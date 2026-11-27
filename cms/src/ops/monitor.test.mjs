import test from 'node:test';
import assert from 'node:assert/strict';
import { collectOpsStatus } from './monitor.mjs';

const timestamp = Date.parse('2026-11-22T11:00:00Z');
const base = { OPS_MONITORING_ENABLED: '1', OPS_GATUS_EDGE_ORIGIN: 'https://edge.example.test', OPS_SITE_ORIGIN: 'https://site.example.test',
  OPS_ECS_INSTANCE_ID: 'i-test1', OPS_ECS_ROLE: 'test-role', OPS_DISK_DEVICE: '/dev/a', OPS_NETWORK_DEVICE: 'eth0' };
const noNetwork = () => { throw Error('unexpected external request'); };

test('从私有源站快照读取同一实例的指标和源站探针数据', async () => {
  const env = { OPS_MONITORING_ENABLED: '1', OPS_SOURCE_HOST: 'origin.example.test',
    OPS_ECS_INSTANCE_ID:'i-host1', OPS_ECS_ROLE:'test-role', OPS_DISK_DEVICE:'/dev/vda3' };
  const snapshot = {
    host:{ instance:'i-host1', samples:{ cpu_total:[{timestamp,Average:15}], diskusage_utilization:[
      {timestamp,Average:12,device:'/dev/vda2'}, {timestamp,Average:31,device:'/dev/vda3'},
    ] } },
    origin:[{group:'origin',name:'origin-homepage',results:[
      {success:true,timestamp:new Date(timestamp).toISOString(),duration:9_000_000},
    ]}],
  };
  const result = await collectOpsStatus(env, { now:timestamp, snapshot, fetcher:noNetwork });
  const checks = Object.fromEntries(result.checks.map(check => [check.id, check]));
  assert.equal(checks.cpu.detail,'15.0%');
  assert.equal(checks.disk.detail,'31.0%');
  assert.equal(checks['origin-web'].detail,'检查通过 · 9 ms');
  const wrong = await collectOpsStatus({ ...env, OPS_ECS_INSTANCE_ID:'i-wrong1' },
    { now:timestamp, snapshot, fetcher:noNetwork });
  assert.equal(wrong.checks.find(check => check.id === 'cpu').state,'error');
});

test('分别读取多台 ECS 的实例、地域及网卡维度', async () => {
  const result = await collectOpsStatus({
    OPS_MONITORING_ENABLED: '1', OPS_ECS_ROLE: 'test-role',
    OPS_ECS_TARGETS: JSON.stringify([
      { id:'i-web1', name:'官网源站', region:'cn-shenzhen', disk:'/dev/a', network:'eth0' },
      { id:'i-web2', name:'第二源站', region:'cn-hangzhou', network:'eth1' },
    ]),
  }, {
    fetcher: noNetwork, now: timestamp,
    readMetric: async (metric, time, env) => [{
      timestamp: time, Average: metric.id === 'network-in' && env.OPS_NETWORK_DEVICE === 'eth1' ? 2000000 : 12,
    }],
  });
  const rows = Object.fromEntries(result.checks.map(check => [check.id, check]));
  assert.equal(rows['i-web1-disk'].state, 'ok');
  assert.equal(rows['i-web2-disk'].state, 'unconfigured');
  assert.equal(rows['i-web2-network-in'].detail, '2.00 Mbit/s');
  assert.equal(rows['i-web2-network-in'].group, '第二源站 · i-web2');
});

test('同一分钟的重复云采样不触发持续高负载，空值不冒充零负载', async () => {
  const result = await collectOpsStatus({...base, OPS_GATUS_EDGE_ORIGIN:'', OPS_SITE_ORIGIN:''}, {
    now:timestamp, fetcher:noNetwork, readMetric: async (item) => item.id === 'cpu'
      ? [0,1,2,3,4].map(() => ({timestamp, Average:90}))
      : [{timestamp,Average:'  '},{timestamp,Average:null},{timestamp,Average:false}],
  });
  const cpu = result.checks.find(c => c.id === 'cpu');
  assert.equal(cpu.state, 'ok');
  assert.deepEqual(cpu.points,[90]);
  assert.equal(result.checks.find(c => c.id === 'memory').state,'stale');
});

test('未显式启用时保持所有数据源未接入，不发起网络访问', async () => {
  let calls = 0;
  const result = await collectOpsStatus({ ...base, OPS_MONITORING_ENABLED: '0' }, { now: timestamp, fetcher: () => {calls++;}, readMetric: () => {calls++;} });
  assert.equal(calls,0); assert.equal(result.checks.length,18); assert.ok(result.checks.every(c => c.state === 'unconfigured'));
  assert.ok(result.checks.every(c => c.sampledAt === null));
});

test('按真实采样时间与来源显示陈旧/异常，识别错误 HTML、同一故障的起始时间', async () => {
  const result = await collectOpsStatus(base, { now: timestamp, fetcher: async input => {
    const url = new URL(input);
    if (url.hostname === 'edge.example.test') return Response.json([
      { group: 'edge', name:'dns', results:[{success:true,timestamp:'2026-11-22T10:50:00Z',duration:8000000}] },
      { group: 'edge', name:'edge-tls', results:[{success:false,timestamp:'2026-11-22T10:59:00Z',duration:4000000},{success:false,timestamp:'2026-11-22T11:00:00Z',duration:9000000}] },
    ]);
    if (url.pathname === '/api/community/health') return new Response('<html>SPA fallback</html>',{headers:{'content-type':'text/html'}});
    if (url.pathname === '/version.json') return Response.json({commit:'a'.repeat(40)});
    return noNetwork();
  }, readMetric: async item => {
    if (item.id === 'network-in') throw Error('test-secret-that-must-never-appear');
    if (item.id === 'memory') return [];
    return [0,1,2,3,4].map(i=>({timestamp:timestamp-(4-i)*60000,Average:item.id === 'cpu'?85:12}));
  } });
  const rows=Object.fromEntries(result.checks.map(c=>[c.id,c]));
  assert.equal(rows.cpu.state,'error'); assert.equal(rows.disk.state,'ok'); assert.deepEqual(rows.cpu.points,[85,85,85,85,85]);
  assert.equal(rows.memory.state,'stale');assert.equal(rows['network-in'].state,'error');assert.equal(rows.dns.state,'stale');
  assert.deepEqual(rows['edge-tls'].points,[4,9]);assert.equal(rows['edge-tls'].since,'2026-11-22T10:59:00.000Z');
  assert.equal(rows['origin-tls'].state,'unconfigured');assert.equal(rows['public-api'].state,'stale');
  assert.equal(rows.service,undefined);assert.equal(result.version,'a'.repeat(40));assert.ok(!JSON.stringify(result).includes('test-secret'));
});
test('探针不接受嵌入凭据和明文远端，公开版核对排除示例接口和快照', async () => {
  const seen=[];
  const result=await collectOpsStatus({ OPS_MONITORING_ENABLED:'1', OPS_SITE_ORIGIN:'https://site.example.test',
    OPS_GATUS_EDGE_ORIGIN:'http://untrusted.example.test', OPS_GATUS_ORIGIN_ORIGIN:'https://user:password@secret.example.test' }, { now:timestamp, fetcher: async input=>{
    const url = new URL(input); seen.push(url.hostname);
    if(url.pathname==='/version.json')return Response.json({commit:'b'.repeat(40),source:'working-tree-snapshot'});
    return Response.json({service:'01player-community',status:'ok',demo:true});
  }});
  assert.deepEqual([...new Set(seen)],['site.example.test']);
  assert.equal(result.checks.find(c=>c.id==='version').state,'error');
  assert.ok(!result.checks.some(c=>c.id==='service'));
  assert.ok(!JSON.stringify(result).includes('password'));
});
test('云效读取最近一次记录，凭据仅发送至固定 OpenAPI，失败消息不回显', async () => {
  let seen;
  const env = { OPS_MONITORING_ENABLED:'1',YUNXIAO_TOKEN:'test-only-key',YUNXIAO_ORGANIZATION_ID:'example12',YUNXIAO_PIPELINE_ID:'76543' };
  const result = await collectOpsStatus(env, {now:timestamp,fetcher:async(url,opts)=>{seen={url,opts};return Response.json({id:4,status:'FAILED'});}});
  assert.equal(new URL(seen.url).hostname,'openapi-rdc.aliyuncs.com');assert.equal(seen.opts.redirect,'error');
  assert.equal(result.pipeline,'#4 · FAILED');assert.equal(result.checks.find(c=>c.id==='pipeline').state,'error');
  assert.ok(!JSON.stringify(result).includes('test-only-key'));
});

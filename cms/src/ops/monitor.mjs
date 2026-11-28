import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getSourceSnapshot } from './source-link.mjs';

const require = createRequire(import.meta.url);
const run = promisify(execFile);
const MINUTE = 60_000;
const metrics = [
  { id: 'cpu', label: 'CPU 使用率', key: 'cpu_total' },
  { id: 'memory', label: '内存使用率', key: 'memory_usedutilization' },
  { id: 'disk', label: '磁盘使用率', key: 'diskusage_utilization', device: 'OPS_DISK_DEVICE' },
  { id: 'network-in', label: '网卡入站带宽', key: 'networkin_rate', device: 'OPS_NETWORK_DEVICE', network: true },
  { id: 'network-out', label: '网卡出站带宽', key: 'networkout_rate', device: 'OPS_NETWORK_DEVICE', network: true },
  { id: 'load', label: '1 分钟系统负载', key: 'load_1m', format: value => value.toFixed(2) },
  { id: 'disk-read', label: '磁盘总读取吞吐', key: 'DiskReadBPS', format: value => (value / 1048576).toFixed(2) + ' MiB/s' },
  { id: 'disk-write', label: '磁盘总写入吞吐', key: 'DiskWriteBPS', format: value => (value / 1048576).toFixed(2) + ' MiB/s' },
];
const edgeChecks = [{ id: 'dns', name: 'dns', label: '公网 DNS' }, { id: 'edge-tls', name: 'edge-tls', label: 'CDN HTTPS 与证书' },
  { id: 'public-web', name: 'homepage', label: '公网首页' }, { id: 'public-api', name: 'event-api', label: '公网报名服务' },
  { id: 'public-admin', name: 'admin-login', label: '公网运营登录' }];
const originChecks = [{ id: 'origin-tls', name: 'origin-tls', label: '源站 HTTPS 与证书' },
  { id: 'origin-web', name: 'origin-homepage', label: '源站首页' },
  { id: 'origin-api', name: 'origin-api', label: '源站报名服务' }];
const check = (id, label, source, state, detail, sampledAt = null) => ({ id, label, source, state, detail, sampledAt });
const empty = (item, source, detail = '尚未接入数据源') => check(item.id, item.label, source, 'unconfigured', detail);
const failed = (item, source, now, detail = '暂时无法读取监测数据') => check(item.id, item.label, source, 'error', detail, new Date(now).toISOString());

function seriesCheck(item, source, samples, now, format) {
  const ordered = samples.filter(p => Number.isFinite(p.time) && p.time <= now + MINUTE).sort((a,b) => a.time - b.time);
  const last = ordered.at(-1);
  if (!last) return check(item.id, item.label, source, 'stale', '尚无有效采样');
  const state = now - last.time > 5 * MINUTE ? 'stale' : last.good ? 'ok' : 'error';
  const row = check(item.id, item.label, source, state, (state === 'stale' ? '数据已过期 · ' : '') + format(last), new Date(last.time).toISOString());
  row.points = ordered.slice(-30).map(p => p.value).filter(Number.isFinite);
  // Report earliest observed failure in this uninterrupted sample run, never infer outages through a gap.
  if (state === 'error') {
    let first = ordered.length - 1;
    while (first > 0 && !ordered[first-1].good && ordered[first].time - ordered[first-1].time < 5 * MINUTE) first--;
    row.since = new Date(ordered[first].time).toISOString();
  }
  return row;
}
function transportUrl(input, path) {
  const parsed = new URL(input);
  const local = ['127.0.0.1','localhost','[::1]'].includes(parsed.hostname);
  if (parsed.username || parsed.password || (!local && parsed.protocol !== 'https:') || !['http:', 'https:'].includes(parsed.protocol)) throw Error('配置的监测地址不受支持。');
  return new URL(path, parsed).href;
}
async function readJson(url, fetcher, headers = {}) {
  const r = await fetcher(url, { headers, signal: AbortSignal.timeout(4200), cache: 'no-store', redirect: 'error' });
  if (!r.ok || !r.headers.get('content-type')?.toLowerCase().includes('json')) throw Error('数据源未返回有效 JSON。');
  return r.json();
}
function probeFailure(conditions) {
  const failed = (Array.isArray(conditions) ? conditions : [])
    .filter(item => item.success === false && typeof item.condition === 'string')
    .map(item => item.condition);
  const certificate = failed.find(condition => condition.startsWith('[CERTIFICATE_EXPIRATION]'));
  if (certificate) {
    const [, hours, minutes] = /^\[CERTIFICATE_EXPIRATION\] \((?:(\d+)h)?(?:(\d+)m)?/.exec(certificate) ?? [];
    const duration = [hours && hours + ' 小时', minutes && minutes + ' 分钟'].filter(Boolean).join(' ');
    return duration ? '证书剩余约 ' + duration + '，低于 7 天' : '证书未达剩余有效期要求';
  }
  if (failed.some(condition => condition.startsWith('[STATUS]'))) return 'HTTP 状态异常';
  if (failed.some(condition => condition.startsWith('[DNS_RCODE]'))) return 'DNS 查询失败';
  if (failed.some(condition => condition.startsWith('[BODY]'))) return '页面或接口内容与预期不符';
  return '检查失败';
}
async function gatus(items, endpoint, token, source, group, deps, observations) {
  if (!endpoint && observations === undefined) return items.map(item => empty(item, source));
  try {
    const statuses = observations === undefined
      ? await readJson(transportUrl(endpoint, '/api/v1/endpoints/statuses?page=1&pageSize=30'),
        deps.fetcher, token ? { Authorization: 'Bearer ' + token } : {})
      : observations;
    if (!Array.isArray(statuses)) throw Error('监测数据格式无效。');
    return items.map(item => {
      const result = statuses.find(row => row.group === group && row.name === item.name);
      const samples = (result?.results || []).filter(row => typeof row.success === 'boolean').map(row => ({
        time: Date.parse(row.timestamp), value: Number.isFinite(row.duration) ? Math.round(row.duration / 1000000) : null,
        good: row.success, detail: row.success ? '检查通过' : probeFailure(row.conditionResults),
      }));
      return seriesCheck(item, source, samples, deps.now, point => point.detail + (point.value === null ? '' : ' · ' + point.value + ' ms'));
    });
  } catch { return items.map(item => failed(item, source, deps.now, '探针未响应或结果无效')); }
}
function createMetricReader(env) {
  const CMS = require('@alicloud/cms20190101');
  const OpenApi = require('@alicloud/openapi-client');
  const Credentials = require('@alicloud/credentials');
  const credentials = new Credentials.default(new Credentials.Config({ type: 'ecs_ram_role', roleName: env.OPS_ECS_ROLE,
    enableIMDSv2: true, disableIMDSv1: true, connectTimeout: 1500, timeout: 2500 }));
  const client = new CMS.default(new OpenApi.Config({ credential: credentials, regionId: env.OPS_ECS_REGION || 'cn-shenzhen',
    endpoint: 'metrics.' + (env.OPS_ECS_REGION || 'cn-shenzhen') + '.aliyuncs.com', connectTimeout: 2500, readTimeout: 4000 }));
  return async (item, now) => {
    const dims = { instanceId: env.OPS_ECS_INSTANCE_ID };
    if (item.device) dims.device = env[item.device];
    const result = await client.describeMetricList(new CMS.DescribeMetricListRequest({ namespace: 'acs_ecs_dashboard', metricName: item.key,
      dimensions: JSON.stringify([dims]), period: '60', startTime: String(now - 30 * MINUTE), endTime: String(now), length: '40' }));
    if (!result.body?.success) throw Error('云监控查询失败。');
    return JSON.parse(result.body.datapoints || '[]');
  };
}
async function hostMetrics(env, deps) {
  const source = '阿里云 CloudMonitor';
  if (!env.OPS_ECS_INSTANCE_ID || !env.OPS_ECS_ROLE) return metrics.map(item => empty(item, source, '尚未配置 ECS 实例与只读角色'));
  let read;
  try {
    if (!/^i-[a-z0-9]+$/i.test(env.OPS_ECS_INSTANCE_ID) || !/^[a-z0-9-]+$/.test(env.OPS_ECS_REGION || 'cn-shenzhen')) throw Error('invalid configuration');
    read = deps.readMetric || createMetricReader(env);
  } catch { return metrics.map(item => failed(item, source, deps.now, '云监控配置无效')); }
  return Promise.all(metrics.map(async item => {
    if (item.device && !env[item.device]) return empty(item, source, '尚未选择' + (item.network ? '网卡' : '磁盘'));
    try {
      const rows = await read(item, deps.now, env);
      const minutes = new Map();
      for (const row of rows) {
        if (!['string','number'].includes(typeof row?.Average) || !String(row.Average).trim()) continue;
        const time = Number(row.timestamp), value = Number(row.Average);
        if (!Number.isFinite(time) || time <= 0 || time > deps.now + MINUTE || !Number.isFinite(value) || value < 0) continue;
        const minute = Math.floor(time / MINUTE);
        if (!minutes.has(minute) || time >= minutes.get(minute).time)
          minutes.set(minute, { time, value, good: true });
      }
      // Match the documented five-minute sustained threshold, never trigger on a single spike.
      const ordered = Array.from(minutes.values()).sort((a,b) => a.time - b.time);
      if (!item.network && !item.format) for (let i = 4; i < ordered.length; i++) {
        const lastFive = ordered.slice(i-4, i+1);
        const firstMinute = Math.floor(lastFive[0].time / MINUTE);
        if (lastFive.every((p, n) => p.value >= 80 && Math.floor(p.time / MINUTE) === firstMinute + n)) ordered[i].good = false;
      }
      return seriesCheck(item, source, ordered, deps.now, point => item.format ? item.format(point.value)
        : item.network ? (point.value / 1000000).toFixed(2) + ' Mbit/s' : point.value.toFixed(1) + '%' + (point.good ? '' : ' · 持续高负载'));
    } catch { return failed(item, source, deps.now); }
  }));
}
const groupChecks = (module, group, rows) => rows.map(row => ({ ...row, module, group }));

async function infrastructure(env, deps) {
  if (!env.OPS_ECS_TARGETS) return groupChecks('hosts', '阿里云 ECS 主机', await hostMetrics(env, deps));
  let targets;
  try {
    targets = JSON.parse(env.OPS_ECS_TARGETS);
    if (!Array.isArray(targets) || !targets.length || targets.length > 10 ||
        new Set(targets.map(target => target.id)).size !== targets.length ||
        targets.some(target => !/^i-[a-z0-9]+$/i.test(target.id) || !/^[a-z0-9-]+$/.test(target.region) ||
          typeof target.name !== 'string' || !target.name.trim() || target.name.length > 60 ||
          [target.disk, target.network].some(device => device !== undefined && typeof device !== 'string'))) throw Error();
  } catch {
    return groupChecks('hosts', '阿里云 ECS 主机', [
      failed({ id: 'ecs-config', label: 'ECS 实例清单' }, '阿里云 CloudMonitor', deps.now, 'ECS 实例清单配置无效'),
    ]);
  }
  const groups = await Promise.all(targets.map(async target => {
    const rows = await hostMetrics({ ...env, OPS_ECS_INSTANCE_ID: target.id, OPS_ECS_REGION: target.region,
      OPS_DISK_DEVICE: target.disk, OPS_NETWORK_DEVICE: target.network }, deps);
    return groupChecks('hosts', target.name + ' · ' + target.id, rows.map(row => ({ ...row, id: target.id + '-' + row.id })));
  }));
  return groups.flat();
}
async function siteCheck(env, deps) {
  const source = '官网服务';
  const endpoint = env.OPS_SITE_ORIGIN || env.COMMUNITY_INTERNAL_ORIGIN;
  const probe = { id: 'version', label: '线上发布版本' };
  if (!endpoint) return { checks: [empty(probe, source)] };
  try {
    const data = await readJson(transportUrl(endpoint, '/version.json'), deps.fetcher);
    if (!/^[a-f0-9]{40}$/.test(data?.commit) || data.source === 'working-tree-snapshot') throw Error('incorrect release metadata');
    return { version: data.commit, checks: [
      check(probe.id, probe.label, source, 'ok', data.commit.slice(0, 12), new Date(deps.now).toISOString()),
    ] };
  } catch {
    return { checks: [failed(probe, source, deps.now, '服务未返回预期的正式版本')] };
  }
}
async function flow(env, deps) {
  const item = { id: 'pipeline', label: '最近一次发布流水线' }, source = '阿里云云效';
  const keychain = process.platform === 'darwin' && env.YUNXIAO_TOKEN_KEYCHAIN_SERVICE;
  if ((!env.YUNXIAO_TOKEN && !keychain) || !env.YUNXIAO_PIPELINE_ID || !env.YUNXIAO_ORGANIZATION_ID) return empty(item, source);
  if (!/^[a-z0-9]+$/i.test(env.YUNXIAO_ORGANIZATION_ID) || !/^\d+$/.test(env.YUNXIAO_PIPELINE_ID)) return failed(item, source, deps.now, '流水线配置无效');
  try {
    const token = env.YUNXIAO_TOKEN || (await run('security', ['find-generic-password', '-w', '-s', keychain], { timeout: 4500 })).stdout.trim();
    if (!token) throw Error('云效令牌不可用。');
    const path = '/oapi/v1/flow/organizations/' + env.YUNXIAO_ORGANIZATION_ID + '/pipelines/' + env.YUNXIAO_PIPELINE_ID + '/runs/latestPipelineRun';
    const data = await readJson('https://openapi-rdc.aliyuncs.com' + path, deps.fetcher, { 'x-yunxiao-token': token });
    const status = String(data?.status || '').toUpperCase(), id = data?.pipelineRunId || data?.id;
    if (!id || !/^[A-Z_]{2,45}$/.test(status)) throw Error('流水线记录格式无效');
    const knownGood = ['SUCCESS','SUCCEEDED','PASS','PASSED','RUNNING','WAITING','INIT','QUEUED','PENDING'].includes(status);
    return check(item.id, item.label, source, knownGood ? 'ok' : 'error', '#' + id + ' · ' + status, new Date(deps.now).toISOString());
  } catch { return failed(item, source, deps.now, '未取得最近一次运行记录'); }
}
export async function collectOpsStatus(env, { fetcher = fetch, now = Date.now(), readMetric, snapshot } = {}) {
  const enabled = env.OPS_MONITORING_ENABLED === '1';
  const config = enabled ? env : {};
  const readSource = config.OPS_SOURCE_HOST ? (item, _, target) => {
    if (snapshot?.host?.instance !== target.OPS_ECS_INSTANCE_ID) throw Error('ECS 采样来源不匹配。');
    const samples = snapshot.host.samples?.[item.key];
    if (!Array.isArray(samples)) throw Error('ECS 指标查询失败。');
    return item.device ? samples.filter(row => row.device === target[item.device]) : samples;
  } : undefined;
  const deps = { fetcher, now, readMetric: readMetric || readSource };
  const [host, edge, origin, site, pipeline] = await Promise.all([infrastructure(config, deps),
    gatus(edgeChecks, config.OPS_GATUS_EDGE_ORIGIN, config.OPS_GATUS_EDGE_TOKEN, '独立公网探针 · Gatus', 'edge', deps),
    gatus(originChecks, config.OPS_GATUS_ORIGIN_ORIGIN, config.OPS_GATUS_ORIGIN_TOKEN, '源站本机探针 · Gatus', 'origin', deps,
      config.OPS_SOURCE_HOST ? snapshot?.origin ?? null : undefined),
    siteCheck(config, deps), flow(config, deps)]);
  return { sampledAt: new Date(now).toISOString(),
    checks: [...host, ...groupChecks('public', '公网可用性', edge), ...groupChecks('origin', '源站可用性', origin),
      ...groupChecks('services', '业务服务与发布', [...site.checks, pipeline])], ...(site.version ? { version: site.version } : {}),
    ...(pipeline.state === 'ok' || pipeline.detail.startsWith('#') ? { pipeline: pipeline.detail } : {}) };
}
let snapshot;
export async function getOpsStatus() {
  if (!snapshot || Date.now() >= snapshot.expires) {
    const promise = getSourceSnapshot().catch(() => null)
      .then(source => collectOpsStatus(process.env, { snapshot: source }));
    snapshot = { expires: Date.now() + 30000, promise };
  }
  return snapshot.promise;
}


import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:tls';
import { parseEnv } from 'node:util';
import { checkOperationsSite } from '../deploy/operations/smoke.mjs';

const command = process.argv[2] ?? 'help';
const configPath = process.env.OPS_CONFIG_FILE
  ?? join(homedir(), '.local/share/01PLAYER/ops/ops.env');

const readToken = config => {
  if (process.env.YUNXIAO_TOKEN) return process.env.YUNXIAO_TOKEN;
  if (process.platform === 'darwin' && config.YUNXIAO_TOKEN_KEYCHAIN_SERVICE) {
    return execFileSync('security', ['find-generic-password', '-w', '-s', config.YUNXIAO_TOKEN_KEYCHAIN_SERVICE], { encoding: 'utf8' }).trim();
  }
  throw new Error('未在环境变量或 macOS 钥匙串中找到云效只读令牌。');
};

async function checkCertificate(hostname) {
  const expires = await new Promise((resolve, reject) => {
    const socket = connect({
      host: hostname, port: 443, servername: hostname,
      rejectUnauthorized: true, signal: AbortSignal.timeout(10000),
    });
    socket.once('error', reject);
    socket.once('secureConnect', () => {
      try {
        if (!socket.authorized) throw Error('证书未通过 TLS 验证');
        const expiry = new Date(socket.getPeerCertificate().valid_to);
        if (!Number.isFinite(expiry.getTime())) throw Error('无法读取证书截止日期');
        resolve(expiry);
      } catch (error) { reject(error); }
      finally { socket.destroy(); }
    });
  });
  const hoursLeft = (expires.getTime() - Date.now()) / 3600000;
  const validity = `有效期至 ${expires.toISOString()}，剩余 ${hoursLeft.toFixed(2)} 小时`;
  if (hoursLeft < 168) throw Error(validity + '，低于 7 天阈值');
  return validity;
}

async function main() {
  if (command === 'help') {
    console.log('只读运维：npm run ops:check / ops:status / ops:runs');
    return;
  }
  if (command === 'check') {
    const hostname = 'club.01aiedu.com';
    try {
      console.log('官网 TLS：' + await checkCertificate(hostname));
    } catch (error) {
      console.error('官网 TLS：' + error.message);
      process.exitCode = 1;
    }
    try {
      await checkOperationsSite('https://' + hostname, { requireProduction: true });
      console.log('零一玩家官网：版本、报名 API、运营登录页和后台权限检查通过。');
    } catch (error) {
      console.error('零一玩家官网：' + error.message);
      process.exitCode = 1;
    }
    try {
      const response = await fetch('https://arch.25thgame.vip/game.html', { signal: AbortSignal.timeout(15000), redirect: 'manual' });
      await response.body?.cancel();
      console.log('25th：HTTP ' + response.status);
      if (response.status !== 200) process.exitCode = 1;
    } catch (error) {
      console.error('25th：' + error.message);
      process.exitCode = 1;
    }
    return;
  }

  const stat = statSync(configPath);
  if (stat.mode & 0o077) throw new Error('私有配置权限必须为 600。');
  const config = parseEnv(readFileSync(configPath, 'utf8'));
  const org = config.YUNXIAO_ORGANIZATION_ID;
  const pipeline = config.YUNXIAO_PIPELINE_ID;
  const domain = config.YUNXIAO_FLOW_DOMAIN || 'https://openapi-rdc.aliyuncs.com';
  if (domain !== 'https://openapi-rdc.aliyuncs.com') throw new Error('仅允许云效中心站 OpenAPI。');
  if (!/^[a-zA-Z0-9]+$/.test(org ?? '') || !/^\d+$/.test(pipeline ?? '')) throw new Error('云效组织或流水线 ID 未配置。');
  const suffix = command === 'status' ? '/runs/latestPipelineRun' : command === 'runs' ? '/runs?page=1&perPage=5' : null;
  if (!suffix) throw new Error('未知运维命令。');
  const base = `${domain}/oapi/v1/flow/organizations/${org}/pipelines/${pipeline}`;
  const response = await fetch(`${base}${suffix}`, {
    headers: { 'x-yunxiao-token': readToken(config) },
    signal: AbortSignal.timeout(15000),
  });
  if (command === 'status' && response.status === 404) {
    const target = await fetch(base, {
      headers: { 'x-yunxiao-token': readToken(config) },
      signal: AbortSignal.timeout(15000),
    });
    if (target.ok && (await target.json()).name === '01aiclub-website-prod') {
      console.log('零一玩家官网流水线存在，尚无运行记录。');
      return;
    }
  }
  if (!response.ok) throw new Error(`云效请求失败：HTTP ${response.status}`);
  const data = await response.json();
  if (Array.isArray(data) && data.length === 0) console.log('零一玩家官网流水线尚无运行记录。');
  for (const run of Array.isArray(data) ? data : [data]) {
    console.log(JSON.stringify({ runId: run.id ?? run.pipelineRunId, status: run.status, triggerMode: run.triggerMode, startTime: run.startTime, endTime: run.endTime }));
  }
}

main().catch(error => {
  console.error(error.code === 'ENOENT' ? `私有配置不存在：${configPath}` : error.message);
  process.exitCode = 1;
});

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

let snapshot;
async function load(env) {
  const host = env.OPS_SOURCE_HOST;
  const key = env.OPS_SOURCE_SSH_KEY;
  const knownHosts = env.OPS_SOURCE_KNOWN_HOSTS;
  if (!/^[a-z0-9][a-z0-9.-]*$/i.test(host) || !key || !knownHosts ||
      !isAbsolute(key) || !isAbsolute(knownHosts) || /["\\\r\n]/.test(knownHosts)) throw Error('源站 SSH 配置无效。');
  const script = await readFile(resolve(process.cwd(), '../deploy/monitoring/source-snapshot.py'));
  return new Promise((resolve, reject) => {
    const child = execFile('ssh', [
      '-T', '-F', '/dev/null', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
      '-o', 'ForwardAgent=no', '-o', 'StrictHostKeyChecking=yes',
      '-o', 'UserKnownHostsFile="' + knownHosts + '"', '-o', 'ConnectTimeout=4',
      '-i', key, 'root@' + host, 'python3', '-I', '-',
    ], { timeout: 16_000, maxBuffer: 512 * 1024 }, (error, stdout) => {
      if (error) return reject(Error('无法通过私有 SSH 通道读取源站。'));
      try { resolve(JSON.parse(stdout)); }
      catch { reject(Error('源站未返回有效的监测快照。')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(script);
  });
}

export function getSourceSnapshot(env = process.env) {
  if (!env.OPS_SOURCE_HOST) return Promise.resolve(null);
  if (!snapshot || Date.now() >= snapshot.expires) {
    const expires = Date.now() + 45_000;
    const promise = load(env).catch(error => {
      if (snapshot?.promise === promise) snapshot.expires = Date.now() + 10_000;
      throw error;
    });
    snapshot = { expires, promise };
  }
  return snapshot.promise;
}

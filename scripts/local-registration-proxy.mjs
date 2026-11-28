import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const templates = fileURLToPath(new URL('../deploy/operations/', import.meta.url));

export async function startRegistrationProxy(communityPort) {
  if (!Number.isInteger(communityPort) || communityPort < 1 || communityPort > 65535) {
    throw Error('需要本机报名测试服务的监听端口。');
  }
  const dir = await mkdtemp(join(tmpdir(), '01player-nginx-'));
  const reservation = createServer();
  let processHandle, exited, spawnError;
  async function rejectionZones() {
    const log = await readFile(join(dir, 'error.log'), 'utf8');
    const counts = {};
    for (const match of log.matchAll(/limiting (?:requests|connections)[^\n]*?by zone "([^"]+)"/g)) {
      counts[match[1]] = (counts[match[1]] || 0) + 1;
    }
    return counts;
  }
  async function stop() {
    if (reservation.listening) await new Promise(done => reservation.close(done));
    if (processHandle) {
      processHandle.kill('SIGTERM');
      await exited;
    }
    await rm(dir, { recursive: true, force: true });
  }
  try {
    await new Promise((resolve, reject) => {
      reservation.once('error', reject);
      reservation.listen(0, '127.0.0.1', resolve);
    });
    const port = reservation.address().port;
    const origin = 'http://127.0.0.1:' + port;
    // Keep every deployed location and threshold. Only the template directory
    // and the two loopback upstream ports differ in this disposable instance.
    const locations = (await readFile(join(templates, 'locations.inc'), 'utf8'))
      .replace('include /etc/01player-runtime/community-upstream.inc;', await readFile(join(templates, 'community-standalone.inc'), 'utf8'))
      .replaceAll('/etc/01player-runtime/common-proxy.inc', JSON.stringify(join(templates, 'common-proxy.inc')))
      .replace(/proxy_pass http:\/\/127\.0\.0\.1:(?:4173|4317);/g, 'proxy_pass http://127.0.0.1:' + communityPort + ';');
    await writeFile(join(dir, 'locations.inc'), locations);
    await writeFile(join(dir, 'nginx.conf'), `pid nginx.pid;
error_log error.log warn;
worker_processes 1;
events { worker_connections 1024; }
http {
  access_log off;
  client_body_temp_path client-body;
  proxy_temp_path proxy-temp;
  fastcgi_temp_path fastcgi-temp;
  uwsgi_temp_path uwsgi-temp;
  scgi_temp_path scgi-temp;
  include ${JSON.stringify(join(templates, 'traffic-zones.conf'))};
  server {
    listen 127.0.0.1:${port};
    server_name localhost;
    location = /_benchmark_ready { return 204; }
    include locations.inc;
  }
}
`);
    const args = ['-p', dir, '-c', join(dir, 'nginx.conf'), '-e', join(dir, 'error.log')];
    execFileSync('nginx', [...args, '-t'], { stdio: 'pipe' });
    await new Promise(done => reservation.close(done));
    processHandle = spawn('nginx', [...args, '-g', 'daemon off;'], { stdio: 'ignore' });
    processHandle.once('error', error => { spawnError = error; });
    exited = new Promise(done => processHandle.once('close', done));
    for (let i = 0; i < 100 && processHandle.exitCode === null; i++) {
      if (spawnError) throw spawnError;
      try {
        const probe = await fetch(origin + '/_benchmark_ready', { signal: AbortSignal.timeout(250) });
        if (probe.status === 204) return { origin, stop, rejectionZones };
      } catch { /* The worker is still starting. */ }
      await delay(25);
    }
    throw Error('本机 NGINX 未启动。' + await readFile(join(dir, 'error.log'), 'utf8'));
  } catch (error) {
    await stop();
    throw error;
  }
}

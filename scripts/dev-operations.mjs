import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
const root = fileURLToPath(new URL('../', import.meta.url));
const cms = join(root, 'cms');
const sitePort = Number(process.env.CLUB_PREVIEW_PORT || 5173);
const adminPort = Number(process.env.CLUB_ADMIN_PORT || 4317);
const vite = join(root, 'node_modules/vite/bin/vite.js');
const next = join(cms, 'node_modules/next/dist/bin/next');
if (!existsSync(vite) || !existsSync(next))
  throw Error('先在官网目录运行 npm ci 和 npm ci --prefix cms。');
const env = {
  ...process.env,
  CLUB_CMS_DATA: resolve(process.env.CLUB_CMS_DATA || join(root, '.local/operations')),
  CMS_INTERNAL_ORIGIN: 'http://127.0.0.1:' + adminPort,
  COMMUNITY_INTERNAL_ORIGIN: 'http://127.0.0.1:' + sitePort,
};
const children = [];
let closing = false;
function stop(code) {
  if (closing) return;
  closing = true;
  process.exitCode = code;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
}
function start(cwd, args) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
  children.push(child);
  child.once('error', (err) => {
    console.error(err.message);
    stop(1);
  });
  child.once('exit', (code, signal) => {
    if (!closing) stop(code ?? (signal ? 1 : 0));
  });
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
start(root, [vite, '--host', '127.0.0.1', '--port', String(sitePort), '--strictPort']);
start(cms, [next, 'dev', '--webpack', '-H', '127.0.0.1', '-p', String(adminPort)]);

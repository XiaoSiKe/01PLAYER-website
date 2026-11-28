import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
export const dir = resolve(process.env.CLUB_CMS_DATA || resolve(process.cwd(), '../.local/operations'));
mkdirSync(dir, { recursive: true, mode: 0o700 });
export function localSecret(name, env) {
  if (process.env[env]) return process.env[env];
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build')
    throw Error('请配置 ' + env);
  const path = resolve(dir, name);
  try {
    writeFileSync(path, randomBytes(48).toString('hex'), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  return readFileSync(path, 'utf8').trim();
}

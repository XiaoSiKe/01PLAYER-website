import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { editorialDir } from './editorial-snapshot.mjs';
export function previewBridgeKey() {
  if (process.env.COMMUNITY_STAFF_BRIDGE_SECRET) return process.env.COMMUNITY_STAFF_BRIDGE_SECRET;
  const dir = editorialDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = resolve(dir, 'bridge.key');
  try {
    writeFileSync(file, randomBytes(48).toString('hex'), { flag: 'wx', mode: 0o600 });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  return readFileSync(file, 'utf8').trim();
}

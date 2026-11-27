import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const operations = fileURLToPath(new URL('../deploy/operations/', import.meta.url));
const stage = join(operations, 'stage-runtime.sh');
const configs = [
  '01player-cms.service', '01player-cms-migrate.service', '01player-community.service',
  'community-player.inc', 'community-standalone.inc', 'locations.inc', 'common-proxy.inc', 'traffic-zones.conf',
  'bridge.env.example', 'cms.env.example', 'community.env.example',
];
const commands = ['check-community-route.mjs', 'smoke.mjs', 'snapshot.py'];
const required = [...configs, ...commands];

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), '01player-stage-ops-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source', 'deploy', 'operations');
  const target = join(root, 'runtime', 'deploy', 'operations');
  mkdirSync(source, { recursive: true });
  for (const name of required) copyFileSync(join(operations, name), join(source, name));
  const run = () => spawnSync('bash', [
    '-c', 'source "$1"; umask 077; stage_operations "$2" "$3"', 'stage-test', stage, source, target,
  ], { encoding: 'utf8' });
  return { source, target, run };
}

test('制品运维目录仅包含同版本的指定文件，分别固定配置和命令权限', t => {
  const { source, target, run } = fixture(t);
  for (const name of ['.env', 'cms.env', 'extra.env.example', 'extra.service', 'extra.inc',
    'registrations.sqlite', 'stage-runtime.sh']) writeFileSync(join(source, name), 'test fixture');
  for (const name of configs) chmodSync(join(source, name), 0o777);
  for (const name of commands) chmodSync(join(source, name), 0o600);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(target).sort(), [...required].sort());
  assert.equal(statSync(target).mode & 0o777, 0o755);
  for (const name of required) {
    const delivered = join(target, name);
    assert.deepEqual(readFileSync(delivered), readFileSync(join(operations, name)), name);
    assert.equal(statSync(delivered).mode & 0o777, commands.includes(name) ? 0o755 : 0o644, name);
  }
});

test('任何必需文件缺失、为空或指向私有文件时均拒绝生成运维目录', t => {
  const { source, target, run } = fixture(t);
  function assertRejected(name) {
    const result = run();
    assert.equal(result.status, 1, result.stderr);
    assert.ok(result.stderr.includes(name));
    assert.equal(existsSync(target), false);
  }
  for (const name of required) {
    rmSync(join(source, name));
    assertRejected(name);
    copyFileSync(join(operations, name), join(source, name));
  }
  writeFileSync(join(source, 'community.env.example'), '');
  assertRejected('community.env.example');
  rmSync(join(source, 'community.env.example'));
  writeFileSync(join(source, 'community.env'), 'test fixture');
  symlinkSync('community.env', join(source, 'community.env.example'));
  assertRejected('community.env.example');
});

test('发布前从候选目录载入完整迁移，拒绝空索引和丢失的 schema 模块', {skip: +process.versions.node.split('.')[0] < 24}, t => {
  const dir = mkdtempSync(join(tmpdir(), '01player-stage-schema-'));
  t.after(() => rmSync(dir, {recursive:true,force:true}));
  const cms = join(dir,'cms'), migrations = join(cms,'src/migrations');
  mkdirSync(migrations,{recursive:true});
  // Node 24 can load these plain TS fixtures without any CMS dependencies.
  // The real runtime uses Payload's locked tsx loader for generated migration imports.
  const loader = join(cms,'node_modules/tsx');
  mkdirSync(loader,{recursive:true});
  writeFileSync(join(loader,'package.json'),'{"exports":"./index.js","type":"module"}');
  writeFileSync(join(loader,'index.js'),'');
  writeFileSync(join(cms,'package.json'),'{"type":"module"}');
  const run = () => spawnSync('bash',['-c','source "$1"; check_migrations "$2"','stage-test',stage,cms],{encoding:'utf8'});
  writeFileSync(join(migrations,'index.ts'),'export const migrations = []');
  assert.notEqual(run().status,0);
  writeFileSync(join(migrations,'index.ts'),"import * as first from './first.ts'; export const migrations=[{name:'first',up:first.up,down:first.down}];");
  assert.notEqual(run().status,0);
  writeFileSync(join(migrations,'first.ts'),'export function up() {}');
  assert.notEqual(run().status,0);
  writeFileSync(join(migrations,'first.ts'),'export function up() { throw Error("must not run"); } export function down() {}');
  const result = run();
  assert.equal(result.status,0,result.stderr);
});

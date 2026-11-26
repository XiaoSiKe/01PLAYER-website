import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRegistrations, registrationFile, snapshotCommunity } from '../server/community-registrations.mjs';

const DatabaseSync = process.getBuiltinModule?.('node:sqlite')?.DatabaseSync;
const script = fileURLToPath(new URL('../deploy/operations/snapshot.py', import.meta.url));
const run = (...args) => execFileSync('python3', [script, ...args], { stdio: 'pipe' });

test('独立官网恢复旧版 JSON 和已提交的 WAL 报名，拒绝损坏的恢复副本及错配、缺失的报名库', { skip: !DatabaseSync }, t => {
  const root = mkdtempSync(join(tmpdir(), '01player-registration-backup-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  mkdirSync(join(source, 'cms'), { recursive: true });
  mkdirSync(join(source, 'community'));
  const cms = new DatabaseSync(join(source, 'cms/cms.sqlite'));
  cms.exec('CREATE TABLE staff(id INTEGER PRIMARY KEY)');
  cms.close();
  const identity = join(source, 'community/community.json');
  const first = { id: 'legacy', eventId: 'workshop', status: 'pending', keyDigest: 'legacy-key' };
  const second = { id: 'new', eventId: 'workshop', status: 'approved', keyDigest: 'new-key' };
  let state = { instanceId: 'backup-fixture', registrationSecret: 'fixture-secret', events: [], registrations: [first] };
  const save = next => { writeFileSync(identity, JSON.stringify(next)); state = next; };
  save(state);
  const legacy = state;
  assert.deepEqual(snapshotCommunity(identity, state), legacy);

  function roundTrip(label, rows) {
    const archive = join(root, label), target = join(root, label + '-restored');
    run('backup', source, archive, '--release', label);
    run('verify', archive);
    run('restore', archive, target);
    assert.deepEqual(readdirSync(join(target, 'community')), ['community.json']);
    const portable = JSON.parse(readFileSync(join(target, 'community/community.json')));
    const expected = { ...state, registrations: rows };
    delete expected.registrationStore;
    assert.deepEqual(portable, expected);
  }
  roundTrip('legacy', [first]);
  const store = openRegistrations(identity, () => state, save);
  try {
    store.write(() => store.add(second));
    assert.ok(existsSync(registrationFile(identity) + '-wal'));
    roundTrip('wal', [first, second]);
    const damaged = join(root, 'wal-copy-error');
    // Simulate a silent copy error. The source is intact and the shortened
    // destination is still valid JSON, so schema checks alone cannot detect it.
    const copyError = `
import json, runpy, shutil, sys
from pathlib import Path
from unittest.mock import patch
program, archive, destination = sys.argv[1:]
archive = Path(archive)
original = shutil.copyfile
def copyfile(source, target, **kwargs):
    result = original(source, target, **kwargs)
    if Path(source) == archive / "data/community/community.json":
        contents = json.loads(Path(target).read_text())
        contents["registrations"].pop()
        Path(target).write_text(json.dumps(contents))
    return result
with patch.object(shutil, "copyfile", copyfile):
    runpy.run_path(program)["create"](archive, Path(destination), None, True)
`;
    assert.throws(() => execFileSync('python3', ['-c', copyError, script, join(root, 'wal'), damaged],
      { stdio: 'pipe' }), /SHA-256 校验失败/);
    assert.equal(existsSync(damaged), false);
    assert.ok(!readdirSync(root).some(name => name.startsWith('.01player-')));
    run('verify', join(root, 'wal'));
  } finally {
    store.close();
  }
  const invalid = join(root, 'invalid');
  // An old identity file beside a newer store must never drop its extra receipt.
  save(legacy);
  assert.throws(() => snapshotCommunity(identity, state), /完成迁移/);
  assert.throws(() => run('backup', source, invalid, '--release', 'stale'), /完成迁移/);
  assert.equal(existsSync(invalid), false);
  assert.throws(() => openRegistrations(identity, () => state, save), /其他记录|不一致/);
  save({ ...legacy, registrations: [first, second] });
  // A genuinely interrupted migration can complete after checking every row.
  openRegistrations(identity, () => state, save).close();
  assert.deepEqual(snapshotCommunity(identity, state).registrations, [first, second]);
  save({ ...state, instanceId: 'different-instance' });
  assert.throws(() => run('backup', source, invalid, '--release', 'mismatch'), /不匹配/);
  assert.equal(existsSync(invalid), false);
  renameSync(registrationFile(identity), join(root, 'held.sqlite'));
  assert.throws(() => run('backup', source, invalid, '--release', 'missing'));
  assert.equal(existsSync(registrationFile(identity)), false);
  assert.equal(existsSync(invalid), false);
});

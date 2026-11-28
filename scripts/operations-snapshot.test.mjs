import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createCommunityApi } from '../server/community-api.mjs';

const sqlite = process.getBuiltinModule?.('node:sqlite');
const tool = fileURLToPath(new URL('../deploy/operations/snapshot.py', import.meta.url));
const snapshot = (...args) => execFileSync('python3', [tool, ...args], {stdio:'pipe'});

async function useCommunity(root, run) {
  const api = createCommunityApi({dataFile: join(root, 'community/community.json'), demo: true});
  const server = createServer(api);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    return await run(async (route, payload) => {
      const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/community/' + route, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload),
      });
      assert.equal(response.status, 200, route);
      return response.json();
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
    api.close();
  }
}

test('独立业务真实回执从冷备恢复，源路径别名不能将恢复目录写回原快照', {skip: !sqlite}, async t => {
  t.mock.timers.enable({apis:['Date'], now:Date.parse('2026-11-22T12:00:00Z')});
  const dir = mkdtempSync(join(tmpdir(),'01player-cold-restore-'));
  t.after(() => rmSync(dir, {recursive:true,force:true}));
  const live = join(dir,'live'), archive = join(dir,'snapshot'), restored = join(dir,'restored');
  mkdirSync(join(live, 'cms/media'), {recursive:true});
  mkdirSync(join(live, 'community'));
  const cms = new sqlite.DatabaseSync(join(live,'cms/cms.sqlite'));
  cms.exec("CREATE TABLE staff (id INT); INSERT INTO staff VALUES(7)");
  cms.close();
  writeFileSync(join(live,'cms/media/cover.jpg'),'fixture media');
  writeFileSync(join(live,'cms/manifest.json'),JSON.stringify({revision:17}));
  const application = {name:'测试玩家', contact:'fixture-local', idempotencyKey:'ops-restore-fixture-123'};
  const submit = 'events/weekend-lab/registrations';
  const receipt = await useCommunity(live, post => post(submit, application));
  assert.ok(receipt.receiptToken);
  snapshot('backup', live, archive, '--release', 'fixture');
  snapshot('verify', archive);
  snapshot('restore', archive, restored);
  const recovered = new sqlite.DatabaseSync(join(restored,'cms/cms.sqlite'), {readOnly:true});
  try { assert.equal(recovered.prepare('SELECT id FROM staff').get().id, 7); }
  finally { recovered.close(); }
  assert.equal(readFileSync(join(restored,'cms/media/cover.jpg'),'utf8'),'fixture media');
  assert.equal(JSON.parse(readFileSync(join(restored,'cms/manifest.json'))).revision,17);
  await useCommunity(restored, async post => {
    const status = await post('registration-status', {id:receipt.id,receiptToken:receipt.receiptToken});
    assert.equal(status.id, receipt.id);
    assert.equal((await post(submit, application)).id, receipt.id);
  });
  for (const [action,source,extra] of [['backup',live,['--release','nested']], ['restore',archive,[]]]) {
    const alias = join(dir,action + '-alias');
    symlinkSync(source,alias,'dir');
    assert.throws(() => snapshot(action,source,join(alias,'nested'),...extra), /目录必须独立/);
    assert.equal(existsSync(join(source,'nested')),false);
  }
});

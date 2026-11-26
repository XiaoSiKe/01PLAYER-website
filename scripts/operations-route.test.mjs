import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ops = new URL('../deploy/operations/', import.meta.url);
const check = fileURLToPath(new URL('check-community-route.mjs', ops));

for (const [owner, port] of [['standalone', 4173], ['player', 4186]]) {
  test('运营与公开报名使用同一个 ' + owner + ' 服务', () => {
    const selector = fileURLToPath(new URL('community-' + owner + '.inc', ops));
    function run(role, env) {
      return spawnSync(process.execPath, [check, role, selector], { env, encoding: 'utf8' });
    }
    const other = port === 4173 ? 4186 : 4173;
    assert.equal(run('cms', { COMMUNITY_INTERNAL_ORIGIN: 'http://127.0.0.1:' + port + '/' }).status, 0);
    const wrongCms = run('cms', { COMMUNITY_INTERNAL_ORIGIN: 'http://127.0.0.1:' + other });
    assert.equal(wrongCms.status, 1);
    assert.match(wrongCms.stderr, /COMMUNITY_INTERNAL_ORIGIN/);
    const external = owner === 'player';
    assert.equal(run('community', { PORT: '4173', COMMUNITY_EXTERNAL: external ? '1' : '0' }).status, 0);
    const wrongWriter = run('community', { PORT: '4173', COMMUNITY_EXTERNAL: external ? '0' : '1' });
    assert.equal(wrongWriter.status, 1);
    assert.match(wrongWriter.stderr, /COMMUNITY_EXTERNAL/);
  });
}

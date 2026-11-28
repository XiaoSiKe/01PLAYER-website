import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { triggerFlow, validatePush, waitForProduction } from './trigger-flow.mjs';

const commit = 'a'.repeat(40);
const event = { ref: 'refs/heads/main', after: commit, deleted: false,
  repository: { id: 1351584381, full_name: 'XiaoSiKe/01PLAYER-website', clone_url: 'https://github.com/XiaoSiKe/01PLAYER-website.git' } };
const webhook = 'https://flow-openapi.aliyun.com/scm/webhook/test-placeholder';
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const immediate = async () => {};

test('a paused or unset deployment switch exits before requiring secrets or contacting production', () => {
  for (const enabled of [undefined, '0', 'true']) {
    const env = { ...process.env };
    delete env.CLUB_FLOW_WEBHOOK_URL;
    delete env.GITHUB_EVENT_PATH;
    if (enabled === undefined) delete env.CLUB_AUTO_DEPLOY;
    else env.CLUB_AUTO_DEPLOY = enabled;
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./trigger-flow.mjs', import.meta.url))], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /自动发布已暂停/);
  }
});

test('the HTTPS Flow receiver gets the real main push JSON', async () => {
  let request;
  await triggerFlow({ webhook, event, commit, fetchImpl: async (url, options) => {
    request = { url, ...options }; return response({ successful: true });
  } });
  assert.equal(request.url, webhook);
  assert.equal(request.method, 'POST');
  assert.deepEqual(request.headers, { 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(request.body), event);
});

test('feature branches, other repos, deleted branches and mismatched revisions cannot deploy', () => {
  for (const invalid of [
    { ...event, ref: 'refs/heads/codex/change' },
    { ...event, repository: { ...event.repository, id: 123 } },
    { ...event, deleted: true },
    { ...event, after: 'b'.repeat(40) },
  ]) assert.throws(() => validatePush(invalid, commit));
});

test('a renamed repository keeps the same deployment identity', () => {
  const beforeRename = { ...event, repository: { ...event.repository, full_name: 'XiaoSiKe/previous-name' } };
  assert.doesNotThrow(() => validatePush(beforeRename, commit));
});

test('HTTP 200 with an application error fails after bounded retries', async () => {
  let calls = 0;
  await assert.rejects(triggerFlow({ webhook, event, commit, wait: immediate,
    fetchImpl: async () => { calls++; return response({ successful: false, errorCode: '1400009' }); },
  }), /1400009/);
  assert.equal(calls, 3);
});

test('transient failures retry, and secret-bearing transport errors are never exposed', async () => {
  let calls = 0;
  await triggerFlow({ webhook, event, commit, wait: immediate, fetchImpl: async () => {
    if (++calls === 1) throw new Error(`Network failure at ${webhook}`);
    return response({ successful: true });
  } });
  assert.equal(calls, 2);
  await assert.rejects(triggerFlow({ webhook, event, commit, wait: immediate,
    fetchImpl: async () => { throw new Error(`Network failure at ${webhook}`); },
  }), error => !error.message.includes(webhook));
});

test('only the expected HTTPS webhook host can receive the push', async () => {
  for (const invalid of ['http://flow-openapi.aliyun.com/scm/webhook/test', 'https://example.com/scm/webhook/test', `${webhook}?redirect=elsewhere`]) {
    await assert.rejects(triggerFlow({ webhook: invalid, event, commit, fetchImpl: async () => assert.fail('Request must be rejected before sending') }));
  }
});

test('deployment is complete only when production serves the exact merged revision', async () => {
  let calls = 0;
  await waitForProduction({ commit, wait: immediate, fetchImpl: async () => {
    if (++calls === 1) return response({ commit: 'b'.repeat(40) });
    if (calls === 2) return response({ commit, source: 'working-tree-snapshot' });
    return response({ commit });
  } });
  assert.equal(calls, 3);
});

test('an accepted trigger cannot pass while production remains on an older commit', async () => {
  let calls = 0;
  await assert.rejects(waitForProduction({ commit, wait: immediate, fetchImpl: async () => {
    calls++; return response({ commit: 'b'.repeat(40) });
  } }), /等待发布超时/);
  assert.equal(calls, 120);
});

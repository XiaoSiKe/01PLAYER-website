import test from 'node:test';
import assert from 'node:assert/strict';
import { accountContinuation, accountLink, reactionIntent, safeSitePath } from '../src/community/account/navigation.js';
import { pagePaths } from '../src/data/page-paths.js';

test('account navigation allows only trusted site pages and strips nested authentication state', () => {
  const safe = '/players?category=competition&q=AI#calendar-heading';
  assert.equal(safeSitePath(safe), safe);
  for (const page of Object.values(pagePaths)) {
    const source = page + '?lang=zh-Hans#top';
    assert.equal(safeSitePath(source), source);
  }
  assert.equal(safeSitePath('/team'), '/team');
  assert.equal(safeSitePath('/player/#home'), '/player/#home');
  assert.equal(safeSitePath('/?page=time-machine#event-list'), '/?page=time-machine#event-list');
  assert.equal(safeSitePath('/plaza?view=mine&from=%2Ffoo'), '/plaza?view=mine');
  for (const value of [
    'https://other.example',
    '//other.example',
    '/\\other.example',
    '/%2fother.example',
    '/admin',
    '/cms-api/sections',
    '/players//',
    '/path/..//outside',
    '/plaza?view=login',
    '/\r\ninvalid',
  ]) {
    assert.equal(safeSitePath(value, '/plaza'), '/plaza', value);
  }
});

test('login remembers the exact filter and validates the originating project before resuming a reaction', () => {
  const current = '/plaza?project=demo1&q=AI';
  const query = new URL(
    accountLink('login', current, 'plaza', { project: 'demo1', intent: 'save' }),
    'http://local.test',
  ).searchParams;
  assert.equal(query.get('returnTo'), current);
  assert.deepEqual(reactionIntent(query, current), { project: 'demo1', kind: 'save' });
  assert.equal(reactionIntent(query, '/plaza?project=other'), null);
  assert.equal(reactionIntent(query, '/players?project=demo1'), null);
  assert.equal(reactionIntent(query, '/plaza?project=demo1&view=review'), null);
  query.set('intent', 'remove');
  assert.equal(reactionIntent(query, current), null);
});

test('account landing offers only a validated protected workflow as a continuation', () => {
  const task = accountContinuation('/players?view=team&event=ai-build-sprint&from=%2Fold', '/players?filter=open');
  assert.equal(task.label, '继续发布组队招募');
  const url = new URL(task.href, 'http://local.test');
  assert.equal(url.pathname, '/players');
  assert.equal(url.searchParams.get('event'), 'ai-build-sprint');
  assert.equal(url.searchParams.get('from'), '/players?filter=open');
  assert.equal(accountContinuation('//other.example?view=publish', '/'), null);
  assert.equal(accountContinuation('/plaza?view=profile', '/'), null);
});

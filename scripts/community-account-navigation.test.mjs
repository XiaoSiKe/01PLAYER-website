import test from 'node:test';
import assert from 'node:assert/strict';
import { accountContinuation, accountLink, reactionIntent, safeSitePath, linkWithSource, returnDestination, playerSpaceTab } from '../src/community/account/navigation.js';
import { pagePaths } from '../src/data/page-paths.js';

test('player space keeps records, collections, likes, profile and security as independent routes', () => {
  for (const tab of ['records','saved','liked','profile','settings']) assert.equal(playerSpaceTab('account',tab),tab);
  assert.equal(playerSpaceTab('account','unknown'),'records');
  assert.equal(playerSpaceTab('profile'),'profile');
  assert.equal(playerSpaceTab('password'),'settings');
  assert.equal(playerSpaceTab('account','password'),'settings');
});

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


test('公共返回记住进入来源、筛选和锚点，活动与票根之间可逐层返回',()=>{
 const list='/players?category=competition&q=AI#calendar-heading';
 const event=linkWithSource('/players?event=event-one',list);
 const project=linkWithSource('/plaza?project=project-one',event);
 const receipt=linkWithSource('/players?view=receipt&event=event-one&receipt=receipt-one',event);
 const source=href=>new URL(href,'https://site.invalid').searchParams.get('from');
 assert.equal(returnDestination(source(receipt),'/players?view=tickets',receipt),event);
 assert.equal(returnDestination(source(event),'/players',event),list);
 assert.equal(returnDestination(source(project),'/plaza',project),event);
 const login=accountLink('login',project,'plaza');
 assert.equal(new URL(login,'https://site.invalid').searchParams.get('returnTo'),project);
 const mine=linkWithSource('/players?view=receipt&receipt=receipt-one','/players?view=tickets');
 assert.equal(returnDestination(source(mine),'/players',mine),'/players?view=tickets');
 assert.equal(returnDestination('https://other.test','/players',event),'/players');
 assert.equal(returnDestination('//other.test','/players',event),'/players');
 assert.equal(returnDestination('/players?event=event-one','/players',event),'/players');
 const unsafe=linkWithSource('/plaza?project=one','/players?event=one&from=https%3A%2F%2Fother.test');
 assert.equal(source(unsafe),'/players?event=one');
});

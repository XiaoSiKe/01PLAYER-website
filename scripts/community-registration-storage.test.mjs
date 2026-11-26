import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openRegistrations, registrationFile, snapshotCommunity } from '../server/community-registrations.mjs';
import { createCommunityApi } from '../server/community-api.mjs';
import { digest, receiptToken, registerAnonymous } from '../server/player-events.mjs';

const DatabaseSync = process.getBuiltinModule?.('node:sqlite')?.DatabaseSync;

test('SQLite 先统计匹配总数，仅读取当前页的报名正文，旧记录默认已通过', { skip: !DatabaseSync }, t => {
  const dir = mkdtempSync(join(tmpdir(), 'community-roster-page-'));
  const records = Array.from({length: 120}, (_, i) => ({id: 'r' + i, eventId: 'event-' + i % 2}));
  let state = {instanceId: 'pages', registrationSecret: 'fixture', registrations: records};
  const store = openRegistrations(join(dir, 'community.json'), () => state, value => { state = value; });
  t.after(() => { store.close(); rmSync(dir, {recursive: true, force: true}); });
  const parse = JSON.parse;
  let decoded = 0;
  t.mock.method(JSON, 'parse', (...args) => { decoded++; return parse(...args); });
  const page = store.page('event-0', 'approved', {page: 2, pageSize: 20});
  assert.equal(decoded, 20);
  assert.equal(page.total, 60);
  assert.deepEqual(page.items, records.filter(r => r.eventId === 'event-0').slice(20,40));
});

test('旧报名与回执跨迁移、锁冲突、写入回滚及备份恢复保持一致', { skip: !DatabaseSync }, t => {
  const dir = mkdtempSync(join(tmpdir(), 'community-receipts-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const identity = join(dir, 'community.json');
  const submission = { name:'乙',contact:'backup@example.test',idempotencyKey:'legacy-submission-key-123',answers:{text:'旧答案', topics:['乙','甲']} };
  const old = { instanceId:'original', registrationSecret:'local-test-secret', registrations:[
    { id:'first', eventId:'event', userId:'member', name:'甲', contact:' Example@example.test ', createdAt:'2025-01-01' },
    { id:'second', eventId:'event', name:submission.name,contact:submission.contact,keyDigest:digest(submission.idempotencyKey),
      answers:{text:'旧答案',topics:['甲','乙']},createdAt:'2025-01-02' },
  ] };
  const token = receiptToken(old, old.registrations[1]);
  let state = old, saves = 0;
  const persist = next => { state = next; saves++; };
  const open = () => openRegistrations(identity, () => state, persist);

  // Simulate stopping between the completed import and the atomic JSON switch.
  assert.throws(() => openRegistrations(identity, () => old, () => { throw Error('interrupted'); }), /interrupted/);
  const store = open();
  try {
    assert.equal(saves, 1);
    assert.equal(state.registrations, null);
    assert.deepEqual(store.list(), old.registrations);
    const edited = {id:'event',publicationStatus:'archived',formFields:[{id:'new',label:'新问题',type:'text',required:true}]};
    const replay = store.write(() => registerAnonymous(store,edited,submission));
    assert.equal(replay.id,'second');
    assert.equal(receiptToken(state,replay),token);
    assert.throws(() => store.write(() => registerAnonymous(store,edited,{...submission,answers:{...submission.answers,text:'修改的答案'}})), {status:409});
    assert.equal(store.hasContact('event','example@example.test'), true);
    assert.equal(store.countForUser('member'), 1);
    assert.deepEqual(store.list('event','approved'), old.registrations);

    const next = { id:'third', eventId:'event', keyDigest:'another-digest', status:'pending' };
    const lock = new DatabaseSync(registrationFile(identity));
    try {
      lock.exec('BEGIN IMMEDIATE');
      assert.throws(() => store.write(() => store.add(next)), { status:503, retryAfter:1 });
      lock.exec('ROLLBACK');
    } finally { lock.close(); }
    assert.equal(store.byId('third'), undefined);
    assert.throws(() => store.write(() => { store.add(next); throw Error('cancel'); }), /cancel/);
    assert.equal(store.byId('third'), undefined);
    store.write(() => store.add(next));
    assert.deepEqual(store.list('event','pending'), [next]);
    assert.equal(saves, 1, '单笔报名无需改写社区 JSON');
    const portable = snapshotCommunity(identity, state);
    assert.deepEqual(portable.registrations, [...old.registrations, next]);
    assert.equal(portable.registrationStore, undefined);
    assert.equal(receiptToken(portable, portable.registrations[1]), token);
  } finally { store.close(); }

  const migrated = state;
  state = { ...migrated, instanceId:'different-instance' };
  assert.throws(open, /不匹配/);
  state = old;
  assert.throws(open, /其他记录/);
  state = migrated;
  renameSync(registrationFile(identity), join(dir,'held.sqlite'));
  assert.throws(open, /缺少配套/);
  assert.equal(existsSync(registrationFile(identity)), false);
});

test('缺失签名密钥的回执文件启动时拒绝打开，原始文件可供恢复', t => {
  const dir = mkdtempSync(join(tmpdir(), 'community-identity-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'data.json');
  for (const fields of [
    { registrations:[{ id:'from-older-version', keyDigest:'old-key' }] },
    { registrationStore:'sqlite-v1', registrations:null, instanceId:'old-id' },
    { registrationStore:'sqlite-v1', registrations:null, registrationSecret:'old-secret' },
  ]) {
    const contents = JSON.stringify({ demo:true, ...fields });
    writeFileSync(file, contents);
    assert.throws(() => createCommunityApi({ dataFile:file, demo:true }), /签名密钥|实例标识/);
    assert.equal(readFileSync(file, 'utf8'), contents);
    assert.equal(existsSync(registrationFile(file)), false);
  }
});

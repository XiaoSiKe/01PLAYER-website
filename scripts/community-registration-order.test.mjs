import test from 'node:test';
import assert from 'node:assert/strict';
import { orderRegistrations } from '../src/community/players/registration-order.js';

test('报名按活动时间排序：最近即将开始优先，进行中及历史活动随后，编号不依赖报名时间', () => {
  const rows = [
    {id:'far',eventId:'far',createdAt:'2026-11-28'},
    {id:'soon',eventId:'soon',createdAt:'2026-10-01'},
    {id:'older',event:{date:'2026.10.01'},createdAt:'2026-11-29'},
    {id:'recent',event:{startsAt:'2026-11-20T12:00:00Z'}},
    {id:'current',event:{startsAt:'2026-11-27T12:00:00Z',endsAt:'2026-11-29T12:00:00Z'}},
    {id:'unknown'},
  ];
  const events = [{id:'far',startsAt:'2026-12-20T12:00:00Z'}, {id:'soon',startsAt:'2026-11-29T12:00:00Z'}];
  assert.deepEqual(orderRegistrations(rows,events,Date.parse('2026-11-28T12:00:00Z')).map(row=>row.id),['soon','far','current','recent','older','unknown']);
  assert.equal(rows[0].id,'far');
});

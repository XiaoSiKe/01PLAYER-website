import { archiveCategories, archiveModules, archivePhotoCategory, archivePhotoMatches, archiveAlbumMatches } from '../server/archive-categories.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptsSignup, eventLocationLabel, eventStatus, nextRegistrationDeadline, sortCalendarEvents } from '../src/community/players/events.js';
import { eventCategories, eventCategory, eventParticipationLabels, eventType } from '../server/event-categories.mjs';

import { listFilters, matchesSearch, selectedOption } from '../src/community/filters.js';

const today = Date.parse('2026-11-22T04:00:00Z');

test('the calendar sorts the entire catalog with the nearest open events first', () => {
  const catalog = [
    { id: 'legacy', status: 'open', date: '12月上旬' },
    { id: 'ended', status: 'ended', startsAt: '2026-11-22T09:00:00Z' },
    { id: 'late', status: 'open', startsAt: '2026-12-05T09:00:00Z' },
    { id: 'next', status: 'open', startsAt: '2026-11-23T09:00:00Z' },
    { id: 'closed', status: 'open', startsAt: '2026-11-22T09:00:00Z', registrationOpen: false },
    { id: 'active', status: 'active' },
  ];
  assert.deepEqual(sortCalendarEvents(catalog, today).map(event => event.id), ['next', 'late', 'legacy', 'active', 'closed', 'ended']);
  assert.deepEqual(sortCalendarEvents([catalog[0], { id: 'another', status: 'open' }], today).map(event => event.id), ['legacy', 'another']);
  assert.deepEqual(sortCalendarEvents([], today), []);
  assert.equal(catalog[0].id, 'legacy');
});

test('an elapsed registration deadline disables signup even when the public response is still cached', () => {
  const event = { status: 'open', registrationOpen: true, registrationClosesAt: new Date(today).toISOString() };
  assert.equal(acceptsSignup(event, today - 1), true);
  assert.equal(acceptsSignup(event, today), false);
  assert.equal(acceptsSignup({ status: 'active' }, today), true);
  assert.equal(acceptsSignup({ ...event, status: 'active' }, today), false);
  assert.equal(nextRegistrationDeadline([{...event,status:'active'}],today-1),today);
});

test('salon is a category and older salon labels are recognized', () => {
  assert.equal(eventCategory({ type: '高校黑客松' }), 'competition');
  assert.equal(eventCategory({ type: '社区沙龙' }), 'salon');
  assert.equal(eventCategory({ type: '社区沙龙', category: 'activity' }), 'salon');
  assert.equal(eventCategory({ type: '主题交流', category: 'salon' }), 'salon');
  assert.equal(eventCategory({ type: '黑客松交流会', category: 'activity' }), 'activity');
});

test('filters retain only the relevant list context, including a literal search for all', () => {
  const list = new URLSearchParams('event=private&view=register&q=all&source=club&sort=all&filter=all');
  assert.deepEqual(listFilters('plaza', list), {q:'all',source:'club'});
  assert.deepEqual(listFilters('players', list), {q:'all'});
  assert.equal(selectedOption([{id:'club'}, {id:'all'}], 'removed'), 'all');
});

test('search accepts full-width input and finds separate words across public metadata', () => {
  assert.ok(matchesSearch(['AI 学习地图','小林'], '  小林　ＡＩ  '));
  assert.equal(matchesSearch(['AI 学习地图','小林'], 'AI 小李'), false);
});

test('event cards show online mode or a short offline city label', () => {
  assert.equal(eventLocationLabel('线上 · 不限城市'), '线上');
  assert.equal(eventLocationLabel('腾讯会议'), '线上');
  assert.equal(eventLocationLabel('线下，福州 · 旗山校区'), '线下，福州');
  assert.equal(eventLocationLabel('福建省厦门市思明区'), '线下，厦门');
  assert.equal(eventLocationLabel('泉州'), '线下，泉州');
  assert.equal(eventLocationLabel('福州大学旗山校区'), '线下，福州');
  assert.equal(eventLocationLabel('创客中心会议室'), '线下');
  assert.equal(eventLocationLabel('地点另行通知'), '');
  assert.equal(eventLocationLabel(undefined), '');
});

test('open listings and registration links expire at the same instant', () => {
  const deadline = today+1000;
  const open = {status:'open',registrationClosesAt:new Date(deadline).toISOString()};
  const previous = {...open,registrationClosesAt:new Date(today-1000).toISOString()};
  assert.equal(nextRegistrationDeadline([previous,{...open,status:'ended'},open],today),deadline);
  assert.equal(nextRegistrationDeadline([open],deadline),Infinity);
  assert.equal(eventStatus(open,deadline-1),'open');
  assert.equal(eventStatus(open,deadline),'closed');
  assert.equal(eventStatus({...open,status:'active'},deadline),'active');
  const endsFirst = {...open, endsAt:new Date(deadline-500).toISOString()};
  assert.equal(nextRegistrationDeadline([endsFirst],today),deadline-500);
  assert.equal(acceptsSignup(endsFirst,deadline-500),false);
});


test('活动类型按赛事、沙龙、共创排序，旧活动编码兼容共创',()=>{
 assert.deepEqual(Object.values(eventCategories),['赛事','沙龙','合作']);
 assert.equal(eventParticipationLabels.activity,'参与合作');
 assert.equal(eventCategory({type:'AI 共创活动'}),'activity');
 assert.equal(eventCategory({category:'activity',type:'共创'}),'activity');
 assert.equal(eventCategory({category:'activity',type:'零一沙龙'}),'salon');
});


test('合作类型兼容旧共创标记，团建独立归档且不增加玩家计划类型',()=>{
 assert.equal(eventType({category:'activity',type:'共创'}),'合作');
 assert.equal(eventType({type:'共创活动'}),'合作');
 assert.equal(eventType({category:'salon',type:'沙龙'}),'沙龙');
 assert.equal(eventCategories['team-building'],undefined);assert.equal(archiveCategories['team-building'],'团建');
 const album={category:'competition',photos:[{category:'competition'},{category:'team-building'},{category:'certificate'}]};
 assert.equal(archiveAlbumMatches(album,'team-building'),true);
 assert.deepEqual(album.photos.filter(photo=>archivePhotoCategory(album,photo)==='team-building'),[{category:'team-building'}]);
 assert.equal(archiveAlbumMatches({...album,photos:[]},'team-building'),false);
 assert.equal(archivePhotoCategory({category:'team-building'},{category:'activity'}),'team-building');
});


test('时光机玩家计划包含三种活动，团建独立展示',()=>{
 assert.deepEqual(Object.values(archiveModules),['全部影像','玩家计划','零一团建']);
 for(const category of ['competition','salon','activity'])assert.equal(archiveAlbumMatches({category},'plan'),true);
 const album={category:'competition'};
 assert.equal(archivePhotoMatches(album,{category:'competition'},'plan'),true);
 assert.equal(archivePhotoMatches(album,{category:'team-building'},'plan'),false);
 assert.equal(archiveAlbumMatches({category:'team-building',photos:[{category:'activity'}]},'plan'),false);
});

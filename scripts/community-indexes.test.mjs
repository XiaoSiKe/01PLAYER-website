import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeProject } from '../server/community-indexes.mjs';
import { eventAlbums, publicEventProjects, publicRecruitments, reconcileEventArchives } from '../server/event-links.mjs';
import { eventsByScene, eventView, sceneFor } from '../server/player-events.mjs';

function countVisits(rows) {
  let visits = 0;
  return {
    rows: new Proxy(rows, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) visits++;
        return Reflect.get(target, property, receiver);
      },
    }),
    visits: () => visits,
  };
}

test('a project listing scans reactions once per collection version and resolves flags for each reader', () => {
  const projects = Array.from({ length: 120 }, (_, i) => ({ id: 'p' + i, status: 'approved' }));
  const reactions = countVisits(projects.flatMap(project => [
    { projectId: project.id, userId: 'a', kind: 'like' },
    { projectId: project.id, userId: 'b', kind: 'save' },
  ]));
  const db = { projects, reactions: reactions.rows };
  const listing = user => publicEventProjects(db).map(p => serializeProject(p, user, db));
  assert.ok(listing({ id: 'a' }).every(p => p.likes === 1 && p.liked && !p.saved));
  assert.ok(listing({ id: 'b' }).every(p => p.likes === 1 && !p.liked && p.saved));
  assert.ok(listing(null).every(p => p.likes === 1 && !p.liked && !p.saved));
  assert.equal(reactions.visits(), 240);
  db.reactions = [{ projectId: 'p3', userId: 'b', kind: 'like' }];
  assert.deepEqual(serializeProject(projects[3], { id: 'b' }, db), { ...projects[3], likes: 1, liked: true, saved: false });
  assert.equal(serializeProject(projects[0], { id: 'a' }, db).likes, 0);
});

test('event and album lookups follow published snapshots, new projects, photos and wall-clock cutoffs', t => {
  const deadline = Date.parse('2030-06-05T05:00:00Z');
  t.mock.timers.enable({ apis: ['Date'], now: deadline - 1 });
  const event = { id: 'e1', name: '开放日', status: 'open', registrationClosesAt: new Date(deadline).toISOString() };
  const draft = { id: 'draft', name: '草稿', status: 'active', publicationStatus: 'draft' };
  const db = { events: [event, draft], projects: [{ id: 'p', eventId: event.id, status: 'pending' }],
    recruitments: [{ id: 'team', eventId: event.id, projectId: 'p' }, { id: 'hidden', eventId: 'draft', projectId: 'p' }],
    photos: [], albums: [] };
  const scene = sceneFor(event.id);
  assert.equal(eventsByScene(db.events).get(scene), event);
  assert.equal(eventView(event, db).hasAlbum, false);
  assert.equal(eventView(event, db).registrationOpen, true);
  t.mock.timers.tick(1);
  assert.equal(eventView(event, db).registrationOpen, false);
  assert.deepEqual(publicRecruitments(db), [{ ...db.recruitments[0], projectPublic: false }]);
  assert.equal(publicEventProjects(db, 'e1').length, 0);

  db.projects = [{ ...db.projects[0], status: 'approved' }];
  db.events = [{ ...event, name: '现场活动', status: 'active' }, draft];
  db.photos = [{ id: 'photo', eventId: event.id }];
  reconcileEventArchives(db);
  assert.equal(eventsByScene(db.events).get(scene).name, '现场活动');
  assert.equal(eventView(db.events[0], db).hasAlbum, true);
  assert.deepEqual(publicRecruitments(db, 'e1'), [{ ...db.recruitments[0], projectPublic: true }]);
  assert.deepEqual(publicRecruitments(db, 'draft'), []);
  assert.equal(publicEventProjects(db, 'e1').length, 1);
  assert.deepEqual(eventAlbums(db).map(({ name, projectCount, photos }) => ({ name, projectCount, photos })),
    [{ name: '现场活动', projectCount: 1, photos: db.photos }]);
  db.events = [{ ...event, publicationStatus: 'archived' }, draft];
  assert.deepEqual(eventAlbums(db), []);
  assert.deepEqual(publicRecruitments(db), []);
});

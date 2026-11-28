import { eventAllowsAlbum, eventPhase, isPublished } from './event-state.mjs';
import { eventCategory, eventType } from './event-categories.mjs';
import { approvedProjects, rowsByEvent, rowsById } from './community-indexes.mjs';

// One owner for event lifecycle → archive creation. Called on load and every commit.
// Album identity is the event ID; historical albums survive an event being reopened.
export function reconcileEventArchives(state, now = new Date().toISOString()) {
  state.albums ??= [];
  state.photos ??= [];
  const existing = new Set(state.albums.map(album => album.eventId));
  const additions = [];
  const time = Date.parse(now);
  for (const event of state.events) {
    if (eventAllowsAlbum(event, time) && !existing.has(event.id)) {
      const scheduled = event.status === 'open' && [event.startsAt, event.endsAt].find(date => Date.parse(date) <= time);
      additions.push({ id: event.id, eventId: event.id, createdAt: scheduled || now });
      existing.add(event.id);
    }
  }
  if (additions.length) state.albums = state.albums.concat(additions);
  return state;
}
export function publicEventProjects(state, eventId) {
  const projects = approvedProjects(state.projects);
  return eventId ? rowsByEvent(projects).get(eventId) ?? [] : projects;
}
export function eventAlbums(state) {
  const events = rowsById(state.events);
  const photos = rowsByEvent(state.photos);
  const projects = rowsByEvent(approvedProjects(state.projects));
  const albums = [];
  for (const album of reconcileEventArchives({ ...state }).albums) {
    const event = events.get(album.eventId);
    if (!event || !isPublished(event)) continue;
    albums.push({ ...album, name: event.name, description: event.description, date: event.date, status: eventPhase(event), type: eventType(event), category: eventCategory(event), example: event.example,
      photos: photos.get(event.id) ?? [], projectCount: projects.get(event.id)?.length ?? 0 });
  }
  return albums;
}

export function publicRecruitments(state, eventId) {
  const events = rowsById(state.events);
  const projects = rowsById(state.projects);
  const rows = eventId ? rowsByEvent(state.recruitments).get(eventId) ?? [] : state.recruitments;
  const result = [];
  for (const row of rows) {
    const event = events.get(row.eventId);
    if (event && isPublished(event)) {
      result.push({ ...row, projectName: projects.get(row.projectId)?.name || '未命名项目', projectPublic: projects.get(row.projectId)?.status === 'approved' });
    }
  }
  return result;
}

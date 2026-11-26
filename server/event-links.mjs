import { isPublished } from './player-events.mjs';
import { approvedProjects, rowsByEvent, rowsById } from './community-indexes.mjs';

// One owner for event lifecycle → archive creation. Called on load and every commit.
// Album identity is the event ID; historical albums survive an event being reopened.
export function reconcileEventArchives(state, now = new Date().toISOString()) {
  state.albums ??= [];
  state.photos ??= [];
  const existing = new Set(state.albums.map(album => album.eventId));
  const additions = [];
  for (const event of state.events) {
    if (isPublished(event) && ['active', 'ended'].includes(event.status) && !existing.has(event.id)) {
      additions.push({ id: event.id, eventId: event.id, createdAt: now });
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
  for (const album of state.albums) {
    const event = events.get(album.eventId);
    if (!event || !isPublished(event)) continue;
    albums.push({ ...album, name: event.name, description: event.description, date: event.date, status: event.status, type: event.type, example: event.example,
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
      result.push({ ...row, projectPublic: projects.get(row.projectId)?.status === 'approved' });
    }
  }
  return result;
}

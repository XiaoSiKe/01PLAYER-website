import { homePinTag } from './home-pins.mjs';

// Each published collection is immutable. Replacing an array invalidates its
// lookups, and releasing the old snapshot also releases its indexes.
function indexCollection(build) {
  const indexes = new WeakMap();
  return rows => {
    let index = indexes.get(rows);
    if (!index) {
      index = build(rows);
      indexes.set(rows, index);
    }
    return index;
  };
}

export function indexBy(keyFor) {
  return indexCollection(rows => {
    const index = new Map();
    for (const row of rows) index.set(keyFor(row), row);
    return index;
  });
}

export const rowsById = indexBy(row => row.id);
export const approvedProjects = indexCollection(projects => projects.filter(project => project.status === 'approved'));
const groupRows = key => indexCollection(rows => {
  const groups = new Map();
  for (const row of rows) {
    const group = groups.get(row[key]);
    if (group) group.push(row);
    else groups.set(row[key], [row]);
  }
  return groups;
});
export const rowsByEvent = groupRows('eventId');
export const projectsByOwner = groupRows('ownerId');

export const projectReactionsByUser = indexCollection(rows => {
  const users = new Map();
  for (const { userId, projectId, kind } of rows) {
    if (kind !== 'like' && kind !== 'save') continue;
    let user = users.get(userId);
    if (!user) {
      user = { like: new Set(), save: new Set() };
      users.set(userId, user);
    }
    user[kind].add(projectId);
  }
  return users;
});

const reactionsByProject = indexCollection(reactions => {
  const projects = new Map();
  for (const { projectId, userId, kind } of reactions) {
    let totals = projects.get(projectId);
    if (!totals) {
      totals = { likes: 0, likedBy: new Set(), savedBy: new Set() };
      projects.set(projectId, totals);
    }
    if (kind === 'like') {
      totals.likes++;
      totals.likedBy.add(userId);
    } else if (kind === 'save') {
      totals.savedBy.add(userId);
    }
  }
  return projects;
});

export function serializeProject(project, user, db) {
  const totals = reactionsByProject(db.reactions).get(project.id);
  const { createdByStaff, ...publicFields } = project;
  return {
    ...publicFields, ...homePinTag(db, 'projects', project.id),
    likes: totals?.likes ?? 0,
    saves: totals?.savedBy.size ?? 0,
    liked: Boolean(user && totals?.likedBy.has(user.id)),
    saved: Boolean(user && totals?.savedBy.has(user.id)),
  };
}

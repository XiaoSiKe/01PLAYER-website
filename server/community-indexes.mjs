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
export const rowsByEvent = indexCollection(rows => {
  const groups = new Map();
  for (const row of rows) {
    const group = groups.get(row.eventId);
    if (group) group.push(row);
    else groups.set(row.eventId, [row]);
  }
  return groups;
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
  return {
    ...project,
    likes: totals?.likes ?? 0,
    liked: Boolean(user && totals?.likedBy.has(user.id)),
    saved: Boolean(user && totals?.savedBy.has(user.id)),
  };
}

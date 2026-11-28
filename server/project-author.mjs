// Backend-created works may name an author without linking a login account.
// Give those published bylines a stable, work-scoped public page.
export function publicAuthorId(project) {
  return typeof project.ownerId === 'string' && project.ownerId ? project.ownerId : 'project-' + project.id;
}

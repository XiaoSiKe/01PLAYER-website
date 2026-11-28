import { publicAuthorId } from './project-author.mjs';
import { publicEventProjects, publicRecruitments } from './event-links.mjs';
import { serializeProject } from './community-indexes.mjs';

// Public identity includes the player’s avatar, university and optional public contact; account and registration data stay private.
export function publicPlayer(state, id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(id)) return null;
  const projects = publicEventProjects(state).filter(project => publicAuthorId(project) === id);
  const teams = publicRecruitments(state).filter(team => team.ownerId === id);
  if (!projects.length && !teams.length) return null;
  const account = state.users.find(user => user.id === id);
  return {
    id,
    name: account?.name || teams[0]?.author || projects[0]?.author || '零一玩家',
    university: account?.university || '',
    publicContact: account?.publicContact || '',
    avatar: account?.avatar ? `/api/community/profiles/${id}/avatar?v=${account.avatar.version}` : '',
    projects: projects.map(project => serializeProject(project, null, state)),
    recruitments: teams.map(({id,eventId,projectName,description}) => ({id,eventId,projectName,description})),
  };
}

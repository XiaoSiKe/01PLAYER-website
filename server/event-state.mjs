export const isPublished = event => (event.publicationStatus || 'published') === 'published';

export function eventPhase(event, now = Date.now()) {
  const { startsAt, endsAt } = event.schedule ?? event;
  if (event.status === 'ended' || Date.parse(endsAt) <= now) return 'ended';
  if (event.status === 'open' && Date.parse(startsAt) <= now) return 'active';
  return event.status;
}

export function acceptsProjectSubmissions(event, now = Date.now()) {
  return Boolean(event && isPublished(event) && eventPhase(event, now) === 'active' && event.submissionsOpen === true);
}

export const usesExternalRegistration = event => event?.registrationDestination === 'external';
export const acceptsRecruitment = event => Boolean(event && isPublished(event) && ['open', 'active'].includes(eventPhase(event)));
export const eventAllowsAlbum = (event, now = Date.now()) =>
  isPublished(event) && ['active', 'ended'].includes(eventPhase(event, now));

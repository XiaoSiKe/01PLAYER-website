export const eventCategories = { competition: '赛事', salon: '沙龙', activity: '合作' };

export const eventParticipationLabels = Object.fromEntries(
  Object.entries(eventCategories).map(([id, label]) => [id, '参与' + label]),
);

export function eventCategory({ category, type }) {
  // Older catalogs used 活动 for salons because they had only two categories.
  if (category !== 'competition' && /沙[龙龍]/.test(type)) return 'salon';
  if (Object.hasOwn(eventCategories, category)) return category;
  return /比赛|赛事|挑战赛|黑客松|竞技|竞赛/.test(type) ? 'competition' : 'activity';
}

export function eventType(event) {
  return eventCategory(event) === 'activity' && /^(?:共创|共創)(?:活动|活動)?$/.test(event.type || '')
    ? eventCategories.activity : event.type;
}

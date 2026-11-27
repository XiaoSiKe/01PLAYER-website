export const eventCategories = { competition: '比赛', activity: '活动', salon: '沙龙' };

export function eventCategory({ category, type }) {
  // Older catalogs used 活动 for salons because they had only two categories.
  if (category !== 'competition' && /沙[龙龍]/.test(type)) return 'salon';
  if (Object.hasOwn(eventCategories, category)) return category;
  return /比赛|赛事|挑战赛|黑客松|竞技|竞赛/.test(type) ? 'competition' : 'activity';
}

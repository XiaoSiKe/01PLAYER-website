export const playerIdentityLabels = {
  head: '头号玩家',
  pioneer: '先锋玩家',
  player: '零一玩家',
};

export function playerIdentityForRole(role) {
  if (role === 'owner' || role === 'admin') return 'head';
  if (role === 'operator') return 'pioneer';
  return 'player';
}

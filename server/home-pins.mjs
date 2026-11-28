import { fail } from './community-input.mjs';
import { isPublished } from './event-state.mjs';

export const homePinLimit = 3;
export const homePinKinds = ['events', 'projects'];
export const canPinOnHome = (kind, item) => kind === 'events' ? isPublished(item) : item.status === 'approved';
const sameSlots = (one, two) => one.length === two.length && one.every((id, index) => id === two[index]);
const validSlots = slots => Array.isArray(slots) && slots.length === homePinLimit &&
  slots.every(id => id === null || (typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id)));

export function homePinSlots(state, kind) {
  const saved = state.homePins?.[kind];
  const slots = validSlots(saved) ? saved : Array(homePinLimit).fill(null);
  return slots.map(id => id && state[kind].some(item => item.id === id && canPinOnHome(kind, item)) ? id : null);
}

export function homePinTag(state, kind, id) {
  const slots = state.homePins?.[kind];
  const position = Array.isArray(slots) ? slots.indexOf(id) + 1 : 0;
  return position ? { homePinPosition: position } : {};
}

export function updateHomePins(state, kind, input) {
  const { slots, expected } = input;
  if (!validSlots(slots) || !validSlots(expected)) fail(400, '请分别选择第 1、2、3 位的置顶内容。');
  const ids = slots.filter(Boolean);
  if (new Set(ids).size !== ids.length) fail(400, '同一条内容只能占一个置顶位。');
  if (ids.some(id => !state[kind].some(item => item.id === id && canPinOnHome(kind, item)))) {
    fail(409, '有内容已下架或尚未公开，请刷新后重新选择。');
  }
  const current = homePinSlots(state, kind);
  if (sameSlots(current, slots)) return state;
  if (!sameSlots(current, expected)) fail(409, '置顶设置已由其他运营人员更新，请重新打开设置。');
  return { ...state, homePins: { ...state.homePins, [kind]: slots } };
}

export function pruneHomePins(state) {
  if (!state.homePins) return;
  for (const kind of homePinKinds) {
    const saved = state.homePins[kind];
    if (!saved) continue;
    const slots = homePinSlots(state, kind);
    if (!validSlots(saved) || !sameSlots(saved, slots)) state.homePins = { ...state.homePins, [kind]: slots };
  }
}

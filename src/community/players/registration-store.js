import { communityApi } from '../api';

const registrationTimeoutMs = 15_000;

const receiptPrefix = '01player.web.receipt.';
const pendingPrefix = '01player.web.pending.';
const running = new Map();

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { throw new Error('浏览器未能保存报名回执，请检查本站存储权限或空间后重试。'); }
}
export function pendingRegistration(eventId) { return read(pendingPrefix + eventId); }
export function localReceipt(id) {
  const row = read(receiptPrefix + id);
  return row?.id === id && row.eventId && row.receiptToken ? row : undefined;
}
export async function accountReceipts(id, signal) {
  const query = new URLSearchParams({ view: 'registrations' });
  if (id != null) query.set('receipt', id);
  const { registrations } = await communityApi('mine?' + query, undefined, undefined, signal);
  // Older community runtimes still return the full /mine representation.
  return id == null ? registrations : registrations.filter(row => row.id === id);
}
export function localReceipts() {
  try {
    return Object.keys(localStorage).filter(key => key.startsWith(receiptPrefix))
      .map(read).filter(row => row?.id && row.eventId && row.receiptToken)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  } catch { return []; }
}
export function saveReceipt(receipt) {
  const existing = read(receiptPrefix + receipt.id);
  if (existing?.updatedAt && (!receipt.updatedAt || Date.parse(receipt.updatedAt) < Date.parse(existing.updatedAt))) return existing;
  write(receiptPrefix + receipt.id, receipt);
  try { localStorage.removeItem(pendingPrefix + receipt.eventId); } catch { /* The confirmed receipt is already saved. */ }
  window.dispatchEvent(new Event('01player-receipts'));
  return receipt;
}
async function requestRegistration(path, body, account) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), registrationTimeoutMs);
  try {
    return await communityApi(path, body, account, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
export async function refreshReceipt(receipt) {
  const next = await requestRegistration('registration-status', { id: receipt.id, receiptToken: receipt.receiptToken });
  if (next.id !== receipt.id || next.eventId !== receipt.eventId) throw Error('回执与本次报名不符，请重新打开。');
  const updated = { ...receipt, ...next, checkedAt: new Date().toISOString() };
  if (!next.ticketGroupQrUrl) delete updated.ticketGroupQrUrl;
  return saveReceipt(updated);
}
export function submitRegistration(event, body, userId) {
  if (running.has(event.id)) return running.get(event.id);
  const execute = async () => {
    const saved = localReceipts().find(row => row.eventId === event.id);
    if (saved) return saved;
    let pending = pendingRegistration(event.id);
    if (!pending) {
      pending = {
        event: { id: event.id, name: event.name, date: event.date, startsAt: event.startsAt, endsAt: event.endsAt, location: event.location, example: event.example },
        body: { ...body, idempotencyKey: crypto.randomUUID() },
        account: userId || 'anonymous',
      };
      write(pendingPrefix + event.id, pending);
    }
    let result;
    try {
      result = await requestRegistration('events/' + encodeURIComponent(event.id) + '/registrations',
        pending.body, pending.account || 'anonymous');
    } catch (error) {
      if ([400, 403, 404, 409, 410, 413, 422].includes(error.status)) {
        try { localStorage.removeItem(pendingPrefix + event.id); } catch { /* Preserve the service error. */ }
      }
      throw error;
    }
    if (!result.id || !result.receiptToken || result.eventId !== event.id) throw Error('服务尚未确认本次报名，请重试确认。');
    return saveReceipt({ ...result, participantName: pending.body.name, event: pending.event, checkedAt: new Date().toISOString() });
  };
  const task = (navigator.locks ? navigator.locks.request('01player-signup-' + event.id, execute) : execute())
    .finally(() => running.delete(event.id));
  running.set(event.id, task);
  return task;
}

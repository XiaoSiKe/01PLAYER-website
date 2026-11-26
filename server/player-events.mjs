import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { fail, text, url } from './community-input.mjs';
import { indexBy, rowsByEvent } from './community-indexes.mjs';
import { eventCategories, eventCategory } from './event-categories.mjs';

const idFormat = /^[A-Za-z0-9_-]{1,100}$/;
const statusTypes = ['open', 'active', 'ended'];
export const isPublished = event => (event.publicationStatus || 'published') === 'published';
export function acceptsRegistration(event, now = Date.now()) {
  if (!isPublished(event) || event.status !== 'open') return false;
  if (event.registrationClosesAt && !(Date.parse(event.registrationClosesAt) > now)) return false;
  const end = eventDates(event).endsAt;
  return !end || now < Date.parse(end);
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export function sameSecret(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.length > 0 && b.length > 0
    && timingSafeEqual(Buffer.from(digest(a), 'hex'), Buffer.from(digest(b), 'hex'));
}
function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) fail(400, label + '无效。');
  return value;
}
function list(value, label, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length > maxItems) fail(400, label + '数量无效。');
  return value.map(item => text(item, label, maxLength));
}
function survey(fields) {
  if (!Array.isArray(fields) || fields.length > 30) fail(400, '每场活动最多可设置 30 道问题。');
  const used = new Set(['__proto__', 'constructor', 'prototype']);
  return fields.map(field => {
    if (!field || typeof field.id !== 'string' || !idFormat.test(field.id) || used.has(field.id)) fail(400, '问题 ID 无效或重复。');
    if (typeof field.required !== 'boolean') fail(400, '问题配置格式错误。');
    used.add(field.id);
    const { id, required } = field;
    const label = text(field.label, '问题内容', 200);
    const type = oneOf(field.type, ['text', 'textarea', 'select', 'multiselect'], '题型');
    if (type === 'select' || type === 'multiselect') {
      const options = list(field.options, '选项', 40, 150);
      if (!options.length || new Set(options).size !== options.length) fail(400, '选项不能为空或重复。');
      return { id, label, type, required, options };
    }
    return { id, label, type, required };
  });
}
export function mediaUrl(value) {
  if (typeof value === 'string' && /^\/(?:cms-api\/media\/file\/|images\/)/.test(value)) {
    let decoded;
    try { decoded = decodeURIComponent(value); } catch { fail(400, '封面路径无效。'); }
    if (value.length > 2000 || /[\\\x00-\x1f?#%]/.test(decoded) || decoded.split('/').some(part => part === '..' || part === '.')) fail(400, '封面路径无效。');
    return value;
  }
  return url(value || '', '封面');
}
function iso(value, label) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !validDay(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) fail(400, label + '需要带时区的有效日期时间。');
  return new Date(value).toISOString();
}
function validDay(day) {
  const stamp = Date.parse(day + 'T00:00:00Z');
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === day;
}
// Legacy display strings use China local calendar dates. Unknown formats stay undated.
function legacyDates(date = '') {
  const m = /^(\d{4})[.-](\d{2})[.-](\d{2})(?:\s*[—–~至]\s*(?:(\d{4})[.-])?(\d{2})[.-](\d{2}))?$/.exec(date);
  if (!m) return {};
  const first = [m[1], m[2], m[3]].join('-');
  const last = [m[4] || m[1], m[5] || m[2], m[6] || m[3]].join('-');
  if (!validDay(first) || !validDay(last) || first > last) return {};
  const start = Date.parse(first + 'T00:00:00+08:00');
  // Public clients and the API use the same exclusive cutoff at the next midnight.
  const end = Date.parse(last + 'T00:00:00+08:00') + 86400000;
  return { startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() };
}
function eventDates(event) {
  if (event.startsAt || event.endsAt) return { startsAt: event.startsAt || null, endsAt: event.endsAt || null };
  return legacyDates(event.date);
}
export function hasEventEnded(event, now = Date.now()) {
  return event.status === 'ended' || Date.parse(eventDates(event).endsAt) <= now;
}
function eventSnapshot(event) {
  const { draft, managedBy, lastEventMutation, publicationStatus, ...content } = event;
  return { ...content, publicationStatus: publicationStatus || 'published' };
}
function eventRevision(event) {
  return digest(JSON.stringify([eventSnapshot(event), event.draft || null]));
}
// The home feed needs only card and deadline data. Detail and form callers keep the full event.
const cardFields = ['id', 'name', 'type', 'category', 'date', 'location', 'subtitle', 'coverUrl', 'example',
  'status', 'startsAt', 'endsAt', 'registrationClosesAt', 'registrationOpen', 'miniHomePinned', 'registrationMode'];
export function eventCard(event, db) {
  const view = eventView(event, db);
  return Object.fromEntries(cardFields.map(key => [key, view[key]]));
}
export function eventView(event, db, staff = false) {
  const current = eventSnapshot(event);
  const draft = event.draft;
  const view = staff && draft ? { ...current, ...draft } : current;
  // The editor round-trips this response. Only public views synthesize timestamps
  // from a display label, so a later label edit cannot persist obsolete inferred dates.
  const dates = staff ? view : eventDates(view);
  return { ...view, miniHomePinned: isPublished(event) && db.miniHomePinnedEventId === event.id,
    category: eventCategory(view),
    registrationMode: view.registrationMode || 'direct', formFields: view.formFields || [],
    startsAt: dates.startsAt || null, endsAt: dates.endsAt || null,
    registrationClosesAt: view.registrationClosesAt || null, registrationOpen: acceptsRegistration(view),
    hasAlbum: rowsByEvent(db.albums).has(event.id), ...(staff ? { hasDraftChanges: Boolean(draft), draftRevision: eventRevision(event) } : {}) };
}
function eventContent(input, previous) {
  const merged = { ...previous, ...input };
  const value = {};
  for (const [key, label] of Object.entries({ name: '活动名称', subtitle: '副标题', description: '活动介绍', date: '活动日期', type: '活动类型', location: '活动地点' })) {
    value[key] = text(merged[key] ?? '', label, key === 'description' ? 12000 : 500, key === 'name');
  }
  const category = oneOf(merged.category ?? eventCategory(value), Object.keys(eventCategories), '活动分类');
  value.category = eventCategory({ category, type: value.type });
  value.status = oneOf(merged.status ?? 'open', statusTypes, '活动状态');
  value.registrationMode = oneOf(merged.registrationMode ?? 'direct', ['direct', 'review'], '报名模式');
  value.rules = list(merged.rules ?? [], '参与规则', 50, 1500);
  value.formFields = survey(merged.formFields ?? []);
  value.coverUrl = mediaUrl(merged.coverUrl);
  if (merged.submissionsOpen !== undefined && typeof merged.submissionsOpen !== 'boolean') fail(400, '提交开关格式错误。');
  value.submissionsOpen = value.status === 'active' && merged.submissionsOpen === true;
  for (const [key, label] of Object.entries({ startsAt: '开始时间', endsAt: '结束时间', registrationClosesAt: '报名截止时间' })) {
    value[key] = iso(merged[key], label);
  }
  if (value.startsAt && value.endsAt && value.endsAt < value.startsAt) fail(400, '结束时间须晚于开始时间。');
  return value;
}
export function importCatalog(raw, existing, demo) {
  if (!Array.isArray(raw)) throw Error('活动目录必须为 JSON 数组。');
  const ids = new Set();
  const imported = raw.map(input => {
    const { id } = input;
    if (typeof id !== 'string' || !idFormat.test(id) || ids.has(id)) throw Error('活动 ID 无效或重复。');
    ids.add(id);
    if (!statusTypes.includes(input.status) || typeof input.submissionsOpen !== 'boolean' || !Array.isArray(input.rules)) throw Error('活动状态、提交开关或参与规则格式错误。');
    const old = existing.find(event => event.id === id);
    if (old?.managedBy === 'staff') return old;
    return { ...eventContent(input), id, example: demo, publicationStatus: 'published' };
  });
  const absent = existing.filter(event => !ids.has(event.id));
  if (absent.some(event => event.managedBy !== 'staff')) throw Error('活动目录不能删除已有活动 ID；请保留历史关联。');
  return [...imported, ...absent];
}
export function createEvent(db, input) {
  const id = input.id ?? randomUUID();
  if (typeof id !== 'string' || !idFormat.test(id)) fail(400, '活动 ID 限 1 至 100 位字母、数字、下划线或连字符。');
  const existing = db.events.find(event => event.id === id);
  if (existing) {
    if (existing.publicationStatus === 'draft' && existing.managedBy === 'staff' && !existing.lastEventMutation) {
      try {
        if (isDeepStrictEqual(eventContent({}, existing), eventContent(input))) return { event: existing, created: false };
      } catch (error) {
        if (error.status !== 400) throw error;
      }
    }
    fail(409, '此活动 ID 已存在，请重新打开原活动。');
  }
  const event = { ...eventContent(input), id, example: db.demo, publicationStatus: 'draft', managedBy: 'staff' };
  db.events.unshift(event);
  return { event, created: true };
}
function recordMutation(event, kind, before) {
  const after = eventRevision(event);
  if (after !== before) {
    event.managedBy = 'staff';
    event.lastEventMutation = { kind, from: before, to: after };
  }
}
export function editEvent(event, input, action) {
  if (input.id !== undefined && input.id !== event.id) fail(400, '活动 ID 不可变更。');
  const kind = action || 'edit';
  const before = eventRevision(event);
  const content = !action && eventContent(input, event.draft || event);
  if (input.draftRevision !== undefined && input.draftRevision !== before) {
    // A lost HTTP response can be retried across a restart. A different edit or
    // decision against the same old screen must never operate on a newer draft.
    const last = event.lastEventMutation;
    if (last?.kind === kind && last.from === input.draftRevision && last.to === before &&
      (action || isDeepStrictEqual(content, eventContent({}, event.draft || event)))) return event;
    fail(409, '其他运营人员已更新此活动。请重新打开活动，核对最新内容后再操作。');
  }
  if (action === 'archive') {
    event.publicationStatus = 'archived';
  } else if (action === 'publish') {
    const proposed = event.draft || event;
    if (!proposed.description || (!proposed.date && !proposed.startsAt)) fail(400, '发布前请填写活动介绍和日期。');
    Object.assign(event, event.draft, { publicationStatus: 'published' });
    delete event.draft;
  } else {
    if (isPublished(event)) {
      if (isDeepStrictEqual(eventContent({}, event), content)) delete event.draft;
      else event.draft = content;
    } else Object.assign(event, content, { draft: undefined });
  }
  recordMutation(event, kind, before);
  return event;
}
export function setEventPhase(event, input) {
  const before = eventRevision(event);
  const status = oneOf(input.status, statusTypes, '活动状态');
  const phase = { status, submissionsOpen: status === 'active' && input.submissionsOpen === true };
  Object.assign(event, phase);
  if (event.draft) {
    Object.assign(event.draft, phase);
    if (isDeepStrictEqual(eventContent({}, event), event.draft)) delete event.draft;
  }
  recordMutation(event, 'phase', before);
  return event;
}
export function sceneFor(id) {
  return digest('01PLAYER/event/' + id).slice(0, 24);
}
export const eventsByScene = indexBy(event => sceneFor(event.id));
function cleanAnswers(fields, supplied) {
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) fail(400, '报名问卷格式错误。');
  if (Object.keys(supplied).some(id => !fields.some(field => field.id === id))) fail(400, '报名表已更新，请刷新并重新填写。');
  const answers = {};
  for (const field of fields) {
    const raw = Object.hasOwn(supplied, field.id) ? supplied[field.id] : undefined;
    const blank = typeof raw === 'string' && !raw.trim();
    if (raw == null || blank || (field.type === 'multiselect' && Array.isArray(raw) && !raw.length)) {
      if (field.required) fail(400, '请填写「' + field.label + '」。');
      continue;
    }
    if (field.type === 'multiselect') {
      if (!Array.isArray(raw) || new Set(raw).size !== raw.length || raw.some(option => !field.options.includes(option))) fail(400, '请选择有效的「' + field.label + '」选项。');
      answers[field.id] = [...raw].sort();
    } else {
      const clean = text(raw, field.label, field.type === 'textarea' ? 3000 : 300);
      if (field.type === 'select' && !field.options.includes(clean)) fail(400, '请选择有效的「' + field.label + '」选项。');
      answers[field.id] = clean;
    }
  }
  return answers;
}
export function registrationView(record) {
  const { keyDigest, requestDigest, ...row } = record;
  return { ...row, status: row.status || 'approved' };
}
export function receiptView(row) {
  return { id: row.id, eventId: row.eventId, createdAt: row.createdAt, status: row.status || 'approved', ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}) };
}
export function participantRegistrationView(row) {
  const result = receiptView(row);
  for (const key of ['userId','source','name','contact','note','answers','formFields']) {
    if (Object.hasOwn(row, key)) result[key] = row[key];
  }
  return result;
}
export function receiptToken(db, row) {
  return createHmac('sha256', db.registrationSecret).update(row.id + '/' + row.keyDigest).digest('base64url');
}
function matchesSavedAnswers(previous, supplied) {
  const saved = previous.answers ?? {};
  if (previous.formFields) return isDeepStrictEqual(saved, cleanAnswers(previous.formFields, supplied));
  // Older receipts contain answers without a questionnaire snapshot. The
  // current event may ask different questions, or may already be archived.
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) fail(400, '报名问卷格式错误。');
  const entries = Object.entries(saved);
  return entries.length === Object.keys(supplied).length && entries.every(([id, answer]) => {
    if (!Object.hasOwn(supplied, id)) return false;
    const value = supplied[id];
    if (Array.isArray(answer)) return Array.isArray(value) && value.every(item => typeof item === 'string')
      && isDeepStrictEqual([...answer].sort(), [...value].sort());
    return typeof value === 'string' && value.trim() === answer;
  });
}
export function registerAnonymous(registrations, event, body) {
  const key = body.idempotencyKey;
  const keyDigest = typeof key === 'string' && /^[a-zA-Z0-9_-]{16,128}$/.test(key) ? digest(key) : null;
  const previous = keyDigest && registrations.byKey(event.id, keyDigest);
  if (!previous && !isPublished(event)) fail(404, '活动不存在。');
  if (!keyDigest) fail(400, '提交标识无效，请重新打开报名表。');
  if (!previous && !acceptsRegistration(event)) fail(409, '本场活动已停止报名。');
  const name = text(body.name, '姓名或称呼', 60);
  const contact = text(body.contact, '联系方式', 250);
  const note = text(body.note ?? '', '备注', 1500, false);
  // A successful request can be replayed after organizers change the live form or archive it.
  if (previous) {
    if (previous.name !== name || previous.contact !== contact || (previous.note ?? '') !== note || !matchesSavedAnswers(previous, body.answers ?? {})) {
      fail(409, '提交内容已改变，请刷新报名状态。');
    }
    return previous;
  }
  const fields = event.formFields ?? [];
  const answers = cleanAnswers(fields, body.answers ?? {});
  if (registrations.hasContact(event.id, contact)) fail(409, '该报名信息已提交，请查看原回执或联系主办方。');
  const row = { id: randomUUID(), eventId: event.id, name, contact, note, answers, formFields: structuredClone(fields),
    source: 'miniprogram', status: event.registrationMode === 'review' ? 'pending' : 'approved', keyDigest, createdAt: new Date().toISOString() };
  registrations.add(row);
  return row;
}
export function reviewRegistration(row, body, actor) {
  const status = oneOf(body.status, ['approved','rejected','pending'], '审核结果');
  const note = text(body.note ?? '', '审核备注', 1500, false);
  const current = row.status || 'approved';
  if (current === status && (row.reviewNote || '') === note) return false;
  // A second decision from a stale pending list cannot replace the original review.
  // The existing explicit action of reopening a decision as pending is preserved.
  if (current !== 'pending' && status !== 'pending') fail(409, '该报名已处理，请刷新列表。');
  row.status = status;
  row.reviewNote = note;
  // Receipts use this version to ignore out-of-order responses across pages.
  const previousTime = Date.parse(row.updatedAt);
  const now = Date.now();
  row.updatedAt = new Date(previousTime >= now ? previousTime + 1 : now).toISOString();
  row.reviewedBy = actor;
  return true;
}

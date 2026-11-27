import { randomBytes } from 'node:crypto';
import { clientAddress } from './community-rate-limits.mjs';
import { photoView, savePhoto, removePhoto } from './event-photos.mjs';
import { fail, optionalPage, text } from './community-input.mjs';
import { handleStaffAccounts } from './community-accounts.mjs';
import { rowsById } from './community-indexes.mjs';
import { acceptsRegistration, createEvent, editEvent, eventCard, eventView, hasEventEnded, isPublished, receiptToken, receiptView,
  registerAnonymous, registrationView, reviewRegistration, sameSecret, eventsByScene } from './player-events.mjs';

export function staffIdentity(req, user, secret) {
  if (user?.role === 'admin') return { role: 'admin', id: user.id };
  if (!sameSecret(req.headers['x-01-staff-secret'], secret)) return null;
  const role = req.headers['x-01-staff-role'] || 'operator';
  if (!['admin', 'operator', 'owner'].includes(role)) return null;
  const id = text(req.headers['x-01-staff-id'] || role, '后台操作人', 160);
  return { role, id };
}
export function trustedStaffRequest(req, secret) {
  return sameSecret(req.headers['x-01-staff-secret'], secret) && !req.headers.origin;
}
export const isAnonymousRoute = route => route === 'registration-status' || /^events\/[A-Za-z0-9_-]+\/registrations$/.test(route);

export function initializeRegistrationState(db) {
  db.registrationSecret ||= randomBytes(32).toString('hex');
}

export function createEventRoutes({ wechat, staffSecret, secure, publicRoot, registrations, admitEnrollment }) {
  const requestCounts = new Map();
  let nextSweep = 0;
  function throttle(req, scope) {
    const key = clientAddress(req, secure) + '/' + scope;
    const now = Date.now();
    if (now >= nextSweep) {
      for (const [key, entry] of requestCounts) if (entry.until <= now) requestCounts.delete(key);
      nextSweep = now + 60000;
    }
    let entry = requestCounts.get(key);
    if (!entry || entry.until <= now) {
      entry = { until: now + 60000, count: 0 };
      requestCounts.set(key, entry);
    }
    if (++entry.count > 35) fail(429, '请求过于频繁，请稍后再试。');
  }
  // Keep mutations synchronous. A second request must never commit an older snapshot
  // while a provider fetch is waiting. Only read-only handoffs return a Promise.
  return function handle({ route, req, res, db, body, user, search, persist, send }) {
    const [area, id, action, subAction, ...extra] = route.split('/');
    const get = req.method === 'GET';
    const events = db.events;
    function publicEvent(item) {
      if (!item || !isPublished(item)) fail(404, '活动不存在或尚未公开。');
      return item;
    }
    const sendWechatCode = async id => {
      const image = await wechat.code(id);
      if (!image) fail(503, id ? '微信报名码暂不可用。' : '微信小程序码暂不可用。');
      res.setHeader('Content-Type', image.type);
      res.end(image.bytes);
      return true;
    };
    if (get && route === 'miniprogram/wechat') return wechat.handoff().then(result => { send(result); return true; });
    if (get && route === 'miniprogram/wechat-code') return sendWechatCode();
    if (area === 'events' && !extra.length && !subAction) {
      if (!id && get) {
        const view = search.get('view') === 'card' ? eventCard : eventView;
        send(events.filter(isPublished).map(event => view(event, db)));
        return true;
      }
      if (!id) return false;
      const event = rowsById(events).get(id);
      if (!get && action === 'registrations') {
        admitEnrollment(clientAddress(req, secure));
        if (!event) fail(404, '活动不存在。');
        // Permit a retry of the very same committed request after the organizer closes the event.
        const row = registrations.write(() => registerAnonymous(registrations, event, body));
        send({ ...receiptView(row), receiptToken: receiptToken(db, row) });
        return true;
      }
      if (!get) return false;
      publicEvent(event);
      if (!action) { send(eventView(event, db)); return true; }
      if (['wechat', 'wechat-code'].includes(action) && !acceptsRegistration(event)) fail(409, '本场活动已停止报名。');
      if (action === 'wechat') return wechat.handoff(id).then(result => { send(result); return true; });
      if (action === 'wechat-code') return sendWechatCode(id);
      return false;
    }
    if (area === 'event-scenes' && id && !action && get) {
      const event = publicEvent(eventsByScene(events).get(id));
      send(eventView(event, db)); return true;
    }
    if (route === 'registration-status' && !get) {
      const row = registrations.byId(body.id);
      const verified = row?.keyDigest && sameSecret(body.receiptToken, receiptToken(db, row));
      // A venue can have many players behind one IP. Verified receipts have
      // separate read limits. Unknown credentials share a single IP bucket.
      throttle(req, verified ? 'receipt/' + row.id : 'unknown-receipts');
      if (!verified) fail(404, '未找到该报名回执。');
      send(receiptView(row)); return true;
    }
    if (area !== 'staff') return false;
    const staff = staffIdentity(req, user, staffSecret);
    if (!staff) fail(user ? 403 : 401, '需要运营后台权限。');
    if (extra.length) fail(404, '后台接口不存在。');
    if (id === 'users') return handleStaffAccounts({ db, registrations, staff, get, id: action, action: subAction, body, search, persist, send });

    if (get) {
      if (route === 'staff/work-queue') {
        let unpublished = 0;
        for (const event of events) {
          if (event.publicationStatus === 'draft' || event.draft) unpublished++;
        }
        send({ events: unpublished, registrations: registrations.countStatus('pending') });
        return true;
      }
      if (route === 'staff/events') {
        if (search.get('view') === 'roster') {
          // Older registrations may need the event's question labels to display their answers.
          send(events.map(event => ({
            id: event.id,
            name: event.draft?.name ?? event.name,
            formFields: (event.draft?.formFields ?? event.formFields ?? []).map(({ id, label }) => ({ id, label })),
          })));
        } else {
          send(events.map(event => eventView(event, db, true)));
        }
        return true;
      }
      if (id === 'events' && action && !subAction) {
        const event = rowsById(events).get(action);
        if (!event) fail(404, '活动不存在。');
        send(eventView(event, db, true)); return true;
      }
      if (route === 'staff/registrations') {
        const eventId = search.get('event'), status = search.get('status');
        const accounts = rowsById(db.users);
        const view = row => ({ ...registrationView(row), accountId: accounts.has(row.userId) ? row.userId : null });
        const requested = optionalPage(search);
        if (requested) {
          const result = registrations.page(eventId, status, requested);
          send({ ...result, items: result.items.map(view) });
        } else send(registrations.list(eventId, status).map(view));
        return true;
      }
      if (route === 'staff/photos') {
        const eventId = search.get('event');
        send(db.photos.filter(photo => !eventId || photo.eventId === eventId).map(photoView)); return true;
      }
      if (route === 'staff/projects') {
        const status = search.get('status');
        const accountIds = new Set(db.users.map(account => account.id));
        send(db.projects.filter(project => !status || project.status === status)
          .map(project => ({ ...project, accountId: accountIds.has(project.ownerId) ? project.ownerId : null }))); return true;
      }
      fail(404, '后台接口不存在。');
    }

    if (id === 'events' && action && subAction === 'pin') {
      const event = rowsById(events).get(action);
      if (!event) fail(404, '活动不存在。');
      if (typeof body.pinned !== 'boolean') fail(400, '请选择是否在小程序首页置顶。');
      if (!isPublished(event) && body.pinned) fail(409, '请先发布活动，再设置首页置顶。');
      const current = db.miniHomePinnedEventId ?? null;
      if (body.pinned && current !== event.id && hasEventEnded(event)) fail(409, '此活动已结束，请选择其他活动置顶。');
      const next = body.pinned ? event.id : (current === event.id ? null : current);
      if (next !== current) {
        db = { ...db, miniHomePinnedEventId: next };
        persist(db);
      }
      send(eventView(event, db, true));
      return true;
    }
    if (id === 'registrations' && action && subAction === 'review') {
      const record = registrations.write(() => {
        const row = registrations.byId(action);
        if (!row) fail(404, '报名不存在。');
        if (reviewRegistration(row, body, staff.id)) registrations.update(row);
        return row;
      });
      send(registrationView(record));
      return true;
    }
    if (!['events', 'photos', 'projects'].includes(id)) fail(404, '后台接口不存在。');
    db = { ...db, [id]: structuredClone(db[id]) };
    let result, changedEvent;
    if (route === 'staff/events') {
      const { event, created } = createEvent(db, body);
      if (!created) { send(eventView(event, db, true)); return true; }
      changedEvent = event;
    } else if (id === 'events' && action && (!subAction || ['publish', 'archive'].includes(subAction))) {
      const event = db.events.find(item => item.id === action);
      if (!event) fail(404, '活动不存在。');
      changedEvent = editEvent(event, body, subAction);
      if (subAction === 'archive' && db.miniHomePinnedEventId === event.id) db.miniHomePinnedEventId = null;
    } else if (id === 'photos' && !subAction) {
      result = savePhoto(db, body, action, publicRoot);
    } else if (id === 'photos' && action && subAction === 'remove') {
      result = removePhoto(db, action);
    } else if (id === 'projects' && action && subAction === 'review') {
      const project = db.projects.find(item => item.id === action);
      if (!project) fail(404, '项目不存在。');
      result = reviewProject(project, body, staff.id);
    } else fail(404, '后台接口不存在。');
    persist(db);
    send(changedEvent ? eventView(changedEvent, db, true) : result);
    return true;
  };
}

export function reviewProject(project, body, actorId) {
  if (project.status !== 'pending') fail(409, '该项目已处理，请刷新列表。');
  if (!['approved', 'returned'].includes(body.status)) fail(400, '请选择审核结果。');
  project.reviewNote = body.status === 'returned' ? text(body.note, '修改建议', 1500) : '';
  project.status = body.status; project.reviewedBy = actorId; project.reviewedAt = new Date().toISOString();
  return project;
}

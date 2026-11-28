import { projectImages } from './project-images.mjs';
import { publicPlayer } from './public-player.mjs';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { events, seedProjects } from './community-seed.mjs';
import { reconcileEventArchives, publicEventProjects, eventAlbums, publicRecruitments } from './event-links.mjs';
import { rowsById, serializeProject } from './community-indexes.mjs';

import { fail, optionalPage, sameOriginSubmission, text } from './community-input.mjs';
import { projectFields, recruitment } from './project-fields.mjs';
import { accountStatus, advanceAccountRevision, revokeAccountSessions, updateAccountProfile } from './community-accounts.mjs';
import { initialPasswordHash, passwordHash, passwordMatches, runPasswordWork } from './community-passwords.mjs';
import { clientAddress, createAuthLimiter, createEnrollmentLimiter, createTrafficLimiter } from './community-rate-limits.mjs';
import { createSiteTraffic } from './site-traffic.mjs';
import { acceptsRegistration, importCatalog, isPublished, participantRegistrationView, receiptView, registrationView, setEventPhase } from './player-events.mjs';
import { acceptsProjectSubmissions, acceptsRecruitment, usesExternalRegistration } from './event-state.mjs';
import { pruneHomePins } from './home-pins.mjs';
import { createEventRoutes, initializeRegistrationState, isAnonymousRoute, reviewProject, trustedStaffRequest } from './player-event-routes.mjs';
import { checkRegistrationIdentity, openRegistrations, registrationFile } from './community-registrations.mjs';
import { historicalPhotoEdits, savePhoto } from './event-photos.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const publicUser = user => user ? { id: user.id, name: user.name, role: user.role } : null;
const sessionUser = user => user ? {
  ...publicUser(user),
  email: user.email,
  ...(user.loginName && { loginName: user.loginName }),
  ...(user.university && { university: user.university }),
  ...(user.publicContact && { publicContact: user.publicContact }),
  ...(user.avatar && { avatar: `/api/community/account/avatar?v=${user.avatar.version}` }),
} : null;
const shortLoginName = /^[a-z0-9][a-z0-9_-]{2,31}$/;
function newPassword(value) {
  const password = text(value, '新密码', 128);
  if (password.length < 10) fail(400, '密码至少需要 10 位。');
  return password;
}

export function createCommunityApi({ dataFile = process.env.COMMUNITY_DATA_FILE || resolve('.local/community.json'), demo = false, secure = false, adminEmail = process.env.COMMUNITY_ADMIN_EMAIL, adminPassword = process.env.COMMUNITY_ADMIN_PASSWORD, eventsFile = process.env.COMMUNITY_EVENTS_FILE, publicRoot = resolve('public'),
  staffSecret = process.env.COMMUNITY_STAFF_BRIDGE_SECRET, passwordQueue = runPasswordWork } = {}) {
  const imageDirectory = resolve(dirname(dataFile), 'project-media');
  let state, usersById, usersByEmail, usersByLogin, sessionsByToken;
  if (existsSync(dataFile)) {
    state = JSON.parse(readFileSync(dataFile, 'utf8'));
    if (state.demo !== demo) throw Error('示例数据与正式数据必须使用不同的 COMMUNITY_DATA_FILE。');
    checkRegistrationIdentity(state);
  } else {
    if (existsSync(registrationFile(dataFile))) throw Error('报名库已有数据，缺少社区身份文件，请恢复配套备份。');
    if (!demo && (!adminEmail || !adminPassword || adminPassword.length < 12)) throw Error('正式运行需设置管理员邮箱与至少 12 位密码。');
    state = { version: 1, demo, users: [], projects: demo ? seedProjects() : [], recruitments: [], registrations: [], reactions: [], sessions: [], events: demo ? events : [] };
    const createdAt = new Date().toISOString();
    if (demo) state.users.push({ id: 'demo-player', name: '示例玩家', email: 'player@example.test', password: initialPasswordHash('Player-2026!'), role: 'player', createdAt });
    state.users.push({ id: 'admin', name: demo ? '示例管理员' : '零一管理员', email: (demo ? 'admin@example.test' : adminEmail).toLowerCase(), password: initialPasswordHash(demo ? 'Admin-2026!' : adminPassword), role: 'admin', createdAt });
    if (demo) state.recruitments.push({ id: 'seed-team', eventId: 'ai-build-sprint', projectId: 'campus-agent', ownerId: 'demo-player', title: '校园搭子 · 寻找一起交付的伙伴', description: '把校园信息变成随时可用的 AI 问答服务。', ...state.projects.find(p => p.id === 'campus-agent').recruitment, author: '示例玩家', createdAt: new Date().toISOString() });
  }
  function useState(next) {
    if (!usersById || next.users !== state.users) {
      usersById = rowsById(next.users);
      usersByEmail = new Map(next.users.map(user => [user.email, user]));
      usersByLogin = new Map(next.users.map(user => [user.loginName || user.email, user]));
    }
    if (!sessionsByToken || next.sessions !== state.sessions)
      sessionsByToken = new Map(next.sessions.map(session => [session.token, session]));
    state = next;
  }
  function persist(next) {
    if (next.events !== state.events) reconcileEventArchives(next);
    if (next.events !== state.events || next.projects !== state.projects) pruneHomePins(next);
    mkdirSync(dirname(dataFile), { recursive: true, mode: 0o700 });
    writeFileSync(`${dataFile}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 });
    renameSync(`${dataFile}.tmp`, dataFile);
    useState(next);
  }
  const initial = { ...state, instanceId: state.instanceId || randomUUID() };
  if (eventsFile) {
    const catalog = JSON.parse(readFileSync(eventsFile, 'utf8'));
    initial.events = importCatalog(catalog, state.events, demo);
  }
  initializeRegistrationState(initial);
  reconcileEventArchives(initial);
  pruneHomePins(initial);
  if (Object.keys(initial).some(key => initial[key] !== state[key])) persist(initial);
  else useState(initial);
  const registrations = openRegistrations(dataFile, () => state, persist);
  const admitEnrollment = createEnrollmentLimiter();
  const traffic = createSiteTraffic(dataFile);
  const admitTraffic = createTrafficLimiter();
  const eventRoutes = createEventRoutes({ staffSecret, secure, publicRoot, imageDirectory, registrations, admitEnrollment, checkExpectedAccount });
  function identity(req) {
    const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('lingyi_session='))?.slice(15);
    const tokenHash = token && hash(token);
    const session = sessionsByToken.get(tokenHash);
    const user = session && session.expires > Date.now() && usersById.get(session.userId);
    return { tokenHash, user: user && accountStatus(user) === 'active' ? user : null };
  }
  const authLimits = createAuthLimiter();
  const cookie = (token = '') => `lingyi_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${token ? 604800 : 0}${secure ? '; Secure' : ''}`;
  function checkExpectedAccount(req, user) {
    const expected = req.headers['x-community-account'];
    if (expected !== undefined && expected !== (user?.id || 'anonymous')) {
      fail(401, '当前登录账号已变更，请刷新页面并确认账号后重试。');
    }
  }
  async function signIn(route, req, body) {
    const registering = route === 'register';
    const address = clientAddress(req, secure);
    const login = text(registering ? body.email : body.loginName ?? body.email, registering ? '邮箱' : '账号', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login) && (registering || !shortLoginName.test(login)))
      fail(400, registering ? '请填写有效邮箱。' : '请填写登录账号或邮箱。');
    const password = registering ? newPassword(body.password) : text(body.password, '密码', 128);
    let newAccount, countRegistration;
    if (registering) {
      const email = login;
      if (usersByEmail.has(email)) fail(409, '此邮箱已注册，请登录。');
      authLimits.checkRegistration(address);
      const name = text(body.name, '昵称', 40);
      const digest = await passwordQueue(() => passwordHash(password));
      if (usersByEmail.has(email)) fail(409, '此邮箱已注册，请登录。');
      countRegistration = authLimits.checkRegistration(address);
      newAccount = { id: randomUUID(), email, name, password: digest, role: 'player', createdAt: new Date().toISOString() };
    } else {
      authLimits.checkLogin(address, login);
      const previous = usersByLogin.get(login);
      const matches = previous && await passwordQueue(() => passwordMatches(password, previous.password));
      const current = usersByLogin.get(login);
      const valid = matches && current?.id === previous.id && current.password === previous.password;
      authLimits.finishLogin(address, login, valid);
      if (accountStatus(current) !== 'active') fail(403, '此账号已停用，请联系运营负责人。');
      if (current.accountRevision !== previous.accountRevision) fail(409, '账号状态已变更，请重新登录。');
    }
    // No await from the latest uniqueness/credential checks through the commit.
    const account = newAccount || { ...usersByLogin.get(login) };
    const db = { ...state, users: newAccount ? [...state.users, account] : state.users.map(u => u.id === account.id ? account : u) };
    const now = Date.now();
    account.lastLoginAt = new Date(now).toISOString();
    const previousHash = identity(req).tokenHash;
    const token = randomBytes(32).toString('hex');
    db.sessions = db.sessions.filter(session => session.expires > now && session.token !== previousHash);
    db.sessions.push({ token: hash(token), userId: account.id, expires: now + 7 * 86400000 });
    persist(db);
    countRegistration?.();
    return { data: { user: sessionUser(account) }, setCookie: cookie(token) };
  }
  async function changePassword(req, body) {
    const previous = identity(req).user;
    checkExpectedAccount(req, previous);
    if (!previous) fail(401, '请先登录，再继续刚才的操作。');
    const current = text(body.currentPassword, '当前密码', 128);
    const replacement = newPassword(body.newPassword);
    let loginName;
    if (body.newLoginName !== undefined) {
      if (previous.role !== 'admin') fail(403, '仅管理员可修改管理员登录账号。');
      loginName = text(body.newLoginName, '登录账号', 32).toLowerCase();
      if (!shortLoginName.test(loginName)) fail(400, '账号需为 3 至 32 位字母或数字，可包含下划线或短横线。');
    }
    const digest = await passwordQueue(async () => {
      if (!await passwordMatches(current, previous.password)) fail(400, '当前密码不正确。');
      if (current === replacement) fail(400, '新密码需要与当前密码不同。');
      return passwordHash(replacement);
    });
    const live = identity(req).user;
    if (!live || live.id !== previous.id) fail(401, '登录状态已变更，请重新登录。');
    if (live.password !== previous.password || live.accountRevision !== previous.accountRevision) {
      fail(409, '账号状态已变更，请重新登录。');
    }
    const account = { ...live };
    if (loginName) {
      const taken = usersByLogin.get(loginName);
      if (taken && taken.id !== live.id) fail(409, '这个登录账号已被使用。');
      account.loginName = loginName;
    }
    const db = { ...state, users: state.users.map(u => u.id === live.id ? account : u) };
    account.password = digest;
    revokeAccountSessions(db, account.id);
    advanceAccountRevision(account);
    persist(db);
    return { data: { ok: true }, setCookie: cookie() };
  }
  const canRead = (project, user) => project.status === 'approved' || project.ownerId === user?.id || user?.role === 'admin';
  async function api(req, res, next = () => { res.statusCode = 404; res.end(); }) {
    let requestUrl;
    try { requestUrl = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); res.end(); return; }
    if (!requestUrl.pathname.startsWith('/api/community/')) return next();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (value, status = 200) => { res.statusCode = status; res.end(JSON.stringify(value)); };
    try {
      const route = requestUrl.pathname.slice('/api/community/'.length);
      const mutating = req.method !== 'GET';
      if (mutating && req.method !== 'POST') fail(405, '不支持的请求方式。');
      if (route === 'staff/traffic') {
        if (mutating) fail(405, '不支持的请求方式。');
        if (!trustedStaffRequest(req, staffSecret)) fail(403, '需要运营后台权限。');
        return send({ ...traffic.read(), demo });
      }
      if (mutating) {
        const origin = req.headers.origin;
        const nativeJson = isAnonymousRoute(route) && !origin && !req.headers.cookie && req.headers['content-type']?.split(';')[0].toLowerCase() === 'application/json';
        if (!sameOriginSubmission(req, secure) || (req.headers['x-community-request'] !== '1' && !nativeJson && !trustedStaffRequest(req, staffSecret))) fail(403, '请从本站提交。');
      }
      let body = {};
      if (mutating) {
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > (route === 'page-view' ? 512 : /^(?:projects$|edit\/|staff\/projects(?:\/|$))/.test(route) ? 1_500_000 : 64000)) fail(413, '提交内容过大，请缩短正文或重新压缩图片。');
          chunks.push(chunk);
        }
        const raw = Buffer.concat(chunks).toString('utf8');
        try { body = JSON.parse(raw || '{}'); } catch { fail(400, '提交格式错误，请重试。'); }
        if (!body || Array.isArray(body) || typeof body !== 'object') fail(400, '提交格式错误。');
      }
      if (mutating && route === 'page-view') {
        admitTraffic(clientAddress(req, secure));
        traffic.record(body);
        return send({ ok: true });
      }
      if (mutating && (route === 'login' || route === 'register' || route === 'account/password')) {
        const result = route === 'account/password' ? await changePassword(req, body) : await signIn(route, req, body);
        res.setHeader('Set-Cookie', result.setCookie);
        return send(result.data);
      }
      // Read the committed snapshot through permission checks; copy only when a write is needed.
      let db = state;
      const beginWrite = collection => {
        db = { ...state };
        if (collection) db[collection] = structuredClone(state[collection]);
      };
      const { tokenHash, user } = identity(req);
      const handled = eventRoutes({ route, req, res, db, body, user, search: requestUrl.searchParams, persist, send });
      if (handled) { await handled; return; }
      const requireUser = () => { if (!user) fail(401, '请先登录，再继续刚才的操作。'); return user; };
      const getEvent = id => { const event = db.events.find(e => e.id === id); if (!event || (!isPublished(event) && user?.role !== 'admin')) fail(404, '活动不存在。'); return event; };
      const getProject = id => {
        const project = mutating ? db.projects.find(p => p.id === id) : rowsById(db.projects).get(id);
        if (!project || !canRead(project, user)) fail(404, '项目尚未公开或不存在。');
        return project;
      };
      if (req.method === 'GET') {
        if (route === 'health') {
          try {
            accessSync(dataFile, constants.R_OK);
            accessSync(dirname(dataFile), constants.W_OK);
            if (db.registrationStore) accessSync(registrationFile(dataFile), constants.R_OK | constants.W_OK);
          }
          catch { fail(503, '活动数据存储暂不可用。'); }
          return send({ service: '01player-community', status: 'ok', demo });
        }
        if (route === 'session') {
          const session = { user: sessionUser(user), demo };
          const event = requestUrl.searchParams.get('registrationEvent');
          if (event !== null) session.eventReceiptId = (user && registrations.receiptIdForEvent(user.id, event)) || null;
          return send(session);
        }
        if (route === 'account/avatar') {
          const avatar = requireUser().avatar;
          if (!avatar || requestUrl.searchParams.get('v') !== avatar.version) fail(404, '头像不存在。');
          res.setHeader('Content-Type', 'image/jpeg');
          return res.end(Buffer.from(avatar.data, 'base64'));
        }
        if (route.startsWith('project-media/')) {
          const filename = route.slice('project-media/'.length);
          if (!/^[a-f0-9]{64}\.jpg$/.test(filename) || !db.projects.some(project => (canRead(project,user) || trustedStaffRequest(req,staffSecret)) && projectImages(project).includes('/api/community/'+route))) fail(404, '图片不存在。');
          const path = resolve(imageDirectory,filename);
          if (!existsSync(path)) fail(404, '图片不存在。');
          res.setHeader('Content-Type','image/jpeg');
          return res.end(readFileSync(path));
        }
        if (/^profiles\/[^/]+\/avatar$/.test(route)) {
          const id = route.split('/')[1];
          const profile = publicPlayer(db,id), avatar = usersById.get(id)?.avatar;
          if (!profile || !avatar || requestUrl.searchParams.get('v') !== avatar.version) fail(404,'头像不存在。');
          res.setHeader('Content-Type','image/jpeg');
          return res.end(Buffer.from(avatar.data,'base64'));
        }
        if (route.startsWith('profiles/')) {
          const profile = publicPlayer(db, route.slice('profiles/'.length));
          if (!profile) fail(404, '玩家主页不存在或暂无公开内容。');
          return send(profile);
        }
        if (route === 'projects') return send(publicEventProjects(db, requestUrl.searchParams.get('event')).map(p => serializeProject(p, user, db)));
        if (route === 'albums') {
          const albums = eventAlbums(db);
          return send(requestUrl.searchParams.get('historical') === '1'
            ? { albums, historicalPhotos: historicalPhotoEdits(db) }
            : albums);
        }
        if (route.startsWith('projects/')) return send(serializeProject(getProject(route.slice(9)), user, db));
        if (route === 'mine') {
          requireUser();
          const events = rowsById(db.events);
          if (requestUrl.searchParams.get('view') === 'registrations') {
            const id = requestUrl.searchParams.get('receipt');
            const row = id === null ? null : registrations.byId(id);
            const rows = id === null ? registrations.forUser(user.id) : row?.userId === user.id ? [row] : [];
            return send({ registrations: rows.map(row => ({ ...receiptView(row, events.get(row.eventId)), name: row.name })) });
          }
          return send({
            projects: db.projects.filter(p => p.ownerId === user.id).map(p => serializeProject(p, user, db)),
            registrations: registrations.forUser(user.id).map(row => participantRegistrationView(row, events.get(row.eventId))),
            recruitments: db.recruitments.filter(r => r.ownerId === user.id),
          });
        }
        if (route === 'recruitments') return send(publicRecruitments(db, requestUrl.searchParams.get('event')));
        if (route === 'review') { requireUser(); if (user.role !== 'admin') fail(403, '仅管理员可以审核。'); return send(db.projects.filter(p => p.status === 'pending')); }
        if (route === 'registrations') {
          requireUser();
          if (user.role !== 'admin') fail(403, '仅管理员可以查看报名。');
          const requested = optionalPage(requestUrl.searchParams);
          if (!requested) return send(registrations.list().map(registrationView));
          const result = registrations.page(null, null, requested);
          return send({ ...result, items: result.items.map(registrationView) });
        }
        fail(404, '内容不存在。');
      }
      // Staff and anonymous event operations have already used their own identity rules.
      checkExpectedAccount(req, user);
      let result = { ok: true }, setCookie;
      if (route === 'logout') {
        if (sessionsByToken.has(tokenHash)) {
          beginWrite();
          db.sessions = db.sessions.filter(session => session.token !== tokenHash);
        }
        setCookie = cookie();
      } else {
        requireUser();
        if (route === 'account/profile') {
          const profile = updateAccountProfile(user, body);
          db = { ...state, users: state.users.map(account => account.id === user.id ? profile : account) };
          result = { user: sessionUser(profile) };
        } else if (route.startsWith('event-status/')) {
          if (user.role !== 'admin') fail(403, '仅管理员可以调整活动状态。');
          beginWrite('events');
          result = setEventPhase(getEvent(route.slice(13)), body);
        } else if (route === 'photos') {
          if (user.role !== 'admin') fail(403, '仅管理员可以添加活动照片。');
          beginWrite('photos');
          result = savePhoto(db, body, null, publicRoot);
        } else if (route === 'projects' || route.startsWith('edit/')) {
          const existing = route.startsWith('edit/') ? getProject(route.slice(5)) : null;
          if (existing && existing.ownerId !== user.id) fail(403, '只能修改自己的项目。');
          const eventId = existing ? existing.eventId : (body.eventId || null);
          if (!existing && eventId) {
            const event = getEvent(eventId);
            if (!isPublished(event)) fail(404, '活动不存在。');
            if (!acceptsProjectSubmissions(event)) fail(409, '本场活动暂未开放作品提交。');
          }
          const project = { id: existing?.id || randomUUID(), ownerId: user.id, author: user.name, ...projectFields(body, eventId, imageDirectory), status: 'pending', reviewNote: '', example: demo, createdAt: existing?.createdAt || new Date().toISOString() };
          const index = existing ? db.projects.indexOf(existing) : -1;
          db = { ...state, projects: state.projects.slice() };
          if (index >= 0) db.projects[index] = project; else db.projects.unshift(project);
          result = project;
        } else if (route === 'recruitments') {
          const event = getEvent(body.eventId); if (!acceptsRecruitment(event)) fail(409, '本场活动暂不接受组队招募。');
          const project = getProject(body.projectId); if (project.ownerId !== user.id) fail(403, '请选择自己的项目。');
          const item = { id: randomUUID(), eventId: event.id, projectId: project.id, ownerId: user.id, author: user.name, title: text(body.title, '招募标题', 100), description: text(body.description, '项目简介', 30), ...recruitment(body.recruitment || {}), createdAt: new Date().toISOString() };
          beginWrite('recruitments');
          db.recruitments.unshift(item); result = item;
        } else if (route === 'register-event') {
          admitEnrollment(clientAddress(req, secure));
          const event = getEvent(body.eventId); if (usesExternalRegistration(event)) fail(409, '本场活动通过外部链接报名。'); if (!acceptsRegistration(event)) fail(409, '本场活动不在报名期。');
          if (event.formFields?.length) fail(409, '请在活动详情中打开完整报名表。');
          const contact = text(body.contact, '联系方式', 250);
          const row = registrations.write(() => {
            if (registrations.hasUser(event.id, user.id)) fail(409, '你已经报名，可以在玩家空间中查看。');
            if (registrations.hasContact(event.id, contact)) fail(409, '此联系方式已提交本场报名。');
            const record = { id: randomUUID(), eventId: event.id, userId: user.id, status: event.registrationMode === 'review' ? 'pending' : 'approved', name: text(body.name, '姓名或称呼', 60), contact, note: text(body.note || '', '参与想法', 1500, false), createdAt: new Date().toISOString() };
            registrations.add(record);
            return record;
          });
          return send(row);
        } else if (route.startsWith('review/')) {
          if (user.role !== 'admin') fail(403, '仅管理员可以审核。');
          beginWrite('projects');
          result = reviewProject(getProject(route.slice(7)), body, user.id);
        } else if (route.startsWith('reaction/')) {
          const project = getProject(route.slice(9)); if (project.status !== 'approved') fail(409, '项目公开后才能点赞或收藏。');
          if (!['like', 'save'].includes(body.kind) || typeof body.active !== 'boolean') fail(400, '无效操作。');
          beginWrite();
          db.reactions = db.reactions.filter(r => !(r.userId === user.id && r.projectId === project.id && r.kind === body.kind));
          if (body.active) db.reactions.push({ userId: user.id, projectId: project.id, kind: body.kind });
          result = serializeProject(project, user, db);
        } else fail(404, '操作不存在。');
      }
      if (db !== state) persist(db);
      if (setCookie) res.setHeader('Set-Cookie', setCookie);
      send(result);
    } catch (error) {
      if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
      send({ error: error.status ? error.message : '服务暂时不可用，请稍后重试。' }, error.status || 500);
      if (!error.status) console.error('[community]', error);
    }
  }
  return Object.assign(api, {
    instanceId: state.instanceId,
    close: () => { registrations.close(); traffic.close(); },
    resolveUser: req => publicUser(identity(req).user),
    canLinkProject: (id, user) => {
      const project = rowsById(state.projects).get(id);
      return Boolean(project && canRead(project, user));
    },
  });
}

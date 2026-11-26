import { communityApi } from '../api.js';

// Window focus and visibility often arrive together. An explicit account/authorization
// change arriving during a check receives one follow-up read of the latest cookie.
export function watchSession(user, protectedView, onChange) {
  let alive = true,
    checking = false,
    queued = false,
    timer,
    lastRead = -Infinity;
  const foreground = () => !document.hidden && document.hasFocus();
  const check = async (force = false) => {
    if (!alive) return;
    if (checking) {
      if (force) queued = true;
      return;
    }
    if (!force && Date.now() - lastRead < 600) return;
    checking = true;
    lastRead = Date.now();
    try {
      const session = await communityApi('session');
      if (alive && ['id', 'role', 'name', 'email', 'university', 'avatar'].some((key) => user?.[key] !== session.user?.[key])) {
        alive = false;
        onChange(session);
      }
    } catch {
      /* A brief connection loss does not imply an account change. */
    } finally {
      checking = false;
      if (queued && alive) {
        queued = false;
        check(true);
      }
    }
  };
  const stop = () => {
    clearInterval(timer);
    timer = undefined;
  };
  const arm = () => {
    stop();
    if (user && protectedView && foreground()) timer = setInterval(() => check(), 30000);
  };
  const focus = () => {
    arm();
    if (foreground()) check();
  };
  const stored = (event) => {
    if (event.key === '01player-account-change') check(true);
  };
  const restored = (event) => {
    if (event.persisted) focus();
  };
  const unauthorized = () => check(true);
  arm();
  document.addEventListener('visibilitychange', focus);
  window.addEventListener('focus', focus);
  window.addEventListener('blur', stop);
  window.addEventListener('storage', stored);
  window.addEventListener('pageshow', restored);
  window.addEventListener('01player-unauthorized', unauthorized);
  return () => {
    alive = false;
    stop();
    document.removeEventListener('visibilitychange', focus);
    window.removeEventListener('focus', focus);
    window.removeEventListener('blur', stop);
    window.removeEventListener('storage', stored);
    window.removeEventListener('pageshow', restored);
    window.removeEventListener('01player-unauthorized', unauthorized);
  };
}

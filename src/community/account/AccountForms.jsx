import { playerSystemAvailable } from '../../data/positioning.js';
import { useEffect, useRef, useState } from 'react';
import { FiArrowLeft, FiArrowRight, FiUser } from 'react-icons/fi';
import SpecularButton from '../../SpecularButton';
import { communityApi as api, communityLink as link } from '../api';
import { Button, Field, Frame } from '../CommunityUi';
import { AccountAccess } from './AccountAccess';
import { AccountForm, PasswordField } from './AccountForm';
import { accountLink, announceSessionChange, pageLocation } from './navigation';
import { AVATAR_EDGE, prepareAvatar } from './profile';
import { playerIdentityForRole, playerIdentityLabels } from './identity';
export { AccountHeading } from './AccountAccess';

export function AccountReturn({ href }) {
  return <Button href={href} className="account-switch"><FiArrowLeft aria-hidden="true" />返回</Button>;
}

function AccountAvatar({ src }) {
  return (
    <span className="account-avatar" aria-hidden="true">
      {src ? <img src={src} alt="" width={AVATAR_EDGE} height={AVATAR_EDGE} /> : <FiUser />}
    </span>
  );
}

export function LoginForm({ title, register, onModeChange, onSuccess, purpose, notice }) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const authenticate = async (values) => {
    const { user } = await api(register ? 'register' : 'login', {
      ...values,
      email: values.email.trim(),
    });
    if (!user?.id) throw Error('未收到登录状态，请重试。');
    const session = await api('session');
    if (session.user?.id !== user.id) throw Error('登录凭证未能保存，请允许本站使用 Cookie 后再登录。');
    announceSessionChange();
    await onSuccess(session);
  };
  return (
    <AccountAccess title={title} purpose={purpose} notice={notice}>
      <AccountForm
        key={String(register)}
        onBusy={setSubmitting}
        onSubmit={authenticate}
        submit={register ? '注册并继续' : '欢迎加入地球Online：零一玩家'}
        pending={register ? '正在注册…' : '正在登录…'}
      >
        {register && (
          <Field label="昵称" name="name" required maxLength={40} autoComplete="nickname" />
        )}
        <Field
          label={register ? '邮箱' : '账号或邮箱'}
          name="email"
          type={register ? 'email' : 'text'}
          autoComplete="username"
          inputMode={register ? 'email' : 'text'}
          spellCheck={false}
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <PasswordField name="password" label="密码" creating={register} />
      </AccountForm>
      <Button type="button" className="account-switch" disabled={submitting} onClick={() => onModeChange(!register)}>
        {register ? '已有账号，去登录' : '还没有零一账号，先注册'}
        <FiArrowRight aria-hidden="true" />
      </Button>
    </AccountAccess>
  );
}

export function PlayerSpace({ user, section, back, continuation, action, onContinue, notice, tab, onTabChange, saved, children }) {
  const profileEntry = useRef(null);
  const heading = useRef(null);
  const focusAfterTabChange = useRef(false);
  const recordsOpen = tab === 'records';
  const showPlayerSystem = playerSystemAvailable();
  const canReview = user.role === 'admin';
  const showTab = next => {
    focusAfterTabChange.current = true;
    onTabChange(next);
  };
  useEffect(() => {
    if (!focusAfterTabChange.current) return;
    focusAfterTabChange.current = false;
    window.scrollTo({ top: 0, behavior: 'instant' });
    const target = recordsOpen ? profileEntry.current?.querySelector('button') : heading.current;
    target?.focus({ preventScroll: true });
  }, [recordsOpen]);
  return (
    <div className={`player-space${recordsOpen ? '' : ' player-space--settings'}`}>
      {recordsOpen && <aside className="player-space-sidebar" aria-label="玩家信息">
        <Frame className="player-space-card player-space-profile" radius={16} flush>
          <div className="account-identity">
            <AccountAvatar src={user.avatar} />
            <div>
              <h2>{user.name}</h2>
              <p>
                <span>{playerIdentityLabels[playerIdentityForRole(user.role)]}</span>
                {user.university && <> · <span>{user.university}</span></>}
              </p>
            </div>
          </div>
          {user.publicContact && <p className="player-space-contact">联系方式：{user.publicContact}</p>}
          <div className="hero-entry player-space-profile-entry" ref={profileEntry}>
            <SpecularButton className="hero-button" onClick={() => showTab('profile')}>
              玩家资料
            </SpecularButton>
          </div>
          {(continuation || action || showPlayerSystem || canReview) && (
            <div className="account-links">
              {continuation && <a href={continuation.href}>{continuation.label} <FiArrowRight aria-hidden="true" /></a>}
              {action && (
                <button type="button" onClick={onContinue}>
                  继续{action.kind === 'like' ? '点赞' : '收藏'} <FiArrowRight aria-hidden="true" />
                </button>
              )}
              {showPlayerSystem && <a href="/player/">打开玩家系统 <FiArrowRight aria-hidden="true" /></a>}
              {canReview && <a href={accountLink('review', back, section)}>审核管理 <FiArrowRight aria-hidden="true" /></a>}
            </div>
          )}
        </Frame>
        {saved}
      </aside>}
      <div className="player-space-content">
        <div className="player-space-toolbar">
          <h2 ref={heading} tabIndex={-1}>{recordsOpen ? '参与记录' : '玩家资料'}</h2>
          {recordsOpen ? (
            <div className="player-space-actions">
              <div className="hero-entry">
                <SpecularButton className="hero-button" href={accountLink('publish', pageLocation(), section)}>发布项目</SpecularButton>
              </div>
              <div className="hero-entry">
                <SpecularButton className="hero-button" href={link('players')}>参与活动</SpecularButton>
              </div>
            </div>
          ) : (
            <div className="player-space-actions">
              <Button className="player-settings-action" size="sm" shineOnInteraction onClick={() => showTab('records')}>
                <FiArrowLeft aria-hidden="true" />返回
              </Button>
            </div>
          )}
        </div>
        {notice && <p className="community-feedback" role="status">{notice}</p>}
        {children}
      </div>
    </div>
  );
}

export function PlayerProfileSettings({ user, back, section, notice, onSaved, onLogout }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="player-space-settings">
      <EditProfile user={user} onSaved={onSaved} notice={notice} />
      <Frame as="section" className="player-space-card player-account-settings" radius={16} flush
        aria-labelledby="player-account-settings-heading">
        <h3 id="player-account-settings-heading">账号设置</h3>
        <h4 className="player-password-heading">修改密码</h4>
        <ChangePassword user={user} back={back} section={section} />
        <div className="player-account-actions">
          <Button shineOnInteraction disabled={loggingOut} onClick={async () => {
            setLoggingOut(true);
            setError('');
            try {
              await onLogout();
            } catch (err) {
              setError(err.message);
              setLoggingOut(false);
            }
          }}>
            {loggingOut ? '正在退出…' : '退出登录'} <FiArrowRight aria-hidden="true" />
          </Button>
        </div>
        {error && <p role="alert" className="community-feedback">{error}</p>}
      </Frame>
    </div>
  );
}

function ChangePassword({ user, back, section }) {
  return (
    <AccountForm
      shineOnInteraction
      submit="更新密码"
      pending="正在更新…"
      onSubmit={async (values) => {
        if (values.newPassword !== values.confirmPassword) throw Error('两次输入的新密码不一致。');
        await api(
          'account/password',
          {
            currentPassword: values.currentPassword,
            newPassword: values.newPassword,
          },
          user.id,
        );
        announceSessionChange();
        window.location.replace(
          accountLink('login', back, section, { authNotice: 'password-changed' }),
        );
      }}
    >
      <input
        className="account-username"
        type="text"
        name="username"
        autoComplete="username"
        value={user.loginName || user.email || user.name}
        readOnly
        tabIndex={-1}
        aria-label="当前账号"
      />
      <PasswordField name="currentPassword" label="当前密码" />
      <PasswordField name="newPassword" label="新密码" creating />
      <PasswordField name="confirmPassword" label="确认新密码" creating />
    </AccountForm>
  );
}

function EditProfile({ user, onSaved, notice }) {
  const [avatar, setAvatar] = useState(undefined);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const displayedAvatar = avatar ?? user.avatar;
  return (
    <Frame as="section" className="player-space-card player-profile-edit" radius={16} flush
      aria-labelledby="player-profile-edit-heading">
      <h3 id="player-profile-edit-heading">头像与资料</h3>
      <AccountForm shineOnInteraction submit="保存资料" pending="正在保存…" disabled={preparing}
        onSubmit={async ({ name, university, publicContact }) => {
          const result = await api('account/profile', { name, university, publicContact, avatar }, user.id);
          setAvatar(undefined);
          onSaved(result.user);
        }}>
        <div className="account-profile-photo">
          <AccountAvatar src={displayedAvatar} />
          <label className="account-avatar-picker">
            <span>{preparing ? '正在处理…' : '选择头像'}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={preparing}
              onChange={async (event) => {
                const file = event.currentTarget.files[0];
                if (!file) return;
                event.currentTarget.value = '';
                setPreparing(true);
                setError('');
                try {
                  setAvatar(await prepareAvatar(file));
                } catch (err) {
                  setError(err instanceof DOMException ? '头像图片无法读取。' : err.message);
                } finally {
                  setPreparing(false);
                }
              }} />
          </label>
        </div>
        {error && <p className="community-feedback" role="alert">{error}</p>}
        <Field label="昵称" name="name" defaultValue={user.name} required maxLength={40} autoComplete="nickname" />
        <Field label="大学（选填）" name="university" defaultValue={user.university || ''} maxLength={100} />
        <Field label="联系方式（选填）" name="publicContact" defaultValue={user.publicContact || ''} maxLength={200} placeholder="微信、邮箱或其他联系渠道" />
        <p className="community-muted">昵称、头像、大学和填写的联系方式会展示在公开玩家主页。</p>
      </AccountForm>
      {notice && <p className="community-feedback" role="status">{notice}</p>}
    </Frame>
  );
}

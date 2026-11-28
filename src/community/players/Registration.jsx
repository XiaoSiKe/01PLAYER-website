import { linkWithSource, pageLocation, returnDestination } from '../account/navigation';
import { orderRegistrations } from './registration-order';
import { saveTicket } from './save-ticket';
import { usesExternalRegistration } from '../../../server/event-state.mjs';
import { useEffect, useRef, useState } from 'react';
import { FiArrowRight, FiCheck, FiClock, FiX } from 'react-icons/fi';
import ClubLogo from '../../components/ClubLogo';
import { Button, DetailBack, Empty, Frame } from '../CommunityUi';
import { communityApi, communityLink as link } from '../api';
import { acceptsSignup, eventDate, eventLocationLabel, eventStatus, eventStatuses } from './events';
import { localReceipts, pendingRegistration, refreshReceipt, submitRegistration } from './registration-store';
import './registration.css';

const statusText = {
  approved: ['报名成功', '你的报名已确认，请留意活动安排及主办方通知。'],
  pending: ['等待审核', '报名资料已提交，主办方审核后会在这里更新结果。'],
  rejected: ['审核未通过', '本次报名未通过审核。'],
};
const checkedTime = value => value ? new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23',
}).format(new Date(value)) : '尚未刷新';

function RegistrationEventFacts({ event = {} }) {
  const location = event.location?.trim();
  const locationLabel = eventLocationLabel(location);
  const mode = locationLabel.startsWith('线上') ? '线上' : locationLabel.startsWith('线下') ? '线下' : '待公布';
  return <dl className="registration-event-facts">
    <div><dt>活动时间</dt><dd>{eventDate(event) || '时间待公布'}</dd></div>
    <div><dt>参与方式</dt><dd>{mode}</dd></div>
    <div><dt>活动地点</dt><dd>{location || '地点待公布'}</dd></div>
  </dl>;
}

export function RegistrationTicket({ receipt, event, user }) {
  const [title, detail] = statusText[receipt.status] || ['状态待确认', '请刷新回执，获取最新结果。'];
  const Icon = receipt.status === 'approved' ? FiCheck : receipt.status === 'rejected' ? FiX : FiClock;
  const currentEvent = { ...receipt.event, ...(event?.id === receipt.eventId ? event : {}) };
  const name = receipt.participantName || receipt.name || user?.name || '零一玩家';
  const eventName = currentEvent.name || '本次活动';
  return <article className="registration-ticket" aria-label="报名票根">
    <div className="registration-ticket-imprint"><ClubLogo horizontal label="零一玩家｜01PLAYER" /><span>{currentEvent.example ? '体验票根' : '报名凭证'}</span></div>
    <div className="registration-ticket-result">
      <p className="registration-ticket-salutation">尊敬的{name}：</p>
      <p className="registration-ticket-welcome">{receipt.status === 'approved' ? `欢迎参加「${eventName}」！期待与你相见。` : `感谢你关注并报名「${eventName}」。`}</p>
      <div className="registration-ticket-status"><span className="registration-ticket-seal"><Icon aria-hidden="true" /></span><h2>{title}</h2></div>
      <p>{detail}</p>
    </div>
    <div className="registration-ticket-stub">
      <h3>{eventName}</h3>
      <RegistrationEventFacts event={currentEvent} />
      <div className={'registration-ticket-footer'+(receipt.status === 'approved' && receipt.ticketGroupQrUrl ? ' registration-ticket-footer--with-qr' : '')}>
        <div className="registration-ticket-reference-group"><span className="registration-ticket-reference-label">报名编号</span>
          <span className="registration-ticket-reference">{receipt.id}</span></div>
        {receipt.status === 'approved' && receipt.ticketGroupQrUrl && <figure className="registration-ticket-invite">
          <div className="registration-ticket-qr"><img src={receipt.ticketGroupQrUrl} alt="活动进群二维码" /></div>
          <figcaption>欢迎加入活动交流群</figcaption>
        </figure>}
      </div>
    </div>
  </article>;
}

export function RegistrationReceipt({ id, event, user }) {
  const [receipt, setReceipt] = useState(() => localReceipts().find(row => row.id === id));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestVersion = useRef(0);
  const ticket = useRef(null);
  const [saving,setSaving] = useState(false);
  async function refresh() {
    const version = ++requestVersion.current;
    setBusy(true); setError('');
    try {
      const saved = localReceipts().find(row => row.id === id);
      if (saved) {
        const latest = await refreshReceipt(saved);
        if (version === requestVersion.current) setReceipt(latest);
      }
      else if (user) {
        const mine = await communityApi('mine');
        const row = mine.registrations.find(row => row.id === id);
        if (!row) throw Error('没有找到这份报名回执。');
        if (version === requestVersion.current) setReceipt({ ...row, checkedAt: new Date().toISOString() });
      } else throw Error('此浏览器没有这份回执，请使用报名时的浏览器，或登录报名账号查看。');
    } catch (reason) { if (version === requestVersion.current) setError(reason.message); }
    finally { if (version === requestVersion.current) setBusy(false); }
  }
  useEffect(() => {
    let active = true;
    const read = async () => {
      if (!active || document.hidden) return;
      await refresh();
    };
    read();
    document.addEventListener('visibilitychange', read);
    return () => { active = false; requestVersion.current++; document.removeEventListener('visibilitychange', read); };
  }, [id, user?.id]);
  const current = receipt?.id === id ? receipt : null;
  const back = returnDestination(new URLSearchParams(location.search).get('from'),link('players',{view:'tickets'}),pageLocation());
  return <div className="web-registration web-registration--receipt">
    {current && <div ref={ticket}><RegistrationTicket receipt={current} event={event} user={user} /></div>}
    {error && <p className="community-feedback" role="alert">{error}</p>}
    <div className="registration-receipt-status">
      <div className="registration-receipt-tools"><Button size="sm" disabled={busy} onClick={refresh}>{busy ? '正在刷新…' : '刷新状态'}</Button>
      <Button size="sm" disabled={!current || saving} onClick={async () => {
        setSaving(true);setError('');
        try {await saveTicket(ticket.current?.querySelector('.registration-ticket'),current.id);}
        catch(reason) {setError(reason.message || '保存失败，请重试。');}
        finally {setSaving(false);}
      }}>{saving ? '正在保存…' : '保存票根'}</Button></div>
      <DetailBack href={back} inline shineOnInteraction>返回</DetailBack>
    </div>
    <p className="registration-receipt-updated">上次确认：{checkedTime(current?.checkedAt)}（北京时间）</p>
  </div>;
}

export function RegistrationList({ user, events = [] }) {
  const [receipts, setReceipts] = useState(localReceipts);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const sync = async () => {
      const local = localReceipts();
      if (!user) { if (active) setReceipts(local); return; }
      try {
        const mine = await communityApi('mine');
        const byId = new Map(local.map(row => [row.id, row]));
        mine.registrations.forEach(row => byId.set(row.id, {
          ...byId.get(row.id), ...row,
          event: byId.get(row.id)?.event || events.find(event => event.id === row.eventId),
        }));
        if (active) setReceipts([...byId.values()]);
      } catch (reason) { if (active) setError(reason.message); }
    };
    sync(); window.addEventListener('storage', sync); window.addEventListener('01player-receipts', sync);
    return () => { active = false; window.removeEventListener('storage', sync); window.removeEventListener('01player-receipts', sync); };
  }, [user?.id, events]);
  const pending = events.filter(event => pendingRegistration(event.id));
  return <div className="web-registration">
    {error && <p role="alert">{error}</p>}
    {!receipts.length && !pending.length && <Empty>暂无报名回执。</Empty>}
    <div className="registration-records">
      {pending.map(event => <Button key={event.id} href={linkWithSource(link('players', { view: 'register', event: event.id }))}>待确认 · {event.name}</Button>)}
      {orderRegistrations(receipts,events).map((row,index) => {
        const event = { ...row.event, ...events.find(event => event.id === row.eventId) };
        return <Frame as="a" radius={12} flush key={row.id} className="registration-record"
        href={linkWithSource(link('players', { view: 'receipt', event: row.eventId, receipt: row.id }))}>
        <div className="registration-record-heading"><span className="registration-record-order" aria-label={`第 ${index+1} 份报名`}>{String(index+1).padStart(2,'0')}</span><span>{statusText[row.status]?.[0] || '状态待确认'}</span></div>
        <h2>{event.name || '历史活动'}</h2>
        <RegistrationEventFacts event={event} />
        <p>报名编号 · {row.id}</p><FiArrowRight aria-hidden="true" />
      </Frame>;
      })}
    </div>
  </div>;
}

export default function RegistrationForm({ event, user, existing }) {
  const back = returnDestination(new URLSearchParams(location.search).get('from'),link('players',{event:event.id}),pageLocation());
  const [pending, setPending] = useState(() => pendingRegistration(event.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saved = localReceipts().find(row => row.eventId === event.id) || existing;
  useEffect(() => {
    if (saved) location.replace(linkWithSource(link('players', { view: 'receipt', event: event.id, receipt: saved.id }),back));
  }, [saved?.id]);
  const status = eventStatus(event);
  const canRegister = acceptsSignup(event);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    const values = new FormData(e.currentTarget);
    const answers = Object.fromEntries((event.formFields || []).map(field => [
      field.id, field.type === 'multiselect' ? values.getAll('answer-' + field.id) : values.get('answer-' + field.id) || '',
    ]));
    try {
      if (!pending && (event.formFields || []).some(field => field.required && field.type === 'multiselect' && !answers[field.id].length)) {
        throw Error('请完成所有必填多选题。');
      }
      const receipt = await submitRegistration(event, {
        name: values.get('name'), phone: values.get('phone'), wechat: values.get('wechat'), note: values.get('note') || '', answers,
      }, user?.id);
      location.replace(linkWithSource(link('players', { view: 'receipt', event: event.id, receipt: receipt.id }),back));
    } catch (reason) {
      setPending(pendingRegistration(event.id)); setError(reason.message); setBusy(false);
    }
  }
  return <div className="web-registration">
    <header className="registration-form-heading"><h1>{event.name}</h1>
      <DetailBack href={back} inline shineOnInteraction>返回</DetailBack>
    </header>
    <p className="community-muted">{eventDate(event)}{event.location && ' · ' + event.location}</p>
    {pending ? <p role="status">上次报名结果待确认，重试会继续确认同一笔报名。</p>
      : <p>{canRegister ? usesExternalRegistration(event) ? '请前往主办方报名页面完成报名。' : event.registrationMode === 'review' ? '主办方审核后确认报名。' : '提交后即可确认报名。' : eventStatuses[status]}{event.example && ' · 示例活动'}</p>}
    {saved ? <p role="status">正在打开已有票根…</p> : usesExternalRegistration(event) && !pending && canRegister ? <Frame><p>本场活动通过主办方的报名页面报名。</p><Button href={event.registrationUrl}>前往报名 <FiArrowRight aria-hidden="true" /></Button></Frame> : !canRegister && !pending ? <Empty>本场活动已停止接受报名。</Empty>
      : <Frame radius={16}><form className="community-form" onSubmit={submit}>
        <fieldset className="registration-form-fields" disabled={busy || Boolean(pending)}>
          <label className="community-field"><span>姓名或昵称 *</span><input name="name" required maxLength={60} autoComplete="name" defaultValue={pending?.body.name} /></label>
          <label className="community-field"><span>电话号码 *</span><input type="tel" name="phone" required maxLength={30} autoComplete="tel" placeholder="请输入电话号码" defaultValue={pending?.body.phone} /></label>
          <label className="community-field"><span>微信（选填）</span><input name="wechat" maxLength={100} placeholder="请输入微信号" defaultValue={pending?.body.wechat} /></label>
          {(event.formFields || []).map(field => <fieldset className="registration-question" key={field.id}>
            <legend>{field.label}{field.required ? ' *' : '（选填）'}</legend>
            {field.type === 'select' ? <select aria-label={field.label} name={'answer-' + field.id} required={field.required} defaultValue={pending?.body.answers?.[field.id] || ''}>
              <option value="">请选择</option>{field.options.map(option => <option key={option}>{option}</option>)}
            </select> : field.type === 'multiselect' ? <div className="registration-options">
              {field.options.map(option => <label key={option}><input type="checkbox" name={'answer-' + field.id} value={option} defaultChecked={pending?.body.answers?.[field.id]?.includes(option)} />{option}</label>)}
            </div> : field.type === 'textarea' ? <textarea aria-label={field.label} name={'answer-' + field.id} required={field.required} maxLength={3000} rows={4} defaultValue={pending?.body.answers?.[field.id]} />
              : <input aria-label={field.label} name={'answer-' + field.id} required={field.required} maxLength={300} defaultValue={pending?.body.answers?.[field.id]} />}
          </fieldset>)}
          <label className="community-field"><span>备注（选填）</span><textarea name="note" rows={3} maxLength={1500} defaultValue={pending?.body.note} /></label>
        </fieldset>
        <p className="community-muted">联系方式仅供主办方处理本次报名及发送活动通知。</p>
        {error && <p className="community-feedback" role="alert">{error}</p>}
        <div className="registration-submit-row">
          <Button type="submit" disabled={busy}>{busy ? '正在确认…' : pending ? '重试并确认报名' : '提交报名'} <FiArrowRight aria-hidden="true" /></Button>
        </div>
      </form></Frame>}
  </div>;
}

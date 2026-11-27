import { useEffect, useState } from 'react';
import { FiArrowUpRight, FiSmartphone } from 'react-icons/fi';
import { communityApi } from '../api';
import { Button, Frame } from '../CommunityUi';
import { eventStatus, eventStatuses } from './events';

export default function SignupHandoff({ event, embedded = false }) {
  const [handoff, setHandoff] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [codeError, setCodeError] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const eventId = event.id;
  const status = eventStatus(event);
  const open = status === 'open';
  useEffect(() => {
    if (!open) return;
    const request = new AbortController();
    let retryTimer;
    setHandoff(null);
    setError('');
    setCodeError(false);
    setWaiting(false);
    communityApi(`events/${encodeURIComponent(eventId)}/wechat`, undefined, undefined, request.signal)
      .then(result => {
        if (request.signal.aborted) return;
        setHandoff(result);
        if (result.retryAfterSeconds > 0) {
          setWaiting(true);
          retryTimer = setTimeout(() => setWaiting(false), result.retryAfterSeconds * 1000);
        }
      })
      .catch(reason => { if (!request.signal.aborted) setError(reason.message); });
    return () => { request.abort(); clearTimeout(retryTimer); };
  }, [eventId, open, attempt]);

  const hasLink = handoff?.available && Boolean(handoff.urlLink);
  const hasCode = handoff?.available && Boolean(handoff.codeUrl);
  const retry = () => setAttempt(value => value + 1);
  const Heading = embedded ? 'h3' : 'h2';
  const heading = <Heading data-event-status={open ? undefined : status}>
    {open ? <>{!embedded && <FiSmartphone aria-hidden="true" />}微信小程序搜索「零一玩家」，</> : eventStatuses[status]}
  </Heading>;
  let entry;
  if (error) {
    entry = <div role="alert"><p>{error}</p><Button size="sm" className="discovery-action" onClick={retry}>重新获取报名入口</Button></div>;
  } else if (!handoff) {
    entry = <p role="status">正在获取报名入口…</p>;
  } else if (!hasLink && !hasCode) {
    entry = <>
      {!handoff.reason?.startsWith('当前为本地示例，') &&
        <p className="signup-status" role="status">{handoff.reason || '报名入口暂未开放，请稍后再来。'}</p>}
      {handoff.retryAfterSeconds > 0 && <Button size="sm" className="discovery-action" disabled={waiting} onClick={retry}>
        {waiting ? `请在 ${handoff.retryAfterSeconds} 秒后重试` : '重新获取报名入口'}
      </Button>}
    </>;
  } else {
    entry = <>
      {hasLink && <Button size="sm" className={`discovery-action ${hasCode ? 'signup-mobile' : ''}`} href={handoff.urlLink}>打开小程序报名 <FiArrowUpRight aria-hidden="true" /></Button>}
      {hasLink && !hasCode && <p className="signup-desktop signup-status">可将链接发送到手机打开。</p>}
      {hasCode && <div className={`signup-code ${hasLink ? 'signup-desktop' : ''}`}>
        {codeError ? <div role="status"><p>小程序码未能加载。</p><Button size="sm" onClick={retry}>重新加载</Button></div>
          : <><img key={attempt} src={handoff.codeUrl} alt={`${event.name}的微信小程序报名码`} width="180" height="180" onError={() => setCodeError(true)} /><p>使用微信扫一扫，进入本场报名</p></>}
      </div>}
    </>;
  }
  const content = <>
    {embedded ? <div className="event-signup-heading"><span>参与方式</span>{heading}</div> : heading}
    {open ? <>
      <p>无需登录，直接填写报名信息！</p>
      {entry}
    </> : <p>本场活动已停止接受报名。</p>}
  </>;
  return embedded
    ? <section className="signup-panel signup-panel--embedded" aria-label="活动报名">{content}</section>
    : <Frame as="section" className="signup-panel" radius={16} flush aria-label="活动报名">{content}</Frame>;
}


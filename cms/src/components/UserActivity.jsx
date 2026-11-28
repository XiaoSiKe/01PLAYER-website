'use client';

import { useEffect, useState } from 'react';
import { FiArrowUpRight, FiBookmark, FiCalendar, FiHeart, FiLayers } from 'react-icons/fi';
import { communityLink } from '../../../src/community/api';
import { desk, statuses } from './desk';
import { useDeskLanguage } from './DeskLanguage';
import { Action } from './OfficialUI';

const sections = {
  registrations: { label: '报名记录', count: 'registrationCount', icon: FiCalendar, empty: '暂无报名记录。' },
  projects: { label: '发布项目', count: 'projectCount', icon: FiLayers, empty: '暂无发布项目。' },
  saved: { label: '收藏', count: 'savedCount', icon: FiBookmark, empty: '暂无收藏。' },
  liked: { label: '喜欢', count: 'likedCount', icon: FiHeart, empty: '暂无喜欢。' },
};
const time = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});

export default function UserActivity({ person }) {
  const { t } = useDeskLanguage();
  const [kind, setKind] = useState('registrations');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const section = sections[kind];
  useEffect(() => {
    const controller = new AbortController();
    desk('staff/users/' + encodeURIComponent(person.id) + '/activity', undefined, { kind, page: String(page) }, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult(data); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [person.id, kind, page, revision]);
  function open(nextKind, nextPage) {
    if (nextKind === kind && nextPage === page) return;
    setResult(null);
    setError('');
    setKind(nextKind);
    setPage(nextPage);
  }
  return (
    <section className="cu-section cu-activity" aria-labelledby="cu-activity-title">
      <h2 id="cu-activity-title">{t('玩家记录')}</h2>
      <div className="cu-activity-modules" role="group" aria-label={t('玩家记录分类')}>
        {Object.entries(sections).map(([key, { label, count, icon: Icon }]) => (
          <button type="button" key={key} aria-pressed={kind === key} onClick={() => open(key, 1)}>
            <span><Icon aria-hidden="true" /> {t(label)}</span>
            <strong>{person[count] ?? '—'}</strong>
          </button>
        ))}
      </div>
      <div className="cu-activity-content" role="region" aria-label={t(section.label)} aria-busy={!result && !error}>
        {error ? <div className="op-line" role="alert">
          <span>{t(error)}</span>
          <Action onClick={() => { setError(''); setRevision(value => value + 1); }}>{t('重试')}</Action>
        </div> : !result ? <p role="status">{t('正在读取…')}</p> : !result.items.length ? (
          <p className="cu-activity-empty">{t(section.empty)}</p>
        ) : (
          <ul className="cu-activity-list">
            {result.items.map(item => {
              const registration = kind === 'registrations';
              const title = item.title || t(registration ? '历史活动' : '项目已不可用');
              const href = item.public && (registration
                ? communityLink('players', { event: item.eventId })
                : communityLink('plaza', { project: item.id }));
              const date = Date.parse(item.date);
              return <li key={item.id}>
                <div className="cu-activity-row">
                  <div className="cu-activity-name">
                    {href ? <a href={href} target="_blank" rel="noreferrer">{title} <FiArrowUpRight aria-hidden="true" /></a> : <strong>{title}</strong>}
                    {item.eventName && <small>{item.eventName}</small>}
                  </div>
                  <div className="cu-activity-meta">
                    {item.status && <span>{t(statuses[item.status] || item.status)}</span>}
                    {Number.isFinite(date) && <time dateTime={item.date}>{time.format(date)}</time>}
                  </div>
                </div>
                {item.summary && <p>{item.summary}</p>}
              </li>;
            })}
          </ul>
        )}
        {result?.totalPages > 1 && <nav className="cu-pagination" aria-label={t('{0}分页', [t(section.label)])}>
          <Action disabled={result.page <= 1} onClick={() => open(kind, result.page - 1)}>{t('上一页')}</Action>
          <span>{t('第 {0} 页 / 共 {1} 页', [result.page, result.totalPages])}</span>
          <Action disabled={result.page >= result.totalPages} onClick={() => open(kind, result.page + 1)}>{t('下一页')}</Action>
        </nav>}
      </div>
    </section>
  );
}

'use client';
import { useDeskLanguage } from './DeskLanguage';
import { useEffect, useId, useRef, useState } from 'react';
import { readDeskJson, statuses } from './desk';
import { Action } from './OfficialUI';

const timestamp = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium',
});
const modules = [
  ['hosts', '阿里云主机'],
  ['public', '公网可用性'],
  ['origin', '源站可用性'],
  ['services', '业务与发布'],
];

function Trend({ label, points }) {
  const { t } = useDeskLanguage();
  if (!points || points.length < 2) return null;
  const min = Math.min(...points);
  const range = Math.max(...points) - min || 1;
  const line = points.map((point, index) => [
    1 + index / (points.length - 1) * 218,
    28 - (point - min) / range * 26,
  ].join(',')).join(' ');
  return (
    <svg viewBox="0 0 220 30" role="img" aria-label={t('{0}近期趋势', [t(label)])}>
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={line} />
    </svg>
  );
}

export default function OpsMonitor() {
  const { t } = useDeskLanguage();
  const [active, setActive] = useState(0);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const id = useId();
  const tabs = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function read() {
      if (!document.hidden) {
        try {
          const data = await readDeskJson('/cms-api/health-board', {}, controller.signal);
          if (!controller.signal.aborted) { setReport(data); setError(''); }
        } catch (error) {
          if (!controller.signal.aborted) setError(error.message);
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(read, 60_000);
    }
    void read();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);
  const checks = report?.checks.filter(check => check.module === modules[active][0]) ?? [];
  const groups = Map.groupBy(checks, check => check.group);
  const counts = checks.reduce((total, check) => {
    const key = check.state === 'ok' ? 'ok' : check.state === 'unconfigured' ? 'unconfigured' : 'issues';
    total[key]++;
    return total;
  }, { ok: 0, unconfigured: 0, issues: 0 });
  function moveFocus(event) {
    const next = {
      ArrowRight: (active + 1) % modules.length,
      ArrowLeft: (active + modules.length - 1) % modules.length,
      Home: 0,
      End: modules.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
    tabs.current?.querySelectorAll('[role="tab"]')[next]?.focus();
  }
  return (
    <div className="ops-monitor">
      <nav className="ops-module-nav" ref={tabs} role="tablist" aria-label={t("运维模块")} onKeyDown={moveFocus}>
        {modules.map(([key, label], index) => (
          <Action key={key} id={id + '-' + key} role="tab"
            aria-selected={active === index} tabIndex={active === index ? 0 : -1}
            aria-controls={id + '-panel'} onClick={() => setActive(index)}>
            {t(label)}
          </Action>
        ))}
      </nav>
      <div key={modules[active][0]} id={id + '-panel'} role="tabpanel" aria-labelledby={id + '-' + modules[active][0]} tabIndex={0}>
      {!report ? <p role={error ? 'alert' : 'status'}>{t(error || '正在读取运维监测…')}</p> : <>
      {error && <p role="alert">{t(error)} {t('下方保留上一次取得的结果。')}</p>}
      <dl className="op-traffic-metrics">
        {[[t("正常"), counts.ok], [t("异常或数据过期"), counts.issues], [t("待接入"), counts.unconfigured]].map(([label, count]) => (
          <div key={label}><dt>{label}</dt><dd>{count}</dd></div>
        ))}
      </dl>
      {report.sampledAt && <p className="ops-sampled">{t('最近读取')} {timestamp.format(new Date(report.sampledAt))}{t('（北京时间）')}</p>}
      {[...groups].map(([label, checks]) => (
        <section className="ops-health-group" key={label} aria-label={t(label)}>
          <h2>{t(label)}</h2>
          <div className="health-grid">
            {checks.map(check => (
              <article className="health-card" key={check.id}>
                <span className={'health-state ' + check.state}>{t(statuses[check.state] || check.state)}</span>
                <h3>{t(check.label)}</h3>
                <p>{t(check.detail)}</p>
                <Trend label={check.label} points={check.points} />
                <small>{t(check.source)} · {check.sampledAt ? timestamp.format(new Date(check.sampledAt)) : t('暂无采样')}</small>
                {check.since && <small>{t('异常始于 {0}', [timestamp.format(new Date(check.since))])}</small>}
              </article>
            ))}
          </div>
        </section>
      ))}
      </>}
      </div>
    </div>
  );
}

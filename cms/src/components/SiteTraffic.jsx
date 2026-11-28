'use client';
import { useDeskLanguage } from './DeskLanguage';
import { useEffect, useState } from 'react';
import { readDeskJson } from './desk';
import { trafficPages } from '../../../src/data/traffic-pages';

const format = new Intl.NumberFormat('zh-CN');
const compact = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 });
const dayLabel = day => day.slice(5).replace('-', '/');

function TrafficTrend({ trend, pageLabel, visitorLabel }) {
  const { t } = useDeskLanguage();
  const [series, setSeries] = useState('views');
  const [day, setDay] = useState(null);
  const last = trend.length - 1;
  const current = trend[day ?? last];
  const peak = trend.reduce((best, item) => item[series] > best[series] ? item : best, trend[0]);
  const label = series === 'views' ? pageLabel : visitorLabel;
  const step = Math.max(1, 10 ** Math.floor(Math.log10(Math.max(peak[series], 1) / 3)));
  const ceiling = Math.max(2, Math.ceil(peak[series] / (2 * step)) * 2 * step);
  const points = trend.map((item, index) => ({
    x: (index + 0.5) * 100 / trend.length,
    y: 100 - item[series] * 100 / ceiling,
  }));
  const coordinates = items => items.map(({ x, y }) => x + ',' + y).join(' ');
  return (
    <section className="op-traffic-panel">
      <div className="op-chart-header">
        <h3>{t("近 7 天走势")}</h3>
        <div className="op-chart-series" role="group" aria-label={t("走势指标")}>
          {[['views', pageLabel], ['visitors', visitorLabel]].map(([key, name]) => (
            <button type="button" key={key} aria-pressed={series === key} onClick={() => setSeries(key)}>{t(name)}</button>
          ))}
        </div>
      </div>
      <div className="op-chart-detail">
        <span><time dateTime={current.day}>{dayLabel(current.day)}</time>{current === trend[last] && ' · ' + t('今日截至当前')}</span>
        <strong>{format.format(current[series])}</strong>
      </div>
      <div className="op-chart-figure" style={{ '--days': trend.length }}>
        <div className="op-chart-scale" aria-hidden="true">
          {[ceiling, ceiling / 2, 0].map(value => <span key={value}>{compact.format(value)}</span>)}
        </div>
        <div className="op-chart-plot" aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
            {[0, 50, 100].map(y => <line key={y} x1="0" x2="100" y1={y} y2={y} className="op-chart-gridline" vectorEffect="non-scaling-stroke" />)}
            <polyline points={coordinates(points.slice(0, last))} vectorEffect="non-scaling-stroke" />
            <polyline points={coordinates(points.slice(-2))} className="op-chart-partial" vectorEffect="non-scaling-stroke" />
          </svg>
          {points.map(({ x, y }, index) => (
            <span key={trend[index].day} className="op-chart-dot" data-active={index === (day ?? last)}
              style={{ left: x + '%', top: y + '%' }} />
          ))}
        </div>
        <ol className="op-chart-dates">
          {trend.map((item, index) => (
            <li key={item.day}>
              <button type="button" aria-pressed={index === (day ?? last)}
                aria-label={item.day + '，' + t(label) + ' ' + format.format(item[series])}
                onFocus={() => setDay(index)} onClick={() => setDay(index)}>
                <time dateTime={item.day}>{dayLabel(item.day)}</time>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <p className="op-chart-peak">{t('单日峰值')} <strong>{format.format(peak[series])}</strong>
        <span> · <time dateTime={peak.day}>{dayLabel(peak.day)}</time></span>
      </p>
    </section>
  );
}

export default function SiteTraffic({ snapshot, loading = false, error = '' }) {
  const { t } = useDeskLanguage();
  const [updated, setUpdated] = useState(null);
  const traffic = updated?.snapshot === snapshot ? updated?.traffic : snapshot?.traffic;
  useEffect(() => {
    if (!snapshot?.refreshing) return;
    const controller = new AbortController();
    readDeskJson('/cms-api/site-traffic', {}, controller.signal)
      .then(traffic => { if (!controller.signal.aborted) setUpdated({ snapshot, traffic }); })
      .catch(() => {});
    return () => controller.abort();
  }, [snapshot]);
  const originLog = traffic?.source === 'origin-log';
  const pageLabel = originLog ? '页面请求' : '页面浏览';
  const visitorLabel = originLog ? '来源 IP' : '独立浏览器';
  const yesterday = traffic?.trend.at(-2);
  const metrics = traffic && [
    ['今日' + pageLabel, traffic.today.views, yesterday && t('昨日全天 {0}', [format.format(yesterday.views)])],
    ['今日' + visitorLabel, traffic.today.visitors, yesterday && t('昨日全天 {0}', [format.format(yesterday.visitors)])],
    ['近 7 天' + pageLabel, traffic.views7d, t('含今日截至当前')],
    ['日均' + pageLabel, Math.round(traffic.views7d / traffic.trend.length), t('近 7 个自然日')],
  ];
  return (
    <section className="op-traffic" aria-labelledby="op-traffic-title" aria-busy={loading}>
      <header className="op-traffic-heading">
        <h2 id="op-traffic-title">{t("访问统计")}</h2>
        <p className="op-traffic-source">{originLog ? t("源站日志 · 北京时间") : traffic?.demo ? t("本地预览 · 北京时间") : t("北京时间")}</p>
      </header>
      {loading ? <div className="op-traffic-metrics" aria-hidden="true">
        {[0, 1, 2, 3].map(slot => <div key={slot} className="op-traffic-placeholder" />)}
      </div> : error ? <p role="alert">{t(error)}</p> : traffic && <>
        <dl className="op-traffic-metrics">
          {metrics.map(([label, value, detail]) => (
            <div key={label}>
              <dt>{t(label)}</dt>
              <dd><strong>{format.format(value)}</strong>{detail && <small>{detail}</small>}</dd>
            </div>
          ))}
        </dl>
        <div className="op-traffic-charts">
          <TrafficTrend trend={traffic.trend} pageLabel={pageLabel} visitorLabel={visitorLabel} />
          <section className="op-traffic-panel">
            <h3>{t("热门页面")}<small>{t("近 7 天")}</small></h3>
            {traffic.popular.length ? <ol className="op-traffic-popular">
              {traffic.popular.map(item => {
                const share = traffic.views7d ? item.views / traffic.views7d : 0;
                return (
                  <li key={item.page}>
                    <span>{t(item.label ?? trafficPages[item.page] ?? item.page)}</span>
                    <strong>{format.format(item.views)}</strong>
                    <small aria-label={t('占近 7 天总量的 {0}', [percent.format(share)])}>{percent.format(share)}</small>
                    <span className="op-traffic-share" style={{ '--share': Math.min(100, share * 100) + '%' }} aria-hidden="true" />
                  </li>
                );
              })}
            </ol> : <p>{t("暂无采集记录")}</p>}
          </section>
        </div>
      </>}
    </section>
  );
}

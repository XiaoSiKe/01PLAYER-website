'use client';
import { useEffect, useState } from 'react';
import { readDeskJson } from './desk';
import { trafficPages } from '../../../src/data/traffic-pages';

const format = new Intl.NumberFormat('zh-CN');

export default function SiteTraffic() {
  const [traffic, setTraffic] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    readDeskJson('/cms-api/site-traffic', {}, controller.signal)
      .then(data => { if (!controller.signal.aborted) setTraffic(data); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, []);
  const max = Math.max(1, ...(traffic?.trend.map(item => item.views) ?? []));
  const originLog = traffic?.source === 'origin-log';
  const values = [
    [originLog ? '今日页面请求' : '今日页面浏览', traffic?.today.views],
    [originLog ? '今日来源 IP' : '今日独立浏览器', traffic?.today.visitors],
    [originLog ? '近 7 天页面请求' : '近 7 天页面浏览', traffic?.views7d],
  ];
  return (
    <section className="op-traffic" aria-labelledby="traffic-title">
      <div className="op-line op-traffic-heading">
        <h2 id="traffic-title">官网访问</h2>
        <span>{originLog ? '源站日志 · 北京时间' : traffic?.demo ? '本地预览 · 北京时间' : '北京时间'}</span>
      </div>
      <dl className="op-traffic-metrics">
        {values.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value === undefined ? '—' : format.format(value)}</dd></div>
        ))}
      </dl>
      {!traffic ? <p role={error ? 'alert' : 'status'}>{error || '正在读取访问数据…'}</p> : (
        <div className="op-traffic-charts">
          <section className="op-traffic-panel">
            <h3>近 7 天走势</h3>
            <ol className="op-traffic-bars">
              {traffic.trend.map(({ day, views }) => (
                <li key={day} aria-label={day + '，' + views + (originLog ? ' 次页面请求' : ' 次浏览')}>
                  <strong>{format.format(views)}</strong>
                  <span className="op-traffic-bar" style={{ '--bar-size': views / max }} aria-hidden="true" />
                  <time dateTime={day}>{day.slice(5)}</time>
                </li>
              ))}
            </ol>
          </section>
          <section className="op-traffic-panel">
            <h3>热门页面 <small>近 7 天</small></h3>
            {traffic.popular.length ? <ol className="op-traffic-popular">
              {traffic.popular.map(item => <li key={item.page}><span>{item.label ?? trafficPages[item.page]}</span><strong>{format.format(item.views)}</strong></li>)}
            </ol> : <p>暂无采集记录</p>}
          </section>
        </div>
      )}
    </section>
  );
}

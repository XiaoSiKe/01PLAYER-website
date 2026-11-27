'use client';
import React, { useEffect, useState } from 'react';
import { FiArrowUpRight, FiPlus } from 'react-icons/fi';
import { operationsName } from '../branding.mjs';
import { Action, DeskTitle } from './OfficialUI';
import { readDeskJson } from './desk';
import SiteTraffic from './SiteTraffic';

export default function Dashboard() {
  const [stats, setStats] = useState({});
  useEffect(() => {
    const controller = new AbortController();
    function update(values) {
      if (!controller.signal.aborted) setStats(previous => ({ ...previous, ...values }));
    }
    readDeskJson('/cms-api/work-queue', {}, controller.signal)
      .then(update)
      .catch(() => update({ events: '不可用', registrations: '不可用' }));
    readDeskJson('/cms-api/health-board', {}, controller.signal)
      .then(({ checks }) => {
        const failures = checks.filter(check => check.state === 'error' || check.state === 'stale');
        update({ status: failures.length || (checks.some(check => check.state === 'ok') ? 0 : '未接入') });
      })
      .catch(() => update({ status: '不可用' }));
    return () => controller.abort();
  }, []);
  return (
    <section className="op-dashboard community-page" aria-labelledby="desk-title">
      <DeskTitle title={operationsName} id="desk-title">
        <Action href="/admin/operations?tab=events&new=1">
          <FiPlus aria-hidden="true" /> 新建活动
        </Action>
      </DeskTitle>
      <SiteTraffic />
      <div className="op-queue">
        {[
          ['registrations', '待审核报名'],
          ['events', '待发布活动'],
          ['status', '运维异常'],
        ].map(([key, label]) => (
          <Action key={key} className="op-queue-card"
              href={
                '/admin/operations?tab=' +
                key +
                ({ events: '&filter=unpublished', registrations: '&filter=pending' }[key] || '')
              }
            >
              <span>{label}</span>
              <strong>{stats[key] ?? '…'}</strong>
              <FiArrowUpRight aria-hidden="true" />
          </Action>
        ))}
      </div>
      <nav className="op-line op-shortcuts" aria-label="常用运营操作">
        <Action href="/admin/collections/media/create">
          上传图片 <FiArrowUpRight aria-hidden="true" />
        </Action>
        <Action href="/admin/community-users">
          玩家管理 <FiArrowUpRight aria-hidden="true" />
        </Action>
        <Action href="/admin/operations?tab=projects">
          作品审核 <FiArrowUpRight aria-hidden="true" />
        </Action>
        <Action href="/admin/operations?tab=photos">
          活动相册 <FiArrowUpRight aria-hidden="true" />
        </Action>
      </nav>
    </section>
  );
}

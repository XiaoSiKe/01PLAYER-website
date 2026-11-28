'use client';
import { useDeskLanguage } from './DeskLanguage';
import React, { useEffect, useState } from 'react';
import { FiArrowUpRight, FiPlus } from 'react-icons/fi';
import { operationsName } from '../branding.mjs';
import { Action, DeskTitle } from './OfficialUI';
import { deskCreateLabels, deskHref, readDeskJson } from './desk';

const priorities = [
  ['registrations', '待审核报名', '&filter=pending'],
  ['projects', '待审核作品', '&filter=pending'],
  ['status', '运维异常', ''],
];

export default function Dashboard({ children }) {
  const { t } = useDeskLanguage();
  const [stats, setStats] = useState({});
  useEffect(() => {
    const controller = new AbortController();
    function update(values) {
      if (!controller.signal.aborted) setStats(previous => ({ ...previous, ...values }));
    }
    readDeskJson('/cms-api/work-queue', {}, controller.signal)
      .then(update)
      .catch(() => update({ registrations: '不可用', projects: '不可用' }));
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
      <DeskTitle title={operationsName} id="desk-title" />
      <nav className="op-queue" aria-label={t("优先待办")}>
        {priorities.map(([key, label, filter]) => (
          <Action key={key} className="op-queue-card" href={deskHref(key, filter)}>
            <span>{t(label)}</span>
            <strong className={typeof stats[key] === 'string' ? 'op-queue-status' : undefined}>{t(stats[key] ?? '…')}</strong>
            <FiArrowUpRight aria-hidden="true" />
          </Action>
        ))}
      </nav>
      {children}
      <nav className="op-line op-dashboard-actions" aria-label={t("新建内容")}>
        {Object.entries(deskCreateLabels).map(([key, label]) => (
          <Action key={key} href={deskHref(key, '&new=1')}>
            <FiPlus aria-hidden="true" /> {t(label)}
          </Action>
        ))}
      </nav>
    </section>
  );
}

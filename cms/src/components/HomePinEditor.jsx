'use client';

import { useRef, useState } from 'react';
import { canPinOnHome } from '../../../server/home-pins.mjs';
import { useDeskLanguage } from './DeskLanguage';
import { desk } from './desk';
import { Action, DeskTitle } from './OfficialUI';

export function HomePinLabel({ position }) {
  const { t } = useDeskLanguage();
  return <span className="op-pin-label" data-pinned={Boolean(position)}>
    {position ? t('置顶第 {0} 位', [position]) : t('未置顶')}
  </span>;
}

export default function HomePinEditor({ title, kind, rows, disabled, onSaved, children }) {
  const { t } = useDeskLanguage();
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const expected = useRef(null);
  const pending = useRef(false);
  const path = 'staff/home-pins/' + kind;
  const candidates = rows.filter(row => canPinOnHome(kind, row));

  async function openSettings() {
    if (pending.current) return;
    if (open) { setOpen(false); return; }
    pending.current = true;
    setOpen(true);
    setBusy(true);
    setSlots(null);
    setError('');
    setSaved(false);
    try {
      const result = await desk(path);
      expected.current = result.slots;
      setSlots(result.slots);
    } catch (error) {
      setError(error.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function choose(index, value) {
    setError('');
    setSaved(false);
    const next = [...slots];
    const previous = value ? next.indexOf(value) : -1;
    if (previous >= 0 && previous !== index) next[previous] = next[index];
    next[index] = value || null;
    setSlots(next);
  }

  async function save() {
    if (pending.current || !slots) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await desk(path, { slots, expected: expected.current });
      expected.current = result.slots;
      setSlots(result.slots);
      setSaved(true);
      onSaved();
    } catch (error) {
      setError(error.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <>
    <DeskTitle title={title}>
      <div className="op-line op-pin-title-actions">
        <Action aria-expanded={open} disabled={disabled || busy} onClick={openSettings}>{t('设置置顶')}</Action>
        {children}
      </div>
    </DeskTitle>
    {open && <section className="op-home-pin-settings" aria-label={t('设置置顶')}>
      {error && <p role="alert">{t(error)}</p>}
      {busy && !slots && <p role="status">{t('正在读取…')}</p>}
      {slots && <>
        <p>{t('空位按当前排序补齐。')}</p>
        <fieldset disabled={busy || disabled} className="op-editor-fields op-home-pin-slots">
          {slots.map((id, index) => {
            const label = t('置顶第 {0} 位', [index + 1]);
            return <label className="community-field" key={index}>
              {label}
              <select aria-label={label} value={id || ''} onChange={event => choose(index, event.target.value)}>
                <option value="">{t('未置顶')}</option>
                {candidates.map(row => <option key={row.id} value={row.id}>
                  {[row.name, kind === 'events' ? row.date : row.author].filter(Boolean).join(' · ')}
                </option>)}
              </select>
            </label>;
          })}
        </fieldset>
        <Action disabled={busy || disabled || slots.every((id, index) => id === expected.current[index])}
          onClick={save}>{t('保存置顶设置')}</Action>
        {saved && <span role="status">{t('置顶设置已保存。')}</span>}
      </>}
    </section>}
  </>;
}

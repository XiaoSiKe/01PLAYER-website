'use client';

import { useRef, useState } from 'react';
import { FiArrowRight, FiEye, FiEyeOff } from 'react-icons/fi';
import { Button, Field } from '../CommunityUi';

export function PasswordField({ name, label, creating = false, maxLength = 128 }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="account-password">
      <Field
        label={label}
        name={name}
        type={revealed ? 'text' : 'password'}
        autoComplete={creating ? 'new-password' : 'current-password'}
        minLength={creating ? 10 : 1}
        maxLength={maxLength}
        spellCheck={false}
        autoCapitalize="none"
        required
      />
      <button
        type="button"
        className="account-eye"
        aria-label={(revealed ? '隐藏' : '显示') + label}
        aria-pressed={revealed}
        onClick={() => setRevealed(!revealed)}
      >
        {revealed ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}
      </button>
    </div>
  );
}

export function AccountForm({ children, submit, pending, onSubmit, onBusy, disabled = false, shineOnInteraction = false }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const sending = useRef(false);
  return (
    <form
      className="community-form account-form"
      aria-busy={busy}
      onSubmit={async (event) => {
        event.preventDefault();
        if (sending.current || disabled) return;
        const values = Object.fromEntries(new FormData(event.currentTarget));
        sending.current = true;
        setBusy(true);
        onBusy?.(true);
        setError('');
        try {
          await onSubmit(values);
        } catch (err) {
          setError(err.message || '操作未完成，请重试。');
        } finally {
          sending.current = false;
          setBusy(false);
          onBusy?.(false);
        }
      }}
    >
      <fieldset disabled={busy}>{children}</fieldset>
      {error && (
        <p role="alert" className="community-feedback">
          {error}
        </p>
      )}
      <Button type="submit" shineOnInteraction={shineOnInteraction} disabled={busy || disabled}>
        {busy ? pending : submit} <FiArrowRight aria-hidden="true" />
      </Button>
    </form>
  );
}

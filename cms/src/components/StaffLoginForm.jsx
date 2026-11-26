'use client';

import { FiArrowRight } from 'react-icons/fi';
import dynamic from 'next/dynamic';
import { Button, Field } from '../../../src/community/CommunityUi';
import { AccountAccess } from '../../../src/community/account/AccountAccess';
import { AccountForm, PasswordField } from '../../../src/community/account/AccountForm';
import { operationsName } from '../branding.mjs';

const SiteBackground = dynamic(() => import('../../../src/components/SiteBackground'), { ssr: false });
const SiteNavigation = dynamic(() => import('../../../src/components/SiteNavigation'), { ssr: false });

export default function StaffLoginForm({ loginUrl, helpUrl, redirectTo }) {
  async function authenticate({ email, password }) {
    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.user?.id) {
      throw new Error(data?.errors?.[0]?.message || '登录未完成，请重试。');
    }
    window.location.replace(redirectTo);
  }

  return (
    <>
      <SiteBackground />
      <SiteNavigation standalone textOnly accountUser={null} />
      <div className="community-shell">
        <main>
          <AccountAccess title={operationsName}>
            <AccountForm onSubmit={authenticate} submit="登录" pending="正在登录…">
              <Field label="邮箱" name="email" type="email" autoComplete="username"
                autoCapitalize="none" spellCheck={false} required />
              <PasswordField name="password" label="密码" maxLength={null} />
            </AccountForm>
            <Button href={helpUrl} className="account-switch">
              忘记密码？ <FiArrowRight aria-hidden="true" />
            </Button>
          </AccountAccess>
        </main>
      </div>
    </>
  );
}

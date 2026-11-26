'use client';

import { Frame } from '../CommunityUi';
import AccountLogo from './AccountLogo';
import AccountTitle from './AccountTitle';
import './account.css';

export function AccountHeading({ title, as }) {
  return (
    <div className="account-brand">
      <AccountTitle key={title} text={title} as={as}>
        <AccountLogo />
      </AccountTitle>
    </div>
  );
}

export function AccountAccess({ title, purpose, notice, children }) {
  return (
    <div className="account-page account-access">
      <Frame>
        <AccountHeading title={title} />
        {purpose && <p className="account-description">{purpose}</p>}
        {notice && <p className="community-feedback" role="status">{notice}</p>}
        {children}
      </Frame>
    </div>
  );
}

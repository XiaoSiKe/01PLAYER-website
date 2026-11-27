import horizontalLogo from '../../../public/images/club-logo-horizontal-white.svg';
import squareLogo from '../../../public/images/club-logo-white.svg';
import { AccountHeading } from '../../../src/community/account/AccountAccess';
import { operationsName } from '../branding.mjs';
import React from 'react';
export function Logo() {
  return <AccountHeading title={operationsName} />;
}
export function Icon() {
  return (
    <span className="brand-icon" role="img" aria-label="零一玩家">
      <img className="brand-icon-square" src={squareLogo.src} alt="" />
      <img className="brand-icon-wide" src={horizontalLogo.src} alt="" />
    </span>
  );
}

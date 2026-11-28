import React from 'react';
import { DeskBack, DeskTitle } from './OfficialUI';
import { DeskText } from './DeskLanguage';

export default function StaffPasswordHelp({ initPageResult }) {
  const signedIn = Boolean(initPageResult.req.user);
  return (
    <section className="community-page op-password-help">
      <DeskTitle title="找回运营账号">
        <DeskBack href={signedIn ? '/admin' : '/admin/login'} />
      </DeskTitle>
      <p><DeskText message="请联系头号玩家核实身份。头号玩家可在「玩家管理」中打开你的运营账号并设置新密码。" /></p>
    </section>
  );
}

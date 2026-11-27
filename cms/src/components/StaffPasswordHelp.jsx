import React from 'react';
import { Action } from './OfficialUI';

export default function StaffPasswordHelp({ initPageResult }) {
  const signedIn = Boolean(initPageResult.req.user);
  return (
    <section className="community-page op-password-help">
      <h1>找回运营账号</h1>
      <p>请联系站点负责人核实身份。负责人可在「玩家管理」中打开你的管理员账号并设置新密码。</p>
      <Action className="discovery-action" href={signedIn ? '/admin' : '/admin/login'}>
        {signedIn ? '返回工作台' : '返回登录'}
      </Action>
    </section>
  );
}

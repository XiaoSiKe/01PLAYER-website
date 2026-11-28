#!/usr/bin/env node
import { readFileSync } from 'node:fs';

// Run with the service's actual systemd environment, before it opens any database.
const [service, selector = '/etc/01player-runtime/community-upstream.inc'] = process.argv.slice(2);
try {
  const directive = readFileSync(selector, 'utf8').replace(/#[^\n]*/g, '').trim();
  const match = /^proxy_pass\s+(http:\/\/127\.0\.0\.1:(\d+))\s*;$/.exec(directive);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 65535) {
    throw Error('请在 community-upstream.inc 指定接收报名的本机服务。');
  }
  if (service === 'cms') {
    const cmsUpstream = (process.env.COMMUNITY_INTERNAL_ORIGIN || '').replace(/\/$/, '');
    if (cmsUpstream !== match[1]) {
      throw Error('CMS 读取名单的 COMMUNITY_INTERNAL_ORIGIN 与 Nginx 报名入口不一致。');
    }
  } else if (service === 'community') {
    const receivesRegistrations = (process.env.PORT || '4173') === match[2];
    const writesRegistrations = process.env.COMMUNITY_EXTERNAL !== '1';
    if (receivesRegistrations !== writesRegistrations) {
      throw Error(receivesRegistrations ? '报名已转给此服务，请关闭 COMMUNITY_EXTERNAL。'
        : '报名由另一项服务接收，请设置 COMMUNITY_EXTERNAL=1，避免打开另一份数据库。');
    }
  } else {
    throw Error('需要检查 cms 或 community 单元。');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

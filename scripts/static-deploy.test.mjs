import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Run the actual scripts against a disposable filesystem. System services, root
// ownership and the certificate issuer are simulated. No privileged commands run.
const shim = `#!/usr/bin/env bash
set -eu
name=\${0##*/}
fixture=$(cd "$(dirname "$0")/.." && pwd)
{ printf '%s' "$name"; printf '\\t%s' "$@"; printf '\\n'; } >> "$fixture/calls"
case "$name" in
  id)
    case "$1" in -u) echo 0 ;; -un) echo 01aiclub-deploy ;; esac ;;
  getent)
    echo "01aiclub-deploy:x:9:9::$fixture/var/lib/01aiclub/deploy-home:/bin/bash" ;;
  install)
    directories=0
    while [[ "$1" == -* ]]; do
      case "$1" in -d) directories=1; shift ;; -m) mode=$2; shift 2 ;; -o|-g) shift 2 ;; esac
    done
    if (( directories )); then mkdir -p -- "$@"; else cp "$1" "$2"; chmod "$mode" "$2"; fi ;;
  nginx)
    if [[ -f "$fixture/fail-tls" ]] && grep -q 'listen 443 ssl' "$fixture/etc/nginx/conf.d/020-01aiclub.conf"; then exit 1; fi ;;
  certbot)
    if [[ -f "$fixture/edit-during-certbot" ]]; then
      echo '# concurrent route change' >> "$fixture/etc/nginx/conf.d/020-01aiclub.conf"
    fi ;;
  mv)
    case "$1" in -T|-Tf) shift; python3 -c 'import os,sys; os.replace(*sys.argv[1:])' "$@" ;; *) /bin/mv "$@" ;; esac ;;
  find)
    # GNU find cannot restore an inaccessible working directory after a privilege switch.
    [[ -r . && -x . ]] || exit 1
    if [[ "$*" == *-printf* ]]; then
      for file in "$1"/*; do [[ ! -f "$file" ]] || basename "$file"; done
    else /usr/bin/find "$@"; fi ;;
  curl)
    url=\${!#}
    [[ "$url" == https://club.01aiedu.com/* ]] || exit 1
    path=\${url#https://club.01aiedu.com}
    if [[ -f "$fixture/asset-returns-home" && "$path" == "$(cat "$fixture/asset-returns-home")" ]]; then path=/index.html; fi
    if [[ "$path" == / ]]; then path=/index.html; fi
    cat "$(cat "$fixture/etc/01PLAYER/static-root")/current$path" ;;
esac
exit 0
`;

function fixture(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), '01player-static-deploy-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const src = join(dir, 'source'), bin = join(dir, 'bin'), conf = join(dir, 'etc/nginx/conf.d/020-01aiclub.conf');
  const control = join(dir, 'etc/01PLAYER'), lib = join(dir, 'usr/local/lib/01aiclub');
  for (const path of [src, bin, join(dir,'etc/nginx/conf.d'), join(dir,'etc/systemd/system')]) mkdirSync(path, { recursive:true });
  for (const name of ['bootstrap.sh','release.sh','receive-release.sh','static-site.py','verify-archive.py','ci-deploy-key.pub','nginx-http.conf','nginx.conf','01aiclub-certbot.service','01aiclub-certbot.timer']) {
    const original = readFileSync(new URL('../deploy/'+name, import.meta.url),'utf8');
    writeFileSync(join(src,name), original.replace(/\/(?:var|etc|usr\/local\/lib)\//g, prefix => dir + prefix), {mode:0o755});
  }
  for (const name of ['nginx','systemctl','id','getent','install','certbot','flock','mv','find','curl']) writeFileSync(join(bin,name), shim, {mode:0o755});
  const run = (script,args=[],input='',cwd) => spawnSync('bash',[script,...args],{
    input,cwd,encoding:'utf8',timeout:15000,env:{...process.env,PATH:bin+':'+process.env.PATH,SSH_ORIGINAL_COMMAND:'publish'},
  });
  const boot = mode => run(join(src,'bootstrap.sh'),[mode]);
  const calls = () => readFileSync(join(dir,'calls'),'utf8').trim().split('\n').map(line => line.split('\t'));
  const template = (file, legacy=false) => {
    const text = readFileSync(join(src,file),'utf8');
    return legacy ? text.replaceAll('/www/01PLAYER/current','/www/01aiclub/current') : text;
  };
  return {dir,src,conf,control,lib,run,boot,calls,template};
}
function ok(result) { assert.equal(result.status,0,result.stderr); }

function artifact(dir, version = {}) {
  const files = {
    'index.html':'<title>01PLAYER</title>', 'CNAME':'club.01aiedu.com', 'lingyi-logo.jpg':'fixture',
    'version.json':JSON.stringify({commit:'a'.repeat(40),builtAt:'2026-01-01T00:00:00Z',...version}),
    'assets/site.js':'void 0;', 'assets/site.css':'body {margin:0}',
  };
  mkdirSync(join(dir,'assets'),{recursive:true});
  const sums = [];
  for (const [name,data] of Object.entries(files)) {
    writeFileSync(join(dir,name),data);
    sums.push(createHash('sha256').update(data).digest('hex')+'  '+name);
  }
  writeFileSync(join(dir,'SHA256SUMS'),sums.join('\n')+'\n');
  return execFileSync('tar',['-czf','-','-C',dir,'.'],{env:{...process.env,COPYFILE_DISABLE:'1'}});
}

test('制品接收拒绝工作区快照，验收资源收到首页时回到先前成功版本', t => {
  const f = fixture(t);
  ok(f.boot('init'));
  ok(f.boot('tls'));
  const deliver = (folder, version) => f.run(join(f.lib,'receive-release.sh'),[],artifact(join(f.dir,folder),version));
  ok(deliver('original',{}));
  const site = join(f.dir,'var/www/01PLAYER');
  const original = realpathSync(join(site,'current'));
  const candidate = {commit:'b'.repeat(40)};
  const candidateId = '20260101000000-bbbbbbbbbbbb';
  for (const [index,asset] of ['/assets/site.js','/assets/site.css','/lingyi-logo.jpg'].entries()) {
    writeFileSync(join(f.dir,'asset-returns-home'),asset);
    const result = deliver('bad-'+index,candidate);
    assert.notEqual(result.status,0,asset);
    assert.equal(realpathSync(join(site,'current')),original);
    assert.equal(existsSync(join(site,'shared/successful',candidateId)),false);
  }
  rmSync(join(f.dir,'asset-returns-home'));
  const workspace = deliver('snapshot',{...candidate,source:'working-tree-snapshot'});
  assert.notEqual(workspace.status,0);
  assert.match(workspace.stderr,/工作区快照/);
  assert.equal(realpathSync(join(site,'current')),original);
  ok(deliver('repaired',candidate));
  assert.equal(realpathSync(join(site,'current')),join(site,'releases',candidateId));
  const caller = join(f.dir, 'launcher');
  mkdirSync(caller);
  writeFileSync(join(caller, 'release.tgz'), artifact(join(f.dir, 'relative-input'), candidate));
  chmodSync(caller, 0o111);
  try {
    ok(f.run(join(f.lib, 'release.sh'), ['release.tgz'], '', caller));
  } finally { chmodSync(caller, 0o700); }
});

test('静态制品版本区分源码副本、未提交工作区和干净提交', t => {
  const root = mkdtempSync(join(tmpdir(), '01player-version-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, '.gitignore'), 'dist/\n');
  const script = join(root, 'scripts/finalize-build.mjs');
  writeFileSync(script, readFileSync(new URL('../scripts/finalize-build.mjs', import.meta.url)));
  const version = (revision = '') => {
    execFileSync(process.execPath, [script], {env: {...process.env, BUILD_VCS_NUMBER: revision}});
    return JSON.parse(readFileSync(join(root, 'dist/version.json'), 'utf8'));
  };
  const snapshot = () => {
    const {source, commit} = version();
    assert.equal(source, 'working-tree-snapshot');
    assert.equal(commit, null);
  };
  snapshot();
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args],
    {cwd: root, encoding: 'utf8'}).trim();
  git('init', '-q');
  git('add', '.gitignore', 'scripts');
  git('-c', 'user.email=fixture@localhost', '-c', 'user.name=Fixture', 'commit', '--no-gpg-sign', '-qm', 'fixture');
  const head = git('rev-parse', 'HEAD');
  assert.equal(version().commit, head);
  writeFileSync(join(root, 'uncommitted.txt'), 'pending');
  snapshot();
  assert.equal(version(head).commit, head);
});

test('全新静态站与原纯 HTTP 站点均使用匹配的证书、备份目录与发布根升级', t => {
  for (const legacy of [false,true]) {
    const f = fixture(t);
    if (legacy) writeFileSync(f.conf,f.template('nginx-http.conf',true));
    ok(f.boot('init'));
    const siteRoot = join(f.dir,'var/www',legacy ? '01aiclub' : '01PLAYER');
    assert.equal(readFileSync(join(f.control,'static-root'),'utf8'),siteRoot+'\n');
    assert.equal(readFileSync(f.conf,'utf8'),f.template('nginx-http.conf',legacy));
    assert.ok(readdirSync(join(f.dir,'var/backups/01PLAYER')).length);
    assert.ok(existsSync(join(f.lib,'receive-release.sh')));
    ok(f.boot('tls'));
    assert.equal(readFileSync(f.conf,'utf8'),f.template('nginx.conf',legacy));
    assert.ok(existsSync(join(f.control,'tls-ready')));
    const cert = f.calls().find(args=>args[0]==='certbot');
    assert.equal(cert[cert.indexOf('--cert-name')+1],'01aiclub');
    assert.ok(readFileSync(f.conf,'utf8').includes('/live/01aiclub/fullchain.pem'));
  }
});

test('现有业务和 /player 入口保留原文，只有逐字匹配的 HTTP 模板可自动升级', t => {
  const f = fixture(t);
  const locations = 'location /player/ { root /some/other/app; } location /api/community/ { proxy_pass http://127.0.0.1:4186; }';
  const custom = f.template('nginx-http.conf',true).replace('location = /version.json',locations+'\n    location = /version.json');
  writeFileSync(f.conf,custom);
  const init = f.boot('init');
  ok(init); assert.match(init.stderr,/人工合并/);
  const tls = f.boot('tls');
  assert.notEqual(tls.status,0); assert.match(tls.stderr,/人工合并/);
  assert.equal(readFileSync(f.conf,'utf8'),custom);
  const merged = f.template('nginx.conf',true).replace('location = /version.json',locations+'\n    location = /version.json');
  writeFileSync(f.conf,merged);
  ok(f.boot('init')); ok(f.boot('tls'));
  assert.equal(readFileSync(f.conf,'utf8'),merged);
  assert.equal(f.calls().filter(args=>args[0]==='certbot').length,0);
  assert.ok(existsSync(join(f.control,'tls-ready')));
  const legacy = join(f.dir,'var/www/01aiclub');
  const release = '20260101000000-aaaaaaaaaaaa';
  ok(f.run(join(f.lib,'receive-release.sh'),[],artifact(join(f.dir,'artifact'))));
  assert.equal(realpathSync(join(legacy,'current')),join(legacy,'releases',release));
  assert.ok(existsSync(join(legacy,'shared/successful',release)));
  ok(f.run(join(f.lib,'release.sh'),['--rollback',release]));
  assert.deepEqual(readdirSync(join(legacy,'shared/incoming')),[]);
  assert.equal(existsSync(join(f.dir,'var/www/01PLAYER')),false);
});

test('拒绝未知或冲突的静态根，候选 TLS 未通过检查时恢复原 HTTP 站点', t => {
  const f = fixture(t);
  const http = f.template('nginx-http.conf');
  writeFileSync(f.conf,http.replace('/www/01PLAYER/current','/www/unrelated/current'));
  assert.notEqual(f.boot('init').status,0);
  assert.equal(existsSync(f.control),false);
  writeFileSync(f.conf,http);
  ok(f.boot('init'));
  writeFileSync(join(f.dir,'fail-tls'),'');
  assert.notEqual(f.boot('tls').status,0);
  assert.equal(readFileSync(f.conf,'utf8'),http);
  assert.equal(existsSync(join(f.control,'tls-ready')),false);
  rmSync(join(f.dir,'fail-tls'));
  writeFileSync(join(f.dir,'edit-during-certbot'),'');
  const changed = f.boot('tls');
  assert.notEqual(changed.status,0); assert.match(changed.stderr,/签发期间 HTTP 配置已变更/);
  assert.equal(readFileSync(f.conf,'utf8'),http+'# concurrent route change\n');
  assert.equal(existsSync(join(f.control,'tls-ready')),false);
  writeFileSync(f.conf,f.template('nginx-http.conf',true));
  const conflict = f.boot('init');
  assert.notEqual(conflict.status,0); assert.match(conflict.stderr,/静态根与现有站点不一致/);
  writeFileSync(join(f.control,'static-root'),'/unrelated\n');
  const release = f.run(join(f.lib,'release.sh'),['--rollback','20260101000000-aaaaaaaaaaaa']);
  assert.notEqual(release.status,0); assert.match(release.stderr,/静态根记录只允许/);
});

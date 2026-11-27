#!/usr/bin/env bash
# 仅初始化零一玩家官网专属资源；日常流水线不得以 root 执行本脚本。
set -euo pipefail
umask 022

readonly CONTROL=/etc/01PLAYER
readonly CONFIG=/etc/nginx/conf.d/020-01aiclub.conf
readonly LIB=/usr/local/lib/01aiclub
readonly BACKUPS=/var/backups/01PLAYER
readonly SOURCE=$(cd "$(dirname "$0")" && pwd)
mode=${1:-init}

[[ $(id -u) == 0 ]] || { printf '初始化需要 root 权限。\n' >&2; exit 1; }
[[ "$mode" == init || "$mode" == tls ]] || { printf '仅支持 init 或 tls。\n' >&2; exit 1; }

assert_plain_path() {
  local current='' part
  local -a parts
  IFS=/ read -r -a parts <<< "$1"
  for part in "${parts[@]}"; do
    [[ -n "$part" ]] || continue
    current="$current/$part"
    [[ ! -L "$current" ]] || { printf '受管路径存在符号链接：%s\n' "$current" >&2; exit 1; }
  done
}
assert_plain_path "$CONTROL/static-root"
assert_plain_path "$CONFIG"
plan=$(python3 "$SOURCE/static-site.py" "$CONTROL/static-root" "$CONFIG")
read -r ROOT protocol <<< "$plan"
readonly ROOT
render_template() { sed "s|/var/www/01PLAYER/current;|$ROOT/current;|g" "$1"; }
if [[ "$protocol" != tls && -e "$CONTROL/tls-ready" ]]; then
  printf '现有站点与 tls-ready 状态不符，请先人工核对 nginx -T。\n' >&2; exit 1
fi
if [[ "$protocol" == new && "$mode" == tls ]]; then
  printf '首次签发前请先运行 init 安装 HTTP 验证入口。\n' >&2; exit 1
fi
if [[ "$protocol" == http ]] && ! cmp -s "$CONFIG" <(render_template "$SOURCE/nginx-http.conf"); then
  printf '已有自定义 HTTP 配置。请人工合并 TLS，保留业务与 /player 路由，再运行 init 同步状态。\n' >&2
  [[ "$mode" == init ]] || exit 1
fi
for path in "$ROOT" "$ROOT/releases" "$ROOT/shared" "$ROOT/shared/successful" "$ROOT/shared/incoming" "$ROOT/shared/archives" \
  "$CONTROL" "$CONTROL/tls-ready" "$LIB" "$LIB/release.sh" \
  "$LIB/verify-archive.py" "$LIB/receive-release.sh" "$LIB/static-site.py" "$BACKUPS" /var/lib/01aiclub/acme \
  /var/lib/01aiclub/deploy-home /etc/letsencrypt-01aiclub /var/lib/letsencrypt-01aiclub \
  /var/log/letsencrypt-01aiclub /etc/systemd/system/01aiclub-certbot.service \
  /etc/systemd/system/01aiclub-certbot.timer; do
  assert_plain_path "$path"
done

if id 01aiclub-deploy > /dev/null 2>&1; then
  [[ $(getent passwd 01aiclub-deploy | cut -d: -f6) == /var/lib/01aiclub/deploy-home ]] || {
    printf '已有同名用户的家目录不符合约定。\n' >&2; exit 1;
  }
fi

nginx -t
protected_state() {
  local path
  for path in /etc/nginx/conf.d/000-25thgame.conf /etc/nginx/conf.d/010-01yang-company-website.conf /etc/nginx/sites-enabled/beian; do
    if [[ -e "$path" || -L "$path" ]]; then sha256sum "$path" || return 1; fi
  done
  for path in /var/www/25thgame/current /var/www/01yang-company-website/current; do
    if [[ -e "$path" || -L "$path" ]]; then readlink -f "$path" || return 1; fi
  done
}
protected_before=$(protected_state)

install -d -m 700 "$BACKUPS"
backup=$(mktemp -d "$BACKUPS/change.XXXXXXXX")
had_config=0
config_changed=0
candidate=''
staged=''
if [[ -f "$CONFIG" ]]; then
  cp -a "$CONFIG" "$backup/nginx.conf"
  had_config=1
fi
cleanup() {
  result=$?
  if [[ -n "$staged" ]]; then rm -f -- "$staged"; fi
  if (( result != 0 && config_changed == 1 )); then
    if [[ ! -L "$CONFIG" ]] && cmp -s "$candidate" "$CONFIG"; then
      if (( had_config == 1 )); then cp -a "$backup/nginx.conf" "$CONFIG"; else rm -f -- "$CONFIG"; fi
      if nginx -t; then systemctl reload nginx; fi
      printf '初始化失败，已恢复入口配置；备份：%s\n' "$backup" >&2
    else
      printf '入口已被其他进程修改，请人工核对；原配置备份：%s\n' "$backup" >&2
    fi
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 129' HUP
trap 'exit 130' INT

install -d -m 755 -o root -g root "$CONTROL" "$LIB" /var/lib/01aiclub/acme
if ! id 01aiclub-deploy > /dev/null 2>&1; then
  useradd --system --user-group --create-home --home-dir /var/lib/01aiclub/deploy-home --shell /bin/bash 01aiclub-deploy
fi
for directory in "$ROOT" "$ROOT/releases" "$ROOT/shared"; do
  install -d -m 755 -o 01aiclub-deploy -g 01aiclub-deploy "$directory"
done
for directory in "$ROOT/shared/successful" "$ROOT/shared/incoming" "$ROOT/shared/archives"; do
  install -d -m 700 -o 01aiclub-deploy -g 01aiclub-deploy "$directory"
done
printf '%s\n' "$ROOT" > "$backup/static-root"
install -m 644 "$backup/static-root" "$CONTROL/static-root"
install -m 644 "$SOURCE/static-site.py" "$LIB/static-site.py"
install -m 755 "$SOURCE/release.sh" "$LIB/release.sh"
install -m 755 "$SOURCE/verify-archive.py" "$LIB/verify-archive.py"
install -m 755 "$SOURCE/receive-release.sh" "$LIB/receive-release.sh"
render_template "$SOURCE/nginx.conf" > "$backup/nginx-tls.candidate"

key_dir=/var/lib/01aiclub/deploy-home/.ssh
[[ $(wc -l < "$SOURCE/ci-deploy-key.pub") -eq 1 ]] || { printf 'CI 公钥文件必须只有一行。\n' >&2; exit 1; }
grep -q '^restrict,command="/usr/local/lib/01aiclub/receive-release.sh" ssh-ed25519 ' "$SOURCE/ci-deploy-key.pub"
ssh-keygen -lf "$SOURCE/ci-deploy-key.pub" > /dev/null
install -d -m 700 -o 01aiclub-deploy -g 01aiclub-deploy "$key_dir"
if [[ -f "$key_dir/authorized_keys" ]]; then
  grep -Fxq -f "$SOURCE/ci-deploy-key.pub" "$key_dir/authorized_keys" || {
    printf '零一玩家官网部署用户已有不同授权，停止覆盖。\n' >&2; exit 1;
  }
else
  install -m 600 -o 01aiclub-deploy -g 01aiclub-deploy "$SOURCE/ci-deploy-key.pub" "$key_dir/authorized_keys"
fi

if [[ "$protocol" == new ]]; then
  candidate="$backup/nginx-http.candidate"
  render_template "$SOURCE/nginx-http.conf" > "$candidate"
elif [[ "$mode" == tls && "$protocol" == http ]]; then
  command -v certbot > /dev/null
  certbot certonly --non-interactive --agree-tos --email 1241798750@qq.com \
    --webroot -w /var/lib/01aiclub/acme --cert-name 01aiclub -d club.01aiedu.com \
    --config-dir /etc/letsencrypt-01aiclub --work-dir /var/lib/letsencrypt-01aiclub \
    --logs-dir /var/log/letsencrypt-01aiclub --keep-until-expiring
  candidate="$backup/nginx-tls.candidate"
fi
if [[ -n "$candidate" ]]; then
  staged=$(mktemp "${CONFIG%/*}/.01player-config.XXXXXXXX")
  install -m 644 "$candidate" "$staged"
  if [[ "$protocol" == new ]]; then
    ln "$staged" "$CONFIG" || { printf '站点配置已变更，请重新核对。\n' >&2; exit 1; }
  else
    [[ ! -L "$CONFIG" ]] && cmp -s "$CONFIG" <(render_template "$SOURCE/nginx-http.conf") || {
      printf '签发期间 HTTP 配置已变更，请人工合并 TLS。\n' >&2; exit 1;
    }
    mv -f -- "$staged" "$CONFIG"
  fi
  config_changed=1
fi

nginx -t
if (( config_changed )); then systemctl reload nginx; fi
protected_after=$(protected_state)
[[ "$protected_after" == "$protected_before" ]]
if [[ "$mode" == tls && "$protocol" == http ]]; then
  install -m 644 "$SOURCE/01aiclub-certbot.service" /etc/systemd/system/01aiclub-certbot.service
  install -m 644 "$SOURCE/01aiclub-certbot.timer" /etc/systemd/system/01aiclub-certbot.timer
  systemctl daemon-reload
  systemctl enable --now 01aiclub-certbot.timer
fi
if [[ "$protocol" == tls || "$mode" == tls ]]; then touch "$CONTROL/tls-ready"; fi
printf '站点入口已核对，静态发布根为 %s，配置备份在 %s。\n' "$ROOT" "$backup"

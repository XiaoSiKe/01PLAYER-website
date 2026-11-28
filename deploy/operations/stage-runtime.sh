#!/usr/bin/env bash
# Stage a trusted, prebuilt Linux checkout. This command never switches live pointers.
stage_operations() {
    local source=$1 target=$2 file
    local configs=(
        01player-cms.service 01player-cms-migrate.service 01player-community.service
        community-standalone.inc community-player.inc
        common-proxy.inc locations.inc traffic-zones.conf
        bridge.env.example cms.env.example community.env.example
    )
    local commands=(check-community-route.mjs smoke.mjs snapshot.py)
    [[ -d "$source" && ! -L "$source" ]] || { echo "缺少运维资源目录 $source" >&2; return 1; }
    for file in "${configs[@]}" "${commands[@]}"; do
        [[ -f "$source/$file" && -s "$source/$file" && ! -L "$source/$file" ]] || {
            echo "缺少或不是独立的运维资源文件 $source/$file" >&2
            return 1
        }
    done
    install -d -m 0755 "$target" || return 1
    for file in "${configs[@]}"; do
        install -m 0644 "$source/$file" "$target/$file" || return 1
    done
    for file in "${commands[@]}"; do
        install -m 0755 "$source/$file" "$target/$file" || return 1
    done
}

# Payload's migrate command treats an empty migration directory as success.
# Load the candidate's migration index with Payload's TS loader; never run the migrations here.
check_migrations() (
    cd "$1" || return 1
    node --import tsx --input-type=module -e '
        import { migrations } from "./src/migrations/index.ts";
        if (!Array.isArray(migrations) || !migrations.length ||
            !migrations.every(m => m.name && typeof m.up === "function" && typeof m.down === "function")) {
            throw Error("CMS 迁移索引为空或迁移模块不完整");
        }
    '
)

# Tests exercise the packaging checks without manufacturing a release build.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return 0; fi
set -euo pipefail
umask 022
[[ $# == 2 ]] || { echo '用法：stage-runtime.sh 已构建的官网目录 新的暂存目录' >&2; exit 2; }
source_dir=$(cd -- "$1" && pwd -P)
destination=$2
[[ "$destination" == /* ]] || { echo '目标目录需使用绝对路径' >&2; exit 1; }
[[ ! -e "$destination" && ! -L "$destination" ]] || { echo '目标目录必须不存在' >&2; exit 1; }
[[ "$source_dir" != *$'\n'* && "$(uname -s)" == Linux ]] || { echo '在匹配生产 CPU 架构的 Linux 构建机打包'; exit 1; }
cd "$source_dir"
required_node=$(cat cms/.nvmrc)
[[ "$(node -v)" == "v$required_node" ]] || { echo "统一发布运行时需 Node v$required_node"; exit 1; }
for file in dist/version.json dist/SHA256SUMS cms/.next/BUILD_ID cms/package-lock.json cms/package.json cms/node_modules/next/package.json; do
    [[ -s "$file" ]] || { echo "缺少 $file" >&2; exit 1; }
done
(cd dist && sha256sum --quiet -c SHA256SUMS)
node -e 'const v=require("./dist/version.json"); if (!/^[a-f0-9]{40}$/.test(v.commit) || v.source==="working-tree-snapshot") process.exit(1)'
mkdir -p -- "$(dirname -- "$destination")"
parent=$(cd -- "$(dirname -- "$destination")" && pwd -P)
destination="$parent/$(basename -- "$destination")"
[[ "$parent" != "$source_dir" && "$parent" != "$source_dir"/* ]] || { echo '暂存目录需位于源码外'; exit 1; }
stage=$(mktemp -d "$parent/.01player-stage.XXXXXXXX")
trap 'rm -rf -- "$stage"' EXIT
mkdir -p "$stage/runtime/cms" "$stage/runtime/src/data" "$stage/runtime/src/community/account" \
  "$stage/runtime/src/editorial" "$stage/runtime/src/time-machine"
stage_operations deploy/operations "$stage/runtime/deploy/operations"
cp -a package.json server dist "$stage/runtime/"
cp -p src/data/{page-paths,traffic-pages,activity-photos,competition}.js "$stage/runtime/src/data/"
cp -p src/community/account/{profile,identity}.js "$stage/runtime/src/community/account/"
cp -p src/editorial/content.js "$stage/runtime/src/editorial/"
cp -p src/time-machine/photos.js "$stage/runtime/src/time-machine/"
node --input-type=module -e 'import { pathToFileURL } from "node:url"; await import(pathToFileURL(process.argv[1]).href)' \
    "$stage/runtime/server/community-api.mjs"
# The community API checks local /images/... against its public root.
ln -s dist "$stage/runtime/public"
cp -a cms/{.nvmrc,package.json,package-lock.json,src,tsconfig.json,next.config.mjs,node_modules,.next} "$stage/runtime/cms/"
check_migrations "$stage/runtime/cms"
if [[ -d cms/scripts ]]; then cp -a cms/scripts "$stage/runtime/cms/"; fi
if [[ -d cms/public ]]; then cp -a cms/public "$stage/runtime/cms/"; fi
rm -rf -- "$stage/runtime/cms/.next/cache"
ln -s /var/cache/01player-cms "$stage/runtime/cms/.next/cache"
mv -T -- "$stage/runtime" "$destination"
printf '运行时制品已暂存于 %s\n' "$destination"

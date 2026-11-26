#!/usr/bin/env python3
"""Cold snapshots of 01PLAYER's CMS and community state. Stop all writers first."""
import argparse
from contextlib import closing, contextmanager
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile


def check_receipt_secret(state):
    has_receipts = "registrationStore" in state or any(row.get("keyDigest") for row in (state.get("registrations") or []))
    if has_receipts and not (isinstance(state.get("registrationSecret"), str) and state["registrationSecret"]):
        raise ValueError("缺少原报名回执签名密钥")


@contextmanager
def read_cold_database(db):
    # Work on a private copy so SQLite can recreate its WAL index without
    # touching the stopped instance, including on older SQLite builds.
    with tempfile.TemporaryDirectory(prefix=".01player-sqlite-") as folder:
        copy = Path(folder) / db.name
        shutil.copyfile(db, copy)
        for suffix in ("-wal", "-journal"):
            sidecar = db.with_name(db.name + suffix)
            if sidecar.is_file():
                shutil.copyfile(sidecar, copy.with_name(copy.name + suffix))
        with closing(sqlite3.connect(copy)) as connection:
            yield connection


def copy_community_identity(identity, target):
    with identity.open(encoding="utf-8") as stream:
        state = json.load(stream)
    check_receipt_secret(state)
    db = identity.with_name(identity.name + ".registrations.sqlite")
    if "registrationStore" not in state:
        if db.exists():
            raise ValueError("旧版身份文件旁已有报名数据库，请先用配套新版服务核对实例与记录并完成迁移，再备份")
        if not isinstance(state.get("registrations"), list):
            raise ValueError("社区报名数据无效")
        shutil.copyfile(identity, target)
        return
    if (state["registrationStore"] != "sqlite-v1" or "registrations" not in state
            or state["registrations"] is not None or not state.get("instanceId")):
        raise ValueError("社区报名存储格式无效")
    with read_cold_database(db) as connection:
        connection.execute("BEGIN")
        pair = connection.execute("SELECT instance, format FROM registration_store").fetchall()
        if pair != [(state["instanceId"], state["registrationStore"])]:
            raise ValueError("报名数据库与社区实例不匹配")
        del state["registrationStore"], state["registrations"]
        with target.open("x", encoding="utf-8", errors="backslashreplace") as out:
            out.write("{")
            for key, value in state.items():
                out.write(json.dumps(key) + ":")
                json.dump(value, out, ensure_ascii=False, separators=(",", ":"))
                out.write(",")
            out.write('"registrations":[')
            rows = connection.execute("SELECT id, body FROM registrations ORDER BY rowid")
            for index, (row_id, body) in enumerate(rows):
                row = json.loads(body)
                if not isinstance(row, dict) or row.get("id") != row_id:
                    raise ValueError("报名记录与索引不匹配")
                if index:
                    out.write(",")
                out.write(body)
            out.write("]}")


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def files(root):
    for path in sorted(root.rglob("*")):
        if path.is_symlink() or not (path.is_dir() or path.is_file()):
            raise ValueError(f"备份目录包含特殊文件 {path.relative_to(root)}")
        if path.is_file():
            yield path


def checksums(root):
    return {str(file.relative_to(root)): sha256(file) for file in files(root)}


def validate_data(root):
    db = root / "cms/cms.sqlite"
    if not db.is_file() or not db.stat().st_size:
        raise ValueError("缺少 CMS 数据库")
    with sqlite3.connect(db.resolve().as_uri() + "?mode=ro&immutable=1", uri=True) as connection:
        if connection.execute("pragma quick_check").fetchall() != [("ok",)]:
            raise ValueError("CMS 数据库校验失败")
        if not connection.execute("select 1 from sqlite_master where name='staff'").fetchone():
            raise ValueError("CMS 数据库缺少负责人集合")
    community = json.loads((root / "community/community.json").read_text())
    if ("registrationStore" in community or not isinstance(community.get("events"), list)
            or not isinstance(community.get("registrations"), list)):
        raise ValueError("社区业务数据无效")
    check_receipt_secret(community)
    manifest = root / "cms/manifest.json"
    if manifest.exists() and not isinstance(json.loads(manifest.read_text()), dict):
        raise ValueError("公开内容快照无效")


def read_manifest(archive):
    return json.loads((archive / "snapshot.json").read_text())


def verify_payload(payload, meta):
    if meta.get("version") != 1 or checksums(payload) != meta.get("files"):
        raise ValueError("备份文件清单或 SHA-256 校验失败")
    validate_data(payload)


def verify(archive):
    meta = read_manifest(archive)
    verify_payload(archive / "data", meta)
    return meta


def create(source, target, release, restore):
    if target.is_symlink():
        raise ValueError("目标必须是全新目录")
    source_root = source.resolve(strict=True)
    # A symlinked parent or a path containing ".." can otherwise put
    # the temporary copy inside the very tree it is about to copy.
    target = target.resolve()
    if target.exists():
        raise ValueError("目标必须是全新目录")
    if target.is_relative_to(source_root) or source_root.is_relative_to(target):
        raise ValueError("备份与业务数据目录必须独立")
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=target.parent, prefix=".01player-") as temporary:
        stage = Path(temporary) / "ready"
        if restore:
            meta = read_manifest(source)
            # Check the bytes being published, without following links from the archive.
            shutil.copytree(source / "data", stage, symlinks=True)
            verify_payload(stage, meta)
        else:
            payload = stage / "data"
            payload.mkdir(parents=True)
            for name in ("cms", "community"):
                directory = source / name
                if directory.is_symlink():
                    raise ValueError(f"需要实际数据目录 {name}")
                list(files(directory))
                if name == "cms":
                    ignore = shutil.ignore_patterns("cms.sqlite", "cms.sqlite-wal", "cms.sqlite-shm", "cms.sqlite-journal")
                else:
                    sidecar = "community.json.registrations.sqlite"
                    excluded = {"community.json", sidecar, sidecar + "-wal", sidecar + "-shm", sidecar + "-journal"}

                    def ignore(folder, names):
                        return excluded.intersection(names) if Path(folder) == directory else set()
                shutil.copytree(directory, payload / name, ignore=ignore)
            copy_community_identity(source / "community/community.json", payload / "community/community.json")
            # SQLite's backup API folds any committed WAL frames into a standalone DB.
            with read_cold_database(source / "cms/cms.sqlite") as original, closing(sqlite3.connect(payload / "cms/cms.sqlite")) as copy:
                original.backup(copy)
                copy.execute("pragma journal_mode=delete")
            metadata = {"version": 1, "release": release, "files": checksums(payload)}
            (stage / "snapshot.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2))
            verify(stage)
        stage.rename(target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="action", required=True)
    for action in ("backup", "restore"):
        command = subcommands.add_parser(action)
        command.add_argument("source", type=Path)
        command.add_argument("destination", type=Path)
        if action == "backup":
            command.add_argument("--release", required=True)
    command = subcommands.add_parser("verify")
    command.add_argument("source", type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    source = args.source.resolve(strict=True)
    if args.action == "verify":
        print("备份校验通过，版本", verify(source)["release"])
    else:
        create(source, args.destination.absolute(), getattr(args, "release", None), args.action == "restore")
        print("完成。输出目录", args.destination.absolute())


if __name__ == "__main__":
    main()

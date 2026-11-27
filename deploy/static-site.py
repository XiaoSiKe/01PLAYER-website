"""Read the static deployment root and inspect the site's direct server directives."""
import re
import sys
from pathlib import Path


ROOTS = {"/var/www/01PLAYER", "/var/www/01aiclub"}
DEFAULT = "/var/www/01PLAYER"
DOMAIN = "club.01aiedu.com"
# Keep quoted location expressions, comments and braced variables out of the block grammar.
WORDS = re.compile(r"""\#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[;{}]|(?:\\.|\$\{[^}]*\}|[^\s"'\#;{}\\])+""")


def site(path):
    blocks, servers, words = [], [], []
    for match in WORDS.finditer(path.read_text()):
        token = match.group()
        if token.startswith("#"):
            continue
        if token == "{":
            server = {} if not blocks and words == ["server"] else None
            if server is not None:
                servers.append(server)
            blocks.append(server)
        elif token == "}":
            if not blocks or words:
                raise ValueError("无法识别站点内容，请人工核对 nginx -T")
            blocks.pop()
        elif token == ";":
            if blocks and blocks[-1] is not None and words:
                blocks[-1].setdefault(words[0], []).append(words[1:])
        else:
            words.append(token[1:-1] if token.startswith(('"', "'")) else token)
            continue
        words = []
    if blocks or words or not servers or any(s.get("server_name") != [[DOMAIN]] for s in servers):
        raise ValueError("站点域名或配置结构无法确认，请人工核对 nginx -T")
    roots = {tuple(row) for s in servers for row in s.get("root", [])}
    if len(roots) != 1 or next(iter(roots)) not in {(r + "/current",) for r in ROOTS}:
        raise ValueError("无法确定唯一的受支持静态根目录，请人工核对 nginx -T")
    root = next(iter(roots))[0].rsplit("/", 1)[0]
    tls = False
    for server in servers:
        if not server.get("listen"):
            raise ValueError("站点监听协议未在本文件中明确配置，请人工核对 nginx -T")
        for listen in server["listen"]:
            port = listen[0].rsplit(":", 1)[-1] if listen else ""
            if port == "443" and "ssl" in listen:
                if not server.get("root"):
                    raise ValueError("无法确定 TLS 站点的静态根目录，请人工核对 nginx -T")
                tls = True
            elif port != "80" or "ssl" in listen:
                raise ValueError("无法确定站点监听协议，请人工核对 nginx -T")
    return root, "tls" if tls else "http"


def selected(path):
    if path.is_symlink():
        raise ValueError("静态根记录必须是普通文件")
    if not path.exists():
        return None
    if not path.is_file():
        raise ValueError("静态根记录必须是普通文件")
    lines = path.read_text().splitlines()
    if len(lines) != 1 or lines[0] not in ROOTS:
        raise ValueError("静态根记录只允许 /var/www/01PLAYER 或 /var/www/01aiclub")
    return lines[0]


if __name__ == "__main__":
    try:
        saved = selected(Path(sys.argv[1]))
        if len(sys.argv) == 2:
            if saved is None:
                raise ValueError("缺少已核对的静态根记录，请先运行 bootstrap.sh init")
            print(saved)
        else:
            config = Path(sys.argv[2])
            root, protocol = site(config) if config.exists() else (saved or DEFAULT, "new")
            if saved and root != saved:
                raise ValueError("已记录的静态根与现有站点不一致，请人工核对后更新 static-root")
            print(root, protocol)
    except (OSError, ValueError) as error:
        sys.exit(str(error))

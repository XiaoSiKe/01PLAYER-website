"""Exercise the shipping vhosts with a disposable Nginx and three loopback upstreams."""
import http.client
import json
import re
import shutil
import socket
import ssl
import subprocess
import tempfile
import threading
import time
import unittest
from contextlib import ExitStack, contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DEPLOY = Path(__file__).resolve().parents[1] / "deploy"
OPS = DEPLOY / "operations"


class Upstream(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(f"{self.server.label} {self.path}".encode())

    def log_message(self, *args):
        pass


def unused_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


class BusinessRouting(unittest.TestCase):
    def test_site_templates(self):
        with ExitStack() as stack:
            root = Path(stack.enter_context(tempfile.TemporaryDirectory()))
            # A system Nginx started by root drops privileges for static requests.
            root.chmod(0o711)
            runtime = root / "runtime"
            runtime.mkdir()
            public = root / "public"
            public.mkdir()
            (public / "index.html").write_text("website")
            shutil.copy(OPS / "common-proxy.inc", runtime)
            ports = {}
            for label, original in [("standalone", 4173), ("player", 4186), ("cms", 4317)]:
                server = ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
                server.label = label
                threading.Thread(target=server.serve_forever, daemon=True).start()
                stack.callback(server.server_close)
                stack.callback(server.shutdown)
                ports[str(original)] = str(server.server_port)

            def localize(source):
                return re.sub(r"127\.0\.0\.1:(4173|4186|4317)",
                              lambda m: "127.0.0.1:" + ports[m[1]], source
                              ).replace("/etc/01player-runtime/", f"{runtime}/")

            (runtime / "locations.inc").write_text(localize((OPS / "locations.inc").read_text()))
            subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
                            "-subj", "/CN=localhost", "-days", "1", "-out", str(root / "fullchain.pem"),
                            "-keyout", str(root / "privkey.pem")], check=True, capture_output=True)
            tls_context = ssl.create_default_context(cafile=str(root / "fullchain.pem"))
            tls_context.check_hostname = False

            @contextmanager
            def serve(template):
                port, http_port = unused_port(), unused_port()
                while port == http_port:
                    http_port = unused_port()
                tls = template == "nginx.conf"
                site = localize((DEPLOY / template).read_text())
                site = (site.replace("listen 80;", f"listen 127.0.0.1:{http_port if tls else port};")
                        .replace("listen 443 ssl http2;", f"listen 127.0.0.1:{port} ssl;")
                        .replace("/etc/letsencrypt-01aiclub/live/01aiclub/", f"{root}/")
                        .replace("/var/www/01PLAYER/current", str(public)).replace("/var/log/nginx/", f"{root}/"))
                if tls:
                    # Simulate a previously installed player route in this same site.
                    site = site.replace("    include " + str(runtime / "enabled"),
                                        "    location = /player/ { return 200 'player-ui'; }\n    include "
                                        + str(runtime / "enabled"))
                config = root / "nginx.conf"
                config.write_text("pid nginx.pid; error_log error.log; events {} http { access_log off;\n"
                                  "client_body_temp_path client-body; proxy_temp_path proxy-temp;\n"
                                  "fastcgi_temp_path fastcgi-temp; uwsgi_temp_path uwsgi-temp; scgi_temp_path scgi-temp;\n"
                                  f'include "{OPS / "traffic-zones.conf"}";\n' + site + "}\n")
                args = ["nginx", "-p", str(root), "-e", str(root / "error.log"), "-c", str(config)]
                subprocess.run([*args, "-t"], check=True, capture_output=True)
                nginx = subprocess.Popen([*args, "-g", "daemon off;"], stderr=subprocess.PIPE)
                def request(path, method="GET"):
                    client = (http.client.HTTPSConnection("127.0.0.1", port, timeout=3,
                              context=tls_context) if tls else
                              http.client.HTTPConnection("127.0.0.1", port, timeout=3))
                    try:
                        client.request(method, path)
                        result = client.getresponse()
                        return result.status, result.headers, result.read().decode()
                    finally:
                        client.close()
                try:
                    for _ in range(100):
                        if nginx.poll() is not None:
                            self.fail((root / "error.log").read_text())
                        try:
                            request("/")
                            break
                        except ConnectionRefusedError:
                            time.sleep(0.02)
                    yield request
                finally:
                    nginx.terminate()
                    nginx.communicate(timeout=5)

            for template in ("nginx-http.conf", "nginx.conf"):
                with self.subTest(template=template), serve(template) as request:
                    self.assertEqual(request("/events")[2], "website")
                    for path in ("/admin/login", "/api/community/health", "/cms-api/health-board",
                                 "/_next/static/a.js", "/site-content/manifest.json"):
                        status, headers, body = request(path)
                        self.assertEqual(status, 503, path)
                        self.assertEqual(headers.get("Cache-Control"), "no-store")
                        self.assertTrue(json.loads(body)["error"])
                    self.assertEqual(request("/api/community/events/test/registrations", "POST")[0], 503)

            (runtime / "enabled").mkdir()
            (runtime / "enabled/operations.conf").symlink_to(runtime / "locations.inc")
            for owner in ("standalone", "player"):
                (runtime / "community-upstream.inc").write_text(localize((OPS / f"community-{owner}.inc").read_text()))
                with self.subTest(owner=owner), serve("nginx.conf") as request:
                    for path, target in [("/api/community/health", owner), ("/admin", "cms"), ("/admin/login", "cms"),
                                         ("/cms-api/health-board", "cms"), ("/_next/static/a.js", "cms"),
                                         ("/site-content/manifest.json", "standalone")]:
                        status, _, body = request(path)
                        self.assertEqual((status, body), (200, f"{target} {path}"))
                    self.assertEqual(request("/site-content/private.json")[0], 404)
                    self.assertEqual(request("/player/")[2], "player-ui")
                    self.assertEqual(request("/events")[2], "website")


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""Sync the verified club certificate to Aliyun CDN using the instance role."""

import base64
from datetime import datetime, timezone
import hashlib
import hmac
import json
from pathlib import Path
import socket
import ssl
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from uuid import uuid4


DOMAIN = "club.01aiedu.com"
CERT_DIR = Path("/etc/letsencrypt-01aiclub/live/01aiclub")
METADATA = "http://100.100.100.200/latest"
ROLE = "EcsCdnCertRenewRole"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def read_credentials(opener):
    token_request = Request(METADATA + "/api/token", method="PUT", headers={
        "X-aliyun-ecs-metadata-token-ttl-seconds": "90",
    })
    with opener.open(token_request, timeout=3) as response:
        token = response.read().decode()
    request = Request(METADATA + "/meta-data/ram/security-credentials/" + ROLE, headers={
        "X-aliyun-ecs-metadata-token": token,
    })
    with opener.open(request, timeout=3) as response:
        return json.load(response)


def public_fingerprint():
    try:
        with socket.create_connection((DOMAIN, 443), timeout=5) as connection:
            with ssl.create_default_context().wrap_socket(connection, server_hostname=DOMAIN) as tls:
                return hashlib.sha256(tls.getpeercert(binary_form=True)).hexdigest()
    except ssl.SSLCertVerificationError:
        return None


def publish(opener, credentials, chain, private_key, fingerprint):
    parameters = {
        "Action": "SetCdnDomainSSLCertificate", "Version": "2018-05-10", "Format": "JSON",
        "DomainName": DOMAIN, "SSLProtocol": "on", "CertType": "upload",
        "CertName": "club-01aiedu-com-" + fingerprint[:10],
        "SSLPub": chain, "SSLPri": private_key,
        "AccessKeyId": credentials["AccessKeyId"], "SecurityToken": credentials["SecurityToken"],
        "SignatureMethod": "HMAC-SHA1", "SignatureVersion": "1.0",
        "SignatureNonce": uuid4().hex, "Timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    canonical = urlencode(sorted(parameters.items()), quote_via=quote, safe="-_.~")
    signed = ("POST&%2F&" + quote(canonical, safe="-_.~")).encode()
    secret = (credentials["AccessKeySecret"] + "&").encode()
    signature = base64.b64encode(hmac.digest(secret, signed, "sha1")).decode()
    request = Request("https://cdn.aliyuncs.com/", data=(canonical + "&Signature=" + quote(signature, safe="")).encode(),
                      headers={"Content-Type": "application/x-www-form-urlencoded"})
    with opener.open(request, timeout=15) as response:
        if not json.load(response).get("RequestId"):
            raise ValueError("CDN request ID missing")


def main():
    cert, key = (CERT_DIR / file for file in ("fullchain.pem", "privkey.pem"))
    end = "-----END CERTIFICATE-----"
    chain = cert.read_text()
    leaf = chain.split(end, 1)[0] + end
    fingerprint = hashlib.sha256(ssl.PEM_cert_to_DER_cert(leaf)).hexdigest()
    if public_fingerprint() == fingerprint:
        print("CDN 证书与源站一致。")
        return

    subprocess.run(["openssl", "x509", "-in", cert, "-noout", "-checkend", "86400"],
                   check=True, stdout=subprocess.DEVNULL)
    # The hostname check requires the exact DNS name in the leaf's SAN.
    if ("DNS", DOMAIN) not in ssl._ssl._test_decode_cert(str(cert)).get("subjectAltName", ()):
        raise ValueError("certificate DNS name mismatch")
    certificate_key = subprocess.check_output(["openssl", "x509", "-in", cert, "-pubkey", "-noout"])
    private_key = subprocess.check_output(["openssl", "pkey", "-in", key, "-pubout"])
    if certificate_key.strip() != private_key.strip():
        raise ValueError("certificate and key mismatch")
    opener = build_opener(ProxyHandler({}), NoRedirect())
    publish(opener, read_credentials(opener), chain, key.read_text(), fingerprint)
    print("已提交 CDN 证书同步，目标 SHA256 " + fingerprint)


if __name__ == "__main__":
    try:
        main()
    except HTTPError as error:
        sys.exit("CDN 证书同步失败，HTTP " + str(error.code))
    except (URLError, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        sys.exit("CDN 证书同步失败，" + type(error).__name__)

# Include only inside the club.01aiedu.com HTTPS server.
# Keep the original static, ACME, /player and /api/player locations.
location = /admin { include /etc/01player-runtime/common-proxy.inc; proxy_pass http://127.0.0.1:4317; }
location ^~ /admin/ { include /etc/01player-runtime/common-proxy.inc; proxy_pass http://127.0.0.1:4317; }
location ^~ /cms-api/ {
    include /etc/01player-runtime/common-proxy.inc;
    client_max_body_size 18m;
    proxy_pass http://127.0.0.1:4317;
}
location ^~ /_next/ { include /etc/01player-runtime/common-proxy.inc; proxy_pass http://127.0.0.1:4317; }

location ^~ /api/community/ {
    include /etc/01player-runtime/common-proxy.inc;
    client_max_body_size 64000;
    client_body_timeout 15s;
    error_page 413 = @club_community_body_too_large;
    include /etc/01player-runtime/community-upstream.inc;
}
location = /site-content/manifest.json {
    include /etc/01player-runtime/common-proxy.inc;
    proxy_pass http://127.0.0.1:4173;
}
location ^~ /site-content/ { return 404; }

location @club_runtime_busy {
    default_type application/json;
    add_header Cache-Control "no-store" always;
    add_header Retry-After 1 always;
    return 429 '{"error":"当前访问较多，请稍后重试。"}';
}
location @club_community_body_too_large {
    default_type application/json;
    add_header Cache-Control "no-store" always;
    return 413 '{"error":"提交内容过大，请缩短内容或使用图片链接。"}';
}

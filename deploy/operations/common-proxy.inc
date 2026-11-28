# Each budget is shared across all Nginx workers. Shed excess before opening
# the upstream connection. Empty keys skip unrelated route budgets.
limit_req zone=club_requests burst=48 nodelay;
limit_req zone=club_writes burst=12 nodelay;
limit_req zone=club_writer_ips burst=8 nodelay;
limit_req zone=club_credentials burst=6 nodelay;
# Pace accepted bursts before forwarding them to the single SQLite writer.
limit_req zone=club_enrollments burst=112 delay=15;
limit_req zone=club_enrollment_ips burst=104 delay=11;
limit_req zone=club_attendee_reads burst=120 delay=11;
limit_req zone=club_attendee_read_ips burst=112 delay=7;
limit_conn club_in_flight 64;
limit_conn club_enrollment_active 64;
limit_conn club_attendee_read_active 32;
limit_conn club_community_active 80;
limit_req_status 429;
limit_conn_status 429;
error_page 429 = @club_runtime_busy;

proxy_intercept_errors off;
proxy_request_buffering on;
proxy_connect_timeout 3s;
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Real-IP $remote_addr;
# The CMS-to-community bridge runs on loopback. Public requests carry no bridge identity.
proxy_set_header X-01-Staff-Secret "";
proxy_set_header X-01-Staff-Role "";
proxy_set_header X-01-Staff-Id "";
proxy_cache off;

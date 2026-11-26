"""Read-only monitoring snapshot from the website ECS. Writes aggregate JSON to stdout."""

from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import gzip
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen


CHINA_TIME = timezone(timedelta(hours=8))
META = 'http://100.100.100.200/latest'
PUBLIC_PAGES = {
    'players', 'plaza', 'time-machine', 'leadership', 'mentors', 'pioneers',
    'research', 'strategy', 'cooperation', 'join',
}
LOG_PAGE = re.compile(r'^([^ ]+) [^\[]*\[([^\]]+)\] "GET ([^ ]+) HTTP/[0-9.]+" 200 ')
METRICS = (
    'cpu_total', 'memory_usedutilization', 'diskusage_utilization', 'networkin_rate',
    'networkout_rate', 'load_1m', 'DiskReadBPS', 'DiskWriteBPS',
)


def request_json(url, headers=None):
    with urlopen(Request(url, headers=headers or {}), timeout=3) as response:
        return json.load(response)


def metric_samples(now):
    request = Request(META + '/api/token', method='PUT',
                      headers={'X-aliyun-ecs-metadata-token-ttl-seconds': '90'})
    with urlopen(request, timeout=3) as response:
        token = response.read().decode()
    headers = {'X-aliyun-ecs-metadata-token': token}

    def metadata(key):
        with urlopen(Request(META + '/meta-data/' + key, headers=headers), timeout=3) as response:
            return response.read().decode().strip()

    instance = metadata('instance-id')
    region = metadata('region-id')
    role = metadata('ram/security-credentials/').splitlines()[0]
    credential = request_json(META + '/meta-data/ram/security-credentials/' + role, headers)
    environment = dict(os.environ, ALIBABA_CLOUD_IGNORE_PROFILE='TRUE', ALIBABA_CLOUD_PROFILE_MODE='StsToken',
                       ALIBABA_CLOUD_ACCESS_KEY_ID=credential['AccessKeyId'],
                       ALIBABA_CLOUD_ACCESS_KEY_SECRET=credential['AccessKeySecret'],
                       ALIBABA_CLOUD_SECURITY_TOKEN=credential['SecurityToken'])
    environment.pop('DEBUG', None)
    end = int(now.timestamp() * 1000)

    def collect(metric):
        dimensions = json.dumps([{'instanceId': instance}])
        try:
            result = subprocess.run([
                '/usr/local/bin/aliyun', 'cms', 'DescribeMetricList', '--region', region,
                '--endpoint', 'metrics.' + region + '.aliyuncs.com', '--Namespace', 'acs_ecs_dashboard',
                '--MetricName', metric, '--Dimensions', dimensions, '--Period', '60',
                '--StartTime', str(end - 30 * 60_000), '--EndTime', str(end), '--Length', '100',
            ], env=environment, capture_output=True, text=True, timeout=6, check=True)
            payload = json.loads(result.stdout)
            if payload.get('Success') is False:
                return metric, None
            return metric, [
                {key: row[key] for key in ('timestamp', 'Average', 'device') if key in row}
                for row in json.loads(payload.get('Datapoints') or '[]')
            ]
        except (subprocess.SubprocessError, ValueError):
            return metric, None

    with ThreadPoolExecutor(max_workers=4) as executor:
        return {'instance': instance, 'samples': dict(executor.map(collect, METRICS))}


def page_group(target):
    try:
        url = urlsplit(target)
    except ValueError:
        return None
    if url.scheme or url.netloc:
        return None
    path = url.path.strip('/')
    if path == 'team':
        return 'leadership'
    if path in PUBLIC_PAGES:
        return path
    if url.path != '/':
        return None
    query = parse_qs(url.query, max_num_fields=100) if url.query.count('&') < 100 else {}
    page = query.get('page', [''])[0]
    return page if page in PUBLIC_PAGES else 'project' if 'project' in query else 'home'


def traffic_counts(now):
    days = [(now.date() - timedelta(days=offset)).isoformat() for offset in range(6, -1, -1)]
    daily, pages = Counter(), Counter()
    sources = defaultdict(set)
    logs = [item for item in Path('/var/log/nginx').glob('01aiclub.access.log*')
            if item.is_file() and not item.is_symlink() and item.stat().st_mtime >= now.timestamp() - 8 * 86400]
    if not logs:
        return None
    for log in logs:
        opener = gzip.open if log.name.endswith('.gz') else open
        try:
            with opener(log, 'rt', encoding='utf-8', errors='replace') as stream:
                for line in stream:
                    match = LOG_PAGE.match(line)
                    if not match:
                        continue
                    if match[1] in ('127.0.0.1', '::1', '::ffff:127.0.0.1') or line.rstrip().endswith('"Gatus/1.0"'):
                        continue
                    page = page_group(match[3])
                    if page is None:
                        continue
                    try:
                        day = datetime.strptime(match[2], '%d/%b/%Y:%H:%M:%S %z').astimezone(CHINA_TIME).date().isoformat()
                    except ValueError:
                        continue
                    if days[0] <= day <= days[-1]:
                        daily[day] += 1
                        sources[day].add(match[1])
                        pages[page] += 1
        except FileNotFoundError:
            continue  # A file can rotate between listing and opening it.
    trend = [{'day': day, 'views': daily[day], 'visitors': len(sources[day])} for day in days]
    return {
        'source': 'origin-log', 'today': trend[-1], 'views7d': sum(daily.values()), 'trend': trend,
        'popular': [{'page': page, 'views': count} for page, count in pages.most_common(5)],
    }


def read_or_none(action):
    try:
        return action()
    except (OSError, ValueError, KeyError, IndexError):
        return None


now = datetime.now(CHINA_TIME)
print(json.dumps({
    'host': read_or_none(lambda: metric_samples(now)),
    'origin': read_or_none(lambda: request_json('http://127.0.0.1:8089/api/v1/endpoints/statuses')),
    'traffic': read_or_none(lambda: traffic_counts(now)),
}, separators=(',', ':')))

"""Verify the public HTTPS deployment with synthetic material and real AI.

Requires an existing invited educator account. Prompts privately for its password.
Creates one test project and deletes ONLY that project when the run finishes.
Makes two billable AI requests by default, or nine with --all-artifacts.
"""
import argparse
import copy
from datetime import datetime, timezone
import getpass
import json
from pathlib import Path
import secrets
import socket
import ssl
import sys
import time
from urllib.parse import urlsplit
import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.schema import KINDS


def synthetic_pdf():
    lines = [
        'Binary search trees: a short teaching source.',
        'For distinct keys, smaller keys go left and larger keys go right.',
        'Search takes O(h) time, where h is tree height.',
        'A balanced tree has logarithmic height. A skewed tree may have linear height.',
        'Inorder traversal visits the left subtree, root, then right subtree.',
        'Students should explain the ordering rule and compare search complexity.',
    ]
    text = 'BT /F1 12 Tf 50 760 Td 18 TL ' + ' '.join(('T* ' if i else '') + '(' + line.replace('(', r'\(').replace(')', r'\)') + ') Tj' for i, line in enumerate(lines)) + ' ET'
    content = text.encode('ascii')
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
               b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
               b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
               b'<< /Length ' + str(len(content)).encode() + b' >>\nstream\n' + content + b'\nendstream']
    pdf = b'%PDF-1.4\n'
    offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(pdf))
        pdf += f'{i} 0 obj\n'.encode() + obj + b'\nendobj\n'
    start = len(pdf)
    pdf += b'xref\n0 6\n0000000000 65535 f \n'
    pdf += b''.join(f'{n:010d} 00000 n \n'.encode() for n in offsets[1:])
    pdf += f'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n'.encode()
    return pdf


def verify(origin, email, password, all_artifacts=False):
    parsed = urlsplit(origin)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.path not in {'', '/'} or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Use only the HTTPS app origin, with no path or credentials.')
    origin = origin.rstrip('/')
    results = []
    report = {'origin': origin, 'time_utc': datetime.now(timezone.utc).isoformat(), 'checks': results, 'passed': False}
    def passed(name):
        results.append({'check': name, 'result': 'PASS'})
        print('PASS:', name, flush=True)
    def check(condition, message):
        if not condition:
            raise ValueError(message)
    with socket.create_connection((parsed.hostname, parsed.port or 443), timeout=15) as raw:
        with ssl.create_default_context().wrap_socket(raw, server_hostname=parsed.hostname) as secure:
            cert = secure.getpeercert()
            check(ssl.cert_time_to_seconds(cert['notAfter']) > time.time() + 7*86400, 'Certificate expires in less than seven days.')
            report['certificate_expires'] = cert['notAfter']
            report['tls_version'] = secure.version()
    passed('Trusted TLS certificate, matching hostname, expiry beyond seven days')
    pid = None
    with httpx.Client(base_url=origin, timeout=45, follow_redirects=False, trust_env=False) as client:
        def request(method, path, expected=200, **kwargs):
            response = client.request(method, path, **kwargs)
            check(response.status_code == expected, f'{method} {path} returned HTTP {response.status_code}; expected {expected}.')
            return response
        def login():
            r = request('POST', '/api/auth/login', json={'email': email, 'password': password}, headers={'Origin': origin})
            cookie = r.headers.get('set-cookie', '').lower()
            check('secure' in cookie and 'httponly' in cookie and 'samesite=lax' in cookie, 'Session cookie protection is missing.')
            client.headers.update({'Origin': origin, 'X-CSRF-Token': r.json()['csrf']})
        try:
            r = client.get('http://' + parsed.netloc + '/api/health')
            check(r.status_code in {301, 302, 307, 308} and r.headers.get('location', '').startswith(origin + '/'), 'HTTP does not redirect to the expected HTTPS origin.')
            passed('HTTP redirects to HTTPS')
            r = request('GET', '/api/health')
            check(r.json().get('status') == 'ok', 'Database health failed.')
            check('max-age=' in r.headers.get('strict-transport-security', ''), 'HSTS is missing.')
            check("frame-ancestors 'none'" in r.headers.get('content-security-policy', ''), 'CSP is missing.')
            passed('Database health and browser security headers')
            request('GET', '/api/projects', expected=401)
            login()
            request('GET', '/api/me')
            passed('Authentication and protected session cookies')
            p = request('POST', '/api/projects', expected=201, files={'file': ('deployment-verification.pdf', synthetic_pdf(), 'application/pdf')}).json()
            pid = p['id']
            check(p['source'][0]['page'] == 1 and 'Binary search trees' in p['source'][0]['text'], 'PDF extraction or page reference failed.')
            passed('PDF upload, extraction, page references and saved project')
            url = '/api/projects/' + pid
            settings = {**p['settings'], 'subject': 'Data structures', 'level': 'Intermediate', 'bloom': 'Apply'}
            request('PATCH', url, json={'settings': settings})
            types = KINDS if all_artifacts else ['Exit ticket', 'Flashcards']
            request('POST', url + '/generate', expected=202, json={'kinds': types})
            deadline = time.monotonic() + (1500 if all_artifacts else 360)
            while time.monotonic() < deadline:
                p = request('GET', url).json()
                state = p['job']['state']
                if state == 'failed':
                    raise ValueError('AI job failed. Inspect the project in the studio for provider status; no test pass was recorded.')
                if state == 'completed':
                    break
                time.sleep(3)
            check(p['job']['state'] == 'completed', 'Generation exceeded the acceptance-test deadline.')
            check({a['kind'] for a in p['artifacts']} == set(types), 'Some selected artifacts were not saved.')
            passed('Real AI and worker generation: ' + ', '.join(types))
            a = p['artifacts'][0]
            updated = copy.deepcopy(a['data'])
            marker = 'Deployment verification edit ' + secrets.token_hex(6)
            updated['sections'][0]['body'] += '\n\n' + marker
            edited = request('PATCH', url + '/artifacts/' + a['id'], json={'revision': a['revision'], 'data': updated}).json()
            request('PATCH', url + '/artifacts/' + a['id'], json={'revision': edited['revision'], 'reviewed': True})
            request('POST', '/api/auth/logout')
            request('GET', url, expected=401)
            login()
            stored = request('GET', url).json()
            saved = next(x for x in stored['artifacts'] if x['id'] == a['id'])
            check(marker in saved['data']['sections'][0]['body'] and saved['reviewed'], 'Saved edit or review status did not persist.')
            passed('Edits and educator review persist after logout/login')
            for fmt in ['json', 'md', 'csv', 'anki']:
                result = request('GET', url + '/export/' + fmt)
                check(bool(result.content) and 'attachment;' in result.headers.get('content-disposition', ''), fmt + ' export failed.')
                if fmt in {'md', 'json'}:
                    check(marker in result.text, fmt + ' export does not contain the saved edit.')
            passed('JSON, Markdown, CSV and Anki exports')
            report['passed'] = True
        except (ValueError, httpx.HTTPError) as exc:
            report['error'] = str(exc)
        finally:
            if pid:
                try:
                    cleaned = client.delete('/api/projects/' + pid)
                    if cleaned.status_code == 200:
                        passed('Removed only the project created by this verification run')
                    else:
                        report['remaining_test_project_id'] = pid
                        report['passed'] = False
                        report['cleanup_status'] = cleaned.status_code
                except httpx.HTTPError:
                    report['remaining_test_project_id'] = pid
                    report['passed'] = False
            try:
                client.post('/api/auth/logout')
            except httpx.HTTPError:
                pass
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', required=True)
    parser.add_argument('--email', required=True)
    parser.add_argument('--all-artifacts', action='store_true')
    parser.add_argument('--report', default='deployment-verification.json')
    args = parser.parse_args()
    if not sys.stdin.isatty():
        raise SystemExit('Run interactively so your password can be entered privately.')
    print('This run creates/deletes one synthetic test project and makes billable AI requests.')
    try:
        report = verify(args.url, args.email, getpass.getpass('Educator password (hidden): '), args.all_artifacts)
    except (ValueError, OSError, httpx.HTTPError) as exc:
        raise SystemExit('Verification stopped: ' + str(exc))
    Path(args.report).write_text(json.dumps(report, indent=2))
    print('Report saved:', args.report)
    print('PASS: deployment acceptance checks complete.' if report['passed'] else 'FAIL: see the report; production signoff remains pending.')
    sys.exit(0 if report['passed'] else 1)

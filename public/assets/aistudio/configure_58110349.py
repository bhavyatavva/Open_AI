"""Run ON THE DEPLOYMENT HOST. Secrets never enter command arguments or stdout."""
import argparse
import getpass
import os
from pathlib import Path
import re
import secrets
import stat
import sys
import tempfile


def valid_domain(domain):
    if len(domain) > 253 or '.' not in domain or not re.fullmatch(r'[a-z0-9.-]+', domain):
        raise ValueError('Use a public domain without https://, port, or path.')
    if any(not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', label) for label in domain.split('.')):
        raise ValueError('Domain contains an invalid label.')
    if domain == 'localhost' or re.fullmatch(r'[0-9.]+', domain):
        raise ValueError('Use a domain pointing to your server, not its IP address.')
    return domain


def valid_key(key):
    if not key or not re.fullmatch(r'[A-Za-z0-9_-]+', key):
        raise ValueError('The API key contains whitespace or unsupported characters.')
    return key


def write_env(root, domain, key, rotate=False):
    target = root / '.env'
    key = valid_key(key)
    if target.is_symlink():
        raise ValueError('Refusing to follow a symbolic link for .env.')
    if rotate:
        if not target.is_file():
            raise ValueError('No existing .env to rotate. Run initial setup first.')
        if stat.S_IMODE(target.stat().st_mode) & 0o077:
            raise ValueError('Protect the existing file with chmod 600 .env before rotation.')
        contents = target.read_text()
        if len(re.findall(r'^OPENAI_API_KEY=.*$', contents, re.M)) != 1:
            raise ValueError('Expected exactly one OPENAI_API_KEY entry.')
        contents = re.sub(r'^OPENAI_API_KEY=.*$', "OPENAI_API_KEY='" + key + "'", contents, flags=re.M)
        fd, temporary = tempfile.mkstemp(prefix='.env-rotate-', dir=root)
        try:
            with os.fdopen(fd, 'w') as stream:
                stream.write(contents)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, target)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    else:
        domain = valid_domain(domain)
        values = {'DOMAIN': domain, 'POSTGRES_PASSWORD': secrets.token_hex(32),
                  'REGISTRATION_CODE': secrets.token_hex(32), 'OPENAI_API_KEY': key,
                  'OPENAI_MODEL': 'gpt-4.1-mini', 'DAILY_JOB_LIMIT': '20'}
        contents = ''.join(f"{name}='{value}'\n" for name, value in values.items())
        # Exclusive creation prevents replacing an existing database password.
        fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rotate-api-key', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    if not sys.stdin.isatty():
        raise SystemExit('Run this interactively in your own server terminal; do not pipe a secret.')
    if not args.rotate_api_key and (root / '.env').exists():
        raise SystemExit('.env already exists. Use --rotate-api-key to change only the API key.')
    domain = '' if args.rotate_api_key else input('App domain (e.g. lessons.yourdomain.com): ').strip().lower()
    key = getpass.getpass('New OpenAI API key (hidden): ').strip()
    try:
        write_env(root, domain, key, args.rotate_api_key)
    except (ValueError, OSError) as exc:
        raise SystemExit('Setup stopped: ' + str(exc))
    print('Configuration saved with owner-only permissions. No key was printed.')
    print('Use a private editor to retrieve REGISTRATION_CODE when creating your educator account.')
    print('Next: docker compose config --quiet')
    print('Then: docker compose up -d --build' if not args.rotate_api_key else 'Then: docker compose up -d --force-recreate web worker')


if __name__ == '__main__':
    main()

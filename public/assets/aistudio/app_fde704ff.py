import csv
import hashlib
import io
import json
import os
import re
import secrets
import time
from pathlib import Path
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError
from flask import Flask, request, g, jsonify, send_from_directory, Response
from pydantic import ValidationError
from sqlalchemy import select, update, delete, func
from sqlalchemy.exc import IntegrityError
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix
from .models import database, migrate, User, Session, Project, Artifact, Job, Limit
from .schema import Settings, KINDS, validate_artifact
from .extract import extract, chunks

ROOT = Path(__file__).resolve().parents[1]
HASHER = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
DUMMY_HASH = HASHER.hash(secrets.token_urlsafe(24))


class ApiError(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def create_app(overrides=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DATABASE_URL=os.getenv('DATABASE_URL', 'sqlite:///lessonly.db'),
        APP_ORIGIN=os.getenv('APP_ORIGIN', 'http://localhost:8080').rstrip('/'),
        PRODUCTION=os.getenv('APP_ENV') == 'production',
        REGISTRATION_CODE=os.getenv('REGISTRATION_CODE', ''),
        MAX_CONTENT_LENGTH=26 * 1024 * 1024,
        MAX_FORM_MEMORY_SIZE=1024 * 1024,
        MAX_FORM_PARTS=20,
        DAILY_JOB_LIMIT=int(os.getenv('DAILY_JOB_LIMIT', '20')),
    )
    if overrides:
        app.config.update(overrides)
    if app.config['PRODUCTION']:
        if not app.config['APP_ORIGIN'].startswith('https://'):
            raise RuntimeError('Production requires an HTTPS APP_ORIGIN.')
        if len(app.config['REGISTRATION_CODE']) < 20:
            raise RuntimeError('Production requires REGISTRATION_CODE of at least 20 characters.')
        if not app.config['DATABASE_URL'].startswith('postgresql'):
            raise RuntimeError('Production requires PostgreSQL.')
        # Compose exposes only Caddy; trust exactly that one reverse proxy hop.
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
    engine, factory = database(app.config['DATABASE_URL'])
    app.extensions.update(engine=engine, db_factory=factory)
    if app.config.get('TESTING'):
        migrate(engine)

    @app.before_request
    def guard():
        g.db = factory()
        g.user = g.session = None
        if not request.path.startswith('/api/'):
            return
        token = request.cookies.get('lessonly_session', '')
        if token:
            session = g.db.get(Session, digest(token))
            if session and session.expires > time.time():
                g.session, g.user = session, g.db.get(User, session.user_id)
        mutation = request.method not in {'GET', 'HEAD', 'OPTIONS'}
        if mutation and request.headers.get('Origin') != app.config['APP_ORIGIN']:
            raise ApiError('This request must come from the application.', 403)
        public = request.path in {'/api/auth/login', '/api/auth/register', '/api/health'}
        if not public and not g.user:
            raise ApiError('Please sign in to continue.', 401)
        if mutation and not public:
            if not secrets.compare_digest(request.headers.get('X-CSRF-Token', ''), g.session.csrf):
                raise ApiError('Session token expired. Reload and try again.', 403)

    @app.teardown_request
    def close(_):
        if hasattr(g, 'db'):
            g.db.close()

    @app.after_request
    def headers(response):
        response.headers.update({
            'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
            'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        })
        if request.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
        if app.config['PRODUCTION']:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000'
        return response

    @app.errorhandler(ApiError)
    def api_error(err):
        g.db.rollback()
        return jsonify(error=err.message), err.status

    @app.errorhandler(ValidationError)
    @app.errorhandler(ValueError)
    def validation_error(err):
        g.db.rollback()
        message = 'Some fields are invalid. Check their values and lengths.' if isinstance(err, ValidationError) else str(err)
        return jsonify(error=message), 400

    @app.errorhandler(HTTPException)
    def http_error(err):
        return jsonify(error=err.description), err.code

    @app.errorhandler(Exception)
    def unexpected(err):
        g.db.rollback()
        # Never log document contents, credentials or provider payloads.
        app.logger.error('request_failed type=%s', type(err).__name__)
        return jsonify(error='An unexpected error occurred. Please try again.'), 500

    def payload():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise ApiError('A JSON object is required.')
        return data

    def rate_limit(key, cap, seconds):
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        from sqlalchemy.dialects.sqlite import insert as sq_insert
        now = time.time()
        bucket = int(now // seconds)
        key = digest(f'{key}:{bucket}')
        insert = pg_insert if engine.dialect.name == 'postgresql' else sq_insert
        query = insert(Limit).values(key=key, count=1, expires=now + seconds)
        query = query.on_conflict_do_update(index_elements=['key'], set_={'count': Limit.count + 1}).returning(Limit.count)
        count = g.db.execute(query).scalar_one()
        g.db.execute(delete(Limit).where(Limit.expires < now))
        g.db.commit()
        if count > cap:
            raise ApiError('Request limit reached. Please try again later.', 429)

    def public_user(user):
        return {'id': user.id, 'name': user.name, 'email': user.email}

    def login_response(user):
        if g.session:
            g.db.delete(g.session)
        token, csrf = secrets.token_urlsafe(40), secrets.token_urlsafe(32)
        g.db.execute(delete(Session).where(Session.expires < time.time()))
        g.db.add(Session(token=digest(token), user_id=user.id, csrf=csrf, expires=time.time() + 86400))
        g.db.commit()
        response = jsonify(user=public_user(user), csrf=csrf)
        response.set_cookie('lessonly_session', token, secure=app.config['PRODUCTION'], httponly=True, samesite='Lax', max_age=86400, path='/')
        return response

    def verify(password, hashed):
        try:
            return HASHER.verify(hashed, password)
        except (VerifyMismatchError, InvalidHashError):
            return False

    @app.get('/api/health')
    def health():
        g.db.execute(select(1))
        return jsonify(status='ok')

    @app.post('/api/auth/register')
    def register():
        rate_limit('register:' + request.remote_addr, 10, 3600)
        data = payload()
        code = app.config['REGISTRATION_CODE']
        if code and not secrets.compare_digest(str(data.get('code', '')), code):
            raise ApiError('A valid workspace invitation code is required.', 403)
        email, name, password = str(data.get('email', '')).strip().lower(), str(data.get('name', '')).strip(), str(data.get('password', ''))
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or len(email) > 254 or not 1 <= len(name) <= 100 or not 12 <= len(password) <= 128:
            raise ApiError('Use a valid email, name and a password of 12–128 characters.')
        user = User(email=email, name=name, password=HASHER.hash(password))
        g.db.add(user)
        try:
            g.db.commit()
        except IntegrityError:
            g.db.rollback()
            raise ApiError('Unable to register this email. Try signing in.', 409)
        return login_response(user)

    @app.post('/api/auth/login')
    def login():
        data = payload()
        email = str(data.get('email', '')).strip().lower()[:254]
        rate_limit('login-ip:' + request.remote_addr, 30, 900)
        rate_limit('login-email:' + email, 10, 900)
        user = g.db.scalar(select(User).where(User.email == email))
        if not verify(str(data.get('password', ''))[:129], user.password if user else DUMMY_HASH) or not user:
            raise ApiError('Email or password is incorrect.', 401)
        return login_response(user)

    @app.get('/api/me')
    def me():
        return jsonify(user=public_user(g.user), csrf=g.session.csrf, ai_ready=bool(os.getenv('OPENAI_API_KEY')), model=os.getenv('OPENAI_MODEL', 'gpt-4.1-mini'))

    @app.post('/api/auth/logout')
    def logout():
        g.db.delete(g.session)
        g.db.commit()
        response = jsonify(ok=True)
        response.delete_cookie('lessonly_session', path='/')
        return response

    @app.post('/api/auth/password')
    def change_password():
        rate_limit('password:' + g.user.id, 5, 900)
        data = payload()
        new = str(data.get('password', ''))
        if not verify(str(data.get('current', ''))[:129], g.user.password) or not 12 <= len(new) <= 128:
            raise ApiError('Check your current password; the new password must have 12–128 characters.')
        g.user.password = HASHER.hash(new)
        g.db.execute(delete(Session).where(Session.user_id == g.user.id))
        g.db.commit()
        response = jsonify(ok=True)
        response.delete_cookie('lessonly_session', path='/')
        return response

    def project_owned(pid, lock=False):
        query = select(Project).where(Project.id == pid, Project.user_id == g.user.id)
        if lock:
            query = query.with_for_update()
        p = g.db.scalar(query)
        if not p:
            raise ApiError('Project not found.', 404)
        return p

    def artifact_json(a):
        return {'id': a.id, 'kind': a.kind, 'data': a.data, 'profile': a.profile, 'revision': a.revision, 'reviewed': a.reviewed, 'created': a.created, 'updated': a.updated}

    def project_json(p, full=True):
        artifacts = list(g.db.scalars(select(Artifact).where(Artifact.project_id == p.id).order_by(Artifact.created)))
        job = g.db.scalar(select(Job).where(Job.project_id == p.id).order_by(Job.created.desc()).limit(1))
        out = {'id': p.id, 'title': p.title, 'filename': p.filename, 'settings': p.settings, 'created': p.created, 'updated': p.updated,
               'artifact_count': len(artifacts), 'reviewed_count': sum(a.reviewed for a in artifacts), 'kinds': [a.kind for a in artifacts], 'job': job_json(job) if job else None}
        if full:
            out.update(source=p.source, artifacts=[artifact_json(a) for a in artifacts])
        return out

    def job_json(j):
        return {'id': j.id, 'state': j.state, 'kinds': j.kinds, 'completed': j.completed, 'error': j.error}

    @app.get('/api/samples')
    def samples():
        return jsonify([{'id': p.stem, 'title': p.read_text().splitlines()[0].lstrip('# '), 'text': p.read_text()} for p in sorted((ROOT / 'samples').glob('*.md'))])

    @app.post('/api/projects')
    def create_project():
        rate_limit('upload:' + g.user.id, 30, 3600)
        count = g.db.scalar(select(func.count()).select_from(Project).where(Project.user_id == g.user.id))
        if count >= 200:
            raise ApiError('Your workspace has reached 200 projects. Export and remove an older project before adding another.', 409)
        if 'file' in request.files:
            f = request.files['file']
            filename = Path(f.filename or 'notes.txt').name[:180]
            source = extract(filename, f.read(25 * 1024 * 1024 + 1))
            settings = Settings().model_dump()
            title = Path(filename).stem.replace('_', ' ')[:180]
        else:
            data = payload()
            filename = 'pasted-notes.md'
            text = str(data.get('text', ''))
            source = extract(filename, text.encode())
            title = str(data.get('title', 'Untitled lesson')).strip()[:180] or 'Untitled lesson'
            settings = Settings.model_validate(data.get('settings', {})).model_dump()
        p = Project(user_id=g.user.id, title=title, filename=filename, source=source, settings=settings)
        g.db.add(p)
        g.db.commit()
        return jsonify(project_json(p)), 201

    @app.get('/api/projects')
    def projects():
        return jsonify([project_json(p, False) for p in g.db.scalars(select(Project).where(Project.user_id == g.user.id).order_by(Project.updated.desc()).limit(200))])

    @app.get('/api/projects/<pid>')
    def project_get(pid):
        return jsonify(project_json(project_owned(pid)))

    @app.patch('/api/projects/<pid>')
    def project_update(pid):
        p = project_owned(pid, True)
        if g.db.scalar(select(Job.id).where(Job.project_id == pid, Job.state.in_(['queued', 'running']))):
            raise ApiError('Wait for generation to finish before changing the learning profile.', 409)
        data = payload()
        p.settings = Settings.model_validate(data.get('settings', p.settings)).model_dump()
        p.title = str(data.get('title', p.title)).strip()[:180] or p.title
        p.updated = time.time()
        g.db.commit()
        return jsonify(project_json(p))

    @app.delete('/api/projects/<pid>')
    def project_delete(pid):
        p = project_owned(pid, True)
        if g.db.scalar(select(Job.id).where(Job.project_id == pid, Job.state.in_(['queued', 'running']))):
            raise ApiError('Wait for generation to finish before deleting the project.', 409)
        g.db.delete(p)
        g.db.commit()
        return jsonify(ok=True)

    @app.post('/api/projects/<pid>/generate')
    def generate_job(pid):
        p = project_owned(pid, True)
        if not os.getenv('OPENAI_API_KEY'):
            raise ApiError('AI is not configured. Ask the administrator to set OPENAI_API_KEY.', 503)
        kinds = payload().get('kinds')
        if not isinstance(kinds, list) or not kinds or len(kinds) > 9 or any(k not in KINDS for k in kinds) or len(set(kinds)) != len(kinds):
            raise ApiError('Choose one or more distinct artifact types.')
        if g.db.scalar(select(Job.id).where(Job.project_id == pid, Job.state.in_(['queued', 'running']))):
            raise ApiError('A generation job is already active for this project.', 409)
        # Lock the account to make daily quota checks consistent across web workers.
        g.db.scalar(select(User).where(User.id == g.user.id).with_for_update())
        count = g.db.scalar(select(func.count()).select_from(Job).where(Job.user_id == g.user.id, Job.created > time.time() - 86400))
        if count >= app.config['DAILY_JOB_LIMIT']:
            raise ApiError('Daily generation limit reached. Please try again tomorrow.', 429)
        job = Job(project_id=p.id, user_id=g.user.id, kinds=kinds)
        g.db.add(job)
        try:
            g.db.commit()
        except IntegrityError:
            raise ApiError('A generation job is already active.', 409)
        return jsonify(job_json(job)), 202

    @app.patch('/api/projects/<pid>/artifacts/<aid>')
    def artifact_update(pid, aid):
        p = project_owned(pid, True)
        if g.db.scalar(select(Job.id).where(Job.project_id == pid, Job.state.in_(['queued', 'running']))):
            raise ApiError('Wait for generation to finish before editing.', 409)
        a = g.db.scalar(select(Artifact).where(Artifact.id == aid, Artifact.project_id == pid).with_for_update())
        if not a:
            raise ApiError('Artifact not found.', 404)
        data = payload()
        if data.get('revision') != a.revision:
            raise ApiError('This artifact changed in another session. Reopen it before editing.', 409)
        content = validate_artifact(data.get('data', a.data), p.source, a.kind)
        changed = content != a.data
        if changed:
            for section in content['sections']:
                section['grounding'] = 'Needs educator review'
        a.data = content
        a.reviewed = bool(data.get('reviewed', False)) and not changed
        a.revision += 1
        a.updated = p.updated = time.time()
        g.db.commit()
        return jsonify(artifact_json(a))

    @app.get('/api/projects/<pid>/export/<fmt>')
    def export(pid, fmt):
        p = project_owned(pid)
        data = project_json(p)
        if fmt == 'json':
            body, mime, extension = json.dumps({'schema_version': 1, **data}, ensure_ascii=False, indent=2), 'application/json', 'json'
        elif fmt == 'md':
            lines = [f'# {p.title}', '', f'Source: {p.filename}', '', 'Learning profile: ' + json.dumps(p.settings, ensure_ascii=False), '']
            for a in data['artifacts']:
                d = a['data']
                lines += [f"## {a['kind']}: {d['title']}", '', 'Generation profile: ' + json.dumps(a['profile'], ensure_ascii=False), '', 'Review status: ' + ('Reviewed' if a['reviewed'] else 'Needs review'), '']
                lines += ['- ' + x for x in d['objectives']]
                for s in d['sections']:
                    lines += ['', '### ' + s['heading'], '', s['body'], '', f"Grounding: {s['grounding']} | Sources: {', '.join(s['source_ids'])}"]
                for c in d['flashcards']:
                    lines += ['', '**Q:** ' + c['front'], '', '**A:** ' + c['back']]
                lines += ['', 'Quality flags: ' + '; '.join(d['quality_flags'])]
            lines += ['', '## Source passages'] + [f"\n### {s['id']} (page {s['page'] or 'n/a'})\n\n{s['text']}" for s in p.source]
            body, mime, extension = '\n'.join(lines), 'text/markdown; charset=utf-8', 'md'
        elif fmt in {'csv', 'anki'}:
            output = io.StringIO()
            writer = csv.writer(output, delimiter='\t' if fmt == 'anki' else ',')
            if fmt == 'csv':
                writer.writerow(['Front', 'Back', 'Tags'])
            for a in data['artifacts']:
                for c in a['data']['flashcards']:
                    def safe(v):
                        v = v.replace('\t', ' ').replace('\n', ' ')
                        return "'" + v if v.lstrip().startswith(('=', '+', '-', '@')) else v
                    writer.writerow([safe(c['front']), safe(c['back']), safe(' '.join(c['tags']))])
            body, mime, extension = output.getvalue(), 'text/plain; charset=utf-8' if fmt == 'anki' else 'text/csv; charset=utf-8', 'tsv' if fmt == 'anki' else 'csv'
        else:
            raise ApiError('Unknown export format.', 404)
        return Response(body, mimetype=mime, headers={'Content-Disposition': f'attachment; filename="lessonly-{pid}.{extension}"'})

    @app.get('/')
    @app.get('/<path:path>')
    def frontend(path=''):
        if path.startswith('api/'):
            raise ApiError('Endpoint not found.', 404)
        if path.startswith('assets/'):
            return send_from_directory(ROOT / 'web' / 'dist', path)
        return send_from_directory(ROOT / 'web' / 'dist', 'index.html')

    return app

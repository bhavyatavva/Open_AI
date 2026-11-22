"""Durable queue. Completed artifacts commit independently; failed jobs preserve work."""
import logging
import os
import time
from sqlalchemy import select, update, delete
from .models import database, Job, Project, Artifact, Session
from .ai import generate
from .schema import validate_artifact
from pydantic import ValidationError


def run_once(factory, generator=generate):
    now = time.time()
    with factory.begin() as db:
        # A killed process leaves a running job. Fail it after the maximum per-artifact
        # request time plus margin; explicit retry avoids silent duplicate AI charges.
        db.execute(update(Job).where(Job.state == 'running', Job.updated < now - 300).values(state='failed', error='Worker interrupted. Completed artifacts were preserved; retry remaining types.'))
        db.execute(delete(Session).where(Session.expires < now))
        job = db.scalar(select(Job).where(Job.state == 'queued').order_by(Job.created).with_for_update(skip_locked=True).limit(1))
        if not job:
            return False
        claimed = db.execute(update(Job).where(Job.id == job.id, Job.state == 'queued').values(state='running', updated=now))
        if not claimed.rowcount:
            return False
        jid, pid, kinds = job.id, job.project_id, job.kinds
        project = db.get(Project, pid)
        source, settings = project.source, project.settings
    for index, kind in enumerate(kinds):
        try:
            data = validate_artifact(generator(source, settings, kind), source, kind)
            with factory.begin() as db:
                job = db.get(Job, jid)
                if job.state != 'running':
                    return True
                # Preserve prior revisions in their own rows; new generation adds a draft.
                db.add(Artifact(project_id=pid, kind=kind, data=data, profile=settings))
                job.completed, job.updated = index + 1, time.time()
                db.get(Project, pid).updated = time.time()
        except Exception as exc:
            with factory.begin() as db:
                job = db.get(Job, jid)
                job.state, job.updated = 'failed', time.time()
                job.error = ('AI output failed validation. No incomplete artifact was saved.' if isinstance(exc, ValidationError) else str(exc)[:500]) if isinstance(exc, ValueError) else 'Generation failed unexpectedly. Please retry later.'
            logging.error('generation_failed job=%s type=%s', jid, type(exc).__name__)
            return True
    with factory.begin() as db:
        db.get(Job, jid).state = 'completed'
    return True


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    _, factory = database(os.getenv('DATABASE_URL', 'sqlite:///lessonly.db'))
    while True:
        try:
            if not run_once(factory):
                time.sleep(2)
        except Exception as exc:
            logging.error('worker_error type=%s', type(exc).__name__)
            time.sleep(5)

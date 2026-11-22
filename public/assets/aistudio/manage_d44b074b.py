import argparse
import getpass
import os
from sqlalchemy import select, delete
from .models import database, migrate, User, Session
from .app import HASHER

parser = argparse.ArgumentParser()
parser.add_argument('command', choices=['migrate', 'reset-password'])
parser.add_argument('--email')
args = parser.parse_args()
engine, factory = database(os.getenv('DATABASE_URL', 'sqlite:///lessonly.db'))
if args.command == 'migrate':
    migrate(engine)
    print('Schema migrations through version 2 applied.')
else:
    with factory.begin() as db:
        user = db.scalar(select(User).where(User.email == (args.email or '').lower()))
        if not user:
            raise SystemExit('Account not found.')
        password = getpass.getpass('New password (12–128 characters): ')
        if not 12 <= len(password) <= 128 or password != getpass.getpass('Confirm password: '):
            raise SystemExit('Passwords did not match or length is invalid.')
        user.password = HASHER.hash(password)
        db.execute(delete(Session).where(Session.user_id == user.id))
    print('Password reset. All account sessions revoked.')

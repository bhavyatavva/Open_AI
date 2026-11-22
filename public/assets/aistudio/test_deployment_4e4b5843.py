import os
import pytest
from server.app import create_app

def test_production_fails_closed_without_https():
    with pytest.raises(RuntimeError,match='HTTPS'):
        create_app({'PRODUCTION':True,'APP_ORIGIN':'http://example.com'})

def test_production_requires_invitation():
    with pytest.raises(RuntimeError,match='REGISTRATION_CODE'):
        create_app({'PRODUCTION':True,'APP_ORIGIN':'https://example.com','REGISTRATION_CODE':''})

def test_production_requires_postgresql():
    with pytest.raises(RuntimeError,match='PostgreSQL'):
        create_app({'PRODUCTION':True,'APP_ORIGIN':'https://example.com','REGISTRATION_CODE':'long-invitation-for-testing','DATABASE_URL':'sqlite:///:memory:'})

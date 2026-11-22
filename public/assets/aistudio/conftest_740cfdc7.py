import os
import uuid
import pytest
from sqlalchemy import text
from server.app import create_app
from server.models import Base

@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', 'test-credential-not-live')
    app = create_app({'TESTING': True, 'PRODUCTION': False, 'APP_ORIGIN': 'http://localhost:8080', 'REGISTRATION_CODE': '',
                      'DATABASE_URL': os.getenv('TEST_DATABASE_URL', 'sqlite:///' + str(tmp_path / 'test.db'))})
    yield app
    with app.extensions['engine'].begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
    app.extensions['engine'].dispose()

@pytest.fixture
def client(app):
    client = app.test_client()
    return client

def signup(client, email='teacher@example.com'):
    response = client.post('/api/auth/register', json={'email':email,'name':'Test Educator','password':'a-strong-test-password'}, headers={'Origin':'http://localhost:8080'})
    assert response.status_code == 200, response.json
    return {'Origin':'http://localhost:8080','X-CSRF-Token':response.json['csrf']}

def project(client, headers):
    response = client.post('/api/projects', json={'title':'Cell transport','text':'A phospholipid bilayer forms the cell membrane. Diffusion moves particles down a concentration gradient. Active transport requires energy.'}, headers=headers)
    assert response.status_code == 201, response.json
    return response.json

def generated(source, settings, kind):
    return {'title':'Cell transport for '+settings['level'],'objectives':['Explain diffusion.'],
            'sections':[{'heading':'Key idea','body':'Diffusion follows a concentration gradient.','grounding':'Directly supported','source_ids':[source[0]['id']]}],
            'flashcards':[{'front':'What is diffusion?','back':'Net movement down a concentration gradient.','tags':['biology']}] if kind=='Flashcards' else [],
            'quality_flags':[]}

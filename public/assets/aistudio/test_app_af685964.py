import copy
import io
import time
import pytest
from reportlab.pdfgen import canvas
from sqlalchemy import select
from server.models import User, Session, Job, Artifact
from server.worker import run_once
from server.extract import extract
from .conftest import signup, project, generated

def test_auth_session_and_password_revocation(app, client):
    assert client.get('/api/projects').status_code == 401
    headers = signup(client)
    assert client.get('/api/me').json['user']['email'] == 'teacher@example.com'
    with app.extensions['db_factory']() as db:
        user=db.scalar(select(User)); session=db.scalar(select(Session))
        assert user.password.startswith('$argon2id$')
        assert len(session.token)==64
    assert client.post('/api/auth/password',json={'current':'wrong','password':'a-new-long-password'},headers=headers).status_code==400
    assert client.post('/api/auth/password',json={'current':'a-strong-test-password','password':'a-new-long-password'},headers=headers).status_code==200
    assert client.get('/api/me').status_code==401
    assert client.post('/api/auth/login',json={'email':'teacher@example.com','password':'a-new-long-password'},headers={'Origin':'http://localhost:8080'}).status_code==200

def test_origin_csrf_and_cookie(client):
    assert client.post('/api/auth/login',json={}).status_code==403
    h=signup(client)
    assert client.post('/api/projects',json={},headers={'Origin':'http://evil.test','X-CSRF-Token':h['X-CSRF-Token']}).status_code==403
    assert client.post('/api/projects',json={},headers={'Origin':'http://localhost:8080'}).status_code==403
    assert client.get('/api/me').headers['Cache-Control']=='no-store'
    assert "frame-ancestors 'none'" in client.get('/').headers['Content-Security-Policy']
    response=client.post('/api/auth/logout',headers=h)
    assert response.status_code==200
    assert client.get('/api/me').status_code==401

def test_invitation_and_registration_validation(app,client):
    app.config['REGISTRATION_CODE']='invitation-code-for-testing'
    assert client.post('/api/auth/register',json={'email':'a@b.com','name':'Teacher','password':'long-password-value'},headers={'Origin':'http://localhost:8080'}).status_code==403
    app.config['REGISTRATION_CODE']=''
    assert client.post('/api/auth/register',json={'email':'bad','name':'','password':'short'},headers={'Origin':'http://localhost:8080'}).status_code==400

def test_login_throttling(client):
    for _ in range(10):
        assert client.post('/api/auth/login',json={'email':'absent@example.com','password':'incorrect'},headers={'Origin':'http://localhost:8080'}).status_code==401
    assert client.post('/api/auth/login',json={'email':'absent@example.com','password':'incorrect'},headers={'Origin':'http://localhost:8080'}).status_code==429

def test_user_isolation(app,client):
    h=signup(client); p=project(client,h)
    other=app.test_client(); oh=signup(other,'other@example.com')
    assert other.get('/api/projects').json==[]
    for suffix in ['', '/export/json']:
        assert other.get('/api/projects/'+p['id']+suffix).status_code==404
    assert other.patch('/api/projects/'+p['id'],json={'title':'stolen'},headers=oh).status_code==404
    assert other.delete('/api/projects/'+p['id'],headers=oh).status_code==404

def test_settings_and_persistence(app,client):
    h=signup(client); p=project(client,h)
    settings={**p['settings'],'level':'Advanced','bloom':'Evaluate','minutes':90,'subject':'Biology'}
    assert client.patch('/api/projects/'+p['id'],json={'settings':settings},headers=h).status_code==200
    assert client.get('/api/projects/'+p['id']).json['settings']==settings
    assert client.patch('/api/projects/'+p['id'],json={'settings':{'minutes':0}},headers=h).status_code==400
    assert len(client.get('/api/projects').json)==1

def test_generation_edit_exports_and_delete(app,client):
    h=signup(client); p=project(client,h); url='/api/projects/'+p['id']
    assert client.post(url+'/generate',json={'kinds':['Lesson plan','Flashcards']},headers=h).status_code==202
    assert client.post(url+'/generate',json={'kinds':['Rubric']},headers=h).status_code==409
    assert client.patch(url,json={'title':'blocked'},headers=h).status_code==409
    assert client.delete(url,headers=h).status_code==409
    assert run_once(app.extensions['db_factory'],generated)
    p=client.get(url).json
    assert p['job']['state']=='completed' and len(p['artifacts'])==2
    a=p['artifacts'][0]; a['data']['sections'][0]['body']='Edited by an educator.'
    changed=client.patch(url+'/artifacts/'+a['id'],json={'data':a['data'],'revision':1,'reviewed':True},headers=h)
    assert changed.status_code==200
    assert not changed.json['reviewed'] and changed.json['data']['sections'][0]['grounding']=='Needs educator review'
    assert client.patch(url+'/artifacts/'+a['id'],json={'revision':1},headers=h).status_code==409
    assert client.patch(url+'/artifacts/'+a['id'],json={'revision':2,'reviewed':True},headers=h).json['reviewed']
    assert 'Edited by an educator.' in client.get(url+'/export/md').text
    assert len(client.get(url+'/export/json').json['artifacts'])==2
    assert 'What is diffusion?' in client.get(url+'/export/csv').text
    assert '\t' in client.get(url+'/export/anki').text
    assert client.delete(url,headers=h).status_code==200
    with app.extensions['db_factory']() as db:
        assert not list(db.scalars(select(Artifact))) and not list(db.scalars(select(Job)))

def test_partial_failure_preserves_completed(app,client):
    h=signup(client);p=project(client,h);url='/api/projects/'+p['id']
    client.post(url+'/generate',json={'kinds':['Lesson plan','Quiz bank']},headers=h)
    def partial(source,settings,kind):
        if kind=='Quiz bank': raise ValueError('Provider unavailable.')
        return generated(source,settings,kind)
    run_once(app.extensions['db_factory'],partial)
    p=client.get(url).json
    assert p['job']['state']=='failed' and p['job']['completed']==1 and len(p['artifacts'])==1
    assert client.post(url+'/generate',json={'kinds':['Quiz bank']},headers=h).status_code==202

def test_stale_job_recovers(app,client):
    h=signup(client);p=project(client,h)
    client.post('/api/projects/'+p['id']+'/generate',json={'kinds':['Lesson plan']},headers=h)
    with app.extensions['db_factory'].begin() as db:
        job=db.scalar(select(Job));job.state='running';job.updated=time.time()-400
    assert not run_once(app.extensions['db_factory'],generated)
    assert client.get('/api/projects/'+p['id']).json['job']['state']=='failed'

def test_limits_and_missing_ai(app,client,monkeypatch):
    h=signup(client);p=project(client,h);url='/api/projects/'+p['id']+'/generate'
    assert client.post(url,json={'kinds':[]},headers=h).status_code==400
    app.config['DAILY_JOB_LIMIT']=0
    assert client.post(url,json={'kinds':['Rubric']},headers=h).status_code==429
    monkeypatch.delenv('OPENAI_API_KEY')
    assert client.post(url,json={'kinds':['Rubric']},headers=h).status_code==503

def test_text_upload_and_xss_are_data(client):
    h=signup(client)
    text=b'<script>alert(1)</script> Membranes are selectively permeable phospholipid bilayers.'
    r=client.post('/api/projects',data={'file':(io.BytesIO(text),'notes.md')},headers=h)
    assert r.status_code==201 and '<script>' in r.json['source'][0]['text']
    assert r.content_type=='application/json'
    assert client.post('/api/projects',data={'file':(io.BytesIO(text),'notes.exe')},headers=h).status_code==400
    assert client.post('/api/projects',data={'file':(io.BytesIO(b'%PDF-invalid'),'notes.pdf')},headers=h).status_code==400

def test_pdf_real_text_and_page_references():
    out=io.BytesIO();c=canvas.Canvas(out)
    c.drawString(40,750,'Cell membranes are selectively permeable phospholipid bilayers.');c.showPage()
    c.drawString(40,750,'Diffusion moves particles down their concentration gradient.');c.save()
    source=extract('lesson.pdf',out.getvalue())
    assert source[0]['page']==1 and source[1]['page']==2
    assert source[0]['id']=='S1' and 'Diffusion' in source[1]['text']

@pytest.mark.parametrize('name,data',[('empty.txt',b''),('binary.txt',b'\x00\x01'*100),('wrong.pdf',b'not a PDF'),('bad.txt',b'\xff'*100),('huge.txt',b'x'*100001)])
def test_rejected_sources(name,data):
    with pytest.raises(ValueError):extract(name,data)

def test_blank_pdf_needs_ocr():
    out=io.BytesIO();c=canvas.Canvas(out);c.showPage();c.save()
    with pytest.raises(ValueError,match='OCR'):extract('scan.pdf',out.getvalue())

def test_pdf_upload_route(client):
    h=signup(client)
    out=io.BytesIO();c=canvas.Canvas(out)
    c.drawString(40,750,'A valid course PDF contains selectable text about cell membrane transport.');c.save()
    response=client.post('/api/projects',data={'file':(io.BytesIO(out.getvalue()),'lecture.pdf')},headers=h)
    assert response.status_code==201
    assert response.json['source'][0]['page']==1
    assert response.json['filename']=='lecture.pdf'

def test_session_expiration(app,client):
    signup(client)
    with app.extensions['db_factory'].begin() as db:
        db.scalar(select(Session)).expires=time.time()-1
    assert client.get('/api/projects').status_code==401

def test_worker_does_not_save_invalid_output(app,client):
    h=signup(client);p=project(client,h)
    client.post('/api/projects/'+p['id']+'/generate',json={'kinds':['Lesson plan']},headers=h)
    run_once(app.extensions['db_factory'],lambda *args:{'malformed':'data'})
    p=client.get('/api/projects/'+p['id']).json
    assert not p['artifacts'] and p['job']['state']=='failed'
    assert 'failed validation' in p['job']['error']

def test_generation_profile_snapshot(app,client):
    h=signup(client);p=project(client,h);url='/api/projects/'+p['id']
    client.post(url+'/generate',json={'kinds':['Lesson plan']},headers=h)
    run_once(app.extensions['db_factory'],generated)
    client.patch(url,json={'settings':{**p['settings'],'level':'Advanced'}},headers=h)
    saved=client.get(url).json
    assert saved['settings']['level']=='Advanced'
    assert saved['artifacts'][0]['profile']['level']=='Introductory'

def test_two_workers_claim_only_once(app,client):
    if app.extensions['engine'].dialect.name!='postgresql':
        pytest.skip('PostgreSQL row locking integration test')
    from concurrent.futures import ThreadPoolExecutor
    h=signup(client);p=project(client,h)
    client.post('/api/projects/'+p['id']+'/generate',json={'kinds':['Lesson plan']},headers=h)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _:run_once(app.extensions['db_factory'],generated),range(2)))
    assert sum(results)==1
    assert len(client.get('/api/projects/'+p['id']).json['artifacts'])==1

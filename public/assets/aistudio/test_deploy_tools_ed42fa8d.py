import copy
import json
import stat
import pytest
import httpx
from tools.configure import write_env, valid_domain
from tools.verify_deployment import synthetic_pdf, verify
from server.extract import extract


def test_secret_setup_is_private_and_does_not_overwrite(tmp_path, capsys):
    write_env(tmp_path, 'lessons.example.com', 'fake-credential-for-tests')
    env=tmp_path/'.env'
    assert stat.S_IMODE(env.stat().st_mode)==0o600
    assert "DOMAIN='lessons.example.com'" in env.read_text()
    original=env.read_text()
    with pytest.raises(FileExistsError):
        write_env(tmp_path, 'other.example.com', 'another-fake-credential')
    assert env.read_text()==original
    assert not capsys.readouterr().out


def test_key_rotation_preserves_database_credentials(tmp_path):
    write_env(tmp_path,'lessons.example.com','first-fake-key')
    before=(tmp_path/'.env').read_text()
    write_env(tmp_path,'','second-fake-key',rotate=True)
    after=(tmp_path/'.env').read_text()
    assert after==before.replace('first-fake-key','second-fake-key')
    assert stat.S_IMODE((tmp_path/'.env').stat().st_mode)==0o600


@pytest.mark.parametrize('domain',['https://example.com','example.com/path','a\nSECRET=value','127.0.0.1','-bad.example.com','a..example.com'])
def test_reject_invalid_domains(domain):
    with pytest.raises(ValueError):valid_domain(domain)


def test_secret_file_symlink_refused(tmp_path):
    elsewhere=tmp_path/'untouched';elsewhere.write_text('original')
    (tmp_path/'.env').symlink_to(elsewhere)
    with pytest.raises(ValueError):write_env(tmp_path,'example.com','fake-key')
    assert elsewhere.read_text()=='original'


def test_synthetic_acceptance_pdf_is_readable():
    data=extract('acceptance.pdf',synthetic_pdf())
    assert data[0]['page']==1 and 'Binary search trees' in data[0]['text']


@pytest.mark.parametrize('fail_ai',[False,True])
def test_acceptance_report_and_scoped_cleanup(monkeypatch,fail_ai):
    class Socket:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def getpeercert(self):return {'notAfter':'Jan 01 00:00:00 2099 GMT'}
        def version(self):return 'TLSv1.3'
    class Context:
        def wrap_socket(self,*args,**kwargs):return Socket()
    monkeypatch.setattr('tools.verify_deployment.socket.create_connection',lambda *a,**kw:Socket())
    monkeypatch.setattr('tools.verify_deployment.ssl.create_default_context',lambda:Context())
    original_client=httpx.Client
    state={'logged':False,'deleted':False}
    p={'id':'synthetic-test-project','source':[{'page':1,'text':'Binary search trees'}], 'settings':{},
       'job':{'state':'failed' if fail_ai else 'completed'},
       'artifacts':[{'id':kind,'kind':kind,'revision':1,'reviewed':False,'data':{'sections':[{'body':'Test source statement.'}]}} for kind in ['Exit ticket','Flashcards']]}
    def transport(req):
        path=req.url.path
        if req.url.scheme=='http':return httpx.Response(308,headers={'location':'https://lessons.example.com/api/health'})
        if path=='/api/health':return httpx.Response(200,json={'status':'ok'},headers={'strict-transport-security':'max-age=31536000','content-security-policy':"frame-ancestors 'none'"})
        if path=='/api/auth/login':
            state['logged']=True
            return httpx.Response(200,json={'csrf':'test-csrf'},headers={'set-cookie':'session=test; Secure; HttpOnly; SameSite=Lax'})
        if path=='/api/auth/logout':state['logged']=False;return httpx.Response(200,json={'ok':True})
        if not state['logged']:return httpx.Response(401,json={})
        if path=='/api/me':return httpx.Response(200,json={})
        if path=='/api/projects' and req.method=='POST':return httpx.Response(201,json=p)
        if path.endswith('/generate'):return httpx.Response(202,json={})
        if '/artifacts/' in path:
            body=json.loads(req.content);a=p['artifacts'][0]
            a['data']=body.get('data',a['data']);a['reviewed']=body.get('reviewed',False);a['revision']+=1
            return httpx.Response(200,json=a)
        if '/export/' in path:return httpx.Response(200,text=json.dumps(p),headers={'content-disposition':'attachment; filename=export.txt'})
        if req.method=='DELETE':
            assert path=='/api/projects/synthetic-test-project'
            state['deleted']=True
            return httpx.Response(200,json={'ok':True})
        return httpx.Response(200,json=p)
    monkeypatch.setattr('tools.verify_deployment.httpx.Client',lambda **kw:original_client(transport=httpx.MockTransport(transport),**kw))
    report=verify('https://lessons.example.com','qa@example.test','fake-test-password')
    assert report['passed'] is (not fail_ai)
    assert state['deleted']
    assert 'fake-test-password' not in json.dumps(report)

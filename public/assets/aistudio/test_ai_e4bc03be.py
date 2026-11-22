import json
import httpx
import pytest
from server.ai import generate
from server.schema import validate_artifact,Settings
from .conftest import generated

SOURCE=[{'id':'S1','page':1,'text':'Diffusion moves particles down a concentration gradient.'}]

def test_real_http_request_contract(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','test-only')
    data=generated(SOURCE,Settings().model_dump(),'Lesson plan')
    def respond(req):
        body=json.loads(req.content)
        assert str(req.url)=='https://api.openai.com/v1/responses'
        assert body['store'] is False and body['text']['format']['strict'] is True
        assert body['text']['format']['schema']['additionalProperties'] is False
        assert 'S1' in body['input'] and 'untrusted reference data' in body['instructions']
        return httpx.Response(200,json={'status':'completed','output':[{'content':[{'type':'output_text','text':json.dumps(data)}]}]})
    client=httpx.Client(transport=httpx.MockTransport(respond))
    monkeypatch.setattr('server.ai.httpx.Client',lambda **kwargs:client)
    assert generate(SOURCE,Settings().model_dump(),'Lesson plan')==data

@pytest.mark.parametrize('status,body',[(401,{}),(429,{}),(500,{}),(200,{'status':'incomplete'}),(200,{'status':'completed','output':[{'content':[{'type':'refusal'}]}]}),(200,{'status':'completed','output':[{'content':[{'type':'output_text','text':'not json'}]}]})])
def test_provider_failures(monkeypatch,status,body):
    monkeypatch.setenv('OPENAI_API_KEY','test-only')
    client=httpx.Client(transport=httpx.MockTransport(lambda req:httpx.Response(status,json=body)))
    monkeypatch.setattr('server.ai.httpx.Client',lambda **kwargs:client)
    with pytest.raises(ValueError):generate(SOURCE,Settings().model_dump(),'Lesson plan')

def test_bad_citation_and_empty_cards_rejected():
    data=generated(SOURCE,Settings().model_dump(),'Lesson plan')
    with pytest.raises(ValueError):validate_artifact(data,SOURCE,'Flashcards')
    data['sections'][0]['source_ids']=['invented']
    with pytest.raises(ValueError):validate_artifact(data,SOURCE,'Lesson plan')
    data['sections'][0]['source_ids']=[]
    with pytest.raises(ValueError):validate_artifact(data,SOURCE,'Lesson plan')

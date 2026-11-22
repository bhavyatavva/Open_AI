"""Run after securely configuring OPENAI_API_KEY. Uses a small synthetic source."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.ai import generate
from server.schema import Settings

source=[{'id':'S1','page':None,'text':'A binary search tree with distinct keys stores smaller keys in the left subtree and larger keys in the right subtree. Search takes O(h) time where h is the tree height. An unbalanced tree may have linear height.'}]
try:
    artifact=generate(source,Settings(subject='Data structures').model_dump(),'Exit ticket')
except Exception as exc:
    print('FAIL:',type(exc).__name__,str(exc)[:300])
    sys.exit(1)
print('PASS: live AI returned a validated artifact with',len(artifact['sections']),'sections.')

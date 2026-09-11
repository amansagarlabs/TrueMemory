import json, sys, uuid
sys.path.insert(0, '/app')
from app.config import get_settings
from services.auth_store import create_api_token
from services.postgres_store import _connect

settings = get_settings()
WS_A = '96b143b1-5169-4f5e-a863-b9e54c7ccccf'

with _connect(settings) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT id::text FROM users WHERE email LIKE 'mcp-test-%' LIMIT 1")
        row = cur.fetchone()
        user_id = row["id"] if row else None

if user_id:
    token = create_api_token(settings, user_id=user_id, token_name='e2e-ws-only', scopes=['memory'], expires_days=1, workspace_id=WS_A)
    print(json.dumps({'token': token['token'], 'user_id': user_id}))
else:
    print('ERROR: no user found')

import json, sys, uuid
sys.path.insert(0, '/app')
from app.config import get_settings
from services.auth_store import create_api_token
from services.postgres_store import _connect

settings = get_settings()
WS_A = '96b143b1-5169-4f5e-a863-b9e54c7ccccf'

# Get existing MCP test user
with _connect(settings) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT id::text FROM users WHERE email LIKE 'mcp-test-%' LIMIT 1")
        row = cur.fetchone()
        user_id = row["id"] if row else None

if not user_id:
    print("ERROR: no user found")
    sys.exit(1)

# Create workspace-only token (no agent_id binding)
token_ws = create_api_token(settings, user_id=user_id, token_name='e2e-ws-only', scopes=['memory'], expires_days=1, workspace_id=WS_A)

# Create agent_b token (workspace + agent_b binding)
agent_b_id = str(uuid.uuid4())
token_b = create_api_token(settings, user_id=user_id, token_name='e2e-agent-b', scopes=['memory'], expires_days=1, workspace_id=WS_A, agent_id=agent_b_id)

# Create agent_c token (workspace + agent_c binding)
agent_c_id = str(uuid.uuid4())
token_c = create_api_token(settings, user_id=user_id, token_name='e2e-agent-c', scopes=['memory'], expires_days=1, workspace_id=WS_A, agent_id=agent_c_id)

print(json.dumps({
    'ws_only_token': token_ws['token'],
    'agent_b': {'agent_id': agent_b_id, 'token': token_b['token']},
    'agent_c': {'agent_id': agent_c_id, 'token': token_c['token']},
    'user_id': user_id,
}))

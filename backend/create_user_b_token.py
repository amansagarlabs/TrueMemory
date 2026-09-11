import json, sys, uuid
sys.path.insert(0, '/app')
from app.config import get_settings
from services.auth_store import create_api_token, create_user_with_password
from services.postgres_store import _connect

settings = get_settings()

# Create user_b with separate workspace
workspace_b = str(uuid.uuid4())
email = f'e2e-user-b-{uuid.uuid4().hex[:8]}@invalid.test'
user = create_user_with_password(settings, email=email, password='test-pass', username=f'e2e_user_b_{uuid.uuid4().hex[:8]}', full_name='E2E User B')
with _connect(settings) as conn:
    with conn.cursor() as cur:
        cur.execute('INSERT INTO workspaces (id, owner_user_id, name, platform) VALUES (%s, %s, %s, %s)', (workspace_b, user['id'], 'E2E User B Workspace', 'Kontext Memory'))
    conn.commit()
token = create_api_token(settings, user_id=str(user['id']), token_name='e2e-user-b', scopes=['memory'], expires_days=1, workspace_id=workspace_b)
print(json.dumps({'token': token['token'], 'user_id': str(user['id']), 'workspace_id': workspace_b}))

import urllib.request, json, sqlite3

BASE = 'http://127.0.0.1:8000'
WS_A = '96b143b1-5169-4f5e-a863-b9e54c7ccccf'
WS_B = '9214bb47-a7ca-49e1-937c-00f91fb4c411'
TOKEN = 'knt_368vegUqDdGc1-KN4vrW0I_aVNMwey5DrH8yKeyRrK0ZKXk-8qniHpYwKWW-mZjj'

def call(method, path, data=None):
    headers = {'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'}
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(f'{BASE}{path}', data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except Exception as e:
        return e.code, json.loads(e.read())

s, r = call('POST', '/v1/memory/store', {'key': 'debug_a', 'content': 'A only', 'workspace_id': WS_A})
print(f'Store A: s={s} r={r}')

s, r = call('POST', '/v1/memory/store', {'key': 'debug_b', 'content': 'B only', 'workspace_id': WS_B})
print(f'Store B: s={s} r={r}')

conn = sqlite3.connect('/tmp/truememory-test.db')
rows = conn.execute("SELECT doc_id, memory_key FROM profile_memories WHERE memory_key LIKE 'debug_%'").fetchall()
for row in rows:
    print(f'DB: doc_id={row[0]} key={row[1]}')
conn.close()

call('POST', '/v1/memory/forget', {'id': 'profile:general|workspace:96b143b1-5169-4f5e-a863-b9e54c7ccccf:debug_a', 'workspace_id': WS_A})
call('POST', '/v1/memory/forget', {'id': 'profile:general|workspace:9214bb47-a7ca-49e1-937c-00f91fb4c411:debug_b', 'workspace_id': WS_B})

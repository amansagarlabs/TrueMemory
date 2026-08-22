# Run Aman Agent Lab on a New PC

This guide starts from a fresh machine and gets the full app running with:

- Next.js frontend
- FastAPI backend
- Docker PostgreSQL
- pgAdmin
- Zilliz / Milvus vector DB
- OpenRouter LLM

Recommended setup for most developers:

- Run `postgres`, `pgadmin`, and `backend` with Docker
- Run the Next.js frontend locally with `npm run dev`

## 1. Install Required Software

Install these first:

- Git: https://git-scm.com/downloads
- Node.js LTS: https://nodejs.org
- Docker Desktop: https://www.docker.com/products/docker-desktop
- Python 3.11 or newer: https://www.python.org/downloads
- VS Code: https://code.visualstudio.com

After installing Docker Desktop, open it once and wait until it says Docker is running.

Check versions:

```powershell
git --version
node --version
npm --version
docker --version
python --version
```

## 2. Clone the Project

```powershell
git clone <your-repo-url>
cd my-ai-app
```

If the project was copied manually, just open PowerShell inside the project folder.

## 3. Create the Environment File

Copy the example env:

```powershell
copy .env.example .env
```

Open `.env` and set these required values:

```env
OPENROUTER_API_KEY=sk-or-v1-your-real-key
OPENROUTER_MODEL=openai/gpt-4o-mini

MILVUS_ADDRESS=https://your-zilliz-endpoint:443
MILVUS_TOKEN=your-zilliz-token
MILVUS_COLLECTION_NAME=pdf_chunks
```

For Docker backend mode, set:

```env
USE_DOCKER_POSTGRES=true
POSTGRES_DOCKER_HOST=postgres
POSTGRES_DB=app-agent
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
DATABASE_URL_DOCKER=postgresql://postgres:postgres@postgres:5432/app-agent
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Important:

- When backend runs in Docker, Postgres host must be `postgres`.
- When backend runs locally on your PC, Postgres host must be `localhost`.

## 4. Install Frontend Dependencies

From the project root:

```powershell
npm install
```

## 5. Start Docker Services

Recommended full backend mode:

```powershell
docker compose up -d --build postgres pgadmin backend
```

Check containers:

```powershell
docker compose ps
```

You should see:

- `my-ai-app-postgres-1`
- `my-ai-app-pgadmin-1`
- `my-ai-app-backend-1`

## 6. Verify Backend Health

Run:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/health | ConvertTo-Json -Depth 4
```

Expected important values:

```json
{
  "status": "ok",
  "openrouter_configured": true,
  "zilliz_configured": true,
  "postgres_connected": true,
  "postgres_mode": "docker",
  "postgres_database": "app-agent",
  "postgres_host": "postgres"
}
```

If `openrouter_configured` is `false`, check `OPENROUTER_API_KEY` in `.env`.

If `zilliz_configured` is `false`, check `MILVUS_ADDRESS` and `MILVUS_TOKEN`.

If `postgres_connected` is `false`, check `USE_DOCKER_POSTGRES=true` and restart backend:

```powershell
docker compose restart backend
```

## 7. Start the Frontend

From the project root:

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

Main pages:

- Homepage: `http://localhost:3000`
- Chat app: `http://localhost:3000/chat`
- Login: `http://localhost:3000/login`
- Signup: `http://localhost:3000/signup`

## 8. Open pgAdmin

Open:

```text
http://localhost:5050
```

Login:

```text
Email: admin@local.dev
Password: admin123
```

Add a server:

```text
Name: AmanAgent Local
Host: postgres
Port: 5432
Maintenance database: app-agent
Username: postgres
Password: postgres
```

Useful tables:

- `users`
- `auth_identities`
- `user_sessions`
- `conversations`
- `messages`
- `message_retrieval_sources`
- `user_memories`

## 9. Test the App Flow

1. Go to `http://localhost:3000/signup`.
2. Create an account with email and password.
3. Go to `/chat`.
4. Ask a normal question without uploading a PDF.
5. Upload a PDF from the `+` menu.
6. Wait for upload and pipeline processing.
7. Ask questions from the PDF.
8. Open pgAdmin and confirm users/chats are saved.

## 10. Common Commands

Start Docker services:

```powershell
docker compose up -d postgres pgadmin backend
```

Rebuild backend after code changes:

```powershell
docker compose up -d --build backend
```

Restart backend only:

```powershell
docker compose restart backend
```

View backend logs:

```powershell
docker compose logs -f backend
```

Stop all Docker services:

```powershell
docker compose down
```

Stop and delete database volume:

```powershell
docker compose down -v
```

Use `down -v` only when you want to delete local Postgres data.

## 11. Optional: Run Backend Locally Instead of Docker

Use this only if you want to debug FastAPI directly on your PC.

Set in `.env`:

```env
USE_DOCKER_POSTGRES=false
POSTGRES_LOCAL_HOST=localhost
DATABASE_URL_LOCAL=postgresql://postgres:postgres@localhost:5432/app-agent
```

Start only Postgres and pgAdmin:

```powershell
docker compose up -d postgres pgadmin
```

Install backend dependencies:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

Run backend:

```powershell
uvicorn main:app --reload --port 8000
```

Run frontend from another terminal:

```powershell
npm run dev
```

## 12. Troubleshooting

### Frontend says OpenRouter is not configured

Check backend health:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/health | ConvertTo-Json -Depth 4
```

If backend says `openrouter_configured: true`, hard refresh the browser:

```text
Ctrl + Shift + R
```

### Chat fails with 422

Rebuild and restart backend:

```powershell
docker compose up -d --build backend
```

Then hard refresh the browser.

### Database disconnected in Docker mode

Make sure:

```env
USE_DOCKER_POSTGRES=true
POSTGRES_DOCKER_HOST=postgres
```

Then:

```powershell
docker compose restart backend
```

### Port already in use

Check what is using a port:

```powershell
netstat -ano | findstr 8000
netstat -ano | findstr 3000
netstat -ano | findstr 5050
```

Stop the conflicting process or change the port in `.env`.

### pgAdmin cannot connect to Postgres

When pgAdmin runs in Docker, use:

```text
Host: postgres
Port: 5432
```

Do not use `localhost` inside pgAdmin for the Docker Postgres container.

## 13. Quick Start Summary

```powershell
git clone <your-repo-url>
cd my-ai-app
copy .env.example .env
# edit .env keys
npm install
docker compose up -d --build postgres pgadmin backend
npm run dev
```

Open:

```text
http://localhost:3000
```

# TrueMemory Production Deployment Configuration

## Environment Variables

### Required
```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Authentication
AMAN_JWT_SECRET=<random-64-char-hex>
AUTH_COOKIE_SECURE=true

# CORS (comma-separated origins)
CORS_ORIGINS=https://yourdomain.com
```

### Optional
```bash
# Logging
LOG_LEVEL=INFO
APP_ENV=production

# Connection Pool
PG_POOL_MIN_SIZE=2
PG_POOL_MAX_SIZE=10
PG_POOL_TIMEOUT=30

# Rate Limiting
MEMORY_RATE_LIMIT=120
MEMORY_RATE_WINDOW_SECONDS=60

# Provider
OPENROUTER_API_KEY=<your-secret>
OPENROUTER_MODEL=openai/gpt-4o-mini
```

## Docker Deployment

### Build
```bash
docker build -t truememory-api:latest -f backend/Dockerfile backend/
```

### Run
```bash
docker run -d \
  --name truememory-api \
  -p 8000:8000 \
  -e DATABASE_URL=postgresql://... \
  -e AMAN_JWT_SECRET=... \
  -e AUTH_COOKIE_SECURE=true \
  -e CORS_ORIGINS=https://yourdomain.com \
  -e APP_ENV=production \
  -e LOG_LEVEL=INFO \
  --restart unless-stopped \
  truememory-api:latest
```

## Docker Compose (Production)

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: truememory
      POSTGRES_USER: truememory
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U truememory"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://truememory:${DB_PASSWORD}@postgres:5432/truememory
      AMAN_JWT_SECRET: ${JWT_SECRET}
      AUTH_COOKIE_SECURE: "true"
      CORS_ORIGINS: ${CORS_ORIGINS}
      APP_ENV: production
      LOG_LEVEL: INFO
    ports:
      - "8000:8000"
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true

volumes:
  postgres_data:
```

## Health Checks

### Liveness Probe
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

### Readiness Probe
```yaml
readinessProbe:
  httpGet:
    path: /readiness
    port: 8000
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

## Monitoring

### Metrics Endpoint
```bash
curl http://localhost:8000/v1/memory/metrics
```

### Structured Logs
Logs are JSON-formatted in production:
```json
{
  "timestamp": "2026-09-14T12:00:00Z",
  "level": "INFO",
  "logger": "TrueMemory.request",
  "message": "request_complete",
  "request_id": "abc-123",
  "method": "POST",
  "path": "/v1/memory/store",
  "status": 200,
  "duration_ms": 45.2
}
```

## Security Checklist

- [ ] AUTH_COOKIE_SECURE=true
- [ ] AMAN_JWT_SECRET is cryptographically random
- [ ] CORS_ORIGINS contains only production domains
- [ ] TrueMemory_ENABLE_TEST_AUTH is NOT set
- [ ] Database credentials are not in code
- [ ] API keys are stored in environment variables
- [ ] HTTPS is enforced (via load balancer/proxy)
- [ ] Security headers are enabled (CSP, HSTS, etc.)
- [ ] Rate limiting is configured
- [ ] Audit logging is enabled

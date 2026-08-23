#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
compose() { docker compose -f docker-compose.yml "$@"; }
record_release() {
  mkdir -p "${RELEASE_METADATA_DIR:-release-metadata}"
  image_digest="$(docker image inspect "$TRUEMEMORY_IMAGE" --format '{{index .RepoDigests 0}}' 2>/dev/null || docker image inspect "$TRUEMORY_IMAGE" --format '{{.Id}}')"
  cat > "${RELEASE_METADATA_DIR:-release-metadata}/$(date -u +%Y%m%dT%H%M%SZ).env" <<EOF
IMAGE=$TRUEMORY_IMAGE
IMAGE_DIGEST=$image_digest
DEPLOYED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo unknown)
ENVIRONMENT=${APP_ENV:-staging}
EOF
}

case "${1:-}" in
  preflight) ./preflight.sh ;;
  deploy) ./preflight.sh; compose pull; compose up -d --no-build; compose ps; record_release ;;
  migrate) compose exec -T backend sh -lc 'DATABASE_URL="$DATABASE_URL_DOCKER" python scripts/init_postgres.py' ;;
  health) curl --fail --silent --show-error "https://${STAGING_DOMAIN:?STAGING_DOMAIN is required}/health" ;;
  readiness) curl --fail --silent --show-error "https://${STAGING_DOMAIN:?STAGING_DOMAIN is required}/readiness" ;;
  backup)
    : "${BACKUP_FILE:?BACKUP_FILE is required}"
    mkdir -p "$(dirname "$BACKUP_FILE")"
    test ! -e "$BACKUP_FILE" || { echo "backup: refusing to overwrite $BACKUP_FILE" >&2; exit 1; }
    compose exec -T postgres pg_dump --format=custom --no-owner --no-privileges > "$BACKUP_FILE"
    test -s "$BACKUP_FILE" || { echo "backup: pg_dump produced an empty file" >&2; exit 1; }
    ;;
  restore)
    : "${BACKUP_FILE:?BACKUP_FILE is required}"
    : "${RESTORE_DATABASE:?RESTORE_DATABASE is required; never restore without an explicit target}"
    [[ "${ALLOW_RESTORE:-0}" == 1 ]] || { echo "restore: set ALLOW_RESTORE=1 explicitly" >&2; exit 1; }
    test -s "$BACKUP_FILE" || { echo "restore: backup is missing or empty" >&2; exit 1; }
    compose exec -T postgres pg_restore --no-owner --no-privileges -d "$RESTORE_DATABASE" < "$BACKUP_FILE"
    compose exec -T postgres pg_isready -d "$RESTORE_DATABASE" >/dev/null
    ;;
  logs) compose logs -f --tail="${TAIL:-200}" backend edge postgres ;;
  restart) compose restart backend edge; ;;
  rollback)
    : "${ROLLBACK_IMAGE:?ROLLBACK_IMAGE is required}"
    compose down
    TRUEMEMORY_IMAGE="$ROLLBACK_IMAGE" compose up -d
    ;;
  *) echo "usage: $0 {preflight|deploy|migrate|health|readiness|backup|restore|logs|restart|rollback}" >&2; exit 2 ;;
esac

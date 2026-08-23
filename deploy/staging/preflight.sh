#!/usr/bin/env bash
set -Eeuo pipefail

fail() { echo "preflight: $*" >&2; exit 1; }
need() { [[ -n "${!1:-}" ]] || fail "missing required input: $1"; }

command -v docker >/dev/null || fail "docker is required"
docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable"
docker compose version >/dev/null 2>&1 || fail "Docker Compose is unavailable"
[[ "$(uname -s)" == "Linux" ]] || fail "deployment target must be Linux"

need STAGING_DOMAIN
need TRUEMEMORY_IMAGE
need POSTGRES_DB
need POSTGRES_USER
need POSTGRES_PASSWORD
need AMAN_JWT_SECRET
need BACKUP_URI

[[ "$TRUEMEMORY_IMAGE" != *:latest ]] || fail "TRUEMEMORY_IMAGE must use an immutable tag or digest"
docker image inspect "$TRUEMEMORY_IMAGE" >/dev/null 2>&1 || fail "deployment image is unavailable locally: $TRUEMEMORY_IMAGE"
[[ "$BACKUP_URI" == s3://* || "$BACKUP_URI" == gs://* || "$BACKUP_URI" == https://* || "$BACKUP_URI" == file://* ]] || fail "BACKUP_URI must identify a supported destination"

[[ "$STAGING_DOMAIN" != *example.com ]] || fail "STAGING_DOMAIN must be a real hostname"
[[ "$STAGING_DOMAIN" != localhost && "$STAGING_DOMAIN" != 127.0.0.1 ]] || fail "STAGING_DOMAIN must be public"
[[ "${KONTEXT_ENABLE_TEST_AUTH:-0}" != 1 ]] || fail "test auth must be disabled"
[[ "${AUTH_COOKIE_SECURE:-true}" == true ]] || fail "AUTH_COOKIE_SECURE=true is required"

command -v ss >/dev/null || fail "ss is required for port validation"
! ss -ltn | awk '$4 ~ /:80$/ || $4 ~ /:443$/ { found=1 } END { exit found ? 0 : 1 }' || fail "ports 80/443 are already occupied"

command -v getent >/dev/null || fail "getent is required for DNS validation"
getent hosts "$STAGING_DOMAIN" >/dev/null || fail "DNS does not resolve: $STAGING_DOMAIN"

command -v openssl >/dev/null || fail "openssl is required for TLS validation"
[[ -n "${TLS_EXPECTED_ISSUER:-}" ]] || fail "TLS_EXPECTED_ISSUER is required"
certificate="$(printf '' | timeout 15 openssl s_client -connect "${STAGING_DOMAIN}:443" -servername "$STAGING_DOMAIN" 2>/dev/null | openssl x509 -noout -issuer -subject 2>/dev/null || true)"
[[ -n "$certificate" ]] || fail "TLS certificate could not be retrieved from ${STAGING_DOMAIN}:443"
grep -F "$STAGING_DOMAIN" <<<"$certificate" >/dev/null || fail "TLS certificate subject does not match $STAGING_DOMAIN"
grep -F "$TLS_EXPECTED_ISSUER" <<<"$certificate" >/dev/null || fail "TLS issuer does not match TLS_EXPECTED_ISSUER"

docker compose -f docker-compose.yml config --quiet || fail "staging Compose configuration is invalid"
echo "preflight: passed for $STAGING_DOMAIN"

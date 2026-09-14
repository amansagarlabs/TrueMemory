# TRUE MEMORY — NEXT SESSION PROMPT

Use this file to resume work in a new opencode session. Paste this into the next conversation.

---

## Phase 9.8 Complete — Next Recommended Phases

### Current State
- **Level:** 5 — Cross-agent persistence (VERIFIED)
- **L4 Status:** HARDENED — LIVE EVIDENCE PARTIAL
- **L5 Status:** NOT IMPLEMENTED
- **E2E:** 65/65 tests passing across REST, MCP, Python SDK

### Evidence Files (docs/research/)
- `TRUE_MEMORY_PHASE9_8_E2E_RESULTS.md`
- `TRUE_MEMORY_PHASE9_8_SECURITY_RESULTS.md`
- `TRUE_MEMORY_PHASE9_8_TELEMETRY_RESULTS.md`
- `TRUE_MEMORY_PHASE9_8_CROSS_AGENT_RESULTS.md`
- `TRUE_MEMORY_PHASE9_8_INTEROPERABILITY_RESULTS.md`
- `TRUE_MEMORY_PHASE9_8_FINAL_STATUS.md`
- `TRUE_MEMORY_FINAL_STATUS_REPORT.md` (updated)
- `TRUE_MEMORY_HARNESS_IMPLEMENTATION_ROADMAP.md` (updated)

### Next Recommended Phases
1. **Phase 9.9:** Live provider validation (requires OpenRouter credits)
2. **Phase 9.10:** TypeScript SDK compilation + E2E
3. **Phase 10.0:** Production hardening + monitoring

### Key Files Modified in Phase 9.8
- `backend/app/routes/memory_api.py` — `_parse_id` rpartition fix
- `backend/app/routes/memory_mcp.py` — same fix
- `docker-compose.test.yml` — DATABASE_URL_DOCKER override
- `backend/db/init/015_agent_native_coding.sql` — IF EXISTS guards
- `backend/scripts/seed_e2e_identities.py` — owner_user_id parameter
- `backend/e2e_full_suite.py` — complete 65-test E2E suite

### Test Tokens (freshly seeded)
- `token_a_ws`: `knt_e5xpiyFrwS502b3LwFbd8oBXtNhMINzvfH96Pn1Y97v9FKOaQBgpwZIQMX53JYUu`
- `token_a_agent`: `knt_aUqTVLimo99opNAunPGG_dik5YyOKy6tZOLxbo9ucHrUAUdH0pl33-A0PY8jAxmT`
- `token_b_agent`: `knt_2i2vnij78sdNy26yPWWZTe0xAkNqpxS56UnKc6MJUE0cM6UMd71Pm6G6iCVW-4LO`
- `token_c_agent`: `knt_TMlMrXPKm9GwkUgbjxAReW2Z8GT_EbuA2BTHGW8onh5-cTYF2GMKPm0Bd9zVBc3s`
- `token_b_ws`: `knt_XoGzub1BUc0e7DRYbj2nUO_9tfnEDXvaHs6QbnLoTjZOHvB20j8SaRsQf2YG9e6T`

### Test IDs
- user_a: `9899dd22-571d-4712-b9e6-4357d93e4c3f`
- user_b: `c9b8ef49-0f66-45b0-a156-03915201871d`
- workspace_a: `1d3b8006-cb12-402d-86ec-4d90fb03b700`
- workspace_b: `3bdfd4b9-016b-46ba-9228-6d69f04b0861`
- project_a: `7da846bd-f93e-4192-8f8f-13c9b4c7b912`
- project_b: `087de8a7-111f-49bb-bc8c-61f8ff90bbcd`
- agent_a: `32187e35-008d-40d5-9d8d-a6ab3f0db0e5`
- agent_b: `b7d9da88-ee0a-4556-9ecc-6259dbfaabc6`
- agent_c: `ed9407e1-fa6f-4dc0-8a58-e9a1e2375ab4`

### Commands
- Start test stack: `$env:TRUEMEMORY_TEST_DB_PASSWORD="test_password_123"; docker compose -f docker-compose.test.yml up -d`
- Run E2E: `cd backend && python e2e_full_suite.py`
- Run unit tests: `cd backend && python -m pytest tests/unit/ -v`
- Shut down: `$env:TRUEMEMORY_TEST_DB_PASSWORD="test_password_123"; docker compose -f docker-compose.test.yml down -v`

### Memory ID Format
`profile:general|workspace:{ws_id}:{key}`

### Scope Split (pipe handling)
- `full_scope.split("|", 1)[0]` → base scope (e.g., `general`)
- `full_scope` after pipe → workspace-scoped (e.g., `workspace:WS_A`)

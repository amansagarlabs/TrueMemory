# Embedded decision policies

These Rego policies are compiled with the OPA CLI into a Wasm bundle and
loaded by the backend through the optional `opa-wasm` runtime. TrueMemory does
not run an OPA HTTP server and does not require `localhost:8181`, `OPA_URL`,
or network access for policy evaluation.

Build the bundle from the repository root:

```powershell
opa build -t wasm -e truememory/decision backend/policies/decision.rego -o backend/policies/bundle.tar.gz
```

Extract `policy.wasm` from the bundle and set `OPA_POLICY_BUNDLE_PATH` to its
path. The application reports deterministic fallback when the optional bundle
or runtime is unavailable.

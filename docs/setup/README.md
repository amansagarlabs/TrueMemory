# Kontext Package Install Guide

This checkout keeps current app intact and ports Kontext branding plus docs.
Use this file when you want to install or reason about packages without converting repo into full monorepo.

## Current Local Packages

Install from repo root:

```powershell
npm install
```

Current frontend package set:

- `next`
- `react`
- `react-dom`
- `framer-motion`
- `motion`
- `lucide-react`
- `cobe`
- `rough-notation`
- `svg-dotted-map`
- `tailwind-merge`
- `clsx`
- `class-variance-authority`
- `@base-ui/react`
- `@radix-ui/react-icons`
- `tw-animate-css`

Current dev tools:

- `eslint`
- `eslint-config-next`
- `typescript`
- `tailwindcss`
- `@tailwindcss/postcss`
- `@types/node`
- `@types/react`
- `@types/react-dom`

## Current Backend Packages

Install backend deps from `backend/`:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Backend stack includes FastAPI, async PostgreSQL drivers, HTTP clients, vector helpers, and local service code.

## Remote Kontext Package Map

Remote repo source of truth says target structure is:

- `apps/server`
- `apps/web`
- `packages/context-core`
- `sdk/python`
- `sdk/typescript`
- `cli`
- `docs`
- `examples`

Use that map as migration target if you later split this checkout into true monorepo.

## Recommended Local Install Order

1. `npm install`
2. backend `pip install -r requirements.txt`
3. run local app
4. port features only when needed

## Notes

- Do not assume remote package folders already exist in this local checkout.
- Keep current app behavior first.
- Use remote repo for naming, product direction, and future split plan.

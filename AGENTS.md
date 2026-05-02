# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

PAP Tax Charts is a Vite + React + TypeScript single-page app that implements the German PAP 2026 payroll tax algorithm entirely client-side. No backend or database required.

### Development commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (serves at http://127.0.0.1:5173) |
| Build | `npm run build` |
| Tests | `npm test -- --run --dir src/lib --reporter verbose` |
| BMF parity tests | `npm run test:bmf` (requires network access to bmf-steuerrechner.de) |

### Notes

- **Node.js 20+** is required. The VM has it installed via nodesource.
- **TypeScript strict checking** (`npx tsc --noEmit`) reports pre-existing type errors in the repo (chart tooltip callback types, test file literal types). These do not block the Vite build or test execution since Vite/esbuild only transpiles without type checking.
- **All 171 tests pass** without external services. The BMF validation test gracefully connects to the remote BMF API when available; no local Java oracle is needed.
- **No lint command** is configured in `package.json`. TypeScript type-checking (`npx tsc --noEmit`) is the closest equivalent.

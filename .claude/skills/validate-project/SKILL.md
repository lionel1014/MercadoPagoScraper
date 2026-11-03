---
name: validate-project
description: Valida MercadoPagoScraper tras un cambio — tipos, lint, tests y build de producción, solo lo pertinente a los archivos modificados. Usar al terminar cambios de código, antes de proponer un commit, o cuando el usuario pida "validá", "chequeá que compile", "corré los tests".
---

# Validar el proyecto

Scripts reales (package.json): `lint`, `build:prod`, `test:ci` (Karma), `test:electron` (node:test, incluye el scraper con Chrome headless contra un sitio falso local, ~1 min), `validate` (lint → build:prod → test:ci → test:electron, corta en el primer error), `dist` (instalador; lento, solo si se pide). Hooks Husky: pre-commit = ESLint sobre `src/**` staged; pre-push = `build:prod`.

## Pasos

1. `git status --short` y `git diff --name-only HEAD` para saber qué cambió. No releas archivos que ya tenés en contexto.
2. Elegí según lo modificado:

| Cambió | Correr |
|---|---|
| `src/**/*.ts` / `*.html` | `npx eslint <archivos>` y `npm run build:prod` (el build ya hace el chequeo de tipos de Angular) |
| `*.spec.ts` o lógica con spec propio | además `npm run test:ci` |
| `electron/mp-parser.js`, `excel-file.js`, `ipc-validation.js`, `browser-path.js` | `node --test` del `.test.js` correspondiente en `electron/test/` |
| `electron/scraper.js` | `node --test electron/test/scraper.test.js` (sitio falso; nunca Mercado Pago real) |
| `electron/main.js`, `preload.js` | `node --check <archivo>`; si cambian canales IPC, revisar `scraper-api.interface.ts` y `app.spec.ts` |
| `angular.json`, `package.json`, `tsconfig*.json` | `npm run validate` completo |
| solo `.md` / docs | nada |

3. Limitá la salida: `2>&1 | tail -40` (Bash) o `Select-Object -Last 40` (PowerShell). Filtrá el aviso `baseline-browser-mapping`, es ruido.
4. Informá en una tabla corta: comando, resultado (✅/❌), y por cada error `archivo:línea` + mensaje. Separá errores introducidos por el cambio de los preexistentes.

## Notas

- `test:ci` necesita Chrome o `CHROME_BIN`. Si no hay Chrome: `CHROME_BIN=$(node -e "console.log(require('puppeteer').executablePath())")`.
- Si aparece un error que no introdujo el cambio, reportalo sin arreglarlo de paso.

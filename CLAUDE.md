# MercadoPagoScraper

App de escritorio (Electron 39 + Angular 21) que lee un Excel de números de operación, los busca en la web de Mercado Pago con la sesión del usuario (Puppeteer 23 + Chrome for Testing empaquetado) y escribe los resultados en una copia del Excel. Cuenta corporativa sin acceso a la API.

- `src/app/` UI Angular (renderer, solo usa `window.mpScraper` vía `ScraperBridgeService`) · `electron/main.js` ventana + IPC · `electron/preload.js` puente · `electron/scraper.js` Puppeteer · `electron/excel-file.js` ExcelJS · `electron/mp-parser.js` importes.
- Skills del proyecto: `validate-project`, `scraper-debugging`, `excel-processing`, `angular-development`, `electron-integration`. Oficial: `angular-developer`.

## Reglas

- Respetar la arquitectura existente: UI en Angular, Excel y automatización solo en main, comunicación por los canales de `preload.js` validados en `main.js`. No agregar dependencias sin necesidad; `dependencies` es solo lo que corre en main (se empaqueta).
- Seguridad Electron: no relajar `contextIsolation`, `sandbox`, `nodeIntegration: false`, la CSP de `index.html` ni la validación de remitente/argumentos IPC.
- **La automatización es Puppeteer, no Playwright.** Playwright MCP es solo herramienta de diagnóstico del agente.
- Angular 21: standalone, `OnPush`, zoneless, signals, `inject()` en código nuevo, control flow `@if/@for`, sin `any`.
- Scraper: esperas por condición antes que `setTimeout` fijos, timeouts explícitos, selectores por atributos estables, un ID fallido no corta el lote.
- **Nunca** loguear ni guardar cookies, tokens, credenciales, ni el JSON/HTML completo de detalle. No navegar Mercado Pago ni usar la sesión del usuario sin autorización explícita en el momento. Nada de evasión de captchas/2FA/detección de bots.
- Excel: el original es de solo lectura; procesar solo el rango elegido; validar IDs (solo dígitos); no usar Excel reales como fixtures.
- Git: no commitear ni pushear sin pedido explícito. Sin trailers `Co-Authored-By` ni "Generated with Claude Code".

## Validar

`npm run lint` · `npm run build:prod` · `npm run test:ci` · `npm run test:electron` · `npm run validate` (todo, corta en el primer error). Pre-push de Husky corre `build:prod`. Instalador: `npm run dist` → `release/`.

## Ahorro de contexto

- Buscar símbolos (LSP / Grep) antes de leer archivos; leer por rangos.
- No explorar `node_modules/`, `dist/`, `.angular/`, `.playwright-mcp/`, `vendor/`, `release/` (bloqueados en `.claude/settings.json`).
- Context7 solo para APIs que no estén claras; Playwright MCP / navegador solo si el diagnóstico lo requiere.
- Limitar salidas de comandos (`tail`), no repetir builds/tests sin cambios en medio, sin subagentes para tareas simples.

---
name: electron-integration
description: Integración Angular–Electron de MercadoPagoScraper (electron/main.js, preload, IPC, seguridad entre procesos, archivos locales, Chrome empaquetado, electron-builder). Usar al tocar electron/, los canales IPC, la carga del build, el navegador incluido o el instalador.
---

# Electron en MercadoPagoScraper

## Arquitectura

- `package.json` `main` = `electron/main.js`. `npm run electron` compila Angular y abre la app; `npm run dist` arma los instaladores.
- Ventana: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `devTools` solo en desarrollo, sin menú en la versión empaquetada.
- `preload.js` expone `window.mpScraper` (congelado): `openExcel`, `start(items)`, `confirmReady`, `cancel`, `saveResults`, `onEvent(cb) → unsubscribe`. Canales: `excel:open`, `scraper:start`, `scraper:confirm`, `scraper:cancel`, `excel:save` (invoke) y `scraper:event` (main → UI).
- `main.js`:
  - `assertTrustedSender` acepta solo el `mainFrame` de la ventana propia con URL del `index.html` local;
  - `handle()` devuelve `{ ok, ...}` o `{ ok:false, error }`;
  - `validateStartPayload` valida los datos de inicio;
  - `will-navigate`/`will-redirect` y `setWindowOpenHandler` están bloqueados, y los permisos denegados.
- Una sola instancia (`requestSingleInstanceLock`). `userData` fijo en `%APPDATA%\MercadoPagoScraper`, de modo que la sesión sobrevive a actualizaciones.
- Al cerrar con un proceso en curso o resultados sin guardar, se pide confirmación. `window-all-closed` cancela y cierra Chrome.
- Variables `MPS_USER_DATA_DIR`, `MPS_ACTIVITIES_URL` y `MPS_HEADLESS`: solo para pruebas, ignoradas si `app.isPackaged`.

## Navegador empaquetado

- `scripts/fetch-browser.js` descarga Chrome for Testing win64 de la versión de `PUPPETEER_REVISIONS.chrome` a `vendor/browser`.
- electron-builder lo copia con `extraResources` a `resources/browser` (fuera de `app.asar`). `electron/browser-path.js` lo resuelve; empaquetada sin navegador → error claro; en desarrollo sin `vendor/` → Chrome de caché de Puppeteer.
- Actualizar: subir `puppeteer`, correr `npm run test:electron` y `npm run dist`.

## Instalador

`build` en `package.json`: NSIS one-click por usuario (sin admin, accesos directos, `deleteAppDataOnUninstall: false`) + portable x64. `files` solo incluye `electron/` (sin tests), el `dist` de Angular y `package.json`; `dependencies` contiene solo lo que usa main (Angular está en devDependencies). Salida en `release/`. Sin firma de código: SmartScreen avisa.

## Reglas

- No relajar las opciones de seguridad ni la CSP para resolver un problema: corregí el código.
- Archivos: solo vía `dialog` en main; nunca escribir sobre el Excel de entrada.
- La sesión de `mp_session_puppeteer` no se copia, no se lee y no se loguea.
- No agregar auto-update ni cambiar versiones de Electron sin pedido explícito.

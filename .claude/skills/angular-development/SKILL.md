---
name: angular-development
description: Convenciones propias de la app Angular de MercadoPagoScraper (estructura, estado con signals, puente con Electron, Material). Complementa a la skill oficial angular-developer, que cubre las buenas prácticas generales. Usar al crear o modificar componentes, servicios o interfaces en src/app.
---

# Angular en MercadoPagoScraper

Para APIs y buenas prácticas generales de Angular 21 usá la skill `angular-developer` o el MCP `angular-cli`. Esta skill solo fija lo propio del proyecto.

## Estructura

- `AppComponent` (`app.ts`/`app.html`/`app.css`): standalone, `OnPush`, zoneless (`provideZonelessChangeDetection`), sin rutas.
- `services/scraper-bridge.service.ts`: expone `api: MpScraperApi | null` (`window.mpScraper`). Es la **única** vía hacia Electron; `null` en `ng serve`.
- `interfaces/scraper-api.interface.ts`: contrato del puente (`ExcelFile`, `ScrapeItem`, `ScraperEvent`, `BridgeResult`). `interfaces/processed-row.interface.ts`: `ProcessedRow` y `RowStatus`.
- UI: Angular Material 21 + `custom-theme.scss`; fuentes e íconos locales (`@fontsource/roboto`, `material-icons`), sin CDN.
- Tests: Karma + Jasmine; `app.spec.ts` usa un puente falso (`jasmine.createSpyObj<MpScraperApi>`).

## Convenciones

- Estado en `signal()`, derivados con `computed()`; el template llama a las signals (`rows()`) y usa `[ngModel]`/`(ngModelChange)` para los inputs.
- `inject()` para dependencias; control flow `@if`/`@for`; sin `any` (las filas de `mat-table` llegan como `any`: resolvé tipos con métodos, como `label()`).
- Respuestas del puente: `{ ok: false, error }` se muestra en el Registro; nunca uses `try/catch` para eso.
- Canales nuevos: se agregan en `electron/preload.js`, se validan en `electron/main.js` y se tipan en `scraper-api.interface.ts`, los tres a la vez.
- No uses `window.require`, `ipcRenderer` ni APIs de Node en `src/`: no existen con `contextIsolation`.
- La CSP solo permite recursos propios: nada de CDNs, scripts inline ni `onload`.
- Textos en español rioplatense, botones con verbos claros («Elegir Excel», «Iniciar», «Ya estoy lista», «Guardar Excel»).

## Cuando `app.ts` crezca

Si un cambio agrega una responsabilidad nueva, extraela a un servicio en `services/` en vez de sumarla al componente. No refactorices si el usuario no lo pidió.

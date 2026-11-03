---
name: scraper-debugging
description: Diagnostica y corrige fallas de la automatización de navegador de MercadoPagoScraper (electron/scraper.js, Puppeteer) — selectores que dejan de encontrar elementos, timeouts, navegación, sesión, extracción del JSON de detalle, cancelación. Usar ante "no encuentra la operación", "timeout", "se cuelga", "devuelve vacío", "cambió la web".
---

# Depurar el scraper

**La app usa Puppeteer 23 con Chrome for Testing empaquetado, no Playwright.** Playwright MCP es solo una herramienta del agente para inspeccionar páginas; no migres el scraper.

## Mapa

- `electron/scraper.js` (`Scraper`):
  - `run(items)`: agrupa números repetidos, lanza Chrome headed con `userDataDir` = `%APPDATA%\MercadoPagoScraper\mp_session_puppeteer`, `waitUntilSessionReady`, busca cada número, emite eventos y siempre cierra el navegador en `finally`.
  - `waitForConfirmation`: espera **sin timeout** a «Ya estoy lista» (`confirm()`); registra la espera antes de emitir el aviso.
  - `isSessionReady`: ir a Actividad + `input[placeholder='Buscar']` visible (15 s). Si falla, vuelve a pedir confirmación (`NOT_READY_MESSAGE` / `SESSION_LOST_MESSAGE`).
  - `lookup(id)`: escribe en el buscador → Enter → `waitForNetworkIdle` → `goto` del primer `a[href*='/activities/detail/']` → espera `#__PRELOADED_STATE__` → `parseDetail`. Si el JSON no contiene el número buscado → `mismatch` (no se atribuyen datos).
  - `withRetry`: un solo reintento salvo cancelación o navegador cerrado.
  - `cancel()`: rechaza la espera y cierra el navegador. El cierre manual del navegador (`disconnected`) también cancela.
- `electron/mp-parser.js`: secciones `ticket-v2` (cobro, retenciones, cargo MP, total) y `payment-v2` (medio de pago). `null` = dato ausente, `0` = cero. El signo sale de la parte entera, incluido `"-0"`.
- Eventos hacia la UI: `status`, `waiting-confirmation`, `item` (`rows`, `status`, `message`, `data`), `done`, `cancelled`, `error`.

## Cómo diagnosticar

1. Pedile al usuario el texto del Registro de la app (y la consola de `npm run electron` en desarrollo) antes de adivinar.
2. Ubicá el paso que falla: sesión, buscador, resultados, detalle, JSON.
3. Reproducí con el sitio falso `electron/test/fake-mp.js` (adaptalo al cambio del DOM que describa el usuario) y `node --test electron/test/scraper.test.js`. `docs/detalle-ejemplo.json` tiene datos reales y su lectura está bloqueada: pedí un fragmento anonimizado si hace falta.
4. **No navegues Mercado Pago real con Playwright MCP ni con el navegador integrado sin autorización explícita en el momento**, y nunca con la sesión de la usuaria.

## Criterios de corrección

- Esperas por condición (`waitForSelector`, `waitForFunction`, `waitForNetworkIdle`), con timeout explícito; nada de `setTimeout` fijos.
- Selectores por atributos estables (`placeholder`, `href` parcial, `id`).
- Un número que falla se reporta con `status: 'error'` y el lote sigue.
- Logs: números de operación y pasos sí; **nunca** cookies, tokens, headers, HTML ni el JSON de detalle completos.

## Fuera de alcance

No implementar evasión de captchas, 2FA, rate limits ni detección de bots, ni agregar flags anti-detección. `--disable-blink-features=AutomationControlled` viene del código original; está pendiente que el usuario decida si se quita.

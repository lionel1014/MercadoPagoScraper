# Mercado Pago Scraper

Aplicación de escritorio para Windows que toma un Excel con números de operación, consulta cada operación en la web de Mercado Pago con la sesión que la propia usuaria inicia a mano, y guarda los importes en una **copia** del Excel. El archivo original nunca se modifica.

## Para la usuaria (versión instalada)

1. Instalá `MercadoPagoScraper-Setup-<versión>.exe` (no pide permisos de administrador ni Node.js). Queda un acceso directo en el escritorio.
2. Abrí MercadoPagoScraper y presioná **Elegir Excel**.
3. Indicá **Desde la fila** y **Hasta la fila** y presioná **Iniciar**.
4. Se abre un Chrome propio de la app en Mercado Pago. **Iniciá sesión vos** (usuario, contraseña y la verificación que pida). La app no ve ni guarda credenciales.
5. Cuando veas tu Actividad, volvé a la app y presioná **Ya estoy lista**. El proceso no empieza solo.
6. Cada fila muestra su estado: Encontrada, No encontrada, Omitida o Error. Podés **Cancelar** en cualquier momento; lo obtenido se conserva.
7. Presioná **Guardar Excel** y elegí dónde guardar la copia con los resultados.

La sesión queda guardada en `%APPDATA%\MercadoPagoScraper\mp_session_puppeteer`, separada de tu Chrome personal, y sobrevive a actualizaciones. Para cerrarla, borrá esa carpeta con la app cerrada.

### Qué agrega al Excel

En la primera hoja, al final, agrega (o reutiliza si ya existen) las columnas `MP Estado`, `MP N° operación`, `MP Fecha`, `MP Cobro`, `MP Imp. Créditos y Débitos`, `MP Retenciones provinciales`, `MP Cargo Mercado Pago`, `MP Total` y `MP Medio de pago`. Un dato que el comprobante no informa queda vacío; un cero se escribe como 0.

La columna de números es la primera cuyo título contenga `REFERENCIA` u `OPERATION` (si no hay, la primera). Los números deben ser solo dígitos: si Excel los muestra en notación científica, formateá la columna como texto.

Se conservan las demás hojas, columnas, formatos y fórmulas. Si el archivo tiene gráficos, macros, tablas dinámicas u otras partes que la copia puede no conservar, la app lo avisa al abrirlo. Los `.xls` se guardan como `.xlsx` sin sus formatos.

## Tecnologías

| Tecnología | Uso |
|---|---|
| [Angular 21](https://angular.dev) + Angular Material | Interfaz (standalone, zoneless, signals) |
| [Electron 39](https://www.electronjs.org) | App de escritorio, proceso principal en Node |
| [Puppeteer 23](https://pptr.dev) + Chrome for Testing | Navegador controlado por la app |
| [ExcelJS](https://github.com/exceljs/exceljs) / [SheetJS](https://sheetjs.com) | Copia del Excel conservando formato / lectura de `.xls` |
| [electron-builder](https://www.electron.build) | Instalador NSIS y ejecutable portable |
| Karma + Jasmine, `node:test` | Tests de la UI y del proceso principal |

## Desarrollo

Requisitos: Windows, Node.js 20+ y npm.

```bash
git clone https://github.com/lionel1014/MercadoPagoScraper.git
cd MercadoPagoScraper
npm install
npm run electron
```

| Comando | Qué hace |
|---|---|
| `npm run electron` | Compila Angular y abre la app de escritorio. |
| `npm start` | Solo la interfaz en `http://localhost:4200` (sin Electron no puede procesar). |
| `npm run lint` | ESLint. |
| `npm run build:prod` | Compilación de producción de Angular. |
| `npm run test:ci` | Tests de Angular sin ventana (necesita Chrome o `CHROME_BIN`). |
| `npm run test:electron` | Tests del proceso principal: importes, Excel, validación IPC y el scraper contra un sitio de Mercado Pago **falso y local**. |
| `npm run validate` | Lint + build + tests de Angular + tests de Electron; corta en el primer error. |
| `npm run fetch-browser` | Descarga Chrome for Testing a `vendor/browser`. |
| `npm run dist` | Build + navegador + instaladores en `release/`. |

En desarrollo, si no corriste `fetch-browser`, Puppeteer usa su Chrome de caché.

### Validaciones automáticas (Husky)

`npm install` instala los hooks de `.husky/`:

- **pre-commit:** ESLint sobre los `.ts`/`.html` de `src/` del commit.
- **pre-push:** `npm run build:prod`; si no compila, se cancela el push.

## Estructura

```
electron/main.js            Proceso principal: ventana segura, IPC validado, diálogos, ciclo de vida
electron/preload.js         Puente window.mpScraper (contextBridge); no expone Node ni ipcRenderer
electron/scraper.js         Automatización con Puppeteer (confirmación manual, sesión, cancelación)
electron/mp-parser.js       Importes del JSON de detalle (__PRELOADED_STATE__)
electron/excel-file.js      Lectura del Excel y escritura de la copia con ExcelJS
electron/ipc-validation.js  Validación de los datos que llegan de la UI
electron/browser-path.js    Ubicación del Chrome empaquetado
electron/test/              Tests node:test y sitio falso de Mercado Pago
scripts/fetch-browser.js    Descarga Chrome for Testing para empaquetar
src/app/                    Interfaz Angular (componente, puente, interfaces)
```

### Seguridad

La ventana corre con `contextIsolation`, `sandbox` y sin `nodeIntegration`. Angular solo accede a las funciones de `window.mpScraper`. El proceso principal acepta mensajes únicamente de la interfaz local, valida cada dato y bloquea la navegación y las ventanas externas. La CSP de `index.html` solo permite recursos propios: las fuentes están incluidas en la app.

## Generar un instalador nuevo

1. Subí `version` en `package.json`.
2. Desde Windows: `npm run dist`.
3. En `release/` quedan `MercadoPagoScraper-Setup-<versión>.exe` (instalador) y `MercadoPagoScraper-Portable-<versión>.exe`.

Instalar una versión nueva encima conserva la sesión y los datos de `%APPDATA%\MercadoPagoScraper`. El instalador no está firmado: Windows SmartScreen puede pedir «Más información → Ejecutar de todas formas».

### Actualizar el navegador incluido

El Chrome empaquetado es el que corresponde a la versión de Puppeteer. Para recibir correcciones de seguridad:

1. `npm install puppeteer@latest` (dentro de la misma versión mayor, o revisá sus cambios).
2. `npm run test:electron`, para verificar el scraper con el Chrome nuevo.
3. `npm run dist`: `fetch-browser` reemplaza `vendor/browser` por la versión nueva.

## Variables de entorno (opcional)

`openai-analisis.js` es un script experimental aparte y la app no lo usa. Si lo querés probar, copiá `.env.example` a `.env` y completá `OPENAI_API_KEY`. Nunca subas el `.env` al repositorio.

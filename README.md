# Mercado Pago Scraper

Aplicación de escritorio que toma un archivo Excel con números de operación, consulta cada operación en la web de Mercado Pago usando la sesión del propio usuario y devuelve los resultados en una tabla exportable.

## Tecnologías

| Tecnología | Uso |
|---|---|
| [Angular 21](https://angular.dev) + Angular Material | Interfaz de usuario |
| [Electron 39](https://www.electronjs.org) | Empaqueta la interfaz como app de escritorio y ejecuta el proceso de Node |
| [Puppeteer 23](https://pptr.dev) | Controla un navegador Chrome para navegar Mercado Pago |
| [SheetJS (xlsx)](https://sheetjs.com) / [ExcelJS](https://github.com/exceljs/exceljs) | Lectura y generación de archivos Excel |
| TypeScript, RxJS | Lenguaje y manejo de eventos del front |
| Karma + Jasmine | Tests unitarios |

## Requisitos

- **Windows** (el script `npm run electron` usa la ruta de Electron de Windows).
- **Node.js 20 o superior** y **npm** — [descargar](https://nodejs.org).
- **Conexión a internet** (la primera instalación descarga Chrome para Puppeteer, ~150 MB).
- **Una cuenta de Mercado Pago** con acceso a la sección *Actividad* de las operaciones que se quieren consultar.
- **Un archivo Excel** (`.xlsx` / `.xls`) con una fila de encabezados y una columna con los números de operación. La app usa la columna cuyo encabezado contenga `REFERENCIA` u `OPERATION`; si no hay ninguna, toma la primera.

## Instalación

```bash
git clone https://github.com/lionel1014/MercadoPagoScraper.git
cd MercadoPagoScraper
npm install
```

`npm install` instala todas las dependencias y descarga el navegador que usa Puppeteer.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run electron` | Compila Angular y abre la app de escritorio. **Es el comando para usar el scraper.** |
| `npm start` | Levanta solo la interfaz en `http://localhost:4200` (sin Electron no se puede scrapear; sirve para trabajar en la UI). |
| `npm run build` | Compila Angular en `dist/mercadoPagoScreapper/`. |
| `npm run watch` | Compila en modo desarrollo y recompila al guardar. |
| `npm test` | Corre los tests unitarios. |

## Cómo usarlo

1. Ejecutá `npm run electron`.
2. En la app, cargá el archivo Excel. Vas a ver las filas en la tabla.
3. Iniciá el proceso. Se abre una ventana de Chrome en la página de Actividad de Mercado Pago.
4. **Iniciá sesión en Mercado Pago en esa ventana de Chrome**, con tu usuario y contraseña, y completá la verificación que te pida (código por SMS/mail, app, etc.). La app no guarda ni ve tus credenciales: el login lo hacés vos directamente en la web de Mercado Pago.
5. Cuando estés dentro y veas tu Actividad, volvé a la app y **confirmá que estás listo**. Tenés hasta 5 minutos; pasado ese tiempo el proceso arranca solo.
6. La app recorre las operaciones una por una y va marcando el estado de cada fila. No uses esa ventana de Chrome mientras trabaja.
7. Al terminar, exportá los resultados a Excel desde la app.

### Sobre la sesión

- La sesión de Mercado Pago queda guardada en la carpeta de datos de la app (`%APPDATA%\<app>\mp_session_puppeteer`), así que en las siguientes ejecuciones normalmente no hace falta volver a iniciar sesión.
- Para cerrar la sesión guardada, borrá esa carpeta.
- Si cerrás la ventana de Chrome durante el proceso, se cancela automáticamente.

## Estructura

```
electron.js          Proceso principal de Electron (ventana + comunicación con la UI)
scraper-handler.js   Lógica de navegación con Puppeteer
src/app/             Aplicación Angular (componente principal, servicios, interfaces)
docs/                Material de referencia
```

## Variables de entorno (opcional)

`openai-analisis.js` es un script experimental aparte y no lo necesita el scraper. Si lo querés probar, copiá `.env.example` a `.env` y completá `OPENAI_API_KEY`. Nunca subas el `.env` al repositorio (ya está en `.gitignore`).

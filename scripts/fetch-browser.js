// Descarga a vendor/browser el Chrome for Testing de Windows x64 que corresponde a la versión de Puppeteer.
// electron-builder lo copia a resources/browser (extraResources). Se ejecuta en la PC que arma el instalador.

const fs = require('fs');
const path = require('path');
const { Browser, BrowserPlatform, install, computeExecutablePath } = require('@puppeteer/browsers');
const { CHROME_BUILD_ID } = require('../electron/browser-path');

const cacheDir = path.join(__dirname, '..', 'vendor', 'browser');

(async () => {
    const opts = { browser: Browser.CHROME, buildId: CHROME_BUILD_ID, platform: BrowserPlatform.WIN64, cacheDir };
    const exe = computeExecutablePath(opts);
    if (fs.existsSync(exe)) {
        console.log(`Chrome ${CHROME_BUILD_ID} ya está en ${exe}`);
        return;
    }
    // Versiones viejas no se empaquetan: solo queda la que usa Puppeteer.
    fs.rmSync(cacheDir, { recursive: true, force: true });
    console.log(`Descargando Chrome for Testing ${CHROME_BUILD_ID} (win64)...`);
    await install(opts);
    if (!fs.existsSync(exe)) throw new Error(`No quedó el ejecutable en ${exe}`);
    console.log(`Listo: ${exe}`);
})().catch(err => {
    console.error(err.message);
    process.exit(1);
});

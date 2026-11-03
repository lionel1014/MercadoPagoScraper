// Ubica el Chrome for Testing que se distribuye con la app (lo descarga scripts/fetch-browser.js).

const fs = require('fs');
const path = require('path');
const { Browser, computeExecutablePath } = require('@puppeteer/browsers');
const { PUPPETEER_REVISIONS } = require('puppeteer-core/internal/revisions.js');

// Versión de Chrome probada con la versión instalada de Puppeteer.
const CHROME_BUILD_ID = PUPPETEER_REVISIONS.chrome;

function bundledBrowserDir({ isPackaged, resourcesPath, appRoot }) {
    // Empaquetada: fuera de app.asar, en resources/browser (extraResources).
    return isPackaged ? path.join(resourcesPath, 'browser') : path.join(appRoot, 'vendor', 'browser');
}

function resolveBrowserPath(opts, exists = fs.existsSync) {
    const executablePath = computeExecutablePath({
        browser: Browser.CHROME,
        buildId: CHROME_BUILD_ID,
        cacheDir: bundledBrowserDir(opts),
    });
    if (exists(executablePath)) return executablePath;
    if (opts.isPackaged) {
        throw new Error('No se encontró el navegador incluido en la instalación. Reinstalá MercadoPagoScraper.');
    }
    return null; // Desarrollo sin `npm run fetch-browser`: Puppeteer usa su Chrome de caché.
}

module.exports = { resolveBrowserPath, bundledBrowserDir, CHROME_BUILD_ID };

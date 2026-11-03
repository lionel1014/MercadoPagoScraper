// Proceso principal de Electron: ventana segura, IPC validado, Excel y scraper.

const { app, BrowserWindow, Menu, dialog, ipcMain, session } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { Scraper } = require('./scraper');
const excel = require('./excel-file');
const { validateStartPayload } = require('./ipc-validation');
const { resolveBrowserPath } = require('./browser-path');

// Solo en desarrollo: las pruebas e2e redirigen perfil y sitio. La app instalada ignora estas variables.
const testEnv = name => (app.isPackaged ? undefined : process.env[name]);

// Ruta fija en %APPDATA%\MercadoPagoScraper: el perfil y la sesión sobreviven a actualizaciones y reinstalaciones.
app.setPath('userData', testEnv('MPS_USER_DATA_DIR') || path.join(app.getPath('appData'), 'MercadoPagoScraper'));

if (!app.requestSingleInstanceLock()) {
    app.quit(); // una sola instancia: dos procesos no pueden compartir el perfil del navegador
}

const INDEX_FILE = path.join(__dirname, '..', 'dist', 'mercadoPagoScreapper', 'browser', 'index.html');
const INDEX_URL = pathToFileURL(INDEX_FILE).href;
// El router de Angular (base href "./") muestra la carpeta en lugar de index.html.
const APP_URLS = new Set([INDEX_URL, pathToFileURL(path.dirname(INDEX_FILE) + path.sep).href]);

let win = null;
let scraper = null;
let workbookPath = null;
let results = new Map(); // fila → datos para escribir en la copia
let unsaved = false;

function createWindow() {
    win = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 900,
        minHeight: 600,
        title: 'MercadoPagoScraper',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            devTools: !app.isPackaged,
        },
    });
    win.once('ready-to-show', () => win.show());
    win.loadFile(INDEX_FILE).catch(() => {
        dialog.showErrorBox('MercadoPagoScraper', 'No se encontró la interfaz. En desarrollo, ejecutá: npm run build');
    });

    win.on('close', event => {
        const running = scraper?.running;
        if (!running && !unsaved) return;
        const choice = dialog.showMessageBoxSync(win, {
            type: 'warning',
            buttons: ['Salir sin guardar', 'Volver'],
            defaultId: 1,
            cancelId: 1,
            title: 'MercadoPagoScraper',
            message: running ? 'Hay un proceso en curso.' : 'Hay resultados sin guardar.',
            detail: 'Si salís ahora, los resultados que no guardaste se pierden. El Excel original no se modifica.',
        });
        if (choice === 1) event.preventDefault();
    });
    win.on('closed', () => {
        win = null;
    });
}

function send(evt) {
    if (evt.type === 'item' && evt.status !== 'processing') {
        const estado = { found: 'Encontrada', 'not-found': 'No encontrada', error: `Error: ${evt.message}` }[evt.status];
        for (const row of evt.rows) results.set(row, { estado, ...(evt.data || {}) });
        unsaved = true;
    }
    win?.webContents.send('scraper:event', evt);
}

// Solo se aceptan mensajes de la interfaz propia cargada desde el build local.
function assertTrustedSender(event) {
    const frame = event.senderFrame;
    // WebFrameMain no conserva identidad entre llamadas: se exige el frame superior (sin padre) de la ventana propia.
    if (!win || event.sender !== win.webContents || !frame || frame.parent !== null || !APP_URLS.has(frame.url.split(/[?#]/)[0])) {
        throw new Error('Remitente IPC no autorizado.');
    }
}

function handle(channel, fn) {
    ipcMain.handle(channel, async (event, ...args) => {
        assertTrustedSender(event);
        try {
            return { ok: true, ...(await fn(...args)) };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    });
}

function registerIpc() {
    handle('excel:open', async () => {
        if (scraper?.running) throw new Error('Esperá a que termine el proceso actual.');
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            title: 'Elegí el Excel con los números de operación',
            properties: ['openFile'],
            filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm', 'xls'] }],
        });
        if (canceled || !filePaths[0]) return { canceled: true };
        const data = await excel.readWorkbook(filePaths[0]);
        workbookPath = filePaths[0];
        results = new Map();
        unsaved = false;
        return { canceled: false, ...data };
    });

    handle('scraper:start', async payload => {
        const items = validateStartPayload(payload);
        if (!workbookPath) throw new Error('Primero elegí un Excel.');
        if (scraper?.running) throw new Error('Ya hay un proceso en curso.');
        for (const { row } of items) results.delete(row);

        scraper = new Scraper({
            executablePath: resolveBrowserPath({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath, appRoot: app.getAppPath() }),
            userDataDir: path.join(app.getPath('userData'), 'mp_session_puppeteer'),
            activitiesUrl: testEnv('MPS_ACTIVITIES_URL'),
            headless: testEnv('MPS_HEADLESS') === '1',
            emit: send,
        });
        scraper.run(items).catch(err => send({ type: 'error', message: err.message }));
        return {};
    });

    handle('scraper:confirm', async () => {
        scraper?.confirm();
        return {};
    });

    handle('scraper:cancel', async () => {
        scraper?.cancel();
        return {};
    });

    handle('excel:save', async () => {
        if (!workbookPath) throw new Error('Primero elegí un Excel.');
        if (scraper?.running) throw new Error('Esperá a que termine o cancelá el proceso antes de guardar.');
        if (results.size === 0) throw new Error('Todavía no hay resultados para guardar.');
        const { canceled, filePath } = await dialog.showSaveDialog(win, {
            title: 'Guardar Excel con resultados',
            defaultPath: excel.defaultOutputPath(workbookPath),
            filters: [{ name: 'Excel', extensions: ['xlsx'] }],
        });
        if (canceled || !filePath) return { canceled: true };
        await excel.writeResults(workbookPath, filePath, results);
        unsaved = false;
        return { canceled: false, path: filePath };
    });
}

function hardenContents() {
    app.on('web-contents-created', (_event, contents) => {
        contents.on('will-navigate', (event, url) => {
            if (url !== INDEX_URL) event.preventDefault();
        });
        contents.on('will-redirect', event => event.preventDefault());
        contents.on('will-attach-webview', event => event.preventDefault());
        contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    });
}

hardenContents();

app.on('second-instance', () => {
    if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
    }
});

app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    if (app.isPackaged) Menu.setApplicationMenu(null);
    registerIpc();
    createWindow();
});

app.on('window-all-closed', () => {
    if (scraper?.running) scraper.cancel();
    Promise.resolve(scraper?.close()).finally(() => app.quit());
});

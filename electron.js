const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const scraperHandler = require('./scraper-handler');

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        }
    });

    // Intenta cargar el archivo build de Angular
    const buildPath = path.join(__dirname, 'dist/mercadoPagoScreapper/browser/index.html');

    if (fs.existsSync(buildPath)) {
        win.loadFile(buildPath);
    } else {
        console.error('Build no encontrado en:', buildPath);
        console.log('Por favor, ejecuta: npm run build');
        // Carga una página en blanco si el build no existe
        win.loadURL('data:text/html,<h1>Error: Build no encontrado</h1>');
    }

    // Abre las herramientas de desarrollador (opcional, para debug)
    // win.webContents.openDevTools();
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

ipcMain.on('start-scraping', (event, { authIds, showBrowser }) => {
    console.log('=== IPC RECIBIDO ===');
    console.log('AuthIds:', authIds);
    console.log('ShowBrowser:', showBrowser);
    
    if (!authIds || authIds.length === 0) {
        console.error('Error: No se recibieron authIds');
        event.reply('scraping-error', { message: 'No se recibieron IDs para procesar' });
        return;
    }
    
    scraperHandler.scrape(authIds, showBrowser, event).catch(err => {
        console.error('Error en scraperHandler.scrape:', err);
        event.reply('scraping-error', { message: err.message || 'Error desconocido' });
    });
});

ipcMain.on('user-confirmed', (event, data) => {
    console.log('Usuario confirmó que está listo:', data);
    // El handler en scraper-handler.js escuchará este evento
});

ipcMain.on('cancel-scraping', (event, data) => {
    console.log('Usuario canceló el scraping:', data);
    // El handler en scraper-handler.js escuchará este evento
});

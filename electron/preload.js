// Puente mínimo entre Angular y el proceso principal. No expone Node, require ni ipcRenderer.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mpScraper', Object.freeze({
    openExcel: () => ipcRenderer.invoke('excel:open'),
    start: items => ipcRenderer.invoke('scraper:start', { items }),
    confirmReady: () => ipcRenderer.invoke('scraper:confirm'),
    cancel: () => ipcRenderer.invoke('scraper:cancel'),
    saveResults: () => ipcRenderer.invoke('excel:save'),
    onEvent: callback => {
        const listener = (_event, evt) => callback(evt);
        ipcRenderer.on('scraper:event', listener);
        return () => ipcRenderer.removeListener('scraper:event', listener);
    },
}));

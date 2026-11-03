const puppeteer = require('puppeteer');
const path = require('path');
const { app, ipcMain } = require('electron');

class ScraperHandler {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isCancelled = false;
    }

    async scrape(authIds, showBrowser, event) {
        try {
            this.isCancelled = false; // Reset cancellation flag
            console.log('=== SCRAPER INICIADO ===');
            console.log('AuthIds recibidos:', authIds);
            console.log('ShowBrowser:', showBrowser);
            
            event.reply('scraping-progress', { message: 'Iniciando navegador con Puppeteer...' });
            
            const userDataDir = path.join(app.getPath('userData'), 'mp_session_puppeteer');
            console.log('UserDataDir:', userDataDir);

            this.browser = await puppeteer.launch({
                headless: false, // Siempre visible para que el usuario pueda autenticarse
                userDataDir: userDataDir, // Mantener sesión entre ejecuciones
                args: [
                    '--start-maximized',
                    '--disable-blink-features=AutomationControlled' // Evitar detección de bot
                ],
                defaultViewport: null
            });

            console.log('Navegador iniciado correctamente');
            
            // Detectar cuando el navegador se cierra
            this.browser.on('disconnected', () => {
                console.log('=== NAVEGADOR CERRADO POR EL USUARIO ===');
                if (!this.isCancelled) {
                    this.isCancelled = true;
                    event.reply('browser-closed', { message: 'El navegador fue cerrado. Proceso cancelado automáticamente.' });
                }
            });
            
            this.page = (await this.browser.pages())[0] || await this.browser.newPage();
            console.log('Página obtenida');

            event.reply('scraping-progress', { message: 'Navegando a Actividades...' });
            console.log('Navegando a MercadoPago...');

            await this.page.goto('https://www.mercadopago.com.ar/activities/1', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            console.log('Página cargada. URL actual:', this.page.url());
            event.reply('scraping-progress', { message: 'Página cargada. Esperando confirmación del usuario...' });
            event.reply('waiting-for-confirmation', { message: 'Por favor, autentícate en el navegador si es necesario y confirma cuando estés listo.' });
            
            // Esperar confirmación del usuario en lugar de esperar tiempo fijo
            await new Promise((resolve, reject) => {
                let resolved = false;
                
                // Timeout de seguridad (5 minutos máximo)
                const timeout = setTimeout(() => {
                    if (!resolved) {
                        console.log('Timeout: continuando sin confirmación del usuario');
                        resolved = true;
                        resolve();
                    }
                }, 300000);
                
                // Escuchar el evento de confirmación
                const confirmHandler = (confirmedEvent, data) => {
                    if (!resolved && data && data.confirmed) {
                        clearTimeout(timeout);
                        resolved = true;
                        ipcMain.removeListener('user-confirmed', confirmHandler);
                        ipcMain.removeListener('cancel-scraping', cancelHandler);
                        resolve();
                    }
                };
                
                // Escuchar el evento de cancelación
                const cancelHandler = (cancelEvent, data) => {
                    if (!resolved && data && data.cancelled) {
                        clearTimeout(timeout);
                        resolved = true;
                        this.isCancelled = true;
                        ipcMain.removeListener('user-confirmed', confirmHandler);
                        ipcMain.removeListener('cancel-scraping', cancelHandler);
                        reject(new Error('Scraping cancelado por el usuario'));
                    }
                };
                
                ipcMain.once('user-confirmed', confirmHandler);
                ipcMain.once('cancel-scraping', cancelHandler);
            });

            // Verificar que estamos en la página correcta
            const currentUrl = this.page.url();
            console.log('URL después de esperar:', currentUrl);
            
            if (!currentUrl.includes('mercadopago.com.ar/activities')) {
                event.reply('scraping-progress', { message: 'Redirigiendo a Actividades...' });
                await this.page.goto('https://www.mercadopago.com.ar/activities/1', {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });
            }

            event.reply('scraping-progress', { message: `Iniciando búsqueda de ${authIds.length} operaciones...` });
            console.log('Iniciando búsqueda de operaciones...');

            const results = [];

            // Procesar TODAS las filas
            for (let i = 0; i < authIds.length; i++) {
                // Verificar si fue cancelado antes de procesar cada elemento
                if (this.isCancelled) {
                    console.log('Proceso cancelado, deteniendo búsqueda...');
                    break;
                }
                
                const authId = authIds[i];
                if (!authId) {
                    console.log(`Fila ${i + 1}: Sin número de autorización, saltando...`);
                    continue;
                }

                event.reply('scraping-progress', { message: `[${i + 1}/${authIds.length}] Buscando operación: ${authId}` });

                try {
                    const data = await this.searchAndExtract(authId);
                    
                    // Verificar nuevamente después de la búsqueda
                    if (this.isCancelled) {
                        console.log('Proceso cancelado durante la búsqueda...');
                        break;
                    }
                    
                    if (data) {
                        results.push(data);
                        console.log(`Fila ${i + 1}: Datos extraídos correctamente`);
                        event.reply('scraping-progress', { message: `[${i + 1}/${authIds.length}] ✓ Encontrado: ${authId}`, success: true });
                    } else {
                        console.log(`Fila ${i + 1}: No se encontró la operación`);
                        event.reply('scraping-progress', { message: `[${i + 1}/${authIds.length}] ✗ No encontrado: ${authId}`, success: false });
                    }
                } catch (err) {
                    // Si el error es porque el navegador se cerró, no es un error real
                    if (this.isCancelled || err.message.includes('Target closed') || err.message.includes('Session closed')) {
                        console.log('Navegador cerrado durante el procesamiento');
                        break;
                    }
                    console.error(`Fila ${i + 1}: Error procesando ${authId}:`, err);
                    event.reply('scraping-progress', { message: `[${i + 1}/${authIds.length}] Error en ${authId}: ${err.message}`, success: false });
                }
            }

            console.log('=== SCRAPING COMPLETADO ===');
            console.log('Resultados:', results.length);
            event.reply('scraping-complete', { results });

        } catch (error) {
            console.error('=== ERROR GENERAL EN SCRAPING ===');
            console.error('Error:', error);
            
            // Verificar si el error es porque el navegador se cerró
            const isBrowserClosed = error.message.includes('Target closed') || 
                                   error.message.includes('Session closed') || 
                                   error.message.includes('Connection closed') ||
                                   this.isCancelled;
            
            if (isBrowserClosed || this.isCancelled) {
                event.reply('scraping-cancelled', { message: 'Proceso cancelado. El navegador fue cerrado.' });
            } else {
                event.reply('scraping-error', { message: error.message });
            }
        } finally {
            // Si el navegador aún existe y fue cancelado, intentar cerrarlo
            if (this.isCancelled && this.browser) {
                try {
                    console.log('Cerrando navegador debido a cancelación...');
                    await this.browser.close();
                } catch (err) {
                    console.log('Navegador ya estaba cerrado');
                }
                this.browser = null;
                this.page = null;
            } else if (this.browser && !this.isCancelled) {
                // No cerramos el navegador para mantener la sesión y que el usuario pueda verlo
                console.log('Scraper finalizado (navegador permanece abierto)');
            }
        }
    }

    async searchAndExtract(authId) {
        // Verificar si el navegador está cerrado antes de continuar
        if (this.isCancelled || !this.browser || !this.page) {
            throw new Error('Navegador cerrado');
        }
        
        console.log('--- Iniciando búsqueda de:', authId);
        
        // Esperar y encontrar el campo de búsqueda
        console.log('Esperando campo de búsqueda...');
        try {
            await this.page.waitForSelector("input[placeholder='Buscar']", { timeout: 10000 });
        } catch (err) {
            if (this.isCancelled || err.message.includes('Target closed') || err.message.includes('Session closed')) {
                throw new Error('Navegador cerrado');
            }
            throw err;
        }
        console.log('Campo de búsqueda encontrado');

        // Verificar nuevamente antes de continuar
        if (this.isCancelled || !this.browser || !this.page) {
            throw new Error('Navegador cerrado');
        }

        const inputBuscar = await this.page.$("input[placeholder='Buscar']");
        if (!inputBuscar) {
            throw new Error('No se encontró el campo de búsqueda');
        }

        // Limpiar el campo y escribir el authId
        console.log('Escribiendo en campo de búsqueda:', authId);
        try {
            await inputBuscar.click({ clickCount: 3 }); // Seleccionar todo el texto
            await inputBuscar.type(authId, { delay: 100 }); // Escribir con delay para simular humano
            await this.page.keyboard.press('Enter');
        } catch (err) {
            if (this.isCancelled || err.message.includes('Target closed') || err.message.includes('Session closed')) {
                throw new Error('Navegador cerrado');
            }
            throw err;
        }
        console.log('Enter presionado, esperando resultados...');

        // Esperar a que carguen los resultados (reducido de 3s a 1.5s)
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Verificar nuevamente antes de buscar resultados
        if (this.isCancelled || !this.browser || !this.page) {
            throw new Error('Navegador cerrado');
        }

        // Buscar los enlaces de resultados
        console.log('Buscando resultados...');
        let allListItems;
        try {
            allListItems = await this.page.$$("a[href*='/activities/detail/']");
        } catch (err) {
            if (this.isCancelled || err.message.includes('Target closed') || err.message.includes('Session closed')) {
                throw new Error('Navegador cerrado');
            }
            throw err;
        }
        console.log('Resultados encontrados:', allListItems.length);

        if (allListItems.length > 0) {
            console.log('Haciendo clic en el primer resultado...');
            try {
                await allListItems[0].click();
                
            // Esperar a que cargue la página de detalle (reducido de 3s a 1.5s)
            await new Promise(resolve => setTimeout(resolve, 1500));
            await this.page.waitForSelector('#__PRELOADED_STATE__', { timeout: 8000 });
            } catch (err) {
                if (this.isCancelled || err.message.includes('Target closed') || err.message.includes('Session closed')) {
                    throw new Error('Navegador cerrado');
                }
                throw err;
            }
            console.log('Página de detalle cargada');

            // Verificar nuevamente antes de extraer JSON
            if (this.isCancelled || !this.browser || !this.page) {
                throw new Error('Navegador cerrado');
            }

            // Extraer el JSON
            let jsonText;
            try {
                jsonText = await this.page.evaluate(() => {
                    const script = document.querySelector('#__PRELOADED_STATE__');
                    return script ? script.textContent : null;
                });
            } catch (err) {
                if (this.isCancelled || err.message.includes('Target closed') || err.message.includes('Session closed')) {
                    throw new Error('Navegador cerrado');
                }
                throw err;
            }
            
            console.log('JSON extraído, longitud:', jsonText?.length || 0);
            const data = this.parseJsonData(jsonText);

            // Verificar nuevamente antes de volver atrás
            if (this.isCancelled || !this.browser || !this.page) {
                throw new Error('Navegador cerrado');
            }

            // Volver atrás
            console.log('Volviendo a la página anterior...');
            try {
                await this.page.goBack();
                // Esperar a que la página cargue, pero con timeout más corto y estrategia más flexible
                try {
                    await this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 2000 });
                } catch (navErr) {
                    // Si falla waitForNavigation, esperar un poco y verificar que estamos en la página correcta
                    console.log('waitForNavigation timeout, esperando manualmente...');
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
                
                // Esperar un poco más para que la página se estabilice (reducido de 2s a 1s)
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Re-esperar el campo de búsqueda con timeout más corto
                try {
                    await this.page.waitForSelector("input[placeholder='Buscar']", { timeout: 2000 });
                } catch (selectorErr) {
                    // Si no encuentra el selector, intentar navegar de nuevo a activities
                    console.log('Campo de búsqueda no encontrado, navegando a activities...');
                    await this.page.goto('https://www.mercadopago.com.ar/activities/1', {
                        waitUntil: 'domcontentloaded',
                        timeout: 20000
                    });
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    await this.page.waitForSelector("input[placeholder='Buscar']", { timeout: 2000 });
                }
            } catch (err) {
                if (this.isCancelled || err.message.includes('Target closed') || err.message.includes('Session closed')) {
                    throw new Error('Navegador cerrado');
                }
                // Si hay un error, intentar navegar de nuevo a activities
                console.log('Error al volver, navegando a activities...');
                try {
                    await this.page.goto('https://www.mercadopago.com.ar/activities/1', {
                        waitUntil: 'domcontentloaded',
                        timeout: 20000
                    });
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    await this.page.waitForSelector("input[placeholder='Buscar']", { timeout: 2000 });
                } catch (recoverErr) {
                    throw new Error(`Error al recuperar: ${recoverErr.message}`);
                }
            }
            console.log('Listo para siguiente búsqueda');

            if (data) {
                data.authId = authId;
            }
            return data;
        } else {
            console.log('No se encontraron resultados');
            // Limpiar búsqueda solo si el navegador sigue abierto
            if (!this.isCancelled && this.browser && this.page) {
                try {
                    await inputBuscar.click({ clickCount: 3 });
                    await inputBuscar.type('');
                } catch (err) {
                    // Ignorar errores al limpiar si el navegador se cerró
                }
            }
            return null;
        }
    }

    parseJsonData(jsonText) {
        if (!jsonText) {
            console.log('JSON vacío o nulo');
            return null;
        }

        try {
            const doc = JSON.parse(jsonText);
            const detail = doc.pageState?.detailData;

            if (!detail) {
                console.log('No se encontró detailData en el JSON');
                return null;
            }

            const result = {
                OperationId: detail.operationId,
                DateIso: detail.date,
                Cobro: 0,
                ImpuestoCreditosDebitos: 0,
                ImpuestoProvincial: 0,
                CargoMp: 0,
                Total: 0,
                MedioPago: ''
            };

            if (Array.isArray(detail.sections)) {
                for (const sectionArray of detail.sections) {
                    if (!Array.isArray(sectionArray)) continue;

                    for (const section of sectionArray) {
                        if (section.id === 'ticket-v2' && section.data) {
                            this.extractTicketData(section.data, result);
                        }
                        if (section.id === 'payment-v2' && section.data) {
                            this.extractPaymentData(section.data, result);
                        }
                    }
                }
            }

            console.log('Datos parseados:', result);
            return result;
        } catch (e) {
            console.error("Error parsing JSON:", e);
            return null;
        }
    }

    extractTicketData(ticketData, result) {
        const items = ticketData.items;
        if (!items) return;

        // Cobro
        if (items.main?.elements?.[0]) {
            result.Cobro = this.getAmountFromElement(items.main.elements[0]);
        }

        // Impuestos
        if (items.withholdings?.elements) {
            for (const wh of items.withholdings.elements) {
                const titulo = wh.title;
                const monto = this.getAmountFromElement(wh);

                if (titulo === "Impuesto sobre los Créditos y Débitos") {
                    result.ImpuestoCreditosDebitos = monto;
                } else {
                    result.ImpuestoProvincial = monto;
                }
            }
        }

        // Cargo MP
        if (items.charges_mp?.elements?.[0]) {
            result.CargoMp = this.getAmountFromElement(items.charges_mp.elements[0]);
        }

        // Total
        if (ticketData.total?.amount) {
            result.Total = this.getAmountFromAmountObject(ticketData.total.amount);
        }
    }

    extractPaymentData(payData, result) {
        if (payData.items?.[0]?.payments?.[0]) {
            result.MedioPago = payData.items[0].payments[0].title;
        }
    }

    getAmountFromElement(element) {
        if (element.amount) {
            return this.getAmountFromAmountObject(element.amount);
        }
        return 0;
    }

    getAmountFromAmountObject(amount) {
        if (amount.fraction !== undefined && amount.cents !== undefined) {
            const fraction = parseFloat(amount.fraction);
            const cents = parseFloat(amount.cents);

            if (fraction < 0) {
                return fraction - (cents / 100);
            } else {
                return fraction + (cents / 100);
            }
        }
        return 0;
    }
}

module.exports = new ScraperHandler();

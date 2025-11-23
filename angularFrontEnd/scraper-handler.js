const { chromium } = require('playwright');
const path = require('path');
const { app } = require('electron');

class ScraperHandler {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
    }

    async scrape(authIds, showBrowser, event) {
        try {
            const userDataDir = path.join(app.getPath('userData'), 'mp_session');

            this.context = await chromium.launchPersistentContext(userDataDir, {
                headless: !showBrowser,
                args: ['--start-maximized'],
                viewport: null
            });

            this.page = this.context.pages()[0] || await this.context.newPage();

            event.reply('scraping-progress', { message: 'Navegando a Actividades...' });

            await this.page.goto('https://www.mercadopago.com.ar/activities/1', {
                waitUntil: 'domcontentloaded'
            });

            const results = [];

            for (const authId of authIds) {
                if (!authId) continue;

                event.reply('scraping-progress', { message: `Buscando operación: ${authId}` });

                try {
                    const data = await this.searchAndExtract(authId);
                    if (data) {
                        results.push(data);
                        event.reply('scraping-progress', { message: `Encontrado: ${authId}`, success: true });
                    } else {
                        event.reply('scraping-progress', { message: `No encontrado: ${authId}`, success: false });
                    }
                } catch (err) {
                    console.error(`Error procesando ${authId}:`, err);
                    event.reply('scraping-progress', { message: `Error en ${authId}: ${err.message}`, success: false });
                }
            }

            event.reply('scraping-complete', { results });

        } catch (error) {
            console.error('Error general en scraping:', error);
            event.reply('scraping-error', { message: error.message });
        } finally {
            if (this.context) {
                // No cerramos el contexto para mantener la sesión, pero podríamos cerrar la página si quisiéramos
                // await this.context.close(); 
                // Si el usuario quiere ver el browser, quizás no deberíamos cerrarlo inmediatamente o preguntar.
                // Por ahora, cerramos si no es persistente o lo dejamos abierto?
                // El requerimiento no especifica, pero para un proceso batch usualmente se cierra o se deja listo.
                // Vamos a dejarlo abierto si showBrowser es true, o cerrarlo si es false?
                // Mejor cerramos para liberar recursos, a menos que queramos debug.
                // Pero si usamos userDataDir, la sesión persiste.
                if (!showBrowser) {
                    await this.context.close();
                }
            }
        }
    }

    async searchAndExtract(authId) {
        const inputBuscar = this.page.locator("input[placeholder='Buscar']");
        await inputBuscar.waitFor();

        await inputBuscar.fill(authId);
        await inputBuscar.press('Enter');

        await this.page.waitForTimeout(2000);

        const allListItems = this.page.locator("a[href*='/activities/detail/']");
        const count = await allListItems.count();

        if (count > 0) {
            await allListItems.first().click();
            await this.page.waitForTimeout(3000);

            const jsonText = await this.page.textContent("#__PRELOADED_STATE__");
            const data = this.parseJsonData(jsonText);

            await this.page.goBack();
            await this.page.waitForLoadState('domcontentloaded');
            await this.page.waitForTimeout(2000);

            // Re-wait for input
            await this.page.locator("input[placeholder='Buscar']").waitFor();

            if (data) {
                data.authId = authId;
            }
            return data;
        } else {
            // Limpiar búsqueda
            await inputBuscar.fill("");
            return null;
        }
    }

    parseJsonData(jsonText) {
        if (!jsonText) return null;

        try {
            const doc = JSON.parse(jsonText);
            const detail = doc.pageState?.detailData;

            if (!detail) return null;

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

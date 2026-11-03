// Automatización de Mercado Pago con Puppeteer. Corre solo en el proceso principal.
// La usuaria inicia sesión a mano en un Chrome propio de la app; nunca se automatizan credenciales.

const puppeteer = require('puppeteer');
const { parseDetail } = require('./mp-parser');

const ACTIVITIES_URL = 'https://www.mercadopago.com.ar/activities/1';
const SEARCH_INPUT = "input[placeholder='Buscar']";
const RESULT_LINK = "a[href*='/activities/detail/']";
const STATE_SCRIPT = '#__PRELOADED_STATE__';

const READY_MESSAGE = 'Se abrió el navegador de Mercado Pago. Iniciá sesión si es necesario. Cuando puedas acceder a tus operaciones, regresá a MercadoPagoScraper y presioná «Ya estoy lista».';
const NOT_READY_MESSAGE = 'Todavía no se puede acceder a la sección Actividad de Mercado Pago. Verificá que hayas iniciado sesión en el navegador y presioná «Ya estoy lista» de nuevo.';
const SESSION_LOST_MESSAGE = 'La sesión de Mercado Pago se cerró o venció. Volvé a iniciar sesión en el navegador y presioná «Ya estoy lista» para continuar.';

class CancelledError extends Error {}

const isBrowserGone = err => /Target closed|Session closed|Connection closed|detached|Navigating frame was detached|Protocol error/i.test(err?.message || '');

function friendlyError(err) {
    const msg = err?.message || '';
    if (/already running for/i.test(msg)) return 'Ya hay una ventana del navegador de MercadoPagoScraper abierta. Cerrala y volvé a intentar.';
    if (/Could not find Chrome|Failed to launch|spawn .* ENOENT/i.test(msg)) return 'No se pudo abrir el navegador. Reinstalá MercadoPagoScraper.';
    if (/net::ERR_INTERNET_DISCONNECTED|net::ERR_NAME_NOT_RESOLVED|net::ERR_CONNECTION/i.test(msg)) return 'Sin conexión a internet o Mercado Pago no responde.';
    if (/timeout/i.test(msg)) return 'Mercado Pago tardó demasiado en responder.';
    return msg || 'Error desconocido.';
}

class Scraper {
    /**
     * @param {{ executablePath: string|null, userDataDir: string, emit: (evt: object) => void,
     *           activitiesUrl?: string, headless?: boolean }} opts
     */
    constructor(opts) {
        this.opts = { activitiesUrl: ACTIVITIES_URL, headless: false, ...opts };
        this.browser = null;
        this.page = null;
        this.running = false;
        this.cancelled = false;
        this.waiter = null;
        this.killOnExit = () => this.browser?.process()?.kill();
    }

    emit(evt) {
        this.opts.emit(evt);
    }

    /** @param {{ row: number, id: string }[]} items ya validados */
    async run(items) {
        if (this.running) throw new Error('Ya hay un proceso en curso.');
        this.running = true;
        this.cancelled = false;

        // Un número repetido se busca una sola vez y se aplica a todas sus filas.
        const groups = new Map();
        for (const { row, id } of items) groups.set(id, [...(groups.get(id) || []), row]);

        try {
            this.emit({ type: 'status', message: 'Abriendo el navegador...' });
            await this.launch();
            await this.waitUntilSessionReady(READY_MESSAGE);

            let n = 0;
            for (const [id, rows] of groups) {
                this.checkCancelled();
                n++;
                const dup = rows.length > 1 ? ` (número repetido en las filas ${rows.join(', ')})` : '';
                this.emit({ type: 'item', rows, status: 'processing', message: `Buscando ${n} de ${groups.size}...` });
                try {
                    const r = await this.withRetry(() => this.lookup(id));
                    if (r.data) this.emit({ type: 'item', rows, status: 'found', message: `Encontrada${dup}`, data: r.data });
                    else if (r.mismatch) this.emit({ type: 'item', rows, status: 'error', message: 'El comprobante abierto no coincide con el número buscado; revisalo a mano.' });
                    else this.emit({ type: 'item', rows, status: 'not-found', message: `No se encontró en Mercado Pago${dup}` });
                } catch (err) {
                    if (err instanceof CancelledError || this.cancelled || isBrowserGone(err)) throw err;
                    console.error(`Operación ${id}: ${err.message}`);
                    this.emit({ type: 'item', rows, status: 'error', message: friendlyError(err) });
                }
            }
            this.emit({ type: 'done', message: `Proceso terminado: ${groups.size} números consultados.` });
        } catch (err) {
            if (err instanceof CancelledError || this.cancelled || isBrowserGone(err)) {
                this.emit({ type: 'cancelled', message: this.browserClosed ? 'Se cerró el navegador. El proceso se detuvo; los resultados obtenidos se conservan.' : 'Proceso cancelado. Los resultados obtenidos se conservan.' });
            } else {
                console.error('Error general del scraper:', err.message);
                this.emit({ type: 'error', message: friendlyError(err) });
            }
        } finally {
            await this.close();
            this.running = false;
        }
    }

    confirm() {
        this.waiter?.resolve();
    }

    cancel() {
        this.cancelled = true;
        this.waiter?.reject(new CancelledError());
        this.close(); // corta esperas en curso sin aguardar a sus timeouts
    }

    checkCancelled() {
        if (this.cancelled) throw new CancelledError();
    }

    async launch() {
        this.browserClosed = false;
        this.browser = await puppeteer.launch({
            executablePath: this.opts.executablePath || undefined,
            headless: this.opts.headless,
            userDataDir: this.opts.userDataDir,
            defaultViewport: null,
            args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
        });
        process.once('exit', this.killOnExit);
        this.browser.on('disconnected', () => {
            if (!this.closing) {
                this.browserClosed = true;
                this.cancel();
            }
        });
        this.page = (await this.browser.pages())[0] || (await this.browser.newPage());
    }

    async close() {
        process.removeListener('exit', this.killOnExit);
        const browser = this.browser;
        this.browser = null;
        this.page = null;
        this.waiter = null;
        if (!browser) return;
        this.closing = true;
        try {
            await Promise.race([browser.close(), new Promise((_, rej) => setTimeout(() => rej(new Error('close timeout')), 5000))]);
        } catch {
            browser.process()?.kill(); // evita un Chrome huérfano que bloquee el perfil
        } finally {
            this.closing = false;
        }
    }

    // Espera obligatoriamente «Ya estoy lista». No hay inicio automático por tiempo.
    // El aviso se emite después de registrar la espera, para no perder una confirmación inmediata.
    waitForConfirmation(message) {
        this.checkCancelled();
        const confirmed = new Promise((resolve, reject) => {
            this.waiter = { resolve, reject };
        }).finally(() => {
            this.waiter = null;
        });
        this.emit({ type: 'waiting-confirmation', message });
        return confirmed;
    }

    async waitUntilSessionReady(message) {
        await this.gotoActivities().catch(() => {}); // puede redirigir al login: la usuaria lo resuelve
        for (;;) {
            await this.waitForConfirmation(message);
            this.emit({ type: 'status', message: 'Verificando acceso a Actividad...' });
            if (await this.isSessionReady()) {
                this.emit({ type: 'status', message: 'Acceso verificado. Comenzando la búsqueda.' });
                return;
            }
            message = NOT_READY_MESSAGE;
        }
    }

    async isSessionReady() {
        this.checkCancelled();
        try {
            if (!this.onActivitiesList()) await this.gotoActivities();
            await this.page.waitForSelector(SEARCH_INPUT, { visible: true, timeout: 15000 });
            return true;
        } catch (err) {
            if (this.cancelled || isBrowserGone(err)) throw err;
            return false;
        }
    }

    onActivitiesList() {
        const url = this.page.url();
        return url.includes('/activities') && !url.includes('/activities/detail/');
    }

    gotoActivities() {
        return this.page.goto(this.opts.activitiesUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    async withRetry(fn) {
        try {
            return await fn();
        } catch (err) {
            if (this.cancelled || isBrowserGone(err)) throw err;
            console.warn('Reintentando tras error de navegación:', err.message);
            return fn(); // un solo reintento; lookup vuelve a cargar Actividad
        }
    }

    async lookup(id) {
        this.checkCancelled();
        const page = this.page;
        if (!(await this.isSessionReady())) {
            await this.waitUntilSessionReady(SESSION_LOST_MESSAGE);
        }

        const input = await page.waitForSelector(SEARCH_INPUT, { visible: true, timeout: 10000 });
        await input.click({ clickCount: 3 });
        await page.keyboard.press('Backspace');
        await input.type(id, { delay: 100 });
        await page.keyboard.press('Enter');
        // La lista se actualiza por red: se espera a que termine en lugar de un tiempo fijo.
        await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 }).catch(() => {});
        this.checkCancelled();

        const hrefs = await page.$$eval(RESULT_LINK, links => links.map(a => a.href));
        if (hrefs.length === 0) return { found: false };

        await page.goto(hrefs[0], { waitUntil: 'domcontentloaded', timeout: 30000 });
        const handle = await page.waitForFunction(
            sel => document.querySelector(sel)?.textContent || null,
            { timeout: 15000 },
            STATE_SCRIPT,
        );
        const jsonText = await handle.jsonValue();
        const data = parseDetail(jsonText);
        if (!data) throw new Error('La página de la operación no cargó completa.');
        // Si la búsqueda no llegó a filtrar, el primer resultado sería otra operación.
        if (!jsonText.includes(id)) return { found: true, mismatch: true };
        return { found: true, data };
    }
}

module.exports = { Scraper, ACTIVITIES_URL, READY_MESSAGE, NOT_READY_MESSAGE, SESSION_LOST_MESSAGE };

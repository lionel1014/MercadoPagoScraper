// Prueba el scraper con Chrome real (headless) contra el sitio falso local. No accede a Mercado Pago.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Scraper, READY_MESSAGE, NOT_READY_MESSAGE } = require('../scraper');
const fakeMp = require('./fake-mp');

let site;
test.before(async () => { site = await fakeMp.start(); });
test.after(() => site.close());

const newProfile = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mps-profile-'));

// Ejecuta el scraper y responde a sus eventos con `onEvent(evt, scraper)`.
function runScraper(items, { userDataDir = newProfile(), onEvent = () => {} } = {}) {
    const events = [];
    const scraper = new Scraper({
        executablePath: null,
        userDataDir,
        activitiesUrl: site.activitiesUrl,
        headless: true,
        emit: evt => { events.push(evt); onEvent(evt, scraper); },
    });
    return { scraper, events, done: scraper.run(items), userDataDir };
}

const login = scraper => scraper.page.goto(site.loginUrl).then(() => scraper.page.click('#login')).then(() => scraper.page.waitForSelector("input[placeholder='Buscar']"));

test('espera «Ya estoy lista» sin límite de tiempo, pide sesión y procesa por fila', async () => {
    let waits = 0;
    const { scraper, events, done, userDataDir } = runScraper(
        [{ row: 2, id: '11111111111' }, { row: 3, id: '33333333333' }, { row: 4, id: '11111111111' }, { row: 5, id: '22222222222' }],
        {
            onEvent: async (evt, s) => {
                if (evt.type !== 'waiting-confirmation') return;
                waits++;
                if (waits === 1) {
                    // Sin sesión: confirma igual, para comprobar que no procesa.
                    s.confirm();
                } else if (waits === 2) {
                    await login(s);
                    s.confirm();
                }
            },
        },
    );

    // Antes de confirmar no se busca nada, aunque pase el tiempo.
    await new Promise(r => setTimeout(r, 300));
    assert.ok(!events.some(e => e.type === 'item'));

    await done;
    const waitsMsgs = events.filter(e => e.type === 'waiting-confirmation').map(e => e.message);
    assert.deepEqual(waitsMsgs, [READY_MESSAGE, NOT_READY_MESSAGE]);

    const finals = events.filter(e => e.type === 'item' && e.status !== 'processing');
    const byRow = Object.fromEntries(finals.flatMap(e => e.rows.map(r => [r, e])));
    assert.equal(byRow[2].status, 'found');
    assert.equal(byRow[2].data.total, 1409.98);
    assert.equal(byRow[2].data.retencionesProvinciales, -22.5);
    assert.equal(byRow[4], byRow[2], 'el número repetido se busca una vez y se aplica a ambas filas');
    assert.match(byRow[2].message, /repetido en las filas 2, 4/);
    assert.equal(byRow[3].status, 'not-found');
    assert.equal(byRow[5].data.cargoMp, -0.05);
    assert.equal(byRow[5].data.impuestoCreditosDebitos, 0);
    assert.equal(events.at(-1).type, 'done');
    assert.equal(scraper.browser, null, 'cierra su navegador al terminar');

    // El perfil persiste: la sesión iniciada sirve en la siguiente ejecución.
    let secondWaits = 0;
    const second = runScraper([{ row: 2, id: '22222222222' }], {
        userDataDir,
        onEvent: (evt, s) => { if (evt.type === 'waiting-confirmation') { secondWaits++; s.confirm(); } },
    });
    await second.done;
    assert.equal(secondWaits, 1, 'no vuelve a pedir sesión');
    assert.equal(second.events.find(e => e.status === 'found').rows[0], 2);
});

test('cancelar mientras espera la confirmación no procesa nada y cierra el navegador', async () => {
    const { scraper, events, done } = runScraper([{ row: 2, id: '11111111111' }], {
        onEvent: (evt, s) => { if (evt.type === 'waiting-confirmation') s.cancel(); },
    });
    await done;
    assert.equal(events.at(-1).type, 'cancelled');
    assert.ok(!events.some(e => e.type === 'item'));
    assert.equal(scraper.browser, null);
});

test('si la usuaria cierra el navegador se cancela y avisa', async () => {
    const { events, done } = runScraper([{ row: 2, id: '11111111111' }], {
        onEvent: (evt, s) => { if (evt.type === 'waiting-confirmation') s.browser.close(); },
    });
    await done;
    assert.equal(events.at(-1).type, 'cancelled');
    assert.match(events.at(-1).message, /Se cerró el navegador/);
});

test('no permite dos procesos a la vez', async () => {
    const { scraper, done } = runScraper([{ row: 2, id: '1' }], {
        onEvent: (evt, s) => { if (evt.type === 'waiting-confirmation') s.cancel(); },
    });
    await assert.rejects(scraper.run([{ row: 2, id: '1' }]), /en curso/);
    await done;
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDetail, parseAmount } = require('../mp-parser');
const { detailState, OPERATIONS } = require('./fixtures');

test('parseAmount conserva signo y centavos', () => {
    assert.equal(parseAmount({ fraction: '1500', cents: '50' }), 1500.5);
    assert.equal(parseAmount({ fraction: '-60', cents: '02' }), -60.02);
    assert.equal(parseAmount({ fraction: '-0', cents: '05' }), -0.05);
    assert.equal(parseAmount({ fraction: '0', cents: '00' }), 0);
    assert.equal(parseAmount({ fraction: '1500' }), null);
    assert.equal(parseAmount(undefined), null);
});

test('parseDetail extrae todos los campos y suma retenciones provinciales', () => {
    assert.deepEqual(parseDetail(JSON.stringify(OPERATIONS['11111111111'])), {
        operationId: '11111111111',
        date: '2026-01-15T10:30:00.000-03:00',
        cobro: 1500.5,
        impuestoCreditosDebitos: -9,
        retencionesProvinciales: -22.5,
        cargoMp: -60.02,
        total: 1409.98,
        medioPago: 'Dinero en cuenta',
    });
});

test('parseDetail distingue cero de dato ausente', () => {
    const r = parseDetail(JSON.stringify(OPERATIONS['22222222222']));
    assert.equal(r.impuestoCreditosDebitos, 0);
    assert.equal(r.retencionesProvinciales, null);
    assert.equal(r.cargoMp, -0.05);

    const vacio = parseDetail(JSON.stringify(detailState({ operationId: '3' })));
    assert.deepEqual([vacio.cobro, vacio.total, vacio.medioPago, vacio.cargoMp], [null, null, null, null]);
});

test('parseDetail devuelve null si la página no tiene detalle', () => {
    assert.equal(parseDetail(''), null);
    assert.equal(parseDetail('{no es json'), null);
    assert.equal(parseDetail(JSON.stringify({ pageState: {} })), null);
});

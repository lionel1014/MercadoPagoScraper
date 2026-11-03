const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { validateStartPayload } = require('../ipc-validation');
const { resolveBrowserPath, bundledBrowserDir, CHROME_BUILD_ID } = require('../browser-path');

test('validateStartPayload acepta filas e IDs válidos y descarta campos extra', () => {
    assert.deepEqual(validateStartPayload({ items: [{ row: 2, id: '123', extra: 'x' }] }), [{ row: 2, id: '123' }]);
});

test('validateStartPayload rechaza datos inválidos', () => {
    for (const bad of [null, {}, { items: 'x' }, { items: [] }]) assert.throws(() => validateStartPayload(bad));
    assert.throws(() => validateStartPayload({ items: [{ row: 1, id: '1' }] }), /fila/);
    assert.throws(() => validateStartPayload({ items: [{ row: 2.5, id: '1' }] }), /fila/);
    assert.throws(() => validateStartPayload({ items: [{ row: 2, id: '12a' }] }), /fila 2/);
    assert.throws(() => validateStartPayload({ items: [{ row: 2, id: 123 }] }), /fila 2/);
    assert.throws(() => validateStartPayload({ items: [{ row: 2, id: '1' }, { row: 2, id: '2' }] }), /repetida/);
    assert.throws(() => validateStartPayload({ items: Array.from({ length: 10001 }, (_, i) => ({ row: i + 2, id: '1' })) }));
});

test('el navegador empaquetado se busca fuera de app.asar', () => {
    const dir = bundledBrowserDir({ isPackaged: true, resourcesPath: 'C:\\App\\resources', appRoot: 'C:\\App\\resources\\app.asar' });
    assert.equal(dir, path.join('C:\\App\\resources', 'browser'));
    assert.ok(!dir.includes('app.asar'));
});

test('resolveBrowserPath: empaquetada sin navegador falla con mensaje claro; desarrollo cae a Puppeteer', () => {
    const opts = { resourcesPath: 'C:\\X', appRoot: 'C:\\Y' };
    assert.throws(() => resolveBrowserPath({ ...opts, isPackaged: true }, () => false), /Reinstalá/);
    assert.equal(resolveBrowserPath({ ...opts, isPackaged: false }, () => false), null);
    const found = resolveBrowserPath({ ...opts, isPackaged: true }, () => true);
    assert.ok(found.includes(CHROME_BUILD_ID) && found.endsWith('chrome.exe') === (process.platform === 'win32'));
});

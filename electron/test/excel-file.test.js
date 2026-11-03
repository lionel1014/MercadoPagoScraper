const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');
const { readWorkbook, writeResults, defaultOutputPath } = require('../excel-file');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mps-excel-'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function makeFixture(file) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Cobros');
    ws.addRow(['Fecha carga', 'N° Referencia', 'Importe', 'Doble']);
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFF0000' } };
    ws.addRow(['2026-01-01', '11111111111', 100, { formula: 'C2*2', result: 200 }]);
    ws.addRow(['2026-01-02', 22222222222, 50, { formula: 'C3*2', result: 100 }]); // ID guardado como número
    ws.addRow(['2026-01-03', '', 10, null]);
    ws.addRow(['2026-01-04', 12345678901234567890, 10, null]); // perdió dígitos en Excel
    ws.getCell('C2').numFmt = '"$"#,##0.00';
    wb.addWorksheet('Otra hoja').addRow(['no tocar']);
    await wb.xlsx.writeFile(file);
}

test('readWorkbook detecta columna de ID, conserva IDs como texto y recorta filas vacías', async () => {
    const file = path.join(tmp, 'origen.xlsx');
    await makeFixture(file);
    const r = await readWorkbook(file);
    assert.equal(r.sheetName, 'Cobros');
    assert.equal(r.idColumn, 1);
    assert.deepEqual(r.rows.map(x => x.row), [2, 3, 4, 5]);
    assert.equal(r.rows[0].values[1], '11111111111');
    assert.equal(r.rows[1].values[1], '22222222222');
    assert.equal(r.rows[1].values[3], '100'); // resultado de la fórmula
    assert.equal(r.rows[2].values[1], '');
    assert.match(r.rows[3].values[1], /e\+/); // no pasa la validación de solo dígitos
    assert.deepEqual(r.warnings, []);
});

test('writeResults escribe una copia y deja el original intacto', async () => {
    const src = path.join(tmp, 'original.xlsx');
    await makeFixture(src);
    const before = sha(src);
    const dest = path.join(tmp, 'copia.xlsx');
    const results = new Map([
        [2, { estado: 'Encontrada', operationId: '11111111111', date: '2026-01-15', cobro: 1500.5, impuestoCreditosDebitos: 0, retencionesProvinciales: null, cargoMp: -60.02, total: 1440.48, medioPago: 'Dinero en cuenta' }],
        [3, { estado: 'No encontrada' }],
    ]);
    await writeResults(src, dest, results);
    assert.equal(sha(src), before, 'el original no cambia');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(dest);
    const ws = wb.getWorksheet('Cobros');
    assert.ok(wb.getWorksheet('Otra hoja'), 'conserva las demás hojas');
    assert.equal(wb.getWorksheet('Otra hoja').getCell('A1').value, 'no tocar');
    assert.equal(ws.getCell('D2').value.formula, 'C2*2', 'conserva fórmulas');
    assert.equal(ws.getCell('C2').numFmt, '"$"#,##0.00', 'conserva formatos');
    assert.equal(ws.getCell('A1').font.bold, true);
    assert.equal(ws.getCell('B2').value, '11111111111', 'no toca columnas existentes');

    const header = ws.getRow(1).values.slice(1);
    assert.deepEqual(header.slice(0, 5), ['Fecha carga', 'N° Referencia', 'Importe', 'Doble', 'MP Estado']);
    const col = t => header.indexOf(t) + 1;
    assert.equal(ws.getCell(2, col('MP Cobro')).value, 1500.5);
    assert.equal(ws.getCell(2, col('MP Imp. Créditos y Débitos')).value, 0, 'el cero se escribe');
    assert.equal(ws.getCell(2, col('MP Retenciones provinciales')).value, null, 'ausente queda vacío');
    assert.equal(ws.getCell(2, col('MP Cargo Mercado Pago')).value, -60.02);
    assert.equal(ws.getCell(3, col('MP Estado')).value, 'No encontrada');
    assert.equal(ws.getCell(4, col('MP Estado')).value, null, 'filas no procesadas no se tocan');
});

test('writeResults reutiliza las columnas MP de una corrida anterior', async () => {
    const src = path.join(tmp, 'corrida1.xlsx');
    await makeFixture(src);
    const first = path.join(tmp, 'corrida1_res.xlsx');
    await writeResults(src, first, new Map([[2, { estado: 'Encontrada', total: 1 }]]));
    const second = path.join(tmp, 'corrida2_res.xlsx');
    await writeResults(first, second, new Map([[3, { estado: 'Encontrada', total: 2 }]]));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(second);
    const header = wb.worksheets[0].getRow(1).values.slice(1);
    assert.equal(header.filter(h => h === 'MP Total').length, 1);
    const totalCol = header.indexOf('MP Total') + 1;
    assert.equal(wb.worksheets[0].getCell(2, totalCol).value, 1, 'conserva resultados previos');
    assert.equal(wb.worksheets[0].getCell(3, totalCol).value, 2);
});

test('writeResults no sobrescribe el original', async () => {
    const src = path.join(tmp, 'mismo.xlsx');
    await makeFixture(src);
    await assert.rejects(writeResults(src, src.toUpperCase(), new Map()), /original/);
});

test('advierte lo que no puede conservar y convierte .xls', async () => {
    const xls = path.join(tmp, 'viejo.xls');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Referencia'], ['123']]), 'H');
    XLSX.writeFile(wb, xls, { bookType: 'xls' });
    const r = await readWorkbook(xls);
    assert.equal(r.rows[0].values[0], '123');
    assert.match(r.warnings[0], /\.xls/);
    await assert.rejects(readWorkbook(path.join(tmp, 'x.csv')), /Excel/);
});

test('defaultOutputPath propone un nombre nuevo junto al original', () => {
    const p = defaultOutputPath('C:\\datos\\cobros.xls', new Date('2026-03-04T05:06:00Z'));
    assert.equal(p, path.join('C:\\datos', 'cobros_resultados_20260304-0506.xlsx'));
});

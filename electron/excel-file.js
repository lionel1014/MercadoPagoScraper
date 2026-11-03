// Lectura del Excel original y escritura de los resultados en una COPIA (el original nunca se escribe).
// ExcelJS conserva hojas, formatos, fórmulas y validaciones; lo que no puede conservar se advierte antes.

const fs = require('fs/promises');
const path = require('path');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');

// Columnas que agrega la app. Se reconocen por el título exacto para reutilizarlas si el archivo ya las tiene.
const RESULT_COLUMNS = [
    { key: 'estado', title: 'MP Estado' },
    { key: 'operationId', title: 'MP N° operación' },
    { key: 'date', title: 'MP Fecha' },
    { key: 'cobro', title: 'MP Cobro', money: true },
    { key: 'impuestoCreditosDebitos', title: 'MP Imp. Créditos y Débitos', money: true },
    { key: 'retencionesProvinciales', title: 'MP Retenciones provinciales', money: true },
    { key: 'cargoMp', title: 'MP Cargo Mercado Pago', money: true },
    { key: 'total', title: 'MP Total', money: true },
    { key: 'medioPago', title: 'MP Medio de pago' },
];
const RESULT_TITLES = new Set(RESULT_COLUMNS.map(c => c.title));

// Partes del .xlsx que ExcelJS no reescribe de forma fiel.
const LOSSY_PARTS = [
    [/^xl\/charts\//, 'gráficos'],
    [/^xl\/pivot(Tables|Cache)\//, 'tablas dinámicas'],
    [/^xl\/vbaProject\.bin$/, 'macros'],
    [/^xl\/slicers\//, 'segmentaciones de datos'],
    [/^xl\/externalLinks\//, 'vínculos a otros libros'],
    [/^xl\/threadedComments\//, 'comentarios con respuestas'],
    [/^xl\/tables\//, 'tablas con formato de Excel'],
];

const SUPPORTED = new Set(['.xlsx', '.xlsm', '.xls']);

async function loadWorkbook(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED.has(ext)) throw new Error('Elegí un archivo de Excel (.xlsx o .xls).');

    let buffer = await fs.readFile(filePath);
    const warnings = [];
    if (ext === '.xls') {
        buffer = XLSX.write(XLSX.read(buffer, { type: 'buffer' }), { type: 'buffer', bookType: 'xlsx' });
        warnings.push('El archivo es .xls (formato antiguo): la copia con resultados se guarda como .xlsx sin los formatos originales.');
    } else {
        const parts = Object.keys(XLSX.read(buffer, { type: 'buffer', bookFiles: true, bookSheets: true }).files || {});
        const lost = [...new Set(LOSSY_PARTS.filter(([re]) => parts.some(p => re.test(p))).map(([, label]) => label))];
        if (lost.length) {
            warnings.push(`Este Excel tiene ${lost.join(', ')}. Puede que la copia con resultados no los conserve igual; el archivo original no se modifica.`);
        }
    }

    const workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.load(buffer);
    } catch {
        throw new Error('No se pudo leer el Excel. Verificá que no esté dañado ni protegido con contraseña.');
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('El Excel no tiene hojas.');
    return { workbook, sheet, warnings };
}

// Texto visible de una celda, sin perder dígitos de números de operación.
function cellText(cell) {
    let value = cell.value;
    if (value && typeof value === 'object' && !(value instanceof Date)) {
        if ('result' in value) value = value.result; // fórmula
        else if ('richText' in value) value = value.richText.map(t => t.text).join('');
        else if ('text' in value) value = value.text; // hipervínculo
        else if ('error' in value) value = value.error;
    }
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)) {
        return value.toExponential(); // Excel ya perdió dígitos: se marca como inválido
    }
    return String(value).trim();
}

function findIdColumn(headers) {
    const isOurs = h => RESULT_TITLES.has(h);
    const byName = headers.findIndex(h => !isOurs(h) && /REFERENCIA|OPERATION/i.test(h));
    if (byName !== -1) return byName;
    return headers.findIndex(h => h && !isOurs(h));
}

async function readWorkbook(filePath) {
    const { sheet, warnings } = await loadWorkbook(filePath);
    const columnCount = sheet.columnCount;
    const headerRow = sheet.getRow(1);
    const headers = Array.from({ length: columnCount }, (_, i) => cellText(headerRow.getCell(i + 1)));
    const idColumn = findIdColumn(headers);
    if (idColumn === -1) throw new Error('La primera fila del Excel debe tener los títulos de las columnas.');

    const rows = [];
    for (let r = 2; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        rows.push({ row: r, values: headers.map((_, i) => cellText(row.getCell(i + 1))) });
    }
    while (rows.length && rows[rows.length - 1].values.every(v => v === '')) rows.pop();

    return { fileName: path.basename(filePath), sheetName: sheet.name, headers, idColumn, rows, warnings };
}

const samePath = (a, b) => {
    const norm = p => path.resolve(p);
    return process.platform === 'win32' ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
};

function defaultOutputPath(sourcePath, now = new Date()) {
    const stamp = now.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    const base = path.basename(sourcePath, path.extname(sourcePath));
    return path.join(path.dirname(sourcePath), `${base}_resultados_${stamp}.xlsx`);
}

// results: Map<número de fila, { estado, ...campos de mp-parser }>
async function writeResults(sourcePath, destPath, results) {
    if (samePath(sourcePath, destPath)) throw new Error('Elegí otro nombre: el Excel original no se sobrescribe.');
    const { workbook, sheet } = await loadWorkbook(sourcePath);
    const headerRow = sheet.getRow(1);
    const lastColumn = sheet.columnCount;
    const titleAt = c => cellText(headerRow.getCell(c));

    let next = lastColumn + 1;
    const columnOf = {};
    for (const col of RESULT_COLUMNS) {
        let c = 0;
        for (let i = 1; i <= lastColumn; i++) if (titleAt(i) === col.title) c = i;
        if (!c) {
            c = next++;
            const cell = headerRow.getCell(c);
            cell.value = col.title;
            cell.style = JSON.parse(JSON.stringify(headerRow.getCell(lastColumn).style || {}));
            sheet.getColumn(c).width = Math.max(14, col.title.length + 2);
        }
        columnOf[col.key] = c;
    }

    for (const [rowNumber, result] of results) {
        const row = sheet.getRow(rowNumber);
        for (const col of RESULT_COLUMNS) {
            const cell = row.getCell(columnOf[col.key]);
            const value = result[col.key];
            cell.value = value === undefined ? null : value;
            if (col.money && typeof value === 'number') cell.numFmt = '#,##0.00';
        }
    }

    try {
        await workbook.xlsx.writeFile(destPath);
    } catch (err) {
        if (err.code === 'EBUSY' || err.code === 'EPERM') {
            throw new Error('No se pudo guardar: el archivo está abierto en Excel o no tenés permiso en esa carpeta. Cerralo o elegí otra ubicación.');
        }
        throw err;
    }
}

module.exports = { readWorkbook, writeResults, defaultOutputPath, RESULT_COLUMNS, cellText };

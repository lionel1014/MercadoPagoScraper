// Valida lo que llega del renderer antes de usarlo en el proceso principal.

const MAX_ITEMS = 10000;
const ID_PATTERN = /^\d{1,30}$/;

function validateStartPayload(payload) {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.items)) {
        throw new Error('Datos de inicio inválidos.');
    }
    const { items } = payload;
    if (items.length === 0) throw new Error('No hay operaciones para procesar en el rango elegido.');
    if (items.length > MAX_ITEMS) throw new Error(`Se pueden procesar hasta ${MAX_ITEMS} filas por vez.`);

    const rows = new Set();
    return items.map(item => {
        if (!item || typeof item !== 'object' || !Number.isInteger(item.row) || item.row < 2) {
            throw new Error('Número de fila inválido.');
        }
        if (typeof item.id !== 'string' || !ID_PATTERN.test(item.id)) {
            throw new Error(`Número de operación inválido en la fila ${item.row}.`);
        }
        if (rows.has(item.row)) throw new Error(`La fila ${item.row} está repetida.`);
        rows.add(item.row);
        return { row: item.row, id: item.id };
    });
}

module.exports = { validateStartPayload, ID_PATTERN };

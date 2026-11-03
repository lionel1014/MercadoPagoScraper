// Datos ficticios con la forma del JSON de detalle de Mercado Pago. No contienen información real.

const amount = (fraction, cents) => ({ amount: { fraction: String(fraction), cents: String(cents) } });

function detailState({ operationId, date = '2026-01-15T10:30:00.000-03:00', cobro, creditosDebitos, provinciales = [], cargoMp, total, medioPago }) {
    const ticketItems = {};
    if (cobro) ticketItems.main = { elements: [amount(...cobro)] };
    const withholdings = [];
    if (creditosDebitos) withholdings.push({ title: 'Impuesto sobre los Créditos y Débitos', ...amount(...creditosDebitos) });
    provinciales.forEach((p, i) => withholdings.push({ title: `Retención provincial ${i + 1}`, ...amount(...p) }));
    if (withholdings.length) ticketItems.withholdings = { elements: withholdings };
    if (cargoMp) ticketItems.charges_mp = { elements: [amount(...cargoMp)] };

    const ticket = { id: 'ticket-v2', data: { items: ticketItems, ...(total ? { total: amount(...total) } : {}) } };
    const payment = medioPago ? { id: 'payment-v2', data: { items: [{ payments: [{ title: medioPago }] }] } } : null;
    return { pageState: { detailData: { operationId, date, sections: [[ticket], payment ? [payment] : []] } } };
}

// Operaciones que conoce el sitio falso de pruebas.
const OPERATIONS = {
    '11111111111': detailState({ operationId: '11111111111', cobro: [1500, 50], creditosDebitos: [-9, 0], provinciales: [[-15, 0], [-7, 50]], cargoMp: [-60, 2], total: [1409, 98], medioPago: 'Dinero en cuenta' }),
    '22222222222': detailState({ operationId: '22222222222', cobro: [0, 75], creditosDebitos: [0, 0], cargoMp: ['-0', 5], total: [0, 70], medioPago: 'Tarjeta de débito' }),
};

module.exports = { detailState, OPERATIONS };

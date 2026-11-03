// Lee los datos de una operación desde el JSON de #__PRELOADED_STATE__ del detalle en Mercado Pago.
// Regla: null = el comprobante no informa el dato; 0 = lo informa en cero.

const CREDITOS_DEBITOS = 'Impuesto sobre los Créditos y Débitos';

function parseAmount(amount) {
    if (!amount || amount.fraction === undefined || amount.cents === undefined) return null;
    const fraction = parseFloat(amount.fraction);
    const cents = parseFloat(amount.cents);
    if (Number.isNaN(fraction) || Number.isNaN(cents)) return null;
    // El signo viaja en la parte entera; "-0" con centavos también es negativo.
    const negative = fraction < 0 || Object.is(fraction, -0);
    const abs = Math.abs(fraction) + Math.abs(cents) / 100;
    return Math.round((negative ? -abs : abs) * 100) / 100;
}

const amountOf = element => (element && element.amount ? parseAmount(element.amount) : null);
const add = (acc, value) => (value === null ? acc : (acc ?? 0) + value);

function parseDetail(jsonText) {
    if (!jsonText) return null;
    let doc;
    try {
        doc = JSON.parse(jsonText);
    } catch {
        return null;
    }
    const detail = doc && doc.pageState && doc.pageState.detailData;
    if (!detail) return null;

    const result = {
        operationId: detail.operationId != null ? String(detail.operationId) : null,
        date: detail.date ?? null,
        cobro: null,
        impuestoCreditosDebitos: null,
        retencionesProvinciales: null,
        cargoMp: null,
        total: null,
        medioPago: null,
    };

    const sections = Array.isArray(detail.sections) ? detail.sections.flat() : [];
    for (const section of sections) {
        if (!section || !section.data) continue;
        if (section.id === 'ticket-v2') {
            const items = section.data.items || {};
            result.cobro = amountOf(items.main?.elements?.[0]);
            for (const wh of items.withholdings?.elements ?? []) {
                if (wh.title === CREDITOS_DEBITOS) result.impuestoCreditosDebitos = add(result.impuestoCreditosDebitos, amountOf(wh));
                else result.retencionesProvinciales = add(result.retencionesProvinciales, amountOf(wh));
            }
            result.cargoMp = amountOf(items.charges_mp?.elements?.[0]);
            result.total = section.data.total?.amount ? parseAmount(section.data.total.amount) : null;
        }
        if (section.id === 'payment-v2') {
            result.medioPago = section.data.items?.[0]?.payments?.[0]?.title ?? null;
        }
    }
    return result;
}

module.exports = { parseDetail, parseAmount };

// Sitio falso que imita las páginas de Mercado Pago que usa el scraper. Solo para pruebas locales.

const http = require('http');
const { OPERATIONS } = require('./fixtures');

const LIST_PAGE = `<!doctype html><html><body>
<input placeholder="Buscar">
<ul id="list"><li><a href="/activities/detail/99999999999">Operación anterior</a></li></ul>
<script>
  document.querySelector('input').addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const ids = await (await fetch('/api/search?q=' + encodeURIComponent(e.target.value))).json();
    document.getElementById('list').innerHTML = ids.map(id => '<li><a href="/activities/detail/' + id + '">' + id + '</a></li>').join('');
  });
</script></body></html>`;

const LOGIN_PAGE = `<!doctype html><html><body><h1>Ingresá</h1>
<button id="login" onclick="document.cookie='mps=1; max-age=86400; path=/'; location.href='/activities/1'">Ingresar</button>
</body></html>`;

function start() {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const loggedIn = /(^|;\s*)mps=1/.test(req.headers.cookie || '');
        const html = body => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);

        if (url.pathname === '/login') return html(LOGIN_PAGE);
        if (!loggedIn) return res.writeHead(302, { location: '/login' }).end();
        if (url.pathname === '/activities/1') return html(LIST_PAGE);
        if (url.pathname === '/api/search') {
            const q = url.searchParams.get('q');
            // Demora de red para que un scraper con espera fija tome la lista vieja.
            return setTimeout(() => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(OPERATIONS[q] ? [q] : [])), 700);
        }
        const detail = url.pathname.match(/^\/activities\/detail\/(\d+)$/);
        if (detail) {
            const state = OPERATIONS[detail[1]] || { pageState: { detailData: { operationId: detail[1], sections: [] } } };
            return html(`<!doctype html><html><body><script id="__PRELOADED_STATE__" type="application/json">${JSON.stringify(state)}</script></body></html>`);
        }
        res.writeHead(404).end();
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
        const base = `http://127.0.0.1:${server.address().port}`;
        resolve({ base, activitiesUrl: `${base}/activities/1`, loginUrl: `${base}/login`, close: () => new Promise(r => server.close(r)) });
    }));
}

module.exports = { start };

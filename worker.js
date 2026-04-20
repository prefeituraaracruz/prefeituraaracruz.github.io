// Cloudflare Worker — verificador de status dos portais da PMA
// Requer: KV namespace vinculado como STATUS_KV + Cron Trigger */5 * * * *

const PORTALS = [
  'https://aracruz.es.gov.br',
  'https://servidor.aracruz.es.gov.br',
];

const ALLOWED_ORIGINS = new Set([
  'https://status.aracruz.es.gov.br',
  'https://prefeituraaracruz.github.io',
  'http://localhost',
  'http://127.0.0.1',
]);

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET',
    'Access-Control-Max-Age': '86400',
  };
}

async function checkPortal(url) {
  const start = Date.now();
  let http_code = 0;
  let ok = false;

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': 'PMA-StatusCheck/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    http_code = res.status;
    ok = http_code >= 200 && http_code < 400;
  } catch (_) {}

  return { url, http_code, ok, response_time_ms: Date.now() - start };
}

// Executado pelo Cron Trigger a cada 5 minutos
async function handleScheduled() {
  const portals = await Promise.all(PORTALS.map(checkPortal));
  const data = JSON.stringify({
    checked_at: new Date().toISOString(),
    portals,
  });
  await STATUS_KV.put('status', data);
}

// Executado a cada request do browser — lê do KV (sem bater nos portais)
async function handleFetch(request) {
  const origin = request.headers.get('Origin') ?? '';

  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response('Forbidden', { status: 403 });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const cached = await STATUS_KV.get('status');

  if (!cached) {
    return new Response(JSON.stringify({ error: 'Dados ainda não disponíveis' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  return new Response(cached, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin),
    },
  });
}

addEventListener('fetch', event => {
  event.respondWith(handleFetch(event.request));
});

addEventListener('scheduled', event => {
  event.waitUntil(handleScheduled());
});

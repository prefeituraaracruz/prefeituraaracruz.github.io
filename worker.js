// Cloudflare Worker — verificador de status dos portais da PMA
// Deploy: https://dash.cloudflare.com → Workers & Pages → Create Worker

const ALLOWED_ORIGINS = new Set([
  'https://status.aracruz.es.gov.br',
  'https://prefeituraaracruz.github.io',
  'http://localhost',
  'http://127.0.0.1',
]);

const ALLOWED_URLS = [
  'https://aracruz.es.gov.br',
  'https://servidor.aracruz.es.gov.br',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET',
    'Access-Control-Max-Age': '86400',
  };
}

async function handleRequest(request) {
  const origin = request.headers.get('Origin') ?? '';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const target = new URL(request.url).searchParams.get('url') ?? '';

  const isAllowed = ALLOWED_URLS.some(
    u => target === u || target.startsWith(u + '/')
  );

  if (!isAllowed) {
    return new Response(JSON.stringify({ error: 'URL não permitida' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  const start = Date.now();
  let http_code = 0;
  let ok = false;

  try {
    const res = await fetch(target, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': 'PMA-StatusCheck/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    http_code = res.status;
    ok = http_code >= 200 && http_code < 400;
  } catch (_) {
    http_code = 0;
    ok = false;
  }

  return new Response(
    JSON.stringify({ http_code, ok, response_time_ms: Date.now() - start }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...corsHeaders(origin),
      },
    }
  );
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

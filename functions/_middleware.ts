// functions/_middleware.ts
// CORS restrito: a API é consumida apenas pelo próprio site. O antigo
// 'Access-Control-Allow-Origin: *' permitia que qualquer página externa
// chamasse os endpoints a partir do navegador de um usuário logado.
export const onRequest: PagesFunction = async (context) => {
  const requestOrigin = context.request.headers.get('Origin');
  const siteOrigin = new URL(context.request.url).origin;
  const isSameOrigin = requestOrigin === siteOrigin;

  if (context.request.method === 'OPTIONS') {
    const preflight = new Response(null, { status: 204 });
    if (isSameOrigin && requestOrigin) {
      preflight.headers.set('Access-Control-Allow-Origin', requestOrigin);
      preflight.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      preflight.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      preflight.headers.set('Vary', 'Origin');
    }
    return preflight;
  }

  const response = await context.next();

  if (isSameOrigin && requestOrigin) {
    response.headers.set('Access-Control-Allow-Origin', requestOrigin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Vary', 'Origin');
  }

  // Respostas de API nunca devem ser cacheadas por proxies intermediários
  if (new URL(context.request.url).pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'no-store');
  }

  return response;
};

/**
 * =========================================================================
 * WFS - Acompanhamento público de solicitação (GET /api/requests/track)
 * =========================================================================
 * Endpoint SEM login, usado pelo colaborador para acompanhar o próprio
 * pedido. Por isso a busca é deliberadamente restritiva:
 *
 *  - protocolo: precisa bater EXATAMENTE (não aceita busca parcial);
 *  - telefone: precisa bater exatamente com pelo menos 10 dígitos;
 *  - busca por nome foi REMOVIDA (permitia varrer a base por sobrenome);
 *  - consulta vazia ou curta retorna lista vazia (antes, uma consulta em
 *    branco devolvia TODA a base com nome, telefone e endereço de todos).
 * =========================================================================
 */
import { deduplicateRequestsKeepLatest } from '../_dedup';

interface Env {
  WFS_KV?: KVNamespace;
}

const MIN_QUERY_LENGTH = 6;
const MAX_RESULTS = 20;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const query = String(url.searchParams.get('query') || '').trim();

  const emptyResponse = () =>
    new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

  if (query.length < MIN_QUERY_LENGTH) {
    return emptyResponse();
  }

  const raw = query.toLowerCase();
  const digits = query.replace(/\D/g, '');
  const isPhoneLookup = digits.length >= 10;

  let requests: any[] = [];
  if (context.env.WFS_KV) {
    try {
      const stored = await context.env.WFS_KV.get('REQUESTS_LIST');
      if (stored) requests = JSON.parse(stored);
    } catch (err) {
      console.error('Erro ao buscar solicitações no KV:', err);
    }
  }

  // Assume o segundo (mais recente) e descarta o primeiro
  requests = deduplicateRequestsKeepLatest(requests);

  const filtered = requests
    .filter((r) => {
      const protocolo = String(r.protocolo || '').trim().toLowerCase();
      const phoneDigits = String(r.telefone || '').replace(/\D/g, '');

      if (protocolo && protocolo === raw) return true;
      if (isPhoneLookup && phoneDigits && phoneDigits === digits) return true;
      return false;
    })
    .slice(0, MAX_RESULTS);

  return new Response(JSON.stringify(filtered), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};

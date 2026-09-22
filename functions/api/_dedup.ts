/**
 * Funções auxiliares para detecção e resolução de pedidos duplicados no backend Cloudflare
 */

export function normalizeText(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePhone(phone?: string | null): string {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

export function normalizeHour(r: any): string {
  const raw =
    r.horarioTermino ||
    r.horarioInicioEvento ||
    r.horarioTerminoEvento ||
    (r.horarioInicio && String(r.horarioInicio).includes(':') ? r.horarioInicio : '') ||
    '';

  const match = String(raw).match(/\b\d{1,2}:\d{2}\b/);
  if (match) {
    const [h, m] = match[0].split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }
  return String(raw).trim();
}

export function normalizeAddress(addr?: string | null): string {
  if (!addr) return '';
  return String(addr)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(rua|avenida|av|alameda|travessa|rodovia|estrada|praca|nº|numero|num|cep)\b/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getDuplicateFingerprint(r: any): string | null {
  const data = String(r.dataEvento || '').trim();
  const hora = normalizeHour(r);
  const nomeCompleto = normalizeText(`${r.nome || ''} ${r.sobrenome || ''}`);
  const fone = normalizePhone(r.telefone);
  const endereco = normalizeAddress(r.enderecoBase || r.enderecoEvento);

  if (!data || !hora || !nomeCompleto || fone.length < 8) {
    return null;
  }

  const endKey = endereco.slice(0, 40);
  return `${data}__${hora}__${nomeCompleto}__${fone}__${endKey}`;
}

/**
 * Filtra a lista preservando apenas o segundo pedido (mais recente) e ignorando o primeiro
 */
export function deduplicateRequestsKeepLatest(requests: any[]): any[] {
  if (!Array.isArray(requests) || requests.length <= 1) {
    return requests || [];
  }

  // Ordena do mais recente para o mais antigo
  const sorted = [...requests].sort((a, b) => {
    const timeA = a.dataCriacao ? new Date(a.dataCriacao).getTime() : 0;
    const timeB = b.dataCriacao ? new Date(b.dataCriacao).getTime() : 0;
    if (timeB !== timeA) return timeB - timeA;
    return String(b.protocolo || b.id || '').localeCompare(String(a.protocolo || a.id || ''));
  });

  const seen = new Set<string>();
  const result: any[] = [];

  for (const item of sorted) {
    const key = getDuplicateFingerprint(item);
    if (key) {
      if (seen.has(key)) {
        // Ignora o primeiro pedido anterior
        continue;
      }
      seen.add(key);
    }
    result.push(item);
  }

  return result;
}

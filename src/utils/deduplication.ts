import { UberRequest } from '../types';

/**
 * Remove acentos e normaliza texto para comparação segura
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

/**
 * Normaliza número de telefone mantendo apenas dígitos numéricos
 */
export function normalizePhone(phone?: string | null): string {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

/**
 * Normaliza horário do transporte/evento extraindo o padrão HH:MM
 */
export function normalizeHour(r: Partial<UberRequest>): string {
  // O horário efetivo pode estar em horarioTermino (campo oficial do horário do transporte),
  // ou em horarioInicioEvento (quando Entrada), ou horarioTerminoEvento (quando Saída)
  const raw =
    r.horarioTermino ||
    r.horarioInicioEvento ||
    r.horarioTerminoEvento ||
    (r.horarioInicio && r.horarioInicio.includes(':') ? r.horarioInicio : '') ||
    '';

  const match = String(raw).match(/\b\d{1,2}:\d{2}\b/);
  if (match) {
    const [h, m] = match[0].split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }
  return String(raw).trim();
}

/**
 * Normaliza endereço removendo pontuações, complementos ruidosos e abreviações
 */
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

/**
 * Gera a chave única para identificar pedidos duplicados para a mesma pessoa:
 * Requisitos:
 * 1. Mesma Data do Evento
 * 2. Mesmo Horário do Transporte / Evento
 * 3. Mesmo Nome Completo (Nome + Sobrenome)
 * 4. Mesmo Número de Celular / Telefone (dígitos)
 * 5. Mesmo Endereço de Destino / Residência
 */
export function getDuplicateFingerprint(r: Partial<UberRequest>): string | null {
  const data = String(r.dataEvento || '').trim();
  const hora = normalizeHour(r);
  const nomeCompleto = normalizeText(`${r.nome || ''} ${r.sobrenome || ''}`);
  const fone = normalizePhone(r.telefone);
  
  // Endereço principal (residência ou evento)
  const endereco = normalizeAddress(r.enderecoBase || r.enderecoEvento);

  // Se faltar dados vitais de identificação da pessoa ou do evento, não agrupa
  if (!data || !hora || !nomeCompleto || fone.length < 8) {
    return null;
  }

  // Endereço reduzido (primeiras palavras ou chave limpa) para absorver variações menores de pontuação
  const endKey = endereco.slice(0, 40);

  return `${data}__${hora}__${nomeCompleto}__${fone}__${endKey}`;
}

/**
 * Desduplica uma lista de solicitações mantendo SEMPRE a mais recente (segundo pedido)
 * e ignorando a mais antiga (primeiro pedido).
 * 
 * Se uma lista contiver o 1º pedido (ex: enviado antes) e o 2º pedido (enviado depois),
 * esta função descarta o 1º e mantém apenas o 2º.
 */
export function deduplicateRequestsKeepLatest(requests: UberRequest[]): UberRequest[] {
  if (!Array.isArray(requests) || requests.length <= 1) {
    return requests || [];
  }

  // Ordena primeiro cronologicamente: do mais recente para o mais antigo.
  // Assim, o primeiro registro encontrado para cada chave é garantidamente o segundo pedido (mais novo).
  const sortedNewestFirst = [...requests].sort((a, b) => {
    const timeA = a.dataCriacao ? new Date(a.dataCriacao).getTime() : 0;
    const timeB = b.dataCriacao ? new Date(b.dataCriacao).getTime() : 0;
    if (timeB !== timeA) return timeB - timeA;

    // Se as datas forem idênticas ou não preenchidas, usa o protocolo ou id como desempate
    return String(b.protocolo || b.id || '').localeCompare(String(a.protocolo || a.id || ''));
  });

  const seenFingerprints = new Set<string>();
  const result: UberRequest[] = [];

  for (const req of sortedNewestFirst) {
    const fingerprint = getDuplicateFingerprint(req);
    if (fingerprint) {
      if (seenFingerprints.has(fingerprint)) {
        // Já existe um pedido posterior/mais recente assumido para esta pessoa no mesmo local e horário.
        // O primeiro pedido é ignorado.
        continue;
      }
      seenFingerprints.add(fingerprint);
    }
    result.push(req);
  }

  return result;
}

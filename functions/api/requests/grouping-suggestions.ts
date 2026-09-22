import {
  checkOperatorAccess,
  getAuthenticatedUser,
  UsersEnv,
} from '../../auth/_usersStore';
import { deduplicateRequestsKeepLatest } from '../../_dedup';
import {
  haversineDistanceKm,
  getTerminalCoordinates,
  nearestNeighborOrder,
} from '../_lib/geo';

interface UberRequest {
  id: string;
  nome: string;
  sobrenome: string;
  telefone: string;
  dataEvento: string;
  horarioInicio: string;
  horarioTermino: string;
  horarioInicioEvento?: string;
  horarioTerminoEvento?: string;
  nomeEvento: string;
  enderecoBase: string;
  enderecoBaseLat?: number;
  enderecoBaseLng?: number;
  enderecoEvento: string;
  viagemIda: string;
  viagemVolta: string;
  responsavelNome?: string;
  responsavelFuncao?: string;
  responsavelMatricula?: string;
  status: 'Pendente' | 'Aprovado' | 'Recusado' | 'Cancelado' | string;
  protocolo: string;
  dataCriacao: string;
  voucherUber?: string;
  observacoesGestor?: string;
  motivoRecusa?: string;
  aprovadoPor?: string;
  origem?: string;
  dataAtualizacao?: string;
  mooveStatus?: string;
  mooveTipoTransporte?: string;
  mooveDadosVan?: string;
  mooveDadosTaxi?: string;
  mooveNomeMotorista?: string;
  mooveHorarioChegada?: string;
  mooveObservacoes?: string;
  mooveMotivoRecusaCOI?: string;
  mooveAtendidoPor?: string;
  coiStatus?: string;
  coiVoucherUber?: string;
  coiMotivoRecusa?: string;
  coiAtendidoPor?: string;
  recusadoPor?: 'Moove' | 'COI';
}

export interface OrdemParada {
  ordem: number;
  solicitacaoId: string;
  nome: string;
  enderecoBase: string;
}

export interface ClusterSugerido {
  sugerido: boolean;
  solicitacoes: UberRequest[];
  raioMaximoUsadoKm: number;
  ordemParadas?: OrdemParada[];
}

export interface JanelaCandidata {
  direcao: 'Entrada' | 'Saída';
  dataEvento: string;
  terminal: string;
  horarioReferencia: string;
  clusters: ClusterSugerido[];
}

interface Env extends UsersEnv {
  WFS_KV?: KVNamespace;
}

/**
 * Converte string de horário (ex: "22:00", "06:30") em minutos a partir de 00:00.
 */
function parseTimeToMinutes(timeStr?: string): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const clean = timeStr.trim();
  const match = clean.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

/**
 * Normaliza a direção da viagem a partir do campo horarioInicio ('Entrada' ou 'Saída').
 */
function parseDirecao(horarioInicio?: string): 'Entrada' | 'Saída' {
  const clean = String(horarioInicio || '').trim().toLowerCase();
  if (clean.includes('entrada')) return 'Entrada';
  if (clean.includes('saida') || clean.includes('saída')) return 'Saída';
  return (horarioInicio as any) || 'Entrada';
}

/**
 * Normaliza o terminal de embarque/desembarque no Aeroporto GRU a partir do enderecoEvento.
 */
function parseTerminal(enderecoEvento?: string): string {
  const clean = String(enderecoEvento || '').trim();
  const match = clean.match(/terminal\s*([1-3])/i);
  if (match) {
    return `Terminal ${match[1]}`;
  }
  return clean || 'Terminal GRU';
}

/**
 * Agrupa as solicitações de uma janela candidata por proximidade geográfica real:
 * - Ordena por densidade/vizinhança dentro do raio
 * - Forma clusters gulosos onde a distância a QUALQUER integrante seja <= raioMaximoKm
 * - Respeita o limite maxPorVeiculo
 * - Marca sugerido: true somente para clusters com 2 ou mais integrantes
 */
function clusterizarSolicitacoesJanela(
  solicitacoes: UberRequest[],
  raioMaximoKm: number,
  maxPorVeiculo: number
): ClusterSugerido[] {
  if (solicitacoes.length === 0) return [];

  if (solicitacoes.length === 1) {
    return [
      {
        sugerido: false,
        solicitacoes: [solicitacoes[0]],
        raioMaximoUsadoKm: raioMaximoKm,
      },
    ];
  }

  // Ordenação por proximidade/densidade mútua
  const stats = solicitacoes.map((item, idx) => {
    let vizinhosDentroRaio = 0;
    let distMaisProxima = Infinity;

    for (let j = 0; j < solicitacoes.length; j++) {
      if (idx === j) continue;
      const other = solicitacoes[j];
      const d = haversineDistanceKm(
        item.enderecoBaseLat!,
        item.enderecoBaseLng!,
        other.enderecoBaseLat!,
        other.enderecoBaseLng!
      );
      if (d <= raioMaximoKm) {
        vizinhosDentroRaio++;
      }
      if (d < distMaisProxima) {
        distMaisProxima = d;
      }
    }

    return { item, vizinhosDentroRaio, distMaisProxima };
  });

  stats.sort((a, b) => {
    if (b.vizinhosDentroRaio !== a.vizinhosDentroRaio) {
      return b.vizinhosDentroRaio - a.vizinhosDentroRaio;
    }
    return a.distMaisProxima - b.distMaisProxima;
  });

  const unassigned: UberRequest[] = stats.map((s) => s.item);
  const clusters: ClusterSugerido[] = [];

  while (unassigned.length > 0) {
    const seed = unassigned.shift()!;
    const currentCluster: UberRequest[] = [seed];

    while (currentCluster.length < maxPorVeiculo && unassigned.length > 0) {
      let bestCandidateIdx = -1;
      let minDistanceToCluster = Infinity;

      for (let i = 0; i < unassigned.length; i++) {
        const candidate = unassigned[i];

        // Distância até QUALQUER integrante já no cluster
        let minCandidateDist = Infinity;
        for (const member of currentCluster) {
          const d = haversineDistanceKm(
            member.enderecoBaseLat!,
            member.enderecoBaseLng!,
            candidate.enderecoBaseLat!,
            candidate.enderecoBaseLng!
          );
          if (d < minCandidateDist) {
            minCandidateDist = d;
          }
        }

        if (minCandidateDist <= raioMaximoKm && minCandidateDist < minDistanceToCluster) {
          minDistanceToCluster = minCandidateDist;
          bestCandidateIdx = i;
        }
      }

      if (bestCandidateIdx >= 0) {
        const [nextReq] = unassigned.splice(bestCandidateIdx, 1);
        currentCluster.push(nextReq);
      } else {
        break;
      }
    }

    clusters.push({
      sugerido: currentCluster.length >= 2,
      solicitacoes: currentCluster,
      raioMaximoUsadoKm: raioMaximoKm,
    });
  }

  // Ordena clusters: sugestões de 2+ integrantes primeiro
  clusters.sort((a, b) => {
    if (a.sugerido !== b.sugerido) {
      return a.sugerido ? -1 : 1;
    }
    return b.solicitacoes.length - a.solicitacoes.length;
  });

  return clusters;
}

/**
 * GET /api/requests/grouping-suggestions
 * =========================================================================
 * Filtro, agrupamento em janelas candidatas e clusterização geográfica:
 * 1. Lê todas as solicitações do KV (com desduplicação mais recente).
 * 2. Filtra solicitações com status 'Pendente Moove' ou ('Pendente' sem mooveStatus).
 * 3. Descarta solicitações sem enderecoBaseLat/enderecoBaseLng geocodificados.
 * 4. Agrupa por direcao, dataEvento, terminal e horarioTermino (janelaMinutos).
 * 5. Dentro de cada janela, clusteriza por proximidade espacial (raioKm e maxPorVeiculo).
 * =========================================================================
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const env = context.env;
  const url = new URL(context.request.url);

  // Validação de autenticação de operador se o cabeçalho Authorization for enviado
  const authUser = await getAuthenticatedUser(context.request, env);
  if (context.request.headers.has('Authorization') && !checkOperatorAccess(authUser)) {
    return new Response(
      JSON.stringify({
        error:
          'Acesso não autorizado. Faça login com um usuário do sistema para listar as sugestões de agrupamento.',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 1. Leitura de todas as solicitações do KV
  let requests: UberRequest[] = [];
  if (env.WFS_KV) {
    try {
      const stored = await env.WFS_KV.get('REQUESTS_LIST');
      if (stored) {
        requests = JSON.parse(stored);
      }
    } catch (err) {
      console.error('[grouping-suggestions] Erro ao ler solicitações no KV:', err);
    }
  }

  // Desduplicação mantendo o mais recente
  requests = deduplicateRequestsKeepLatest(requests);

  // 2. Filtro: apenas solicitações com status 'Pendente Moove' ou ('Pendente' sem mooveStatus)
  const pendentesMoove = requests.filter((r) => {
    const status = (r.status || '').trim();
    const mooveStatus = (r.mooveStatus || '').trim();
    return status === 'Pendente Moove' || (status === 'Pendente' && !mooveStatus);
  });

  // 3. Descarte automático de solicitações sem enderecoBaseLat/enderecoBaseLng
  const candidatasGeocodificadas = pendentesMoove.filter((r) => {
    const lat = r.enderecoBaseLat;
    const lng = r.enderecoBaseLng;
    return (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      !isNaN(lat) &&
      !isNaN(lng) &&
      lat !== 0 &&
      lng !== 0
    );
  });

  // Parâmetros de query configuráveis
  const janelaMinutosParam = url.searchParams.get('janelaMinutos');
  let janelaMinutos = 45;
  if (janelaMinutosParam) {
    const parsed = parseInt(janelaMinutosParam, 10);
    if (!isNaN(parsed) && parsed > 0) {
      janelaMinutos = parsed;
    }
  }

  const raioKmParam = url.searchParams.get('raioKm');
  let raioMaximoKm = 4;
  if (raioKmParam) {
    const parsed = parseFloat(raioKmParam);
    if (!isNaN(parsed) && parsed > 0) {
      raioMaximoKm = parsed;
    }
  }

  const maxPorVeiculoParam = url.searchParams.get('maxPorVeiculo');
  let maxPorVeiculo = 4;
  if (maxPorVeiculoParam) {
    const parsed = parseInt(maxPorVeiculoParam, 10);
    if (!isNaN(parsed) && parsed > 0) {
      maxPorVeiculo = parsed;
    }
  }

  // Agrupamento prévio em janelas candidatas
  interface CandidateItem {
    req: UberRequest;
    direcao: 'Entrada' | 'Saída';
    dataEvento: string;
    terminal: string;
    minutes: number | null;
  }

  const primaryBuckets = new Map<string, CandidateItem[]>();

  for (const req of candidatasGeocodificadas) {
    const direcao = parseDirecao(req.horarioInicio);
    const dataEvento = String(req.dataEvento || '').trim();
    const terminal = parseTerminal(req.enderecoEvento);
    const minutes = parseTimeToMinutes(req.horarioTermino);

    const bucketKey = `${direcao}__${dataEvento}__${terminal}`;
    let list = primaryBuckets.get(bucketKey);
    if (!list) {
      list = [];
      primaryBuckets.set(bucketKey, list);
    }
    list.push({ req, direcao, dataEvento, terminal, minutes });
  }

  interface WindowRaw {
    direcao: 'Entrada' | 'Saída';
    dataEvento: string;
    terminal: string;
    horarioReferencia: string;
    solicitacoes: UberRequest[];
  }

  const rawJanelas: WindowRaw[] = [];

  for (const [, items] of primaryBuckets) {
    const timedItems = items.filter((i) => i.minutes !== null);
    const untimedItems = items.filter((i) => i.minutes === null);

    timedItems.sort((a, b) => (a.minutes as number) - (b.minutes as number));

    let currentWindow: WindowRaw | null = null;
    let windowStartMinutes = -1;

    for (const item of timedItems) {
      const itemMinutes = item.minutes as number;

      if (!currentWindow || itemMinutes > windowStartMinutes + janelaMinutos) {
        windowStartMinutes = itemMinutes;
        currentWindow = {
          direcao: item.direcao,
          dataEvento: item.dataEvento,
          terminal: item.terminal,
          horarioReferencia: item.req.horarioTermino || '00:00',
          solicitacoes: [item.req],
        };
        rawJanelas.push(currentWindow);
      } else {
        currentWindow.solicitacoes.push(item.req);
      }
    }

    for (const item of untimedItems) {
      rawJanelas.push({
        direcao: item.direcao,
        dataEvento: item.dataEvento,
        terminal: item.terminal,
        horarioReferencia: item.req.horarioTermino || 'Horário a definir',
        solicitacoes: [item.req],
      });
    }
  }

  // Ordenação das janelas para apresentação consistente
  rawJanelas.sort((a, b) => {
    if (a.dataEvento !== b.dataEvento) return a.dataEvento.localeCompare(b.dataEvento);
    if (a.direcao !== b.direcao) return a.direcao.localeCompare(b.direcao);
    if (a.terminal !== b.terminal) return a.terminal.localeCompare(b.terminal);
    return a.horarioReferencia.localeCompare(b.horarioReferencia);
  });

  // Clusterização gulosa por proximidade real dentro de cada janela
  const janelas: JanelaCandidata[] = rawJanelas.map((j) => {
    const rawClusters = clusterizarSolicitacoesJanela(j.solicitacoes, raioMaximoKm, maxPorVeiculo);
    const terminalOrigin = getTerminalCoordinates(j.terminal);

    const clustersWithStops: ClusterSugerido[] = rawClusters.map((cluster) => {
      if (cluster.solicitacoes.length === 0) {
        return cluster;
      }

      // Pontos para cálculo de proximidade
      const pontos = cluster.solicitacoes.map((s) => ({
        id: s.id,
        lat: s.enderecoBaseLat || 0,
        lng: s.enderecoBaseLng || 0,
      }));

      // Ordem a partir do terminal
      const orderedIdsFromTerminal = nearestNeighborOrder(pontos, terminalOrigin);

      // Se 'Entrada' (casas -> terminal): van busca nas casas nessa ordem e finaliza no terminal
      // Se 'Saída' (terminal -> casas): van sai do terminal e desembarca nessa ordem
      const routeIds =
        j.direcao === 'Entrada'
          ? [...orderedIdsFromTerminal].reverse()
          : orderedIdsFromTerminal;

      const reqMap = new Map<string, UberRequest>();
      cluster.solicitacoes.forEach((s) => reqMap.set(s.id, s));

      const ordemParadas: OrdemParada[] = routeIds
        .map((id, index) => {
          const req = reqMap.get(id);
          if (!req) return null;
          const nomeCompleto = `${req.nome || ''} ${req.sobrenome || ''}`.trim() || 'Colaborador';
          return {
            ordem: index + 1,
            solicitacaoId: req.id,
            nome: nomeCompleto,
            enderecoBase: req.enderecoBase || '',
          };
        })
        .filter((p): p is OrdemParada => p !== null);

      return {
        ...cluster,
        ordemParadas,
      };
    });

    return {
      direcao: j.direcao,
      dataEvento: j.dataEvento,
      terminal: j.terminal,
      horarioReferencia: j.horarioReferencia,
      clusters: clustersWithStops,
    };
  });

  // Retorna os clusters já formados dentro de cada janela
  return new Response(
    JSON.stringify({
      janelas,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }
  );
};

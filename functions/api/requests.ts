import {
  checkOperatorAccess,
  getAuthenticatedUser,
  withWebhookSecret,
  UsersEnv,
} from './auth/_usersStore';
import {
  deduplicateRequestsKeepLatest,
  getDuplicateFingerprint,
} from './_dedup';
import { isWithinLockWindow, SYSTEM_LOCK_MESSAGE } from './_lib/timeLock';
import { geocodeAddress } from './_lib/geocode';

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
  mooveAtendidoPor?: string;
  mooveDataAvaliacao?: string;
  mooveMotivoRecusaCOI?: string;
  coiStatus?: string;
  coiAtendidoPor?: string;
  coiDataAvaliacao?: string;
  coiObservacoes?: string;
  coiVoucherUber?: string;
  coiMotivoRecusa?: string;
}

interface Env extends UsersEnv {
  GOOGLE_SHEETS_WEBHOOK_URL?: string;
  GOOGLE_SHEETS_ID?: string;
  MANAGER_PIN?: string;
  MASTER_PASSWORD?: string;
  WFS_KV?: KVNamespace;
}

// Sincroniza diretamente com o Google Sheets Webhook oficial WFS
async function syncToGoogleSheets(
  env: Env,
  request: UberRequest,
  action: 'create' | 'update_status' = 'create',
  clientWebhookUrl?: string
) {
  let webhookUrl = env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhookUrl && env.WFS_KV) {
    webhookUrl = await env.WFS_KV.get('CONFIG_WEBHOOK_URL') || undefined;
  }
  if (!webhookUrl && clientWebhookUrl) {
    webhookUrl = clientWebhookUrl;
  }

  if (!webhookUrl) {
    console.warn('[Cloudflare Functions] GOOGLE_SHEETS_WEBHOOK_URL não configurada no Cloudflare');
    return false;
  }

  try {
    const payload = {
      action,
      dataEvento: request.dataEvento,
      horarioInicio: request.horarioInicio,
      horarioTermino: request.horarioTermino,
      horarioInicioEvento: request.horarioInicioEvento || '',
      horarioTerminoEvento: request.horarioTerminoEvento || '',
      nomeEvento: request.nomeEvento,
      nome: request.nome,
      sobrenome: request.sobrenome,
      telefone: request.telefone,
      enderecoBase: request.enderecoBase,
      enderecoEvento: request.enderecoEvento,
      viagemIda: request.viagemIda,
      viagemVolta: request.viagemVolta,
      responsavelNome: request.responsavelNome || '',
      responsavelFuncao: request.responsavelFuncao || '',
      responsavelMatricula: request.responsavelMatricula || '',
      status: request.status,
      protocolo: request.protocolo,
      voucherUber: request.voucherUber || (request.mooveDadosTaxi ? `Táxi: ${request.mooveDadosTaxi} | Motorista: ${request.mooveNomeMotorista || 'N/A'}` : request.mooveDadosVan ? `Van: ${request.mooveDadosVan} | Motorista: ${request.mooveNomeMotorista || 'N/A'}` : ''),
      observacoesGestor: request.observacoesGestor || request.mooveObservacoes || request.motivoRecusa || '',
      mooveStatus: request.mooveStatus || '',
      mooveTipoTransporte: request.mooveTipoTransporte || '',
      mooveDadosVan: request.mooveDadosVan || '',
      mooveDadosTaxi: request.mooveDadosTaxi || '',
      mooveNomeMotorista: request.mooveNomeMotorista || '',
      mooveHorarioChegada: request.mooveHorarioChegada || '',
      mooveObservacoes: request.mooveObservacoes || '',
      aprovadoPor: request.aprovadoPor || '',
      dataCriacao: request.dataCriacao,
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withWebhookSecret(env, payload)),
      redirect: 'follow',
    });

    if (!res.ok) {
      console.warn(`[Cloudflare Functions] Google Sheets retornou HTTP ${res.status}`);
      return false;
    }

    const resJson: any = await res.json().catch(() => null);
    if (resJson && resJson.status === 'error') {
      console.warn('[Cloudflare Functions] Google Sheets retornou erro:', resJson.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Cloudflare Functions] Erro ao sincronizar com Google Sheets:', err);
    return false;
  }
}

// GET /api/requests
// Restrito: lista completa de solicitações contém dados pessoais (nome,
// telefone, endereços) e só pode ser acessada por gestores/administradores
// autenticados. Para o cidadão/colaborador rastrear a própria solicitação,
// use GET /api/requests/track (busca pontual, sem listar tudo).
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const env = context.env;

  const authUser = await getAuthenticatedUser(context.request, env);
  // Operadores dos portais COI/Moove precisam da lista para decidir os pedidos
  if (!checkOperatorAccess(authUser)) {
    return new Response(
      JSON.stringify({
        error:
          'Acesso não autorizado. Faça login com um usuário do sistema para listar as solicitações.',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(context.request.url);
  const statusParam = url.searchParams.get('status');
  const searchParam = url.searchParams.get('search');
  const dateParam = url.searchParams.get('date');

  let requests: UberRequest[] = [];

  if (env.WFS_KV) {
    try {
      const stored = await env.WFS_KV.get('REQUESTS_LIST');
      if (stored) {
        requests = JSON.parse(stored);
      }
    } catch (err) {
      console.error('Erro ao ler KV:', err);
    }
  }

  // Regra de desduplicação: se houver dois pedidos para a mesma pessoa no mesmo endereço,
  // data e horário, assume apenas o segundo (mais recente) e ignora o primeiro.
  requests = deduplicateRequestsKeepLatest(requests);

  // Filtro por status
  if (statusParam && statusParam !== 'Todos') {
    requests = requests.filter(
      (r) => r.status.toLowerCase() === statusParam.toLowerCase()
    );
  }

  // Filtro por data do evento
  if (dateParam) {
    requests = requests.filter((r) => r.dataEvento === dateParam);
  }

  // Filtro por busca textual (nome, sobrenome, protocolo, telefone, evento)
  if (searchParam) {
    const q = searchParam.toLowerCase().trim();
    requests = requests.filter(
      (r) =>
        r.nome.toLowerCase().includes(q) ||
        r.sobrenome.toLowerCase().includes(q) ||
        (r.protocolo && r.protocolo.toLowerCase().includes(q)) ||
        (r.telefone && r.telefone.includes(q)) ||
        (r.nomeEvento && r.nomeEvento.toLowerCase().includes(q)) ||
        (r.responsavelNome && r.responsavelNome.toLowerCase().includes(q))
    );
  }

  return new Response(JSON.stringify(requests), {
    headers: { 'Content-Type': 'application/json' },
  });
};

// POST /api/requests
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const env = context.env;
  try {
    // Janela de bloqueio operacional: nenhum novo lançamento entre 00:01 e
    // 04:59 (horário de Brasília). Reabre automaticamente às 05:00.
    if (isWithinLockWindow()) {
      return new Response(
        JSON.stringify({ error: SYSTEM_LOCK_MESSAGE, locked: true }),
        { status: 423, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body: any = await context.request.json();
    
    // Validação obrigatória de 11 dígitos no telefone com DDD
    const cleanPhoneDigits = String(body.telefone || '').replace(/\D/g, '');
    if (cleanPhoneDigits.length !== 11) {
      return new Response(
        JSON.stringify({ error: 'O número de telefone deve conter obrigatoriamente 11 dígitos com DDD (ex: (11) 98765-4321).' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Gerar protocolo sequencial amigável
    const timestamp = Date.now();
    const protocolo = body.protocolo || `WFS-${new Date().getFullYear()}-${timestamp.toString().slice(-6)}`;

    // Geocodificação do endereço base via Nominatim com cache determinístico no KV
    let enderecoBaseLat: number | undefined = undefined;
    let enderecoBaseLng: number | undefined = undefined;
    if (body.enderecoBase && env.WFS_KV) {
      try {
        const geo = await geocodeAddress(String(body.enderecoBase), env.WFS_KV);
        if (geo) {
          enderecoBaseLat = geo.lat;
          enderecoBaseLng = geo.lng;
        }
      } catch (geoErr) {
        console.warn('[Cloudflare Functions] Falha na geocodificação do endereço base:', geoErr);
      }
    }

    const newRequest: UberRequest = {
      id: `req-${timestamp}`,
      nome: String(body.nome || '').trim(),
      sobrenome: String(body.sobrenome || '').trim(),
      telefone: String(body.telefone || '').trim(),
      dataEvento: body.dataEvento || '',
      horarioInicio: body.horarioInicio || '',
      horarioTermino: body.horarioTermino || '',
      horarioInicioEvento: body.horarioInicioEvento || '',
      horarioTerminoEvento: body.horarioTerminoEvento || '',
      nomeEvento: String(body.nomeEvento || '').trim(),
      enderecoBase: body.enderecoBase || 'Aeroporto Internacional de Guarulhos (GRU)',
      enderecoBaseLat,
      enderecoBaseLng,
      enderecoEvento: String(body.enderecoEvento || '').trim(),
      viagemIda: body.viagemIda || 'Não',
      viagemVolta: body.viagemVolta || 'Sim',
      responsavelNome: body.responsavelNome?.trim(),
      responsavelFuncao: body.responsavelFuncao?.trim(),
      responsavelMatricula: body.responsavelMatricula?.trim(),
      status: body.status || 'Pendente Moove',
      protocolo,
      dataCriacao: new Date().toISOString(),
      voucherUber: '',
      observacoesGestor: '',
    };

    // 1. Grava na Planilha Google Sheets via Webhook
    const clientWebhookUrl = typeof body.webhookUrl === 'string' ? body.webhookUrl.trim() : undefined;
    const sheetsSynced = await syncToGoogleSheets(env, newRequest, 'create', clientWebhookUrl);

    // 2. Se KV estiver vinculado, salva na memória compartilhada Cloudflare
    if (env.WFS_KV) {
      try {
        const stored = await env.WFS_KV.get('REQUESTS_LIST');
        let list: UberRequest[] = stored ? JSON.parse(stored) : [];
        const newFingerprint = getDuplicateFingerprint(newRequest);
        if (newFingerprint) {
          // Se já havia um pedido para a mesma pessoa, data, horário e endereço, descarta o anterior (assume o segundo)
          list = list.filter((item) => getDuplicateFingerprint(item) !== newFingerprint);
        }
        list.unshift(newRequest);
        await env.WFS_KV.put('REQUESTS_LIST', JSON.stringify(list));
      } catch (err) {
        console.error('Erro ao salvar no KV:', err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        request: newRequest,
        protocolo: newRequest.protocolo,
        sheetsSynced,
        message: sheetsSynced
          ? 'Solicitação gravada na Planilha Google Sheets e no sistema WFS!'
          : 'Solicitação registrada! Sincronização direta com Google Sheets em processamento.',
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Erro ao processar solicitação: ' + (err.message || err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

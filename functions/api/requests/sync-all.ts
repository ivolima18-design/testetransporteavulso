import {
  checkOperatorAccess,
  getAuthenticatedUser,
  withWebhookSecret,
  UsersEnv,
} from '../auth/_usersStore';

interface Env extends UsersEnv {
  GOOGLE_SHEETS_WEBHOOK_URL?: string;
  GOOGLE_SHEETS_ID?: string;
  MANAGER_PIN?: string;
  MASTER_PASSWORD?: string;
  WFS_KV?: KVNamespace;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const env = context.env;

  try {
    // Rotina operacional: sincronizar os pedidos com a planilha oficial é
    // parte do fluxo de atendimento, liberada a qualquer usuário autenticado.
    const authUser = await getAuthenticatedUser(context.request, env);
    if (!checkOperatorAccess(authUser)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Acesso não autorizado. Faça login com um usuário do sistema para sincronizar as solicitações.',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let webhookUrl = env.GOOGLE_SHEETS_WEBHOOK_URL;
    if (!webhookUrl && env.WFS_KV) {
      webhookUrl = (await env.WFS_KV.get('CONFIG_WEBHOOK_URL')) || undefined;
    }

    let body: any = {};
    try {
      body = await context.request.json();
    } catch {
      body = {};
    }

    if (!webhookUrl && body.webhookUrl) {
      webhookUrl = String(body.webhookUrl).trim();
    }

    if (!webhookUrl) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'A URL do Webhook do Google Sheets não está configurada. Acesse Configurações > Google Sheets e informe a URL do Web App gerada no Apps Script.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let requests: any[] = [];
    if (env.WFS_KV) {
      try {
        const stored = await env.WFS_KV.get('REQUESTS_LIST');
        if (stored) {
          requests = JSON.parse(stored);
        }
      } catch (err) {
        console.error('[Cloudflare sync-all] Erro ao ler KV:', err);
      }
    }

    if (Array.isArray(body.items) && body.items.length > 0) {
      const map = new Map<string, any>();
      requests.forEach((r) => { if (r.protocolo) map.set(r.protocolo, r); });
      body.items.forEach((item: any) => {
        if (item.protocolo) {
          const existing = map.get(item.protocolo);
          map.set(item.protocolo, { ...existing, ...item });
        }
      });
      requests = Array.from(map.values());
    }

    if (requests.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          total: 0,
          syncedCount: 0,
          errors: [],
          message: 'Nenhuma solicitação encontrada para sincronizar.',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let syncedCount = 0;
    const errors: string[] = [];

    // Tenta primeiro sincronização em lote caso o script suporte
    try {
      const batchRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withWebhookSecret(env, { action: 'bulk_sync', items: requests })),
        redirect: 'follow',
      });
      if (batchRes.ok) {
        const batchData: any = await batchRes.json().catch(() => null);
        if (batchData && batchData.status === 'success') {
          syncedCount = batchData.syncedCount || requests.length;
        } else if (batchData && batchData.status === 'error') {
          errors.push(`Erro do Google Sheets: ${batchData.message}`);
        }
      }
    } catch (e: any) {
      console.warn('[Cloudflare sync-all] Falha no envio em lote:', e.message);
    }

    // Se o lote não foi aceito, envia individualmente com garantia de upsert
    if (syncedCount === 0) {
      for (const item of requests) {
        try {
          const payload = {
            action: 'create', // O script agora possui idempotência e upsert por protocolo
            dataEvento: item.dataEvento,
            horarioInicio: item.horarioInicio,
            horarioTermino: item.horarioTermino,
            horarioInicioEvento: item.horarioInicioEvento || '',
            horarioTerminoEvento: item.horarioTerminoEvento || '',
            nomeEvento: item.nomeEvento,
            nome: item.nome,
            sobrenome: item.sobrenome,
            telefone: item.telefone,
            enderecoBase: item.enderecoBase,
            enderecoEvento: item.enderecoEvento,
            viagemIda: item.viagemIda,
            viagemVolta: item.viagemVolta,
            responsavelNome: item.responsavelNome || '',
            responsavelFuncao: item.responsavelFuncao || '',
            responsavelMatricula: item.responsavelMatricula || '',
            status: item.status,
            protocolo: item.protocolo,
            voucherUber: item.voucherUber || '',
            observacoesGestor: item.observacoesGestor || item.motivoRecusa || '',
            aprovadoPor: item.aprovadoPor || '',
            dataCriacao: item.dataCriacao,
          };

          const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(withWebhookSecret(env, payload)),
            redirect: 'follow',
          });

          if (res.ok) {
            const resJson: any = await res.json().catch(() => null);
            if (resJson && resJson.status === 'error') {
              errors.push(`Erro no protocolo ${item.protocolo}: ${resJson.message}`);
            } else {
              item.sincronizadoSheets = true;
              syncedCount++;
            }
          } else {
            errors.push(`Falha no protocolo ${item.protocolo} (HTTP ${res.status})`);
          }
        } catch (e: any) {
          errors.push(`Erro no protocolo ${item.protocolo}: ${e.message}`);
        }
      }
    }

    if (env.WFS_KV) {
      try {
        await env.WFS_KV.put('REQUESTS_LIST', JSON.stringify(requests));
      } catch (err) {
        console.error('[Cloudflare sync-all] Erro ao salvar KV:', err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: requests.length,
        syncedCount,
        errors,
        message: `${syncedCount} de ${requests.length} solicitações foram sincronizadas com a planilha Google Sheets!`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Erro interno ao sincronizar com Google Sheets: ' + (err.message || err),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

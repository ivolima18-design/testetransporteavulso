import {
  isMasterAuth,
  masterOnlyDenied,
  getAuthenticatedUser,
  withWebhookSecret,
  UsersEnv,
} from '../auth/_usersStore';

interface Env extends UsersEnv {
  GOOGLE_SHEETS_WEBHOOK_URL?: string;
  GOOGLE_SHEETS_ID?: string;
}

/**
 * DELETE /api/requests/:id — Exclui definitivamente uma solicitação
 * (do KV do sistema e tenta remover a linha correspondente na planilha).
 * EXCLUSIVO DO ADMINISTRADOR MASTER: exclusão de dados não é uma rotina
 * operacional dos portais COI/Moove nem do gestor de usuários.
 */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const env = context.env;
  const id = String(context.params.id || '');

  try {
    const authUser = await getAuthenticatedUser(context.request, env);

    if (!isMasterAuth(authUser)) {
      return masterOnlyDenied('excluir solicitações da base de dados');
    }

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'Identificador da solicitação não fornecido.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!env.WFS_KV) {
      return new Response(
        JSON.stringify({
          error:
            'Persistência indisponível: vincule o KV namespace "WFS_KV" ao projeto no painel do Cloudflare.',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const stored = await env.WFS_KV.get('REQUESTS_LIST');
    const list: any[] = stored ? JSON.parse(stored) : [];
    const index = list.findIndex((r) => r.id === id || r.protocolo === id);

    if (index === -1) {
      return new Response(
        JSON.stringify({ error: 'Solicitação não encontrada.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const [removed] = list.splice(index, 1);
    await env.WFS_KV.put('REQUESTS_LIST', JSON.stringify(list));

    // Tenta remover a linha correspondente na planilha do Google Sheets
    let sheetsSynced = false;
    let webhookUrl = env.GOOGLE_SHEETS_WEBHOOK_URL;
    if (!webhookUrl) {
      webhookUrl = (await env.WFS_KV.get('CONFIG_WEBHOOK_URL')) || undefined;
    }

    if (webhookUrl) {
      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withWebhookSecret(env, {
            action: 'delete',
            protocolo: removed.protocolo,
          })),
          redirect: 'follow',
        });
        sheetsSynced = res.ok;
      } catch (err) {
        console.warn('Erro ao remover linha na planilha:', err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sheetsSynced,
        message: sheetsSynced
          ? `Solicitação ${removed.protocolo} excluída do sistema e da planilha.`
          : `Solicitação ${removed.protocolo} excluída do sistema. Não foi possível confirmar a remoção da linha na planilha — remova manualmente se necessário.`,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Erro ao excluir solicitação: ' + (err?.message || err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

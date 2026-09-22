import {
  isMasterAuth,
  masterOnlyDenied,
  getAuthenticatedUser,
  UsersEnv,
} from '../auth/_usersStore';

interface Env extends UsersEnv {
  GOOGLE_SHEETS_WEBHOOK_URL?: string;
  GOOGLE_SHEETS_ID?: string;
  MANAGER_PIN?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const env = context.env;
  try {
    // Integração com a base de dados (Google Sheets): exclusivo do Master.
    // O antigo desvio por PIN foi removido — nem gestores de usuários nem
    // operadores podem alterar a origem dos dados.
    const authUser = await getAuthenticatedUser(context.request, env);
    if (!isMasterAuth(authUser)) {
      return masterOnlyDenied('alterar a integração com a base de dados (Google Sheets)');
    }

    const body: any = await context.request.json().catch(() => ({}));

    const webhookUrl = String(body.webhookUrl || '').trim();
    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: 'A URL do Webhook do Google Sheets é obrigatória.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    try {
      const parsed = new URL(webhookUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('Protocolo inválido');
      }
    } catch {
      return new Response(
        JSON.stringify({ error: 'URL do Webhook inválida.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (env.WFS_KV && webhookUrl) {
      await env.WFS_KV.put('CONFIG_WEBHOOK_URL', webhookUrl);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'URL do Google Sheets Webhook salva com sucesso no Cloudflare!',
        sheetsConfigured: true,
        sheetsWebhookUrl: webhookUrl,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Erro ao salvar configuração: ' + (err.message || err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

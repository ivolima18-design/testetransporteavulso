import {
  isMasterAuth,
  masterOnlyDenied,
  getAuthenticatedUser,
  UsersEnv,
} from './auth/_usersStore';

interface ConfigEnv extends UsersEnv {
  GOOGLE_SHEETS_WEBHOOK_URL?: string;
  GOOGLE_SHEETS_ID?: string;
}

export const onRequestGet: PagesFunction<ConfigEnv> = async (context) => {
  const env = context.env;
  let webhookUrl = env.GOOGLE_SHEETS_WEBHOOK_URL || '';

  if (!webhookUrl && env.WFS_KV) {
    webhookUrl = (await env.WFS_KV.get('CONFIG_WEBHOOK_URL')) || '';
  }

  const webhookConfigured = Boolean(webhookUrl);
  const authUser = await getAuthenticatedUser(context.request, env);
  // A URL secreta do Webhook (integração/base de dados) é exclusiva do Master
  const isAuthorized = isMasterAuth(authUser);

  return new Response(
    JSON.stringify({
      // Só expõe a URL secreta do Webhook para o Administrador Master
      sheetsWebhookUrl: isAuthorized ? webhookUrl : '',
      spreadsheetId: env.GOOGLE_SHEETS_ID || '1kyCEVV5pNQS0bqnOCzVcCPF-yVh6fRqqQOOfLqDLhYM',
      managerPinConfigured: Boolean(env.MANAGER_PIN),
      sheetsConfigured: webhookConfigured,
      isConfigured: webhookConfigured,
      platform: 'Cloudflare Pages Functions',
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
};

export const onRequestPost: PagesFunction<ConfigEnv> = async (context) => {
  const env = context.env;
  try {
    const authUser = await getAuthenticatedUser(context.request, env);
    if (!isMasterAuth(authUser)) {
      return masterOnlyDenied('alterar as configurações do sistema');
    }

    const body: any = await context.request.json();
    const sheetsWebhookUrl = String(body.sheetsWebhookUrl || '').trim();

    if (!sheetsWebhookUrl) {
      return new Response(
        JSON.stringify({ error: 'A URL do Webhook do Google Sheets é obrigatória.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Se for URL, valida formato
    try {
      const parsed = new URL(sheetsWebhookUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('Protocolo inválido');
      }
    } catch {
      return new Response(
        JSON.stringify({ error: 'URL do Webhook inválida.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // If KV is available, save runtime override
    if (env.WFS_KV) {
      await env.WFS_KV.put('CONFIG_WEBHOOK_URL', sheetsWebhookUrl);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Configurações atualizadas com sucesso!',
        config: {
          sheetsWebhookUrl,
          spreadsheetId: env.GOOGLE_SHEETS_ID || '1kyCEVV5pNQS0bqnOCzVcCPF-yVh6fRqqQOOfLqDLhYM',
          isConfigured: true,
        },
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Erro ao processar requisição: ' + (err.message || err) }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

import {
  isMasterAuth,
  masterOnlyDenied,
  getAuthenticatedUser,
  withWebhookSecret,
  UsersEnv,
} from './auth/_usersStore';

interface Env extends UsersEnv {
  GOOGLE_SHEETS_WEBHOOK_URL?: string;
  GOOGLE_SHEETS_ID?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const env = context.env;
  try {
    const authUser = await getAuthenticatedUser(context.request, env);
    if (!isMasterAuth(authUser)) {
      return masterOnlyDenied('testar a conexão com a base de dados (Webhook)');
    }

    const body: any = await context.request.json().catch(() => ({}));
    let webhookUrl = body.webhookUrl;

    if (!webhookUrl && env.WFS_KV) {
      webhookUrl = await env.WFS_KV.get('CONFIG_WEBHOOK_URL');
    }
    if (!webhookUrl) {
      webhookUrl = env.GOOGLE_SHEETS_WEBHOOK_URL;
    }

    if (!webhookUrl) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'URL do Webhook do Google Apps Script não configurada nas variáveis do Cloudflare.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const testPayload = {
      action: 'create',
      dataEvento: new Date().toLocaleDateString('pt-BR'),
      horarioInicio: '08:00',
      horarioTermino: '17:00',
      nomeEvento: 'TESTE DE CONEXÃO CLOUDFLARE PAGES',
      nome: 'Teste de Integração',
      sobrenome: 'Cloudflare',
      telefone: '(11) 99999-9999',
      enderecoBase: 'Aeroporto Internacional de Guarulhos (GRU)',
      enderecoEvento: 'Terminal de Cargas WFS',
      viagemIda: 'Sim',
      viagemVolta: 'Sim',
      responsavelNome: 'Sistema WFS Cloudflare',
      responsavelFuncao: 'Teste Automatizado',
      responsavelMatricula: 'TESTE-01',
      status: 'Aprovado',
      protocolo: `TESTE-${Date.now().toString().slice(-6)}`,
      voucherUber: 'TESTE-OK',
      observacoesGestor: 'Linha gerada via Cloudflare Pages Function para validar conexão oficial',
      aprovadoPor: 'Sistema Cloudflare',
      dataCriacao: new Date().toISOString(),
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withWebhookSecret(env, testPayload)),
      redirect: 'follow',
    });

    const resText = await res.text();
    let resJson = null;
    try {
      resJson = JSON.parse(resText);
    } catch {
      // not JSON
    }

    if (res.ok) {
      if (resJson && resJson.status === 'error') {
        return new Response(
          JSON.stringify({
            success: false,
            error: `O Google Apps Script recusou a requisição: ${resJson.message}`,
            detalhes: resJson,
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Conexão com a planilha Google Sheets testada e aprovada com sucesso!',
          detalhes: resJson || resText,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Google Apps Script retornou HTTP ${res.status}: ${resText.slice(0, 200)}`,
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Falha ao conectar com o Google Sheets: ' + (err.message || err),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

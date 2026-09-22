import {
  isMasterAuth,
  masterOnlyDenied,
  getAuthenticatedUser,
  UsersEnv,
} from '../auth/_usersStore';

interface Env extends UsersEnv {
  WFS_KV?: any;
}

const DEFAULT_WORKFLOW_CONFIG = {
  permitirMooveEnviarCoi: true,
  permitirCoiDevolverMoove: true,
  guiaSolicitarAtiva: true,
  guiaAcompanharAtiva: true,
  guiaMooveAtiva: true,
  guiaCoiAtiva: true,
  uberSuspenso: true,
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const env = context.env;
  let config = { ...DEFAULT_WORKFLOW_CONFIG };

  if (env.WFS_KV) {
    try {
      const stored = await env.WFS_KV.get('WORKFLOW_CONFIG');
      if (stored) {
        config = { ...DEFAULT_WORKFLOW_CONFIG, ...JSON.parse(stored) };
      }
    } catch (err) {
      console.warn('Erro ao ler WORKFLOW_CONFIG do KV:', err);
    }
  }

  return new Response(JSON.stringify({ success: true, config }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const env = context.env;

  try {
    const authUser = await getAuthenticatedUser(context.request, env);
    if (!isMasterAuth(authUser)) {
      return masterOnlyDenied('alterar as regras de fluxo operacional e ativação de guias');
    }

    const body: any = await context.request.json().catch(() => ({}));
    const newConfig = {
      permitirMooveEnviarCoi: body.permitirMooveEnviarCoi !== false,
      permitirCoiDevolverMoove: body.permitirCoiDevolverMoove !== false,
      guiaSolicitarAtiva: body.guiaSolicitarAtiva !== false,
      guiaAcompanharAtiva: body.guiaAcompanharAtiva !== false,
      guiaMooveAtiva: body.guiaMooveAtiva !== false,
      guiaCoiAtiva: body.guiaCoiAtiva !== false,
      uberSuspenso: body.uberSuspenso !== undefined ? Boolean(body.uberSuspenso) : true,
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: authUser ? `${authUser.nome} (${authUser.email})` : 'Administrador Master',
    };

    if (env.WFS_KV) {
      await env.WFS_KV.put('WORKFLOW_CONFIG', JSON.stringify(newConfig));
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Regras de fluxo e ativação de guias salvas com sucesso!',
        config: newConfig,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Erro ao salvar regras de fluxo: ' + (err.message || err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

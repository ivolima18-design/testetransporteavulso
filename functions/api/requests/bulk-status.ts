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
}

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const env = context.env;

  try {
    const authUser = await getAuthenticatedUser(context.request, env);
    const body: any = await context.request.json().catch(() => ({}));
    const { items } = body;

    // Atalho por PIN removido: aprovação em massa exige usuário autenticado.
    if (!checkOperatorAccess(authUser)) {
      return new Response(
        JSON.stringify({
          error:
            'Acesso não autorizado. Faça login com seu usuário do sistema para a aprovação em massa.',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Nenhum item informado para atualização em massa.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const defaultAprovador = authUser
      ? `${authUser.nome} (${authUser.role.toUpperCase()})`
      : 'Gestor WFS';

    const updatedList: any[] = [];
    const now = new Date().toISOString();

    if (env.WFS_KV) {
      try {
        const stored = await env.WFS_KV.get('REQUESTS_LIST');
        if (stored) {
          const list = JSON.parse(stored);
          for (const updateItem of items) {
            const index = list.findIndex((r: any) => r.id === updateItem.id || r.protocolo === updateItem.id);
            if (index !== -1) {
              list[index].status = updateItem.status;
              list[index].dataAtualizacao = now;
              if (updateItem.observacoesGestor !== undefined) list[index].observacoesGestor = updateItem.observacoesGestor;
              list[index].aprovadoPor = updateItem.aprovadoPor || defaultAprovador;
              if (updateItem.voucherUber !== undefined) list[index].voucherUber = updateItem.voucherUber;
              if (updateItem.motivoRecusa !== undefined) list[index].motivoRecusa = updateItem.motivoRecusa;
              if (updateItem.mooveStatus !== undefined) list[index].mooveStatus = updateItem.mooveStatus;
              if (updateItem.mooveTipoTransporte !== undefined) list[index].mooveTipoTransporte = updateItem.mooveTipoTransporte;
              if (updateItem.mooveDadosVan !== undefined) list[index].mooveDadosVan = updateItem.mooveDadosVan;
              if (updateItem.mooveDadosTaxi !== undefined) list[index].mooveDadosTaxi = updateItem.mooveDadosTaxi;
              if (updateItem.mooveNomeMotorista !== undefined) list[index].mooveNomeMotorista = updateItem.mooveNomeMotorista;
              if (updateItem.mooveHorarioChegada !== undefined) list[index].mooveHorarioChegada = updateItem.mooveHorarioChegada;
              if (updateItem.mooveObservacoes !== undefined) list[index].mooveObservacoes = updateItem.mooveObservacoes;
              if (updateItem.mooveAtendidoPor !== undefined) list[index].mooveAtendidoPor = updateItem.mooveAtendidoPor;
              if (updateItem.mooveDataAvaliacao !== undefined) list[index].mooveDataAvaliacao = updateItem.mooveDataAvaliacao;
              if (updateItem.mooveMotivoRecusaCOI !== undefined) list[index].mooveMotivoRecusaCOI = updateItem.mooveMotivoRecusaCOI;
              if (updateItem.coiStatus !== undefined) list[index].coiStatus = updateItem.coiStatus;
              if (updateItem.coiAtendidoPor !== undefined) list[index].coiAtendidoPor = updateItem.coiAtendidoPor;
              if (updateItem.coiDataAvaliacao !== undefined) list[index].coiDataAvaliacao = updateItem.coiDataAvaliacao;
              if (updateItem.coiObservacoes !== undefined) list[index].coiObservacoes = updateItem.coiObservacoes;
              if (updateItem.coiVoucherUber !== undefined) list[index].coiVoucherUber = updateItem.coiVoucherUber;
              if (updateItem.coiMotivoRecusa !== undefined) list[index].coiMotivoRecusa = updateItem.coiMotivoRecusa;
              if (updateItem.recusadoPor !== undefined) list[index].recusadoPor = updateItem.recusadoPor;
              updatedList.push(list[index]);
            }
          }
          await env.WFS_KV.put('REQUESTS_LIST', JSON.stringify(list));
        }
      } catch (err) {
        console.error('Erro no KV:', err);
      }
    }

    // Background sync to Google Sheets if configured
    let webhookUrl = env.GOOGLE_SHEETS_WEBHOOK_URL;
    if (!webhookUrl && env.WFS_KV) {
      webhookUrl = await env.WFS_KV.get('CONFIG_WEBHOOK_URL') || undefined;
    }

    if (webhookUrl && updatedList.length > 0) {
      for (const item of updatedList) {
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(withWebhookSecret(env, {
              action: 'update_status',
              protocolo: item.protocolo,
              status: item.status,
              voucherUber: item.voucherUber,
              observacoesGestor: item.observacoesGestor,
              aprovadoPor: item.aprovadoPor,
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
              dataCriacao: item.dataCriacao,
            })),
            redirect: 'follow',
          });
        } catch (e) {
          console.warn('Erro ao sincronizar em massa com Sheets:', e);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        updatedCount: updatedList.length,
        message: `${updatedList.length} solicitações atualizadas com sucesso!`,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Erro ao processar atualização em massa: ' + (err.message || err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

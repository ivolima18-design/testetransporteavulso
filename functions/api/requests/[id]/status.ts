import {
  checkOperatorAccess,
  getAuthenticatedUser,
  withWebhookSecret,
  UsersEnv,
} from '../../auth/_usersStore';

interface Env extends UsersEnv {
  GOOGLE_SHEETS_WEBHOOK_URL?: string;
  GOOGLE_SHEETS_ID?: string;
  MANAGER_PIN?: string;
}

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const env = context.env;
  const params = context.params;
  const id = params.id as string;

  try {
    const authUser = await getAuthenticatedUser(context.request, env);
    const body: any = await context.request.json().catch(() => ({}));

    // O antigo atalho por PIN foi removido: toda decisão precisa de um
    // usuário autenticado, para que a auditoria registre quem atendeu ou
    // recusou o pedido.
    if (!checkOperatorAccess(authUser)) {
      return new Response(
        JSON.stringify({
          error:
            'Acesso não autorizado. Faça login com seu usuário do sistema para aprovar ou alterar o status.',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validação das regras de fluxo configuradas pelo Administrador Master no KV
    if (env.WFS_KV && authUser?.role !== 'master') {
      try {
        const wfRaw = await env.WFS_KV.get('WORKFLOW_CONFIG');
        if (wfRaw) {
          const wf = JSON.parse(wfRaw);
          // Se tentar enviar da Moove para o COI mas a regra estiver desativada pelo Master
          if (mooveStatus === 'Recusado_Enviado_COI' && wf.permitirMooveEnviarCoi === false) {
            return new Response(
              JSON.stringify({
                error: 'O envio de solicitações da Moove para atendimento pelo COI está temporariamente bloqueado pelas regras do Administrador Master.',
              }),
              { status: 403, headers: { 'Content-Type': 'application/json' } }
            );
          }
          // Se tentar devolver do COI para a Moove mas a regra estiver desativada pelo Master
          if (coiMotivoDevolucaoMoove && wf.permitirCoiDevolverMoove === false) {
            return new Response(
              JSON.stringify({
                error: 'A devolução de solicitações do COI para reavaliação da Moove está temporariamente bloqueada pelas regras do Administrador Master.',
              }),
              { status: 403, headers: { 'Content-Type': 'application/json' } }
            );
          }
        }
      } catch (wfErr) {
        console.warn('Aviso ao consultar WORKFLOW_CONFIG no status.ts:', wfErr);
      }
    }

    const {
      status,
      voucherUber,
      observacoesGestor,
      aprovadoPor,
      motivoRecusa,
      mooveStatus,
      mooveTipoTransporte,
      mooveDadosVan,
      mooveDadosTaxi,
      mooveNomeMotorista,
      mooveHorarioChegada,
      mooveObservacoes,
      mooveAtendidoPor,
      mooveDataAvaliacao,
      mooveMotivoRecusaCOI,
      coiStatus,
      coiAtendidoPor,
      coiDataAvaliacao,
      coiObservacoes,
      coiVoucherUber,
      coiMotivoRecusa,
      recusadoPor,
      coiMotivoDevolucaoMoove,
      coiDevolvidoPor,
      coiDataDevolucao,
    } = body;
    const finalAprovador = authUser
      ? `${authUser.nome} (${authUser.role.toUpperCase()})`
      : (aprovadoPor || 'Gestor WFS');

    let targetRequest: any = null;

    if (env.WFS_KV) {
      try {
        const stored = await env.WFS_KV.get('REQUESTS_LIST');
        if (stored) {
          const list = JSON.parse(stored);
          const index = list.findIndex((r: any) => r.id === id || r.protocolo === id);
          if (index !== -1) {
            if (status) list[index].status = status;
            if (voucherUber !== undefined) list[index].voucherUber = voucherUber;
            if (observacoesGestor !== undefined) list[index].observacoesGestor = observacoesGestor;
            if (motivoRecusa !== undefined) list[index].motivoRecusa = motivoRecusa;
            if (mooveStatus !== undefined) list[index].mooveStatus = mooveStatus;
            if (mooveTipoTransporte !== undefined) list[index].mooveTipoTransporte = mooveTipoTransporte;
            if (mooveDadosVan !== undefined) list[index].mooveDadosVan = mooveDadosVan;
            if (mooveDadosTaxi !== undefined) list[index].mooveDadosTaxi = mooveDadosTaxi;
            if (mooveNomeMotorista !== undefined) list[index].mooveNomeMotorista = mooveNomeMotorista;
            if (mooveHorarioChegada !== undefined) list[index].mooveHorarioChegada = mooveHorarioChegada;
            if (mooveObservacoes !== undefined) list[index].mooveObservacoes = mooveObservacoes;
            if (mooveAtendidoPor !== undefined) list[index].mooveAtendidoPor = mooveAtendidoPor;
            if (mooveDataAvaliacao !== undefined) list[index].mooveDataAvaliacao = mooveDataAvaliacao;
            if (mooveMotivoRecusaCOI !== undefined) list[index].mooveMotivoRecusaCOI = mooveMotivoRecusaCOI;
            if (coiStatus !== undefined) list[index].coiStatus = coiStatus;
            if (coiAtendidoPor !== undefined) list[index].coiAtendidoPor = coiAtendidoPor;
            if (coiDataAvaliacao !== undefined) list[index].coiDataAvaliacao = coiDataAvaliacao;
            if (coiObservacoes !== undefined) list[index].coiObservacoes = coiObservacoes;
            if (coiVoucherUber !== undefined) list[index].coiVoucherUber = coiVoucherUber;
            if (coiMotivoRecusa !== undefined) list[index].coiMotivoRecusa = coiMotivoRecusa;
            if (recusadoPor !== undefined) list[index].recusadoPor = recusadoPor;
            if (coiMotivoDevolucaoMoove !== undefined) list[index].coiMotivoDevolucaoMoove = coiMotivoDevolucaoMoove;
            if (coiDevolvidoPor !== undefined) list[index].coiDevolvidoPor = coiDevolvidoPor;
            if (coiDataDevolucao !== undefined) list[index].coiDataDevolucao = coiDataDevolucao;
            list[index].aprovadoPor = finalAprovador;
            list[index].dataAtualizacao = new Date().toISOString();
            targetRequest = list[index];
            await env.WFS_KV.put('REQUESTS_LIST', JSON.stringify(list));
          }
        }
      } catch (err) {
        console.error('Erro no KV:', err);
      }
    }

    if (!targetRequest) {
      targetRequest = {
        id,
        protocolo: body.protocolo || id,
        status: status || 'Aprovado',
        voucherUber: voucherUber || '',
        observacoesGestor: observacoesGestor || '',
        motivoRecusa: motivoRecusa || '',
        mooveStatus: mooveStatus || '',
        mooveTipoTransporte: mooveTipoTransporte || '',
        mooveDadosVan: mooveDadosVan || '',
        mooveDadosTaxi: mooveDadosTaxi || '',
        mooveNomeMotorista: mooveNomeMotorista || '',
        mooveHorarioChegada: mooveHorarioChegada || '',
        mooveObservacoes: mooveObservacoes || '',
        mooveAtendidoPor: mooveAtendidoPor || '',
        mooveDataAvaliacao: mooveDataAvaliacao || '',
        mooveMotivoRecusaCOI: mooveMotivoRecusaCOI || '',
        coiStatus: coiStatus || '',
        coiAtendidoPor: coiAtendidoPor || '',
        coiDataAvaliacao: coiDataAvaliacao || '',
        coiObservacoes: coiObservacoes || '',
        coiVoucherUber: coiVoucherUber || '',
        coiMotivoRecusa: coiMotivoRecusa || '',
        recusadoPor: recusadoPor || '',
        aprovadoPor: finalAprovador,
      };
    }

    // Sincroniza atualização no Google Sheets
    let webhookUrl = env.GOOGLE_SHEETS_WEBHOOK_URL;
    if (!webhookUrl && env.WFS_KV) {
      webhookUrl = await env.WFS_KV.get('CONFIG_WEBHOOK_URL') || undefined;
    }

    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withWebhookSecret(env, {
            action: 'update_status',
            protocolo: targetRequest.protocolo,
            status: targetRequest.status,
            voucherUber: targetRequest.voucherUber || (targetRequest.mooveDadosTaxi ? `Táxi: ${targetRequest.mooveDadosTaxi} | Motorista: ${targetRequest.mooveNomeMotorista || 'N/A'}` : targetRequest.mooveDadosVan ? `Van: ${targetRequest.mooveDadosVan} | Motorista: ${targetRequest.mooveNomeMotorista || 'N/A'}` : ''),
            observacoesGestor: targetRequest.observacoesGestor || targetRequest.mooveObservacoes || targetRequest.motivoRecusa || (targetRequest.coiMotivoDevolucaoMoove ? `[Devolvido para Moove pelo COI]: ${targetRequest.coiMotivoDevolucaoMoove}` : ''),
            coiMotivoDevolucaoMoove: targetRequest.coiMotivoDevolucaoMoove || '',
            mooveStatus: targetRequest.mooveStatus || '',
            mooveTipoTransporte: targetRequest.mooveTipoTransporte || '',
            mooveDadosVan: targetRequest.mooveDadosVan || '',
            mooveDadosTaxi: targetRequest.mooveDadosTaxi || '',
            mooveNomeMotorista: targetRequest.mooveNomeMotorista || '',
            mooveHorarioChegada: targetRequest.mooveHorarioChegada || '',
            mooveObservacoes: targetRequest.mooveObservacoes || '',
            aprovadoPor: targetRequest.aprovadoPor,
            dataEvento: targetRequest.dataEvento,
            horarioInicio: targetRequest.horarioInicio,
            horarioTermino: targetRequest.horarioTermino,
            horarioInicioEvento: targetRequest.horarioInicioEvento || '',
            horarioTerminoEvento: targetRequest.horarioTerminoEvento || '',
            nomeEvento: targetRequest.nomeEvento,
            nome: targetRequest.nome,
            sobrenome: targetRequest.sobrenome,
            telefone: targetRequest.telefone,
            enderecoBase: targetRequest.enderecoBase,
            enderecoEvento: targetRequest.enderecoEvento,
            viagemIda: targetRequest.viagemIda,
            viagemVolta: targetRequest.viagemVolta,
            responsavelNome: targetRequest.responsavelNome || '',
            responsavelFuncao: targetRequest.responsavelFuncao || '',
            responsavelMatricula: targetRequest.responsavelMatricula || '',
            dataCriacao: targetRequest.dataCriacao,
          })),
          redirect: 'follow',
        });
      } catch (err) {
        console.warn('Erro ao sincronizar status no Google Sheets:', err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        request: targetRequest,
        message: 'Status atualizado com sucesso!',
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Erro ao atualizar status: ' + (err.message || err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

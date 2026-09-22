import { deduplicateRequestsKeepLatest } from '../_dedup';

interface Env {
  WFS_KV?: KVNamespace;
}

/**
 * GET /api/requests/summary
 * =========================================================================
 * Versão restrita de GET /api/requests para a aba "Acompanhar Pedido".
 * Por padrão de minimização de dados (LGPD), essa tela não precisa — e por
 * isso não deve receber — dados pessoais completos do passageiro (telefone,
 * endereço residencial, endereço do evento) nem dados do responsável além
 * do nome (função/matrícula ficam de fora).
 *
 * Os campos sensíveis são removidos AQUI, no servidor: eles nunca chegam a
 * trafegar até o navegador de quem abre essa aba, então não há forma de
 * "vazar" via DevTools/inspeção de rede, diferente de simplesmente escondê-
 * los na tela.
 *
 * O acompanhamento é público e não exige login.
 * =========================================================================
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const env = context.env;

  let requests: any[] = [];
  if (env.WFS_KV) {
    try {
      const stored = await env.WFS_KV.get('REQUESTS_LIST');
      if (stored) requests = JSON.parse(stored);
    } catch (err) {
      console.error('Erro ao buscar solicitações no KV:', err);
    }
  }

  // Desduplicação mantendo o mais recente (segundo pedido)
  requests = deduplicateRequestsKeepLatest(requests);

  // Whitelist explícita de campos: só sai daqui o que está listado abaixo.
  const redacted = requests.map((r) => ({
    id: r.id,
    protocolo: r.protocolo,
    status: r.status,
    dataEvento: r.dataEvento,
    dataCriacao: r.dataCriacao,
    horarioInicio: r.horarioInicio,   // Solicitação (Entrada/Saída)
    horarioTermino: r.horarioTermino, // Horário do Transporte
    nome: r.nome,
    sobrenome: r.sobrenome,
    responsavelNome: r.responsavelNome || '',

    // Feedback da área que analisou (só isso, nada de dados pessoais do passageiro)
    mooveStatus: r.mooveStatus,
    mooveTipoTransporte: r.mooveTipoTransporte || '',
    mooveDadosVan: r.mooveDadosVan || '',
    mooveDadosTaxi: r.mooveDadosTaxi || '',
    mooveNomeMotorista: r.mooveNomeMotorista || '',
    mooveHorarioChegada: r.mooveHorarioChegada || '',
    mooveObservacoes: r.mooveObservacoes || '',
    mooveMotivoRecusaCOI: r.mooveMotivoRecusaCOI || '',
    coiStatus: r.coiStatus,
    coiVoucherUber: r.coiVoucherUber || '',
    coiMotivoRecusa: r.coiMotivoRecusa || '',
    recusadoPor: r.recusadoPor || '',
    voucherUber: r.voucherUber || '',
    observacoesGestor: r.observacoesGestor || '',
    motivoRecusa: r.motivoRecusa || '',
    aprovadoPor: r.aprovadoPor || '',

    // Campos existem no tipo do front por compatibilidade, mas nunca saem
    // com dado real por esta rota — dados pessoais do passageiro ficam
    // restritos à listagem completa (GET /api/requests), usada apenas pelo
    // painel do gestor.
    horarioInicioEvento: '',
    horarioTerminoEvento: '',
    nomeEvento: '',
    telefone: '',
    enderecoBase: '',
    enderecoEvento: '',
    viagemIda: '',
    viagemVolta: '',
    responsavelFuncao: '',
    responsavelMatricula: '',
  }));

  return new Response(JSON.stringify(redacted), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};

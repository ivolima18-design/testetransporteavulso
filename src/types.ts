export type TripOption = 'Sim' | 'Não';

export type RequestStatus =
  | 'Pendente Moove'
  | 'Pendente'
  | 'Atendido Moove'
  | 'Pendente COI'
  | 'Aprovado COI'
  | 'Aprovado'
  | 'Recusado COI'
  | 'Recusado'
  | 'Cancelado';

export interface RequestHistoryStep {
  etapa: 'Nova Solicitação' | 'Validação Moove' | 'Validação COI';
  status: string;
  data: string;
  responsavel?: string;
  detalhes?: {
    observacao?: string;
    dadosVan?: string;
    nomeMotorista?: string;
    horarioChegadaVan?: string;
    voucherUber?: string;
    motivoRecusa?: string;
  };
}

export const GRU_TERMINAL_OPTIONS = [
  {
    id: 'terminal-1',
    label: 'Terminal 1',
    address: 'Terminal 1 — Aeroporto Internacional de São Paulo/Guarulhos, Guarulhos – SP, 07190-100',
  },
  {
    id: 'terminal-2',
    label: 'Terminal 2',
    address: 'Terminal 2 — R. Interna do Aeroporto Internacional de Guarulhos, s/nº – Cumbica, Guarulhos – SP, 07190-100',
  },
  {
    id: 'terminal-3',
    label: 'Terminal 3',
    address: 'Terminal 3 — Rod. Hélio Smidt, s/nº – Cumbica, Guarulhos – SP, 07190-100',
  },
] as const;

export interface UberRequest {
  id: string;
  protocolo: string;
  // Campos exatos da planilha Google Sheets oficial:
  dataEvento: string;           // A: Data do evento (ex: YYYY-MM-DD)
  horarioInicio: string;        // Solicitação: "Entrada" ou "Saída" (rótulo interno, não é horário)
  horarioTermino: string;       // Horário do Transporte (ex: 22:00)
  horarioInicioEvento: string;  // Preenchido só quando Solicitação = "Entrada" (mesmo valor de horarioTermino); senão fica vazio
  horarioTerminoEvento: string; // Preenchido só quando Solicitação = "Saída" (mesmo valor de horarioTermino); senão fica vazio
  nomeEvento: string;           // D: Nome do evento / Motivo Operacional (descrito pelo usuário)
  nome: string;                 // E: Nome
  sobrenome: string;            // F: Sobrenome
  telefone: string;             // G: Número de telefone (WhatsApp)
  enderecoBase: string;         // H: Endereço Base (Endereço da Residência do Colaborador)
  enderecoBaseLat?: number;     // Latitude geocodificada do endereço base
  enderecoBaseLng?: number;     // Longitude geocodificada do endereço base
  enderecoEvento: string;       // I: Endereço do Evento (Local de Partida do Transporte: Terminais GRU)
  viagemIda: TripOption;        // J: Viagem de ida necessária (Sim / Não)
  viagemVolta: TripOption;      // K: Viagem de volta necessária (Sim / Não)
  
  // Responsável pela Solicitação (Sempre obrigatório)
  responsavelNome: string;      // Nome do responsável pela solicitação
  responsavelFuncao: string;    // Função / Cargo do responsável
  responsavelMatricula: string; // Matrícula do responsável

  // Campos de controle operacional e decisão do Gestor:
  dataCriacao: string;          // ISO timestamp
  status: RequestStatus;

  // Validação Moove
  mooveStatus?: 'Pendente' | 'Atendido' | 'Recusado_Enviado_COI';
  mooveTipoTransporte?: 'Van' | 'Taxi';
  mooveAtendidoPor?: string;
  mooveDataAvaliacao?: string;
  mooveObservacoes?: string;
  mooveDadosVan?: string;       // Dados da Van que atenderá (modelo, placa, prefixo)
  mooveDadosTaxi?: string;      // Dados do Táxi que atenderá (modelo, placa, cooperativa)
  mooveNomeMotorista?: string;   // Nome do motorista da van ou táxi
  mooveHorarioChegada?: string; // Horário que o veículo vai chegar
  mooveMotivoRecusaCOI?: string; // Observação ao recusar e enviar para o COI

  // Validação COI
  coiStatus?: 'Pendente' | 'Atendido' | 'Recusado';
  coiAtendidoPor?: string;
  coiDataAvaliacao?: string;
  coiObservacoes?: string;
  coiVoucherUber?: string;
  coiMotivoRecusa?: string;
  recusadoPor?: 'Moove' | 'COI'; // Área que recusou o pedido (status Recusado)
  coiMotivoDevolucaoMoove?: string; // Motivo quando o COI devolve para reavaliação da Moove
  coiDevolvidoPor?: string;         // Identificação do operador do COI que devolveu
  coiDataDevolucao?: string;        // Timestamp da devolução para a Moove

  // Campos legados / consolidados
  observacoesGestor?: string;
  aprovadoPor?: string;
  voucherUber?: string;
  motivoRecusa?: string;
  dataAtualizacao?: string;
  sincronizadoSheets?: boolean;

  // Histórico detalhado de passos
  historico?: RequestHistoryStep[];
}

export interface OrdemParada {
  ordem: number;
  solicitacaoId: string;
  nome: string;
  enderecoBase: string;
}

export interface ClusterSugerido {
  sugerido: boolean;
  solicitacoes: UberRequest[];
  raioMaximoUsadoKm: number;
  ordemParadas?: OrdemParada[];
}

export interface JanelaCandidata {
  direcao: 'Entrada' | 'Saída' | string;
  dataEvento: string;
  terminal: string;
  horarioReferencia: string;
  clusters: ClusterSugerido[];
  solicitacoes?: UberRequest[];
}

export interface GroupingSuggestionsResponse {
  janelas: JanelaCandidata[];
}

export type TransportRequest = UberRequest;

export interface NewUberRequestPayload {
  dataEvento: string;
  horarioInicio: string;
  horarioTermino: string;
  horarioInicioEvento: string;
  horarioTerminoEvento: string;
  nomeEvento: string;
  nome: string;
  sobrenome: string;
  telefone: string;
  enderecoBase: string;       // Endereço Residencial do Colaborador (Rua, Número, Bairro, Cidade, CEP)
  enderecoEvento: string;     // Local de Partida (Terminais GRU 1, 2 ou 3)
  viagemIda: TripOption;
  viagemVolta: TripOption;
  responsavelNome: string;
  responsavelFuncao: string;
  responsavelMatricula: string;
}

export type NewTransportRequestPayload = NewUberRequestPayload;

export interface UserAccount {
  id: string;
  email: string;
  nome: string;
  funcao?: string;
  matricula?: string;
  role: 'master' | 'admin' | 'gestor' | 'coi';
  status: 'ativo' | 'bloqueado';
  podeGerenciarUsuarios?: boolean;
  deveTrocarSenha?: boolean;
  senha?: string;
  criadoEm: string;
  ultimoAcesso?: string;
}

/**
 * =========================================================================
 * NÍVEIS DE ACESSO (fonte única de verdade do frontend)
 * =========================================================================
 * OPERADOR  -> portais COI e Moove com TODA a rotina operacional: atender,
 *              recusar com justificativa, exportar em Excel e sincronizar
 *              com a planilha. Não acessa configurações do sistema.
 * GESTOR DE -> tudo do operador + módulo "Cadastrar Usuários" (sem poder
 * USUÁRIOS     promover ninguém a gestor/administrador). Não acessa
 *              configurações do sistema.
 * MASTER    -> tudo: configurações, integrações, scripts, Cloudflare,
 *              delegação de permissões e exclusão de contas de gestão.
 * =========================================================================
 */
export const MASTER_EMAIL = 'ivoaltctrl@gmail.com';

export function isMasterAccount(user?: UserAccount | null): boolean {
  if (!user) return false;
  return (
    user.role === 'master' ||
    String(user.email || '').trim().toLowerCase() === MASTER_EMAIL
  );
}

/** Pode acessar APENAS o módulo de cadastro/gestão de usuários. */
export function canManageUsers(user?: UserAccount | null): boolean {
  if (!user) return false;
  if (isMasterAccount(user)) return true;
  return user.role === 'admin' || Boolean(user.podeGerenciarUsuarios);
}

/** Configurações, integrações, scripts e Cloudflare: exclusivo do Master. */
export function canAccessSystemConfig(user?: UserAccount | null): boolean {
  return isMasterAccount(user);
}

/** Operação dos portais COI e Moove: qualquer usuário ativo autenticado. */
export function canOperatePortals(user?: UserAccount | null): boolean {
  return Boolean(user && user.status !== 'bloqueado');
}

/**
 * Rotinas operacionais (exportar em Excel, sincronizar com a planilha,
 * atualizar status): fazem parte do atendimento, liberadas ao operador.
 */
export function canRunOperationalRoutines(user?: UserAccount | null): boolean {
  return canOperatePortals(user);
}

/** Excluir solicitações da base: exclusivo do Administrador Master. */
export function canDeleteRequests(user?: UserAccount | null): boolean {
  return isMasterAccount(user);
}

/** O painel de Configurações só abre para Master ou gestor de usuários. */
export function canOpenSettingsPanel(user?: UserAccount | null): boolean {
  return isMasterAccount(user) || canManageUsers(user);
}

export interface AuthSession {
  user: UserAccount;
  token: string;
}

export interface SheetsConfig {
  webhookUrl: string;
  sheetId?: string;
  ativo: boolean;
  ultimoEnvio?: string;
  statusConexao?: 'conectado' | 'desconectado' | 'erro';
}

/**
 * Retorna verdadeiro se a solicitação foi repassada para o COI (2ª etapa)
 * ou já foi finalizada/tratada no fluxo do COI.
 * Solicitações repassadas ao COI saem da guia da Moove e ficam exclusivamente no COI.
 * Quando o COI devolve para a Moove (status 'Pendente Moove'), ela retorna imediatamente à fila da Moove.
 */
export function isRepassadoAoCoi(r?: Partial<UberRequest> | null): boolean {
  if (!r) return false;
  // Se está pendente ou atendido pela Moove, NUNCA é repassado ao COI
  if (r.status === 'Pendente Moove' || r.status === 'Pendente' || r.status === 'Atendido Moove') {
    return false;
  }
  if (r.status === 'Pendente COI' || r.status === 'Aprovado COI' || r.status === 'Recusado COI') {
    return true;
  }
  if (r.mooveStatus === 'Recusado_Enviado_COI') {
    return true;
  }
  if (r.coiStatus === 'Atendido' || r.coiStatus === 'Recusado') {
    return true;
  }
  if (r.status === 'Aprovado' && !r.mooveDadosVan && !r.mooveDadosTaxi && (r.voucherUber || r.coiVoucherUber)) {
    return true;
  }
  if (r.status === 'Recusado' && (r.motivoRecusa || r.coiMotivoRecusa) && !r.mooveDadosVan && !r.mooveDadosTaxi) {
    return true;
  }
  return false;
}

/**
 * Retorna verdadeiro se a solicitação foi recusada pela Moove e repassada ao COI.
 * Garante rastreabilidade total para que a equipe Moove visualize as solicitações que recusou.
 */
export function isRecusadoMoove(r?: Partial<UberRequest> | null): boolean {
  if (!r) return false;
  if (r.status === 'Pendente Moove' || (r.status === 'Pendente' && !r.mooveStatus) || isAtendidoMoove(r)) {
    return false;
  }
  if (r.mooveStatus === 'Recusado_Enviado_COI' || Boolean(r.mooveMotivoRecusaCOI)) {
    return true;
  }
  if (isRepassadoAoCoi(r)) {
    return true;
  }
  return false;
}

/**
 * Área que recusou o pedido.
 * 1) Usa o campo gravado (recusadoPor), quando existe.
 * 2) Registros antigos (sem o campo): recusa individual do COI (coiStatus
 *    'Recusado') é COI; nos demais casos deduz pelo avaliador registrado
 *    (ex.: "Fulano (Operador Moove)" => Moove; "... (Operador COI)" => COI).
 * 3) Sem nenhuma pista, mantém o comportamento anterior (COI).
 */
export function getRecusaOrigem(r?: Partial<UberRequest> | null): 'Moove' | 'COI' {
  if (!r) return 'COI';
  if (r.recusadoPor === 'Moove' || r.recusadoPor === 'COI') return r.recusadoPor;
  if (r.coiStatus === 'Recusado') return 'COI';
  const avaliador = String(r.aprovadoPor || r.coiAtendidoPor || r.mooveAtendidoPor || '').toLowerCase();
  if (/moove|moover/.test(avaliador)) return 'Moove';
  return 'COI';
}

/**
 * Retorna verdadeiro se a solicitação atendida pela Moove foi definida como TÁXI.
 * Fonte única de verdade para todo o sistema (acompanhamento, painel, impressão):
 * - o tipo explícito (mooveTipoTransporte) sempre prevalece;
 * - sem tipo (registros antigos), infere pelos dados preenchidos ou pelo status.
 */
export function isMooveTaxi(r?: Partial<UberRequest> | null): boolean {
  if (!r) return false;
  const tipo = String(r.mooveTipoTransporte || '').toLowerCase().trim();
  if (tipo === 'taxi' || tipo === 'táxi') return true;
  if (tipo === 'van') return false;
  const statusStr = String(r.status || '').toLowerCase();
  if (statusStr.includes('atendido com taxi') || statusStr.includes('atendido com táxi')) return true;
  return !!r.mooveDadosTaxi && !r.mooveDadosVan;
}

const OBS_PADRAO_VAN = 'Embarque no bolsão de vans T2';
const OBS_PADRAO_TAXI = 'Ponto de encontro Táxi - Desembarque Terminal 2';

/**
 * Comentário de observação da Moove ajustado ao tipo de transporte da viagem.
 * Só troca os textos-padrão gerados pelo próprio sistema (não mexe em texto
 * digitado livremente pelo operador).
 */
export function mooveObservacoesTexto(r?: Partial<UberRequest> | null): string {
  const obs = String(r?.mooveObservacoes || '');
  if (!obs || !isAtendidoMoove(r)) return obs;
  const taxi = isMooveTaxi(r);
  if (taxi && obs.trim() === OBS_PADRAO_VAN) return OBS_PADRAO_TAXI;
  if (!taxi && obs.trim() === OBS_PADRAO_TAXI) return OBS_PADRAO_VAN;
  return obs;
}

/**
 * Retorna verdadeiro se a solicitação foi atendida pela Moove (Van ou Táxi).
 * Quando a MOOVE realizar o atendimento, o registro correspondente deve ser
 * isolado e exibido exclusivamente na guia da MOOVE, sem aparecer ou ser replicado na guia do COI.
 */
export function isAtendidoMoove(r?: Partial<UberRequest> | null): boolean {
  if (!r) return false;
  const statusStr = String(r.status || '').toLowerCase().trim();
  const mooveStatusStr = String(r.mooveStatus || '').toLowerCase().trim();

  // Compatibilidade com todas as variações literais e internas:
  // - "Atendido Moove" (chave interna padrão)
  // - "Atendido com Van pela Moove"
  // - "Atendido com Taxi pela Moove"
  // - r.mooveStatus === 'Atendido'
  // - r.mooveDadosVan ou r.mooveDadosTaxi preenchido
  if (
    statusStr === 'atendido moove' ||
    statusStr === 'atendido com van pela moove' ||
    statusStr === 'atendido com van (moove)' ||
    statusStr.includes('atendido com van') ||
    statusStr.includes('atendido com taxi') ||
    statusStr.includes('atendido com táxi') ||
    statusStr.includes('atendido moove') ||
    mooveStatusStr === 'atendido'
  ) {
    return true;
  }

  if (
    (r.mooveDadosVan || r.mooveDadosTaxi || r.mooveTipoTransporte) &&
    !r.mooveMotivoRecusaCOI &&
    (statusStr.includes('atendido') || statusStr.includes('van') || statusStr.includes('taxi') || statusStr.includes('táxi'))
  ) {
    return true;
  }

  return false;
}

/**
 * Configuração Dinâmica de Fluxo Operacional e Ativação de Guias
 * Controlado exclusivamente pelo Administrador Master nas Configurações
 */
export interface SystemWorkflowConfig {
  permitirMooveEnviarCoi: boolean;   // Master pode impedir ou permitir a Moove de repassar ao COI
  permitirCoiDevolverMoove: boolean; // Master pode impedir ou permitir o COI de devolver à Moove
  guiaSolicitarAtiva: boolean;       // Ativar/desativar Guia "Nova Solicitação"
  guiaAcompanharAtiva: boolean;      // Ativar/desativar Guia "Acompanhar Pedido"
  guiaMooveAtiva: boolean;           // Ativar/desativar Guia "Validação Moove"
  guiaCoiAtiva: boolean;             // Ativar/desativar Guia "Validação COI"
  uberSuspenso: boolean;             // Modo Moove Exclusivo: Uber suspenso e regras de horários (23:30 saída / 17:30 entrada)
  atualizadoEm?: string;
  atualizadoPor?: string;
}

export const DEFAULT_WORKFLOW_CONFIG: SystemWorkflowConfig = {
  permitirMooveEnviarCoi: true,
  permitirCoiDevolverMoove: true,
  guiaSolicitarAtiva: true,
  guiaAcompanharAtiva: true,
  guiaMooveAtiva: true,
  guiaCoiAtiva: true,
  uberSuspenso: true,
};


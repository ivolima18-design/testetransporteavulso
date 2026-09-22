import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Search,
  RefreshCw,
  FileSpreadsheet,
  AlertTriangle,
  Car,
  ExternalLink,
  KeyRound,
  User,
  LogOut,
  MapPin,
  Calendar,
  Phone,
  ShieldCheck,
  UserCheck,
  Eye,
  Copy,
  Check,
  List,
  LayoutGrid,
  MessageSquare,
  PhoneCall,
  X,
  CheckSquare,
  Square,
  Layers,
  ChevronDown,
  Trash2,
  Bus,
  Send,
  Printer,
  Undo2,
  Sparkles,
  Users,
  Route,
} from 'lucide-react';
import { printUberRequests } from '../utils/printOrder';
import {
  UberRequest,
  RequestStatus,
  UserAccount,
  isMasterAccount,
  canRunOperationalRoutines,
  canDeleteRequests as canDeleteRequestsPerm,
  isRepassadoAoCoi,
  isAtendidoMoove,
  isMooveTaxi,
  mooveObservacoesTexto,
  getRecusaOrigem,
  isRecusadoMoove,
  SystemWorkflowConfig,
  DEFAULT_WORKFLOW_CONFIG,
  JanelaCandidata,
  ClusterSugerido,
} from '../types';
import { ConfirmationPopup } from './ConfirmationPopup';
import { WorkflowTimeline } from './WorkflowTimeline';
import { ExportDropdown } from './ExportDropdown';
import {
  fetchRequests,
  updateRequestStatus,
  updateBulkRequestStatus,
  deleteUberRequest,
  triggerExcelDownload,
  GOOGLE_SHEETS_URL,
  syncAllRequestsToSheets,
  fetchServerConfig,
  getLocalWorkflowConfig,
  fetchWorkflowConfig,
  fetchGroupingSuggestions,
} from '../services/api';

export type ActionType =
  | 'moove_attend_van'
  | 'moove_attend_taxi'
  | 'moove_attend'
  | 'moove_send_coi'
  | 'coi_attend'
  | 'coi_reject'
  | 'coi_return_moove'
  | 'approve'
  | 'reject';

interface ManagerDashboardProps {
  currentUser: UserAccount | null;
  onRequireLogin: () => void;
  onLogout: () => void;
  moduleType?: 'coi' | 'moove';
  onNavigateToTab?: (tab: 'solicitar' | 'acompanhar' | 'coi' | 'moove') => void;
}

export const ManagerDashboard: React.FC<ManagerDashboardProps> = ({
  currentUser,
  onRequireLogin,
  onLogout,
  moduleType = 'coi',
  onNavigateToTab,
}) => {
  const isMoove = moduleType === 'moove';
  const moduleLabel = isMoove ? 'Validação Moove' : 'Validação COI';
  const roleDefault = isMoove ? 'Operador Moove' : 'Operador COI';

  const [allRequests, setAllRequests] = useState<UberRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Por padrão ao abrir a página, exibe apenas os pendentes do módulo ativo (Pendente Moove ou Pendente COI)
  const [filterStatus, setFilterStatus] = useState<string>(() => (isMoove ? 'Pendente Moove' : 'Pendente COI'));

  // Atualiza o filtro padrão se o módulo alternar entre Moove e COI
  useEffect(() => {
    setFilterStatus(isMoove ? 'Pendente Moove' : 'Pendente COI');
  }, [isMoove]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [viewMode, setViewMode] = useState<'linha' | 'card'>('linha');
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<UberRequest | null>(null);
  const [copiedDetailProtocol, setCopiedDetailProtocol] = useState(false);

  // Confirmation popup state (5 seconds)
  const [confirmationData, setConfirmationData] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    instructionsMessage?: string;
    protocol?: string;
    controlNumber?: string;
    collaboratorName?: string;
    type?: 'success' | 'info';
  } | null>(null);

  // Modals for approval / rejection / Moove & COI actions
  const [actionModalItem, setActionModalItem] = useState<{
    item: UberRequest;
    items?: UberRequest[];
    type: ActionType;
    clusterMeta?: {
      direcao: string;
      terminal: string;
      horarioReferencia: string;
    };
  } | null>(null);

  // Sugestões de Agrupamento Moove
  const [groupingJanelas, setGroupingJanelas] = useState<JanelaCandidata[]>([]);
  const [isLoadingGrouping, setIsLoadingGrouping] = useState(false);
  const [ignoredClusterKeys, setIgnoredClusterKeys] = useState<string[]>([]);

  // Moove Van & Taxi form states
  const [mooveDadosVan, setMooveDadosVan] = useState('');
  const [mooveDadosTaxi, setMooveDadosTaxi] = useState('');
  const [mooveNomeMotorista, setMooveNomeMotorista] = useState('');
  const [mooveHorarioChegada, setMooveHorarioChegada] = useState('');
  const [mooveObservacoes, setMooveObservacoes] = useState('');
  const [mooveMotivoRecusaCOI, setMooveMotivoRecusaCOI] = useState('');

  // Bulk selection and action state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkActionModal, setBulkActionModal] = useState<{
    isOpen: boolean;
    type: 'approve' | 'reject';
    items: UberRequest[];
  } | null>(null);
  const [bulkManagerNotes, setBulkManagerNotes] = useState('');
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [isHeaderSelectMenuOpen, setIsHeaderSelectMenuOpen] = useState(false);

  // Workflow Config (Controle de Repasse e Devolução)
  const [workflowConfig, setWorkflowConfig] = useState<SystemWorkflowConfig>(getLocalWorkflowConfig());

  useEffect(() => {
    const handleConfigChanged = (e: any) => {
      if (e.detail) {
        setWorkflowConfig(e.detail);
      } else {
        setWorkflowConfig(getLocalWorkflowConfig());
      }
    };
    window.addEventListener('wfs:workflow-config-changed', handleConfigChanged);
    fetchWorkflowConfig().then(setWorkflowConfig).catch(() => {});
    return () => window.removeEventListener('wfs:workflow-config-changed', handleConfigChanged);
  }, []);

  const [managerNotes, setManagerNotes] = useState('');
  const [voucherCode, setVoucherCode] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [sheetsStatusMessage, setSheetsStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isMaster = isMasterAccount(currentUser);
  // Exportar e sincronizar fazem parte da rotina de atendimento do operador
  const canUseDatabaseTools = canRunOperationalRoutines(currentUser);
  // Exclusão real de solicitações: restrita a Master, Admin ou Gestor com permissão de gerenciamento
  const canDeleteRequests = canDeleteRequestsPerm(currentUser);

  const [deleteModalItem, setDeleteModalItem] = useState<UberRequest | null>(null);
  const [isDeletingRequest, setIsDeletingRequest] = useState(false);

  // Load data
  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchRequests({
        search: searchQuery,
        date: selectedDate,
      });
      setAllRequests(data);
    } catch (err) {
      console.error('Erro ao carregar dados do gestor:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncWithSheets = async () => {
    if (!canRunOperationalRoutines(currentUser)) {
      setSheetsStatusMessage({
        type: 'error',
        text: 'Faça login com um usuário ativo do sistema para sincronizar as solicitações.',
      });
      return;
    }
    setIsSyncingSheets(true);
    setSheetsStatusMessage(null);
    try {
      const listToSync = allRequests.length > 0 ? allRequests : [];
      const res = await syncAllRequestsToSheets(listToSync);
      setSheetsStatusMessage({
        type: 'success',
        text: res.message || `${res.syncedCount} solicitações sincronizadas com a planilha Google Sheets!`,
      });
      loadData();
    } catch (e: any) {
      setSheetsStatusMessage({
        type: 'error',
        text: e.message || 'Erro ao sincronizar com Google Sheets. Verifique a URL do webhook nas configurações.',
      });
    } finally {
      setIsSyncingSheets(false);
      setTimeout(() => setSheetsStatusMessage(null), 7000);
    }
  };

  const handleExportExcel = async () => {
    if (!canRunOperationalRoutines(currentUser)) {
      setSheetsStatusMessage({
        type: 'error',
        text: 'Faça login com um usuário ativo do sistema para exportar as solicitações.',
      });
      return;
    }
    setIsExportingExcel(true);
    setSheetsStatusMessage(null);
    try {
      const res = await triggerExcelDownload(sortedRequests);
      setSheetsStatusMessage({
        type: 'success',
        text: res.message,
      });
    } catch (e: any) {
      setSheetsStatusMessage({
        type: 'error',
        text: e.message || 'Erro ao exportar a planilha em Excel.',
      });
    } finally {
      setIsExportingExcel(false);
      setTimeout(() => setSheetsStatusMessage(null), 9000);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [currentUser, searchQuery, selectedDate]);

  const loadGroupingSuggestions = async () => {
    if (!isMoove) return;
    setIsLoadingGrouping(true);
    try {
      const res = await fetchGroupingSuggestions();
      setGroupingJanelas(res.janelas || []);
    } catch (err) {
      console.warn('Erro ao carregar sugestões de agrupamento:', err);
    } finally {
      setIsLoadingGrouping(false);
    }
  };

  useEffect(() => {
    if (currentUser && isMoove && filterStatus === 'Pendente Moove') {
      loadGroupingSuggestions();
    }
  }, [currentUser, isMoove, filterStatus]);

  const handleOpenMooveAttendGroupVanModal = (
    cluster: ClusterSugerido,
    janela: JanelaCandidata
  ) => {
    if (!cluster.solicitacoes || cluster.solicitacoes.length === 0) return;
    const firstItem = cluster.solicitacoes[0];

    setActionModalItem({
      item: firstItem,
      items: cluster.solicitacoes,
      type: 'moove_attend_van',
      clusterMeta: {
        direcao: String(janela.direcao),
        terminal: janela.terminal,
        horarioReferencia: janela.horarioReferencia,
      },
    });

    setMooveDadosVan(firstItem.mooveDadosVan || 'Van Executiva Moove');
    setMooveDadosTaxi('');
    setMooveNomeMotorista(firstItem.mooveNomeMotorista || '');
    setMooveHorarioChegada(firstItem.mooveHorarioChegada || janela.horarioReferencia || firstItem.horarioTermino || '');
    setMooveObservacoes(
      firstItem.mooveObservacoes ||
        `Grupo Moove (${janela.direcao} • ${janela.terminal}). Paradas roteirizadas por proximidade.`
    );
  };

  const handleOpenMooveAttendVanModal = (item: UberRequest) => {
    setActionModalItem({ item, type: 'moove_attend_van' });
    setMooveDadosVan(item.mooveDadosVan || '');
    setMooveDadosTaxi('');
    setMooveNomeMotorista(item.mooveNomeMotorista || '');
    setMooveHorarioChegada(item.mooveHorarioChegada || item.horarioTermino || '');
    setMooveObservacoes(item.mooveObservacoes || 'Embarque no bolsão de vans T2');
  };

  const handleOpenMooveAttendTaxiModal = (item: UberRequest) => {
    setActionModalItem({ item, type: 'moove_attend_taxi' });
    setMooveDadosTaxi(item.mooveDadosTaxi || '');
    setMooveDadosVan('');
    setMooveNomeMotorista(item.mooveNomeMotorista || '');
    setMooveHorarioChegada(item.mooveHorarioChegada || item.horarioTermino || '');
    setMooveObservacoes(item.mooveObservacoes || 'Ponto de encontro Táxi - Desembarque Terminal 2');
  };

  const handleOpenMooveAttendModal = (item: UberRequest) => {
    if (isMooveTaxi(item)) {
      handleOpenMooveAttendTaxiModal(item);
    } else {
      handleOpenMooveAttendVanModal(item);
    }
  };

  const handleOpenMooveSendCoiModal = (item: UberRequest) => {
    setActionModalItem({ item, type: 'moove_send_coi' });
    setMooveMotivoRecusaCOI(
      item.mooveMotivoRecusaCOI ||
      'Sem van ou táxi disponível para este horário/itinerário. Encaminhado para análise e emissão pelo plantão COI.'
    );
  };

  const handleOpenCoiAttendModal = (item: UberRequest) => {
    setActionModalItem({ item, type: 'coi_attend' });
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    setVoucherCode(item.voucherUber || item.coiVoucherUber || `WFS-TRP-GRU-${randomSuffix}`);
    setManagerNotes(item.observacoesGestor || item.coiObservacoes || 'Aprovado pelo plantão COI. Horário sem transporte público regular disponível.');
  };

  const handleOpenCoiRejectModal = (item: UberRequest) => {
    setActionModalItem({ item, type: 'coi_reject' });
    setVoucherCode('');
    setManagerNotes(item.motivoRecusa || item.coiMotivoRecusa || 'Transporte público municipal operando normalmente no horário solicitado.');
  };

  const handleOpenCoiReturnMooveModal = (item: UberRequest) => {
    setActionModalItem({ item, type: 'coi_return_moove' });
    setVoucherCode('');
    setManagerNotes(
      item.coiMotivoDevolucaoMoove ||
      'Identificada viabilidade de atendimento pela Moove (Van/Táxi). Devolvido pelo plantão COI para reavaliação.'
    );
  };

  const handleOpenActionModal = (item: UberRequest, type: 'approve' | 'reject') => {
    if (isMoove) {
      if (type === 'approve') {
        handleOpenMooveAttendModal(item);
      } else {
        handleOpenMooveSendCoiModal(item);
      }
    } else {
      if (type === 'approve') {
        handleOpenCoiAttendModal(item);
      } else {
        handleOpenCoiRejectModal(item);
      }
    }
  };

  // Close action modals on Escape key press
  useEffect(() => {
    if (!actionModalItem && !bulkActionModal && !selectedOrderDetail && !deleteModalItem) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (deleteModalItem) {
          setDeleteModalItem(null);
        } else if (bulkActionModal) {
          setBulkActionModal(null);
        } else if (actionModalItem) {
          setActionModalItem(null);
        } else if (selectedOrderDetail) {
          setSelectedOrderDetail(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actionModalItem, bulkActionModal, selectedOrderDetail, deleteModalItem]);

  const handleConfirmDelete = async () => {
    if (!deleteModalItem) return;
    if (!canDeleteRequestsPerm(currentUser)) {
      setSheetsStatusMessage({
        type: 'error',
        text: 'A exclusão de solicitações é exclusiva do Administrador Master.',
      });
      setDeleteModalItem(null);
      return;
    }
    setIsDeletingRequest(true);
    const itemToDelete = deleteModalItem;

    try {
      const result = await deleteUberRequest(itemToDelete.id);
      setDeleteModalItem(null);
      setSelectedOrderDetail(null);
      setSelectedIds((prev) => prev.filter((sid) => sid !== itemToDelete.id));
      await loadData();

      setConfirmationData({
        isOpen: true,
        title: 'Solicitação Excluída com Sucesso!',
        subtitle: result.sheetsSynced
          ? 'A solicitação foi removida definitivamente do sistema e da planilha.'
          : 'A solicitação foi removida do sistema. Confira a planilha — pode ser necessário remover a linha manualmente.',
        protocol: itemToDelete.protocolo,
        collaboratorName: `${itemToDelete.nome} ${itemToDelete.sobrenome}`,
        type: result.sheetsSynced ? 'success' : 'info',
      });
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir solicitação');
    } finally {
      setIsDeletingRequest(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!actionModalItem) return;
    setIsProcessingAction(true);

    const itemToConfirm = actionModalItem.item;
    const approverName = currentUser
      ? `${currentUser.nome} (${isMaster ? 'Master WFS' : currentUser.funcao || roleDefault})`
      : `${roleDefault} WFS`;

    try {
      if (actionModalItem.type === 'moove_attend_van' || actionModalItem.type === 'moove_attend') {
        if (!mooveDadosVan.trim() || !mooveNomeMotorista.trim() || !mooveHorarioChegada.trim()) {
          alert('Por favor, preencha os dados da Van, o nome do motorista e o horário de chegada.');
          setIsProcessingAction(false);
          return;
        }

        const itemsToProcess =
          actionModalItem.items && actionModalItem.items.length > 0
            ? actionModalItem.items
            : [itemToConfirm];

        for (const item of itemsToProcess) {
          await updateRequestStatus(item.id, {
            status: 'Atendido Moove',
            mooveStatus: 'Atendido',
            mooveTipoTransporte: 'Van',
            mooveDadosVan: mooveDadosVan.trim(),
            mooveDadosTaxi: '',
            mooveNomeMotorista: mooveNomeMotorista.trim(),
            mooveHorarioChegada: mooveHorarioChegada.trim(),
            mooveObservacoes: mooveObservacoes.trim(),
            mooveAtendidoPor: approverName,
            aprovadoPor: approverName,
          });
        }

        setActionModalItem(null);
        await loadData();
        loadGroupingSuggestions();

        const isGroup = itemsToProcess.length > 1;
        setConfirmationData({
          isOpen: true,
          title: isGroup
            ? `Grupo de ${itemsToProcess.length} Solicitações Atendido via Van pela Moove!`
            : 'Transporte Atendido via Van pela Moove!',
          subtitle: `A Van (${mooveDadosVan.trim()}) com o motorista ${mooveNomeMotorista.trim()} chegará às ${mooveHorarioChegada.trim()}. ${
            isGroup ? 'Os colaboradores já podem acompanhar seus itinerários.' : 'O colaborador já pode acompanhar no painel.'
          }`,
          protocol: itemsToProcess.map((it) => it.protocolo).join(', '),
          collaboratorName: isGroup
            ? `${itemsToProcess.length} colaboradores atendidos em rota integrada`
            : `${itemToConfirm.nome} ${itemToConfirm.sobrenome}`,
          type: 'success',
        });
      } else if (actionModalItem.type === 'moove_attend_taxi') {
        if (!mooveDadosTaxi.trim() || !mooveNomeMotorista.trim() || !mooveHorarioChegada.trim()) {
          alert('Por favor, preencha os dados do Táxi, o nome do motorista e o horário de chegada.');
          setIsProcessingAction(false);
          return;
        }

        await updateRequestStatus(itemToConfirm.id, {
          status: 'Atendido Moove',
          mooveStatus: 'Atendido',
          mooveTipoTransporte: 'Taxi',
          mooveDadosTaxi: mooveDadosTaxi.trim(),
          mooveDadosVan: '',
          mooveNomeMotorista: mooveNomeMotorista.trim(),
          mooveHorarioChegada: mooveHorarioChegada.trim(),
          mooveObservacoes: mooveObservacoes.trim(),
          mooveAtendidoPor: approverName,
          aprovadoPor: approverName,
        });

        setActionModalItem(null);
        await loadData();

        setConfirmationData({
          isOpen: true,
          title: 'Transporte Atendido via Táxi pela Moove!',
          subtitle: `O Táxi (${mooveDadosTaxi.trim()}) com o motorista ${mooveNomeMotorista.trim()} chegará às ${mooveHorarioChegada.trim()}. O colaborador já pode acompanhar no painel.`,
          protocol: itemToConfirm.protocolo,
          collaboratorName: `${itemToConfirm.nome} ${itemToConfirm.sobrenome}`,
          type: 'success',
        });
      } else if (actionModalItem.type === 'moove_send_coi') {
        if (!workflowConfig.permitirMooveEnviarCoi) {
          alert('O repasse de solicitações da Moove para o COI está temporariamente bloqueado pelo Administrador Master nas configurações.');
          setIsProcessingAction(false);
          return;
        }

        if (!mooveMotivoRecusaCOI.trim()) {
          alert('Por favor, informe a observação / motivo do envio ao COI.');
          setIsProcessingAction(false);
          return;
        }

        await updateRequestStatus(itemToConfirm.id, {
          status: 'Pendente COI',
          mooveStatus: 'Recusado_Enviado_COI',
          mooveMotivoRecusaCOI: mooveMotivoRecusaCOI.trim(),
          mooveObservacoes: mooveMotivoRecusaCOI.trim(),
          mooveAtendidoPor: approverName,
          aprovadoPor: approverName,
        });

        setActionModalItem(null);
        await loadData();

        setConfirmationData({
          isOpen: true,
          title: 'Recusado na Moove e Enviado para o COI!',
          subtitle: 'A solicitação foi transferida para a 2ª etapa no plantão do COI para avaliação e emissão de Uber.',
          protocol: itemToConfirm.protocolo,
          collaboratorName: `${itemToConfirm.nome} ${itemToConfirm.sobrenome}`,
          type: 'info',
        });
      } else if (actionModalItem.type === 'coi_attend' || actionModalItem.type === 'approve') {
        const controlNum = voucherCode.trim() || `WFS-TRP-GRU-${Math.floor(1000 + Math.random() * 9000)}`;

        await updateRequestStatus(itemToConfirm.id, {
          status: 'Aprovado COI',
          coiStatus: 'Atendido',
          voucherUber: controlNum,
          coiVoucherUber: controlNum,
          observacoesGestor: managerNotes,
          coiObservacoes: managerNotes,
          coiAtendidoPor: approverName,
          aprovadoPor: approverName,
        });

        setActionModalItem(null);
        await loadData();

        setConfirmationData({
          isOpen: true,
          title: 'Solicitação Autorizada pelo COI!',
          subtitle: 'Voucher Uber / Nº de Controle gerado e sincronizado com a planilha oficial.',
          instructionsMessage: 'Seu pedido será atendido via Uber. Fique atento ao número de WhatsApp informado na solicitação. Em caso de dúvidas, contate o responsável que realizou o pedido.',
          protocol: itemToConfirm.protocolo,
          controlNumber: controlNum,
          collaboratorName: `${itemToConfirm.nome} ${itemToConfirm.sobrenome}`,
          type: 'success',
        });
      } else if (actionModalItem.type === 'coi_reject' || actionModalItem.type === 'reject') {
        const reason = managerNotes.trim() || 'Transporte público municipal operando normalmente.';

        await updateRequestStatus(itemToConfirm.id, {
          status: 'Recusado COI',
          coiStatus: 'Recusado',
          motivoRecusa: reason,
          observacoesGestor: reason,
          coiMotivoRecusa: reason,
          recusadoPor: 'COI',
          coiAtendidoPor: approverName,
          aprovadoPor: approverName,
        });

        setActionModalItem(null);
        await loadData();

        setConfirmationData({
          isOpen: true,
          title: 'Solicitação Recusada pelo COI',
          subtitle: 'A justificativa de recusa foi registrada no sistema e sincronizada.',
          protocol: itemToConfirm.protocolo,
          collaboratorName: `${itemToConfirm.nome} ${itemToConfirm.sobrenome}`,
          type: 'info',
        });
      } else if (actionModalItem.type === 'coi_return_moove') {
        if (!workflowConfig.permitirCoiDevolverMoove) {
          alert('A devolução de solicitações do COI para a Moove está temporariamente bloqueada pelo Administrador Master nas configurações.');
          setIsProcessingAction(false);
          return;
        }

        const reason = managerNotes.trim();
        if (!reason) {
          alert('Por favor, informe a justificativa da devolução para a Moove.');
          setIsProcessingAction(false);
          return;
        }

        const nowIso = new Date().toISOString();
        await updateRequestStatus(itemToConfirm.id, {
          status: 'Pendente Moove',
          mooveStatus: 'Pendente',
          coiStatus: undefined,
          mooveMotivoRecusaCOI: undefined,
          coiMotivoDevolucaoMoove: reason,
          coiDevolvidoPor: approverName,
          coiDataDevolucao: nowIso,
          observacoesGestor: `Devolvido para a Moove pelo COI: ${reason}`,
          coiObservacoes: `Devolvido para a Moove pelo COI: ${reason}`,
          coiMotivoRecusa: undefined,
          aprovadoPor: approverName,
        });

        setActionModalItem(null);
        await loadData();

        setConfirmationData({
          isOpen: true,
          title: 'Solicitação Devolvida para a Moove!',
          subtitle: 'O pedido retornou com sucesso para a fila de validação da Moove.',
          instructionsMessage: 'A equipe Moove foi notificada com a justificativa de devolução registrada para reprogramar a Van ou Táxi.',
          protocol: itemToConfirm.protocolo,
          collaboratorName: `${itemToConfirm.nome} ${itemToConfirm.sobrenome}`,
          type: 'info',
        });
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao processar ação');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // If user is not authenticated, display login prompt
  if (!currentUser) {
    return (
      <div className="w-full max-w-md mx-auto py-12">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
          <div className="w-14 h-14 bg-red-50 text-[#E31837] rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-100">
            <KeyRound className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Acesso Restrito - {moduleLabel}</h3>
          <p className="text-xs text-slate-500 mt-1 mb-6">
            O acesso a esta área exige autenticação com e-mail e senha cadastrados.
          </p>

          <button
            type="button"
            onClick={onRequireLogin}
            className="w-full py-3 bg-[#E31837] hover:bg-[#c4122d] text-white font-bold text-sm rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <Shield className="w-4 h-4" />
            Identificar-se / Login {isMoove ? 'Moove' : 'COI'}
          </button>

          <div className="mt-6 pt-6 border-t border-slate-100 text-[11px] text-slate-400">
            WFS A SATS COMPANY • Operações Aeroporto GRU
          </div>
        </div>
      </div>
    );
  }

  // Pedidos sob a gestão do módulo atual:
  // - Na guia da Moove: exibe todos os pedidos ativos da Moove (Pendentes e Atendidos)
  //   e também fornece rastreabilidade completa das solicitações que a Moove recusou e repassou ao COI,
  //   sem alterar em nada o fluxo operacional estabelecido.
  // - Na guia do COI: quando a MOOVE realizar o atendimento, o registro correspondente é isolado e exibido exclusivamente
  //   na guia da MOOVE, sem aparecer ou ser replicado na guia do COI.
  const requests = isMoove
    ? allRequests.filter((r) => !isRepassadoAoCoi(r) || isRecusadoMoove(r))
    : allRequests.filter((r) => !isAtendidoMoove(r));

  // Metrics
  const totalCount = requests.length;
  // Moove metrics:
  const moovePendingCount = allRequests.filter((r) => !isRepassadoAoCoi(r) && (r.status === 'Pendente Moove' || (r.status === 'Pendente' && !r.mooveStatus))).length;
  const mooveAttendedCount = allRequests.filter((r) => !isRepassadoAoCoi(r) && isAtendidoMoove(r)).length;
  const mooveSentToCoiCount = allRequests.filter((r) => isRecusadoMoove(r)).length;

  // COI metrics:
  const coiPendingCount = allRequests.filter((r) => !isAtendidoMoove(r) && (r.status === 'Pendente COI' || (r.status === 'Pendente' && r.mooveStatus === 'Recusado_Enviado_COI'))).length;
  const coiApprovedCount = allRequests.filter((r) => !isAtendidoMoove(r) && (r.status === 'Aprovado COI' || r.status === 'Aprovado')).length;
  const coiRejectedCount = allRequests.filter((r) => !isAtendidoMoove(r) && (r.status === 'Recusado COI' || r.status === 'Recusado')).length;

  const pendingCount = isMoove ? moovePendingCount : coiPendingCount;
  const approvedCount = isMoove ? mooveAttendedCount : coiApprovedCount;
  const rejectedCount = isMoove ? mooveSentToCoiCount : coiRejectedCount;

  // Helper para verificar se a solicitação está pendente no módulo ativo
  const isItemPending = (r: UberRequest) => {
    if (isMoove) {
      return !isRepassadoAoCoi(r) && (r.status === 'Pendente Moove' || (r.status === 'Pendente' && !r.mooveStatus));
    }
    return r.status === 'Pendente COI' || (r.status === 'Pendente' && r.mooveStatus === 'Recusado_Enviado_COI');
  };

  // Filtragem por status da aba
  const filteredRequests = requests.filter((r) => {
    if (!filterStatus || filterStatus === 'Todos') return true;
    if (isMoove) {
      if (filterStatus === 'Pendente Moove') {
        return r.status === 'Pendente Moove' || (r.status === 'Pendente' && !r.mooveStatus);
      }
      if (filterStatus === 'Atendido Moove') {
        return isAtendidoMoove(r);
      }
      if (filterStatus === 'Recusado Moove') {
        return isRecusadoMoove(r);
      }
      return true;
    } else {
      if (filterStatus === 'Pendente COI') {
        return r.status === 'Pendente COI' || (r.status === 'Pendente' && r.mooveStatus === 'Recusado_Enviado_COI');
      }
      if (filterStatus === 'Aprovado COI') {
        return r.status === 'Aprovado COI' || r.status === 'Aprovado';
      }
      if (filterStatus === 'Recusado COI') {
        return r.status === 'Recusado COI' || r.status === 'Recusado';
      }
      return true;
    }
  });

  // Classificação: sempre colocando os mais novos em cima
  const sortedRequests = [...filteredRequests].sort((a, b) => {
    const timeA = a.dataCriacao ? new Date(a.dataCriacao).getTime() : 0;
    const timeB = b.dataCriacao ? new Date(b.dataCriacao).getTime() : 0;
    if (timeB !== timeA) return timeB - timeA;
    return (b.protocolo || '').localeCompare(a.protocolo || '');
  });

  // Bulk selection calculations
  const visibleIds = sortedRequests.map((r) => r.id);
  const pendingVisibleRequests = sortedRequests.filter(isItemPending);
  const pendingVisibleIds = pendingVisibleRequests.map((r) => r.id);

  const isAllPendingSelected =
    pendingVisibleIds.length > 0 && pendingVisibleIds.every((id) => selectedIds.includes(id));
  const isSomePendingSelected =
    pendingVisibleIds.some((id) => selectedIds.includes(id));

  const isAllVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const isSomeVisibleSelected =
    visibleIds.some((id) => selectedIds.includes(id));

  const selectedRequests = requests.filter((r) => selectedIds.includes(r.id));
  const selectedPendingCount = selectedRequests.filter(isItemPending).length;
  const selectedNonPendingCount = selectedRequests.filter((r) => !isItemPending(r)).length;

  // Sugestões ativas de agrupamento para a visão Moove
  const suggestedClustersList: {
    key: string;
    janela: JanelaCandidata;
    cluster: ClusterSugerido;
  }[] = [];

  if (isMoove && filterStatus === 'Pendente Moove') {
    groupingJanelas.forEach((janela) => {
      janela.clusters?.forEach((cluster) => {
        if (cluster.sugerido && cluster.solicitacoes && cluster.solicitacoes.length > 0) {
          const clusterKey = `${janela.direcao}_${janela.dataEvento}_${janela.terminal}_${janela.horarioReferencia}_${cluster.solicitacoes.map((s) => s.id).sort().join('_')}`;
          if (!ignoredClusterKeys.includes(clusterKey)) {
            suggestedClustersList.push({
              key: clusterKey,
              janela,
              cluster,
            });
          }
        }
      });
    });
  }

  const handleToggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllVisible = () => {
    if (isAllVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  // Select EXCLUSIVELY what is pending (marcar apenas o que tá pendente)
  const handleSelectOnlyPending = () => {
    setSelectedIds(pendingVisibleIds);
  };

  const handleSelectAllPending = () => {
    const pendingIds = sortedRequests
      .filter(isItemPending)
      .map((r) => r.id);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...pendingIds])));
  };

  // Header checkbox smart toggle:
  // If there are pending requests, toggles selecting ONLY the pending requests.
  // If there are no pending requests, toggles all visible.
  const handleHeaderCheckboxToggle = () => {
    if (pendingVisibleIds.length > 0) {
      if (isAllPendingSelected) {
        setSelectedIds((prev) => prev.filter((id) => !pendingVisibleIds.includes(id)));
      } else {
        handleSelectOnlyPending();
      }
    } else {
      handleSelectAllVisible();
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const handleOpenBulkActionModal = (type: 'approve' | 'reject') => {
    const items = requests.filter((r) => selectedIds.includes(r.id));
    if (items.length === 0) return;

    setBulkActionModal({
      isOpen: true,
      type,
      items,
    });

    if (type === 'approve') {
      setBulkManagerNotes(`Aprovado em lote pelo plantão ${isMoove ? 'Moove' : 'COI'}. Horário sem transporte público regular disponível.`);
    } else {
      setBulkManagerNotes('Transporte público municipal operando normalmente no horário solicitado.');
    }
  };

  const handleConfirmBulkAction = async () => {
    if (!bulkActionModal) return;
    setIsProcessingBulk(true);

    const isApprove = bulkActionModal.type === 'approve';
    const approverName = currentUser
      ? `${currentUser.nome} (${isMaster ? 'Master WFS' : currentUser.funcao || roleDefault})`
      : `${roleDefault} WFS`;

    const itemsToUpdate = bulkActionModal.items.map((item) => {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const voucherUber = isApprove ? `WFS-TRP-GRU-${randomSuffix}` : undefined;
      return {
        id: item.id,
        status: (isApprove ? 'Aprovado' : 'Recusado') as RequestStatus,
        aprovadoPor: approverName,
        observacoesGestor: bulkManagerNotes,
        motivoRecusa: !isApprove ? bulkManagerNotes : undefined,
        recusadoPor: !isApprove ? (isMoove ? ('Moove' as const) : ('COI' as const)) : undefined,
        voucherUber,
      };
    });

    try {
      const res = await updateBulkRequestStatus(itemsToUpdate);
      const affectedCount = res.updatedCount || itemsToUpdate.length;

      setBulkActionModal(null);
      setSelectedIds([]);
      await loadData();

      setConfirmationData({
        isOpen: true,
        title: isApprove
          ? `${affectedCount} Solicitações Aprovadas em Massa!`
          : `${affectedCount} Solicitações Recusadas em Massa!`,
        subtitle: isApprove
          ? `Todas as ${affectedCount} solicitações foram autorizadas com números de controle interno individuais gerados e sincronizados com a planilha.`
          : `Todas as ${affectedCount} solicitações foram recusadas com a respectiva justificativa registrada no sistema.`,
        instructionsMessage: isApprove
          ? 'Os pedidos foram atendidos via Uber. Oriente os colaboradores a ficarem atentos ao número de WhatsApp cadastrado. Em caso de dúvidas, contate o responsável que realizou o pedido.'
          : undefined,
        type: isApprove ? 'success' : 'info',
      });
    } catch (err: any) {
      alert(err.message || 'Erro ao processar ação em massa');
    } finally {
      setIsProcessingBulk(false);
    }
  };

  // Badge com status piscando de pendente ou atendido
  const renderStatusBadge = (status: RequestStatus, item?: UberRequest) => {
    if (status === 'Pendente Moove' || status === 'Pendente') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-900 border border-amber-300 shadow-2xs whitespace-nowrap">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-80"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
          </span>
          Pendente Moove (1ª Etapa)
        </span>
      );
    }
    const s = String(status || '').toLowerCase().trim();
    if (
      status === 'Atendido Moove' ||
      s === 'atendido com van pela moove' ||
      s === 'atendido com van (moove)' ||
      s.includes('atendido com van') ||
      s.includes('atendido moove') ||
      (item && isAtendidoMoove(item))
    ) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-2xs whitespace-nowrap">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          {item ? (isMooveTaxi(item) ? 'Atendido Moove Taxi' : 'Atendido Moove Van') : 'Atendido Moove'}
        </span>
      );
    }
    if (status === 'Pendente COI') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-purple-50 text-purple-900 border border-purple-300 shadow-2xs whitespace-nowrap">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-80"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500"></span>
          </span>
          ⏳ Pendente COI (2ª Etapa)
        </span>
      );
    }
    if (status === 'Aprovado COI' || status === 'Aprovado') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-2xs whitespace-nowrap">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
          🚗 Uber Autorizado (COI)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 whitespace-nowrap">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-500"></span>
        ✕ Recusado
      </span>
    );
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Top Header & Actions Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-[#E31837] border border-red-100">
                <Shield className="w-3.5 h-3.5" />
                {moduleLabel} • Módulo de Decisão
              </div>

              {isMaster && (
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                  Administrador Master
                </div>
              )}
            </div>

            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {moduleLabel}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Avalie solicitações de transporte avulso, atribua o número de controle interno, recuse justificadamente e sincronize os registros com a planilha.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {canUseDatabaseTools && (
            <button
              type="button"
              disabled={isSyncingSheets}
              onClick={handleSyncWithSheets}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition-all flex items-center gap-2 shadow-xs disabled:opacity-50"
              title="Enviar e sincronizar todas as solicitações com a planilha Google Sheets oficial"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncingSheets ? 'animate-spin' : ''}`} />
              <span>{isSyncingSheets ? 'Sincronizando...' : 'Sincronizar com Planilha'}</span>
            </button>
            )}

            {canUseDatabaseTools && (
              <ExportDropdown
                requests={sortedRequests}
                disabled={isExportingExcel}
                onExportStart={() => {
                  setSheetsStatusMessage(null);
                }}
                onExportComplete={(format, count) => {
                  const formatLabels: Record<'xlsx' | 'csv' | 'pdf', string> = {
                    xlsx: 'Excel (.xlsx)',
                    csv: 'CSV (Texto Delimitado)',
                    pdf: 'PDF (Relatório Oficial)',
                  };
                  setSheetsStatusMessage({
                    type: 'success',
                    text: `Exportação em ${formatLabels[format]} concluída com sucesso (${count} registros)!`,
                  });
                  setTimeout(() => setSheetsStatusMessage(null), 8000);
                }}
                onExportError={(err) => {
                  setSheetsStatusMessage({
                    type: 'error',
                    text: err.message || 'Erro ao gerar arquivo de exportação.',
                  });
                  setTimeout(() => setSheetsStatusMessage(null), 8000);
                }}
              />
            )}

            <button
              type="button"
              onClick={loadData}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors"
              title="Atualizar lista de solicitações"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Notificação de Sincronização */}
        {sheetsStatusMessage && (
          <div
            className={`mt-3 p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
              sheetsStatusMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {sheetsStatusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              )}
              <span>{sheetsStatusMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setSheetsStatusMessage(null)}
              className="text-slate-400 hover:text-slate-700 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Informações do usuário logado */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-slate-400" />
            <span>
              Gestor ativo: <strong>{currentUser.nome}</strong> ({currentUser.email})
            </span>
            <span>•</span>
            <span>Função: {currentUser.funcao || 'Gestor de Operações'}</span>
            {currentUser.matricula && (
              <>
                <span>•</span>
                <span>Matrícula: {currentUser.matricula}</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="text-xs text-[#E31837] hover:underline font-semibold flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            Encerrar Sessão
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-slate-100">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-xs font-semibold text-slate-500 block">Total de Pedidos</span>
            <strong className="text-2xl font-black text-slate-900 block mt-1">{totalCount}</strong>
            <span className="text-[11px] text-slate-400">
              {isMoove ? 'Sob gestão da Moove' : 'Registros no sistema'}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-900">
                {isMoove ? 'Pendentes Moove' : 'Pendentes COI'}
              </span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <strong className="text-2xl font-black text-amber-900 block mt-1">
              {isMoove ? moovePendingCount : coiPendingCount}
            </strong>
            <span className="text-[11px] text-amber-700">
              {isMoove ? '1ª etapa de validação' : '2ª etapa (após recusa Moove)'}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-900">
                {isMoove ? 'Atendido Moove' : 'Uber Autorizados'}
              </span>
              {isMoove ? (
                <Bus className="w-4 h-4 text-emerald-600" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              )}
            </div>
            <strong className="text-2xl font-black text-emerald-900 block mt-1">
              {isMoove ? mooveAttendedCount : coiApprovedCount}
            </strong>
            <span className="text-[11px] text-emerald-700">
              {isMoove ? 'Atendidos pela Moove (Van ou Táxi)' : 'Voucher Uber emitido'}
            </span>
          </div>

          <div
            onClick={() => {
              if (isMoove) {
                setFilterStatus('Recusado Moove');
              } else {
                setFilterStatus('Recusado COI');
              }
            }}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              isMoove
                ? 'bg-purple-50/70 border-purple-200 hover:bg-purple-100/80 group'
                : 'bg-rose-50/70 border-rose-200 hover:bg-rose-100/80 group'
            }`}
            title={isMoove ? 'Clique para filtrar solicitações recusadas pela Moove e repassadas ao COI' : 'Clique para filtrar solicitações recusadas pelo COI'}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold ${isMoove ? 'text-purple-900 group-hover:underline' : 'text-rose-900 group-hover:underline'}`}>
                {isMoove ? 'Recusados pela Moove' : 'Recusados pelo COI'}
              </span>
              {isMoove ? (
                <Send className="w-4 h-4 text-purple-600" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-600" />
              )}
            </div>
            <strong className={`text-2xl font-black block mt-1 ${isMoove ? 'text-purple-900' : 'text-rose-900'}`}>
              {isMoove ? mooveSentToCoiCount : coiRejectedCount}
            </strong>
            <span className={`text-[11px] ${isMoove ? 'text-purple-700 font-medium' : 'text-rose-700'}`}>
              {isMoove ? 'Rastreabilidade Moove > COI' : 'Sem liberação de Uber'}
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {(isMoove
            ? [
                { id: 'Todos', label: 'Todos', count: totalCount },
                { id: 'Pendente Moove', label: 'Pendentes Moove', count: moovePendingCount, badgeColor: 'bg-amber-500' },
                { id: 'Atendido Moove', label: 'Atendido Moove', count: mooveAttendedCount, badgeColor: 'bg-emerald-600' },
                { id: 'Recusado Moove', label: 'Recusados pela Moove', count: mooveSentToCoiCount, badgeColor: 'bg-purple-600' },
              ]
            : [
                { id: 'Todos', label: 'Todos', count: totalCount },
                { id: 'Pendente COI', label: 'Pendentes COI', count: coiPendingCount, badgeColor: 'bg-amber-500' },
                { id: 'Aprovado COI', label: 'Uber Autorizados', count: coiApprovedCount, badgeColor: 'bg-emerald-600' },
                { id: 'Recusado COI', label: 'Recusados', count: coiRejectedCount, badgeColor: 'bg-rose-600' },
              ]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                filterStatus === tab.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-white text-[10px] ${tab.badgeColor || 'bg-slate-500'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search, Date Filter & View Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar colaborador, protocolo, tel..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
            />
          </div>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-xs py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-700"
            title="Filtrar por data do evento"
          />

          {selectedDate && (
            <button
              type="button"
              onClick={() => setSelectedDate('')}
              className="text-[11px] text-slate-500 hover:text-slate-800 font-medium"
            >
              Limpar
            </button>
          )}

          {/* Quick select pending button */}
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={handleSelectOnlyPending}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border shadow-2xs cursor-pointer ${
                isAllPendingSelected
                  ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600'
                  : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
              }`}
              title="Marcar apenas solicitações que estão aguardando aprovação/recusa"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Marcar apenas pendentes</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  isAllPendingSelected ? 'bg-amber-700 text-white' : 'bg-amber-200 text-amber-950'
                }`}
              >
                {pendingCount}
              </span>
            </button>
          )}

          {/* Toggle Visão: Linha (Tabela) vs Cartões */}
          <div className="flex items-center gap-1 border border-slate-200 rounded-xl p-0.5 bg-slate-50">
            <button
              type="button"
              onClick={() => setViewMode('linha')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'linha'
                  ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Visão de Linha (Tabela de Registros)"
            >
              <List className="w-3.5 h-3.5" />
              <span>Visão de Linha</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'card'
                  ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Visão em Cartões"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cartões</span>
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Ação em Massa Contextual (quando itens estão marcados) */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white font-black text-sm flex items-center justify-center shadow-xs shrink-0">
                {selectedIds.length}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-sm text-amber-950">
                    {selectedIds.length} {selectedIds.length === 1 ? 'solicitação selecionada' : 'solicitações selecionadas'}
                  </h4>
                  {selectedPendingCount > 0 && (
                    <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-900">
                      {selectedPendingCount} pendente{selectedPendingCount > 1 ? 's' : ''}
                    </span>
                  )}
                  {selectedNonPendingCount > 0 && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      {selectedNonPendingCount} já atendida/recusada
                    </span>
                  )}
                </div>
                <p className="text-xs text-amber-800 mt-0.5">
                  Selecione uma ação coletiva para processamento simultâneo no Acesso COI.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
              {/* Botão para isolar apenas os pendentes caso tenha marcado outros */}
              {selectedNonPendingCount > 0 && pendingVisibleIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectOnlyPending}
                  className="px-3 py-1.5 rounded-xl font-bold text-xs bg-white text-amber-900 border-2 border-amber-400 hover:bg-amber-100 transition-colors shadow-2xs flex items-center gap-1.5"
                  title="Remove os já aprovados/recusados da seleção e mantém apenas os pendentes"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-amber-600" />
                  <span>Deixar apenas pendentes ({pendingVisibleIds.length})</span>
                </button>
              )}

              {/* Se nem todos os pendentes foram selecionados, atalho para marcar apenas eles */}
              {!isAllPendingSelected && pendingVisibleIds.length > 0 && selectedNonPendingCount === 0 && (
                <button
                  type="button"
                  onClick={handleSelectOnlyPending}
                  className="px-3 py-1.5 rounded-xl font-bold text-xs bg-white text-amber-900 border border-amber-300 hover:bg-amber-100 transition-colors shadow-2xs"
                >
                  Marcar todos os pendentes ({pendingVisibleIds.length})
                </button>
              )}

              {/* Opção para marcar tudo visível */}
              {!isAllVisibleSelected && (
                <button
                  type="button"
                  onClick={handleSelectAllVisible}
                  className="px-3 py-1.5 rounded-xl font-medium text-xs bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 transition-colors"
                >
                  Marcar todos ({visibleIds.length})
                </button>
              )}

              <button
                type="button"
                onClick={handleClearSelection}
                className="px-3 py-1.5 rounded-xl font-medium text-xs text-amber-800 hover:text-amber-950 hover:bg-amber-200/60 transition-colors"
              >
                Desmarcar todos
              </button>
              <button
                type="button"
                onClick={() => {
                  const selectedItems = requests.filter((r) => selectedIds.includes(r.id));
                  printUberRequests(selectedItems);
                }}
                className="px-3.5 py-2 rounded-xl font-bold text-xs bg-white text-slate-800 border border-slate-300 hover:bg-slate-100 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                title="Imprimir fichas de todos os pedidos selecionados"
              >
                <Printer className="w-4 h-4 text-slate-700" />
                <span>Imprimir ({selectedIds.length})</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenBulkActionModal('approve')}
                className="px-4 py-2 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Aprovar em Massa ({selectedIds.length})</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenBulkActionModal('reject')}
                className="px-4 py-2 rounded-xl font-bold text-xs bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-all flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>Recusar em Massa ({selectedIds.length})</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Seção Sugestões de Agrupamento Inteligente (Aba 'Pendente Moove') */}
      {isMoove && filterStatus === 'Pendente Moove' && (
        <div className="bg-gradient-to-r from-emerald-50/80 via-teal-50/50 to-indigo-50/60 border border-emerald-200/80 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-sm text-slate-900">
                    Sugestões de Agrupamento
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200/80 text-emerald-900">
                    {suggestedClustersList.length} grupo{suggestedClustersList.length === 1 ? '' : 's'} sugerido{suggestedClustersList.length === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Agrupamento inteligente por proximidade geográfica e janela de horário de voo/escala.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => loadGroupingSuggestions()}
              disabled={isLoadingGrouping}
              className="px-3 py-1.5 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs self-end sm:self-auto"
              title="Atualizar sugestões com base nos endereços mais recentes"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingGrouping ? 'animate-spin text-emerald-600' : ''}`} />
              <span>{isLoadingGrouping ? 'Calculando rotas...' : 'Atualizar Sugestões'}</span>
            </button>
          </div>

          {isLoadingGrouping && suggestedClustersList.length === 0 ? (
            <div className="bg-white/80 rounded-xl border border-emerald-200 p-6 text-center text-xs text-slate-600">
              <RefreshCw className="w-5 h-5 text-emerald-600 animate-spin mx-auto mb-2" />
              Identificando proximidades residenciais e calculando itinerários...
            </div>
          ) : suggestedClustersList.length === 0 ? (
            <div className="bg-white/70 rounded-xl border border-emerald-200/70 p-4 text-xs text-slate-600 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Route className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Nenhum cluster com 2 ou mais colaboradores na mesma região e janela de horário no momento.
                </span>
              </div>
              {ignoredClusterKeys.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIgnoredClusterKeys([])}
                  className="text-[11px] text-emerald-700 hover:underline font-bold cursor-pointer"
                >
                  Restaurar {ignoredClusterKeys.length} sugestão(ões) ignorada(s)
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {suggestedClustersList.map(({ key, janela, cluster }) => {
                const isEntrada = janela.direcao === 'Entrada';
                const stops =
                  cluster.ordemParadas && cluster.ordemParadas.length > 0
                    ? cluster.ordemParadas
                    : cluster.solicitacoes.map((s, idx) => ({
                        ordem: idx + 1,
                        solicitacaoId: s.id,
                        nome: `${s.nome} ${s.sobrenome || ''}`.trim(),
                        enderecoBase: s.enderecoBase || '',
                      }));

                return (
                  <div
                    key={key}
                    className="bg-white rounded-xl border border-emerald-200/90 shadow-xs p-4 flex flex-col justify-between hover:border-emerald-400 transition-colors"
                  >
                    <div>
                      {/* Cabeçalho do Card */}
                      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                              isEntrada
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                            }`}
                          >
                            {isEntrada ? 'Entrada (Ida)' : 'Saída (Volta)'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {janela.terminal}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                            {cluster.solicitacoes.length} colaboradores
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 font-semibold whitespace-nowrap">
                          Raio: ~{cluster.raioMaximoUsadoKm || 4} km
                        </span>
                      </div>

                      {/* Info de data e horário */}
                      <div className="mt-2.5 flex items-center gap-3 text-xs text-slate-600">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-semibold text-slate-700">{janela.dataEvento}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            Ref: <strong className="text-slate-900">{janela.horarioReferencia}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Lista Ordenada de Paradas */}
                      <div className="mt-3">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                          {isEntrada
                            ? 'Roteiro de Embarque (Residências → Terminal):'
                            : 'Roteiro de Desembarque (Terminal → Residências):'}
                        </span>
                        <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 max-h-48 overflow-y-auto pr-1">
                          {stops.map((stop) => (
                            <div
                              key={stop.solicitacaoId}
                              className="flex items-start gap-2 text-xs bg-white p-2 rounded-lg border border-slate-100 shadow-2xs"
                            >
                              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                                {stop.ordem}
                              </span>
                              <div className="min-w-0 flex-1">
                                <strong className="text-slate-900 block truncate font-bold">
                                  {stop.nome}
                                </strong>
                                <span
                                  className="text-[11px] text-slate-500 block truncate"
                                  title={stop.enderecoBase}
                                >
                                  {stop.enderecoBase}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Botões de Ação do Card */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIgnoredClusterKeys((prev) => [...prev, key])}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        Ignorar sugestão
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenMooveAttendGroupVanModal(cluster, janela)}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Bus className="w-3.5 h-3.5" />
                        <span>Atender este grupo com Van</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Requests Management Table / List */}
      <div className="space-y-4">
        {sortedRequests.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-3">
              <Car className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">
              Nenhuma solicitação encontrada
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Assim que um colaborador registrar um pedido de transporte avulso, ele será listado aqui para avaliação e sincronização com o Google Sheets.
            </p>
          </div>
        ) : viewMode === 'linha' ? (
          /* VISÃO DE LINHA (PLANILHA OPERACIONAL COM AS COLUNAS DA IMAGEM) */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3 w-16 text-center relative">
                      <div className="inline-flex items-center justify-center gap-0.5 bg-white/90 border border-slate-300 rounded-lg px-1 py-0.5 shadow-2xs">
                        <input
                          type="checkbox"
                          checked={
                            pendingVisibleIds.length > 0
                              ? isAllPendingSelected
                              : isAllVisibleSelected
                          }
                          ref={(el) => {
                            if (el) {
                              el.indeterminate =
                                pendingVisibleIds.length > 0
                                  ? isSomePendingSelected && !isAllPendingSelected
                                  : isSomeVisibleSelected && !isAllVisibleSelected;
                            }
                          }}
                          onChange={handleHeaderCheckboxToggle}
                          className="w-4 h-4 rounded text-[#E31837] focus:ring-[#E31837] border-slate-300 cursor-pointer"
                          title={
                            pendingVisibleIds.length > 0
                              ? isAllPendingSelected
                                ? 'Desmarcar pendentes'
                                : `Marcar apenas as ${pendingVisibleIds.length} solicitações pendentes`
                              : isAllVisibleSelected
                              ? 'Desmarcar todos'
                              : 'Marcar todos os visíveis'
                          }
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsHeaderSelectMenuOpen((prev) => !prev);
                          }}
                          className="p-0.5 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                          title="Opções de seleção em massa (Apenas pendentes / Todos)"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Dropdown com opções de seleção: Apenas pendentes vs Todos */}
                      {isHeaderSelectMenuOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-20 cursor-default"
                            onClick={() => setIsHeaderSelectMenuOpen(false)}
                          />
                          <div className="absolute left-2 top-full mt-1 z-30 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 text-left text-xs font-normal normal-case">
                            <div className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
                              Opções de Seleção
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                handleSelectOnlyPending();
                                setIsHeaderSelectMenuOpen(false);
                              }}
                              className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-amber-50 text-slate-800 hover:text-amber-950 font-bold transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
                                <span>Apenas o que tá Pendente</span>
                              </div>
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-black">
                                {pendingVisibleIds.length}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                handleSelectAllVisible();
                                setIsHeaderSelectMenuOpen(false);
                              }}
                              className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>Marcar Todos os Visíveis</span>
                              </div>
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                                {visibleIds.length}
                              </span>
                            </button>

                            {selectedIds.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  handleClearSelection();
                                  setIsHeaderSelectMenuOpen(false);
                                }}
                                className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-rose-50 text-rose-700 hover:text-rose-900 border-t border-slate-100 mt-1 transition-colors cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Desmarcar Seleção ({selectedIds.length})</span>
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </th>
                    <th className="py-3 px-3.5 whitespace-nowrap">Status</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">Data do evento</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">Horário de início do evento</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">Horário de término do evento</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">Nome do evento</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">Nome</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">Sobrenome</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">Número de telefone</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">Endereço base</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">Endereço do evento</th>
                    <th className="py-3 px-3.5 whitespace-nowrap text-center">Viagem de ida necessária</th>
                    <th className="py-3 px-3.5 whitespace-nowrap text-center">Viagem de volta necessária</th>
                    <th className="py-3 px-3.5 text-right whitespace-nowrap">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedRequests.map((item) => {
                    const isPending = item.status === 'Pendente';
                    const isApproved = item.status === 'Aprovado';
                    const isRejected = item.status === 'Recusado';
                    const isSelected = selectedIds.includes(item.id);

                    const isIdaY =
                      item.viagemIda === 'Sim' ||
                      item.viagemIda === 'Y' ||
                      item.viagemIda === 'SIM' ||
                      item.viagemIda === 'Yes';
                    const isVoltaY =
                      item.viagemVolta === 'Sim' ||
                      item.viagemVolta === 'Y' ||
                      item.viagemVolta === 'SIM' ||
                      item.viagemVolta === 'Yes';

                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedOrderDetail(item)}
                        className={`transition-colors cursor-pointer group ${
                          isSelected
                            ? 'bg-amber-50/60 hover:bg-amber-50/90 border-l-4 border-l-amber-500'
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        {/* Checkbox de Seleção em Massa */}
                        <td
                          className="py-3 px-3 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectOne(item.id)}
                            className="w-4 h-4 rounded text-[#E31837] focus:ring-[#E31837] border-slate-300 cursor-pointer"
                            title="Selecionar esta solicitação"
                          />
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          {renderStatusBadge(item.status, item)}
                        </td>

                        {/* Data do evento */}
                        <td className="py-3 px-3.5 whitespace-nowrap font-mono font-medium text-slate-800">
                          {item.dataEvento}
                        </td>

                        {/* Horário de início do evento (coluna C: só preenchida quando Solicitação = "Entrada") */}
                        <td className="py-3 px-3.5 whitespace-nowrap font-medium text-slate-700">
                          {item.horarioInicioEvento || '-'}
                        </td>

                        {/* Horário de término do evento (coluna D: só preenchida quando Solicitação = "Saída") */}
                        <td className="py-3 px-3.5 whitespace-nowrap font-bold text-slate-900">
                          {item.horarioTerminoEvento || '-'}
                        </td>

                        {/* Nome do evento */}
                        <td
                          className="py-3 px-3.5 whitespace-nowrap font-medium text-slate-800 max-w-[160px] truncate"
                          title={item.nomeEvento}
                        >
                          {item.nomeEvento}
                        </td>

                        {/* Nome */}
                        <td className="py-3 px-3.5 whitespace-nowrap font-bold text-slate-900">
                          {item.nome}
                        </td>

                        {/* Sobrenome */}
                        <td className="py-3 px-3.5 whitespace-nowrap font-bold text-slate-900">
                          {item.sobrenome}
                        </td>

                        {/* Número de telefone */}
                        <td className="py-3 px-3.5 whitespace-nowrap font-mono text-slate-700">
                          {item.telefone}
                        </td>

                        {/* Endereço base */}
                        <td
                          className="py-3 px-3.5 whitespace-nowrap text-slate-600 max-w-[220px] truncate"
                          title={item.enderecoBase}
                        >
                          {item.enderecoBase}
                        </td>

                        {/* Endereço do evento */}
                        <td
                          className="py-3 px-3.5 whitespace-nowrap text-slate-600 max-w-[220px] truncate"
                          title={item.enderecoEvento}
                        >
                          {item.enderecoEvento}
                        </td>

                        {/* Viagem de ida necessária */}
                        <td className="py-3 px-3.5 whitespace-nowrap text-center">
                          <span
                            className={`inline-block font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                              isIdaY ? 'bg-amber-100 text-amber-900 font-bold' : 'text-slate-400'
                            }`}
                          >
                            {isIdaY ? 'Y' : 'N'}
                          </span>
                        </td>

                        {/* Viagem de volta necessária */}
                        <td className="py-3 px-3.5 whitespace-nowrap text-center">
                          <span
                            className={`inline-block font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                              isVoltaY ? 'bg-indigo-100 text-indigo-900 font-bold' : 'text-slate-400'
                            }`}
                          >
                            {isVoltaY ? 'Y' : 'N'}
                          </span>
                        </td>

                        {/* Ações */}
                        <td
                          className="py-3 px-3.5 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Botão Abrir Pedido */}
                            <button
                              type="button"
                              onClick={() => setSelectedOrderDetail(item)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs transition-colors flex items-center gap-1 shadow-2xs"
                              title="Abrir detalhes completos e timeline do pedido"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-600" />
                              <span>Abrir Pedido</span>
                            </button>

                            {/* Botão Imprimir Pedido */}
                            <button
                              type="button"
                              onClick={() => printUberRequests(item)}
                              className="p-1.5 bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg text-xs transition-colors flex items-center justify-center shadow-2xs cursor-pointer"
                              title="Imprimir Ficha do Pedido"
                            >
                              <Printer className="w-3.5 h-3.5 text-slate-600" />
                            </button>

                            {/* Ações do Módulo Moove (1ª Etapa) */}
                            {isMoove ? (
                              <>
                                {(item.status === 'Pendente Moove' || (item.status === 'Pendente' && !item.mooveStatus)) ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenMooveAttendVanModal(item)}
                                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-2xs transition-colors"
                                      title="Atender com Van (Moove)"
                                    >
                                      <Bus className="w-3.5 h-3.5" />
                                      <span>Atender Van</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenMooveAttendTaxiModal(item)}
                                      className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-2xs transition-colors"
                                      title="Atender com Táxi (Moove)"
                                    >
                                      <Car className="w-3.5 h-3.5" />
                                      <span>Atender Taxi</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={!workflowConfig.permitirMooveEnviarCoi}
                                      onClick={() => handleOpenMooveSendCoiModal(item)}
                                      className={`px-2.5 py-1.5 font-bold rounded-lg text-xs flex items-center gap-1 shadow-2xs transition-colors ${
                                        workflowConfig.permitirMooveEnviarCoi
                                          ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
                                          : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                                      }`}
                                      title={
                                        workflowConfig.permitirMooveEnviarCoi
                                          ? 'Recusar e Enviar para o COI'
                                          : 'Repasse para o COI bloqueado pelo Administrador Master'
                                      }
                                    >
                                      <Send className="w-3.5 h-3.5" />
                                      <span>Recusar / Enviar para o COI</span>
                                    </button>
                                  </>
                                ) : item.status === 'Atendido Moove' ? (
                                  <div className="flex items-center gap-1">
                                    {isMooveTaxi(item) ? (
                                      <>
                                        <span className="px-2 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg text-[11px] font-bold">
                                          🚕 {item.mooveDadosTaxi || 'Táxi'} ({item.mooveHorarioChegada || '-'})
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleOpenMooveAttendTaxiModal(item)}
                                          className="p-1.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
                                          title="Editar Dados do Táxi"
                                        >
                                          <CheckCircle2 className="w-4 h-4" />
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <span className="px-2 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-bold">
                                          🚐 {item.mooveDadosVan || 'Van'} ({item.mooveHorarioChegada || '-'})
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleOpenMooveAttendVanModal(item)}
                                          className="p-1.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors"
                                          title="Editar Dados da Van"
                                        >
                                          <CheckCircle2 className="w-4 h-4" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                ) : (
                                  <span className="px-2 py-1 bg-purple-50 text-purple-800 border border-purple-200 rounded-lg text-[11px] font-bold">
                                    ↪️ Enviado ao COI
                                  </span>
                                )}
                              </>
                            ) : (
                              /* Ações do Módulo COI (2ª Etapa) */
                              <>
                                {(item.status === 'Pendente COI' || (item.status === 'Pendente' && item.mooveStatus === 'Recusado_Enviado_COI')) ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenCoiAttendModal(item)}
                                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                                      title="Autorizar Transporte Uber (COI)"
                                    >
                                      <Car className="w-3.5 h-3.5" />
                                      <span>Atender (Uber)</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={!workflowConfig.permitirCoiDevolverMoove}
                                      onClick={() => handleOpenCoiReturnMooveModal(item)}
                                      className={`px-2.5 py-1.5 font-bold rounded-lg text-xs flex items-center gap-1 shadow-2xs transition-colors ${
                                        workflowConfig.permitirCoiDevolverMoove
                                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                                          : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                                      }`}
                                      title={
                                        workflowConfig.permitirCoiDevolverMoove
                                          ? 'Devolver solicitação para a Moove'
                                          : 'Devolução para a Moove bloqueada pelo Administrador Master'
                                      }
                                    >
                                      <Undo2 className="w-3.5 h-3.5" />
                                      <span>Devolver à Moove</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenCoiRejectModal(item)}
                                      className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                                      title="Recusar Solicitação no COI"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                      <span>Recusar</span>
                                    </button>
                                  </>
                                ) : (item.status === 'Pendente Moove' || (item.status === 'Pendente' && !item.mooveStatus)) ? (
                                  <span className="px-2 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-medium">
                                    ⏳ Aguardando Moove (1ª etapa)
                                  </span>
                                ) : item.status === 'Atendido Moove' ? (
                                  <span className="px-2 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-bold">
                                    {isMooveTaxi(item) ? '🚕 Atendido Moove Taxi' : '🚐 Atendido Moove Van'}
                                  </span>
                                ) : (item.status === 'Aprovado COI' || item.status === 'Aprovado') ? (
                                  <div className="flex items-center gap-1">
                                    <span className="px-2 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-bold">
                                      🚗 Uber: {item.coiVoucherUber || item.voucherUber}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenCoiAttendModal(item)}
                                      className="p-1.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors"
                                      title="Editar Voucher"
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <span className="px-2 py-1 bg-rose-50 text-rose-800 border border-rose-200 rounded-lg text-[11px] font-bold">
                                      ✕ Recusado
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenCoiRejectModal(item)}
                                      className="p-1.5 rounded-lg text-xs font-bold bg-rose-100 text-rose-800 hover:bg-rose-200 transition-colors"
                                      title="Editar Recusa"
                                    >
                                      <XCircle className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                              </>
                            )}

                            {/* Botão Excluir (real, restrito a Master/Gestor autorizado) */}
                            {canDeleteRequests && (
                              <button
                                type="button"
                                onClick={() => setDeleteModalItem(item)}
                                className="p-1.5 rounded-lg text-xs font-bold bg-slate-50 text-slate-400 hover:bg-red-600 hover:text-white border border-slate-200 transition-all"
                                title="Excluir solicitação definitivamente"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* VISÃO EM CARTÕES */
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1 text-xs text-slate-500">
              <span className="font-semibold">{sortedRequests.length} solicitações exibidas</span>
              <div className="flex items-center gap-3">
                {pendingVisibleIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectOnlyPending}
                    className="font-bold text-amber-700 hover:text-amber-900 underline flex items-center gap-1 cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Marcar apenas pendentes ({pendingVisibleIds.length})</span>
                  </button>
                )}
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={handleSelectAllVisible}
                  className="font-medium hover:text-slate-800 cursor-pointer"
                >
                  {isAllVisibleSelected ? 'Desmarcar todos' : 'Marcar todos os visíveis'}
                </button>
              </div>
            </div>

            {sortedRequests.map((item) => {
            const isPending = item.status === 'Pendente';
            const isApproved = item.status === 'Aprovado';
            const isRejected = item.status === 'Recusado';
            const isSelected = selectedIds.includes(item.id);

            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl border shadow-sm transition-all overflow-hidden ${
                  isSelected
                    ? 'border-amber-400 ring-2 ring-amber-400/20 bg-amber-50/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectOne(item.id)}
                          className="w-4 h-4 rounded text-[#E31837] focus:ring-[#E31837] border-slate-300 cursor-pointer mr-0.5"
                          title="Selecionar para ação em massa"
                        />
                        {renderStatusBadge(item.status, item)}
                        <span className="font-mono text-xs font-bold text-slate-500">
                          {item.protocolo}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-xs text-slate-500">
                          {new Date(item.dataEvento + 'T00:00:00').toLocaleDateString('pt-BR')} • {item.horarioInicio === 'Entrada' || item.horarioInicio === 'Saída' ? `Solicitação: ${item.horarioInicio}` : item.horarioInicio} • Horário: {item.horarioTermino}
                        </span>
                      </div>
                      <h4 className="text-lg font-bold text-slate-900">
                        {item.nome} {item.sobrenome}
                      </h4>
                      <p className="text-xs text-slate-600 font-medium mt-0.5">
                        {item.nomeEvento}
                      </p>
                    </div>

                    {/* Action Buttons for Gestor */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedOrderDetail(item)}
                        className="px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition-all flex items-center gap-1.5 shadow-2xs"
                      >
                        <Eye className="w-4 h-4 text-slate-600" />
                        Abrir Pedido
                      </button>

                      <button
                        type="button"
                        onClick={() => printUberRequests(item)}
                        className="px-3 py-2 text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        title="Imprimir Ficha do Pedido"
                      >
                        <Printer className="w-4 h-4 text-slate-600" />
                        Imprimir
                      </button>

                      {isMoove ? (
                        <>
                          {(item.status === 'Pendente Moove' || (item.status === 'Pendente' && !item.mooveStatus)) ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenMooveAttendVanModal(item)}
                                className="px-3.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all flex items-center gap-1.5 shadow-xs"
                              >
                                <Bus className="w-4 h-4" />
                                Atender Van
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenMooveAttendTaxiModal(item)}
                                className="px-3.5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition-all flex items-center gap-1.5 shadow-xs"
                              >
                                <Car className="w-4 h-4" />
                                Atender Taxi
                              </button>
                              <button
                                type="button"
                                disabled={!workflowConfig.permitirMooveEnviarCoi}
                                onClick={() => handleOpenMooveSendCoiModal(item)}
                                className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs ${
                                  workflowConfig.permitirMooveEnviarCoi
                                    ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
                                    : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                                }`}
                                title={
                                  workflowConfig.permitirMooveEnviarCoi
                                    ? 'Recusar e Enviar para o COI'
                                    : 'Repasse para o COI bloqueado pelo Administrador Master'
                                }
                              >
                                <Send className="w-4 h-4" />
                                Recusar e Enviar para o COI
                              </button>
                            </>
                          ) : item.status === 'Atendido Moove' ? (
                            isMooveTaxi(item) ? (
                              <button
                                type="button"
                                onClick={() => handleOpenMooveAttendTaxiModal(item)}
                                className="px-3.5 py-2 text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-xl transition-all flex items-center gap-1.5"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                Editar Dados do Táxi
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenMooveAttendVanModal(item)}
                                className="px-3.5 py-2 text-xs font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-xl transition-all flex items-center gap-1.5"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                Editar Dados da Van
                              </button>
                            )
                          ) : null}
                        </>
                      ) : (
                        <>
                          {(item.status === 'Pendente COI' || (item.status === 'Pendente' && item.mooveStatus === 'Recusado_Enviado_COI')) ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenCoiAttendModal(item)}
                                className="px-3.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                              >
                                <Car className="w-4 h-4" />
                                Atender (Uber)
                              </button>
                              <button
                                type="button"
                                disabled={!workflowConfig.permitirCoiDevolverMoove}
                                onClick={() => handleOpenCoiReturnMooveModal(item)}
                                className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs ${
                                  workflowConfig.permitirCoiDevolverMoove
                                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                                    : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                                }`}
                                title={
                                  workflowConfig.permitirCoiDevolverMoove
                                    ? 'Devolver solicitação para a Moove'
                                    : 'Devolução para a Moove bloqueada pelo Administrador Master'
                                }
                              >
                                <Undo2 className="w-4 h-4" />
                                Devolver à Moove
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenCoiRejectModal(item)}
                                className="px-3.5 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                              >
                                <XCircle className="w-4 h-4" />
                                Recusar
                              </button>
                            </>
                          ) : (item.status === 'Aprovado COI' || item.status === 'Aprovado') ? (
                            <button
                              type="button"
                              onClick={() => handleOpenCoiAttendModal(item)}
                              className="px-3.5 py-2 text-xs font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-xl transition-all flex items-center gap-1.5"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Editar Voucher Uber
                            </button>
                          ) : (item.status === 'Recusado COI' || item.status === 'Recusado') ? (
                            <button
                              type="button"
                              onClick={() => handleOpenCoiRejectModal(item)}
                              className="px-3.5 py-2 text-xs font-bold bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-xl transition-all flex items-center gap-1.5"
                            >
                              <XCircle className="w-4 h-4" />
                              Editar Justificativa
                            </button>
                          ) : null}
                        </>
                      )}

                      {canDeleteRequests && (
                        <button
                          type="button"
                          onClick={() => setDeleteModalItem(item)}
                          className="px-3 py-2 text-xs font-bold bg-slate-50 text-slate-400 border border-slate-200 hover:bg-red-600 hover:text-white rounded-xl transition-all flex items-center gap-1.5"
                          title="Excluir solicitação definitivamente"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Detalhes do registro */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-xs">
                    <div>
                      <span className="text-slate-400 font-medium block">Telefone (WhatsApp)</span>
                      <strong className="text-slate-800 block mt-0.5">{item.telefone}</strong>
                    </div>

                    <div>
                      <span className="text-slate-400 font-medium block">Trajeto Solicitado</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-bold text-[#E31837]">
                          {item.viagemIda === 'Sim' ? 'Apenas Viagem de IDA' : 'Apenas Viagem de VOLTA'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-slate-400 font-medium block">Endereço Residencial (Base)</span>
                      <span className="text-slate-800 font-medium block truncate mt-0.5" title={item.enderecoBase}>
                        {item.enderecoBase}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 font-medium block">Ponto Operacional (GRU)</span>
                      <span className="text-slate-800 font-medium block truncate mt-0.5" title={item.enderecoEvento}>
                        {item.enderecoEvento}
                      </span>
                    </div>
                  </div>

                  {/* Responsável pela Solicitação */}
                  {item.responsavelNome && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                      <span className="font-bold text-slate-700 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#E31837]" />
                        Responsável:
                      </span>
                      <span><strong>Nome:</strong> {item.responsavelNome}</span>
                      <span>•</span>
                      <span><strong>Função:</strong> {item.responsavelFuncao || 'N/A'}</span>
                      <span>•</span>
                      <span><strong>Matrícula:</strong> {item.responsavelMatricula || 'N/A'}</span>
                    </div>
                  )}

                  {/* Details / Voucher Banner if Approved or Rejected */}
                  {(item.voucherUber || item.observacoesGestor || item.motivoRecusa) && (
                    <div
                      className={`mt-4 p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                        isApproved
                          ? 'bg-emerald-50/60 border-emerald-200'
                          : 'bg-rose-50/60 border-rose-200'
                      }`}
                    >
                      <div className="space-y-0.5">
                        {item.voucherUber && (
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-700">Nº de Controle Interno:</span>
                            <span className="font-mono font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200">
                              {item.voucherUber}
                            </span>
                          </div>
                        )}
                        {(item.observacoesGestor || item.motivoRecusa) && (
                          <p className="text-slate-600">
                            <strong>Obs/Motivo:</strong> {item.observacoesGestor || item.motivoRecusa}
                          </p>
                        )}
                      </div>

                      {item.aprovadoPor && (
                        <span className="text-[11px] text-slate-500 italic">
                          Avaliador: {item.aprovadoPor}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        )}
      </div>

      {/* Modal de Detalhes Completos do Pedido ("Abrir Pedido") */}
      <AnimatePresence>
        {selectedOrderDetail && (
          <div
            id="order-detail-modal-backdrop"
            onClick={() => setSelectedOrderDetail(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
          >
            <motion.div
              id="order-detail-modal-card"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full my-8 overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-[#E31837]">
                    <Car className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-300">
                        {selectedOrderDetail.protocolo}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedOrderDetail.protocolo);
                          setCopiedDetailProtocol(true);
                          setTimeout(() => setCopiedDetailProtocol(false), 2000);
                        }}
                        className="p-1 text-slate-400 hover:text-white rounded transition-colors"
                        title="Copiar Protocolo"
                      >
                        {copiedDetailProtocol ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-white mt-0.5">
                      Detalhes da Solicitação de Transporte
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {renderStatusBadge(selectedOrderDetail.status, selectedOrderDetail)}
                  <button
                    type="button"
                    onClick={() => printUberRequests(selectedOrderDetail)}
                    className="p-2 text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                    title="Imprimir Pedido de Transporte"
                  >
                    <Printer className="w-4 h-4 text-slate-200" />
                    <span className="hidden sm:inline">Imprimir</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedOrderDetail(null)}
                    className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Fechar"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6 sm:p-8 space-y-5 max-h-[75vh] overflow-y-auto">
                {/* 1. Informações da Operação & Horário */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-[#E31837]" />
                    1. Informações da Operação &amp; Horário
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <span className="text-slate-400 block font-medium">Data do Evento</span>
                      <strong className="text-slate-900 text-sm block mt-0.5">
                        {new Date(selectedOrderDetail.dataEvento + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </strong>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <span className="text-slate-400 block font-medium">Solicitação</span>
                      <strong className="text-slate-900 text-sm block mt-0.5">
                        {selectedOrderDetail.horarioInicio === 'Entrada' || selectedOrderDetail.horarioInicio === 'Saída'
                          ? selectedOrderDetail.horarioInicio
                          : selectedOrderDetail.horarioInicio || 'Saída'}
                      </strong>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <span className="text-slate-400 block font-medium">Horário do Transporte</span>
                      <strong className="text-slate-900 text-sm block mt-0.5">
                        {selectedOrderDetail.horarioTermino}
                      </strong>
                    </div>
                  </div>
                  <div className="mt-3 bg-white p-3.5 rounded-xl border border-slate-200 text-xs">
                    <span className="text-slate-400 block font-medium">Motivo Operacional / Justificativa</span>
                    <p className="text-slate-800 font-medium mt-1 leading-relaxed">
                      {selectedOrderDetail.nomeEvento}
                    </p>
                  </div>
                </div>

                {/* 2. Identificação do Colaborador */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-[#E31837]" />
                    2. Identificação do Colaborador Transportado
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <span className="text-slate-400 block font-medium">Nome Completo</span>
                      <strong className="text-slate-900 text-sm block mt-0.5">
                        {selectedOrderDetail.nome} {selectedOrderDetail.sobrenome}
                      </strong>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                      <div>
                        <span className="text-slate-400 block font-medium">Telefone / WhatsApp</span>
                        <strong className="text-slate-900 text-sm block mt-0.5">
                          {selectedOrderDetail.telefone}
                        </strong>
                      </div>
                      <a
                        href={`https://wa.me/55${selectedOrderDetail.telefone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-2xs transition-all"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        WhatsApp
                      </a>
                    </div>
                  </div>
                  <div className="mt-3 bg-white p-3.5 rounded-xl border border-slate-200 text-xs">
                    <span className="text-slate-400 block font-medium flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#E31837]" />
                      Endereço Residencial (Base)
                    </span>
                    <p className="text-slate-800 font-medium mt-1">
                      {selectedOrderDetail.enderecoBase}
                    </p>
                  </div>
                </div>

                {/* 3. Trajeto & Terminal GRU */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Car className="w-4 h-4 text-[#E31837]" />
                    3. Local de Partida / Terminal &amp; Sentido
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <span className="text-slate-400 block font-medium">Ponto Operacional GRU</span>
                      <strong className="text-slate-900 block mt-0.5">
                        {selectedOrderDetail.enderecoEvento}
                      </strong>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <span className="text-slate-400 block font-medium">Sentido do Transporte</span>
                      <strong className="text-slate-900 block mt-0.5">
                        {selectedOrderDetail.viagemIda === 'Sim' ? 'Apenas Viagem de IDA' : 'Apenas Viagem de VOLTA'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* 4. Responsável pela Solicitação */}
                {selectedOrderDetail.responsavelNome && (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-[#E31837]" />
                      4. Responsável pela Solicitação
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="bg-white p-3 rounded-xl border border-slate-200">
                        <span className="text-slate-400 block font-medium">Nome</span>
                        <strong className="text-slate-900 block mt-0.5">
                          {selectedOrderDetail.responsavelNome}
                        </strong>
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-slate-200">
                        <span className="text-slate-400 block font-medium">Função</span>
                        <strong className="text-slate-900 block mt-0.5">
                          {selectedOrderDetail.responsavelFuncao || 'N/A'}
                        </strong>
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-slate-200">
                        <span className="text-slate-400 block font-medium">Matrícula</span>
                        <strong className="text-slate-900 block mt-0.5">
                          {selectedOrderDetail.responsavelMatricula || 'N/A'}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Timeline do Fluxo Moove > COI */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5">
                  <WorkflowTimeline request={selectedOrderDetail} />
                </div>

                {/* 5. Situação do Atendimento Moove e COI */}
                <div
                  className={`rounded-2xl p-5 border text-xs ${
                    selectedOrderDetail.status === 'Aprovado COI' || selectedOrderDetail.status === 'Aprovado' || selectedOrderDetail.status === 'Atendido Moove'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : selectedOrderDetail.status === 'Recusado COI' || selectedOrderDetail.status === 'Recusado'
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm flex items-center gap-2">
                      {selectedOrderDetail.status === 'Atendido Moove' ? (
                        isMooveTaxi(selectedOrderDetail) ? (
                          <>
                            <Car className="w-5 h-5 text-amber-600" />
                            Atendido com Táxi pela Moove
                          </>
                        ) : (
                          <>
                            <Bus className="w-5 h-5 text-emerald-600" />
                            Atendido com Van pela Moove
                          </>
                        )
                      ) : selectedOrderDetail.status === 'Aprovado COI' || selectedOrderDetail.status === 'Aprovado' ? (
                        <>
                          <Car className="w-5 h-5 text-emerald-600" />
                          Transporte Uber Autorizado pelo COI
                        </>
                      ) : selectedOrderDetail.status === 'Recusado COI' || selectedOrderDetail.status === 'Recusado' ? (
                        <>
                          <XCircle className="w-5 h-5 text-rose-600" />
                          {getRecusaOrigem(selectedOrderDetail) === 'Moove' ? 'Pedido Recusado pela Moove' : 'Pedido Recusado pelo COI'}
                        </>
                      ) : selectedOrderDetail.status === 'Pendente COI' ? (
                        <>
                          <Clock className="w-5 h-5 text-purple-600" />
                          Aguardando Análise do COI (2ª Etapa)
                        </>
                      ) : (
                        <>
                          <Clock className="w-5 h-5 text-amber-600" />
                          Aguardando Validação da Moove (1ª Etapa)
                        </>
                      )}
                    </span>
                    {selectedOrderDetail.aprovadoPor && (
                      <span className="text-[11px] opacity-75">
                        Avaliador: {selectedOrderDetail.aprovadoPor}
                      </span>
                    )}
                  </div>

                  {/* Dados da Van (se atendido com Van pela Moove) */}
                  {!isMooveTaxi(selectedOrderDetail) && selectedOrderDetail.mooveDadosVan && (
                    <div className="mt-3 p-3.5 bg-white rounded-xl border border-emerald-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <span className="text-[11px] text-slate-500 block">Identificação da Van:</span>
                        <strong className="text-slate-900 text-xs block font-bold">{selectedOrderDetail.mooveDadosVan}</strong>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">Motorista:</span>
                        <strong className="text-slate-900 text-xs block font-bold">{selectedOrderDetail.mooveNomeMotorista || '-'}</strong>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">Horário de Chegada:</span>
                        <strong className="text-slate-900 text-xs block font-bold">{selectedOrderDetail.mooveHorarioChegada || '-'}</strong>
                      </div>
                    </div>
                  )}

                  {/* Dados do Táxi (se atendido com Táxi pela Moove) */}
                  {isMooveTaxi(selectedOrderDetail) && selectedOrderDetail.mooveDadosTaxi && (
                    <div className="mt-3 p-3.5 bg-white rounded-xl border border-amber-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <span className="text-[11px] text-slate-500 block">Identificação do Táxi:</span>
                        <strong className="text-slate-900 text-xs block font-bold">{selectedOrderDetail.mooveDadosTaxi}</strong>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">Motorista:</span>
                        <strong className="text-slate-900 text-xs block font-bold">{selectedOrderDetail.mooveNomeMotorista || '-'}</strong>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">Horário de Chegada:</span>
                        <strong className="text-slate-900 text-xs block font-bold">{selectedOrderDetail.mooveHorarioChegada || '-'}</strong>
                      </div>
                    </div>
                  )}

                  {/* Voucher Uber (se aprovado COI) */}
                  {(selectedOrderDetail.coiVoucherUber || selectedOrderDetail.voucherUber) && (
                    <div className="mt-3 p-3.5 bg-white rounded-xl border border-emerald-200 flex items-center justify-between">
                      <div>
                        <span className="text-[11px] text-slate-500 block">Número do Voucher / Controle Uber:</span>
                        <strong className="font-mono text-base text-emerald-800 font-bold block">
                          {selectedOrderDetail.coiVoucherUber || selectedOrderDetail.voucherUber}
                        </strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const code = selectedOrderDetail.coiVoucherUber || selectedOrderDetail.voucherUber;
                          if (code) {
                            navigator.clipboard.writeText(code);
                          }
                        }}
                        className="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold rounded-lg text-xs flex items-center gap-1 transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copiar
                      </button>
                    </div>
                  )}

                  {/* Observações Moove / Recusa COI */}
                  {(selectedOrderDetail.mooveObservacoes || selectedOrderDetail.mooveMotivoRecusaCOI || selectedOrderDetail.observacoesGestor || selectedOrderDetail.motivoRecusa) && (
                    <div className="mt-3 p-3 bg-white rounded-xl border border-slate-200 text-slate-700 space-y-1.5">
                      {selectedOrderDetail.mooveObservacoes && (
                        <div>
                          <span className="text-[11px] text-slate-400 block font-medium">Obs Moove:</span>
                          <p className="font-medium text-xs text-slate-800">{mooveObservacoesTexto(selectedOrderDetail)}</p>
                        </div>
                      )}
                      {selectedOrderDetail.mooveMotivoRecusaCOI && (
                        <div>
                          <span className="text-[11px] text-purple-700 block font-bold">Justificativa de Encaminhamento ao COI:</span>
                          <p className="font-medium text-xs text-slate-800">{selectedOrderDetail.mooveMotivoRecusaCOI}</p>
                        </div>
                      )}
                      {(selectedOrderDetail.observacoesGestor || selectedOrderDetail.motivoRecusa) && (
                        <div>
                          <span className="text-[11px] text-slate-400 block font-medium">Justificativa / Observações COI:</span>
                          <p className="font-medium text-xs text-slate-800">
                            {selectedOrderDetail.observacoesGestor || selectedOrderDetail.motivoRecusa}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedOrderDetail(null)}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    onClick={() => printUberRequests(selectedOrderDetail)}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                    title="Imprimir Ficha Completa do Pedido de Transporte"
                  >
                    <Printer className="w-4 h-4 text-slate-700" />
                    <span>Imprimir Pedido</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {isMoove ? (
                    <>
                      {(selectedOrderDetail.status === 'Pendente Moove' || (selectedOrderDetail.status === 'Pendente' && !selectedOrderDetail.mooveStatus)) ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const item = selectedOrderDetail;
                              setSelectedOrderDetail(null);
                              handleOpenMooveAttendVanModal(item);
                            }}
                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5"
                          >
                            <Bus className="w-4 h-4" />
                            Atender Van
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const item = selectedOrderDetail;
                              setSelectedOrderDetail(null);
                              handleOpenMooveAttendTaxiModal(item);
                            }}
                            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5"
                          >
                            <Car className="w-4 h-4" />
                            Atender Taxi
                          </button>

                          <button
                            type="button"
                            disabled={!workflowConfig.permitirMooveEnviarCoi}
                            onClick={() => {
                              const item = selectedOrderDetail;
                              setSelectedOrderDetail(null);
                              handleOpenMooveSendCoiModal(item);
                            }}
                            className={`px-4 py-2.5 font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 ${
                              workflowConfig.permitirMooveEnviarCoi
                                ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                            }`}
                            title={
                              workflowConfig.permitirMooveEnviarCoi
                                ? 'Recusar e Enviar para o COI'
                                : 'Repasse para o COI bloqueado pelo Administrador Master'
                            }
                          >
                            <Send className="w-4 h-4" />
                            Recusar / Enviar para o COI
                          </button>
                        </>
                      ) : selectedOrderDetail.status === 'Atendido Moove' ? (
                        isMooveTaxi(selectedOrderDetail) ? (
                          <button
                            type="button"
                            onClick={() => {
                              const item = selectedOrderDetail;
                              setSelectedOrderDetail(null);
                              handleOpenMooveAttendTaxiModal(item);
                            }}
                            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Editar Dados do Táxi
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              const item = selectedOrderDetail;
                              setSelectedOrderDetail(null);
                              handleOpenMooveAttendVanModal(item);
                            }}
                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Editar Dados da Van
                          </button>
                        )
                      ) : null}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const item = selectedOrderDetail;
                          setSelectedOrderDetail(null);
                          handleOpenCoiAttendModal(item);
                        }}
                        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Car className="w-4 h-4" />
                        {selectedOrderDetail.status === 'Aprovado COI' || selectedOrderDetail.status === 'Aprovado' ? 'Editar Voucher Uber' : 'Atender (Uber)'}
                      </button>

                      <button
                        type="button"
                        disabled={!workflowConfig.permitirCoiDevolverMoove}
                        onClick={() => {
                          const item = selectedOrderDetail;
                          setSelectedOrderDetail(null);
                          handleOpenCoiReturnMooveModal(item);
                        }}
                        className={`px-4 py-2.5 font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 ${
                          workflowConfig.permitirCoiDevolverMoove
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                        }`}
                        title={
                          workflowConfig.permitirCoiDevolverMoove
                            ? 'Devolver solicitação para a Moove'
                            : 'Devolução para a Moove bloqueada pelo Administrador Master'
                        }
                      >
                        <Undo2 className="w-4 h-4" />
                        Devolver à Moove
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const item = selectedOrderDetail;
                          setSelectedOrderDetail(null);
                          handleOpenCoiRejectModal(item);
                        }}
                        className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <XCircle className="w-4 h-4" />
                        {selectedOrderDetail.status === 'Recusado COI' || selectedOrderDetail.status === 'Recusado' ? 'Editar Recusa' : 'Recusar Pedido'}
                      </button>
                    </>
                  )}

                  {canDeleteRequests && (
                    <button
                      type="button"
                      onClick={() => setDeleteModalItem(selectedOrderDetail)}
                      className="px-4 py-2.5 bg-white hover:bg-red-600 hover:text-white text-red-600 border border-red-200 font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Decision Modal (Approve or Reject) */}
      <AnimatePresence>
        {actionModalItem && (
          <div
            id="action-modal-backdrop"
            onClick={() => setActionModalItem(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          >
            <motion.div
              id="action-modal-card"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 sm:p-8 relative"
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    actionModalItem.type === 'moove_attend_van' || actionModalItem.type === 'moove_attend'
                      ? 'bg-emerald-100 text-emerald-700'
                      : actionModalItem.type === 'moove_attend_taxi'
                      ? 'bg-amber-100 text-amber-700'
                      : actionModalItem.type === 'moove_send_coi'
                      ? 'bg-rose-100 text-rose-700'
                      : actionModalItem.type === 'coi_return_moove'
                      ? 'bg-indigo-100 text-indigo-700'
                      : actionModalItem.type === 'coi_attend' || actionModalItem.type === 'approve'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {actionModalItem.type === 'moove_attend_van' || actionModalItem.type === 'moove_attend' ? (
                    <Bus className="w-6 h-6" />
                  ) : actionModalItem.type === 'moove_attend_taxi' ? (
                    <Car className="w-6 h-6" />
                  ) : actionModalItem.type === 'moove_send_coi' ? (
                    <Send className="w-6 h-6" />
                  ) : actionModalItem.type === 'coi_return_moove' ? (
                    <Undo2 className="w-6 h-6" />
                  ) : actionModalItem.type === 'coi_attend' || actionModalItem.type === 'approve' ? (
                    <Car className="w-6 h-6" />
                  ) : (
                    <XCircle className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {actionModalItem.type === 'moove_attend_van' || actionModalItem.type === 'moove_attend'
                      ? actionModalItem.items && actionModalItem.items.length > 1
                        ? `Atender Grupo com Van (${actionModalItem.items.length} passageiros)`
                        : 'Atender com Van (Validação Moove)'
                      : actionModalItem.type === 'moove_attend_taxi'
                      ? 'Atender com Táxi (Validação Moove)'
                      : actionModalItem.type === 'moove_send_coi'
                      ? 'Recusar e Enviar para o COI'
                      : actionModalItem.type === 'coi_return_moove'
                      ? 'Devolver Solicitação para a Moove'
                      : actionModalItem.type === 'coi_attend' || actionModalItem.type === 'approve'
                      ? 'Autorizar Transporte Uber (COI)'
                      : 'Recusar Solicitação no COI'}
                  </h3>
                  <span className="text-xs text-slate-500">
                    {actionModalItem.items && actionModalItem.items.length > 1
                      ? `${actionModalItem.items.length} solicitações integradas • ${actionModalItem.clusterMeta?.terminal || ''} • Horário: ${actionModalItem.clusterMeta?.horarioReferencia || ''}`
                      : `Protocolo: ${actionModalItem.item.protocolo} • ${actionModalItem.item.nome} ${actionModalItem.item.sobrenome}`}
                  </span>
                </div>
              </div>

              <div className="space-y-4 text-xs">
                {/* 1. Modal Moove Atender Van (Van, Motorista, Horário, Obs) */}
                {(actionModalItem.type === 'moove_attend_van' || actionModalItem.type === 'moove_attend') && (
                  <>
                    {actionModalItem.items && actionModalItem.items.length > 1 ? (
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 text-xs">
                        <p className="font-bold mb-1 flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-emerald-700" />
                          Atendimento integrado para {actionModalItem.items.length} colaboradores:
                        </p>
                        <p className="text-[11px] text-emerald-800 mb-2">
                          Os dados abaixo serão aplicados simultaneamente a todas as solicitações deste grupo:
                        </p>
                        <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                          {actionModalItem.items.map((it, idx) => (
                            <div key={it.id} className="flex items-center justify-between bg-white/80 px-2 py-1 rounded border border-emerald-100 text-[11px]">
                              <span className="font-medium text-slate-800">
                                {idx + 1}. {it.nome} {it.sobrenome}
                              </span>
                              <span className="text-slate-500 font-mono text-[10px]">{it.protocolo}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 text-xs">
                        <p className="font-semibold">Preencha os dados da Van e motorista escalados para atender o colaborador:</p>
                      </div>
                    )}

                    <div>
                      <label className="block font-bold text-slate-700 mb-1" htmlFor="modal-moove-van">
                        Identificação / Dados da Van *
                      </label>
                      <input
                        id="modal-moove-van"
                        type="text"
                        required
                        placeholder="Ex: Van Sprinter Branca - Placa ABC-1234 / Prefixo 08"
                        value={mooveDadosVan}
                        onChange={(e) => setMooveDadosVan(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1" htmlFor="modal-moove-driver">
                          Nome do Motorista *
                        </label>
                        <input
                          id="modal-moove-driver"
                          type="text"
                          required
                          placeholder="Ex: Carlos Oliveira"
                          value={mooveNomeMotorista}
                          onChange={(e) => setMooveNomeMotorista(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1" htmlFor="modal-moove-arrival">
                          Horário Previsto de Chegada *
                        </label>
                        <input
                          id="modal-moove-arrival"
                          type="text"
                          required
                          placeholder="Ex: 23:15 ou em 20 min"
                          value={mooveHorarioChegada}
                          onChange={(e) => setMooveHorarioChegada(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1" htmlFor="modal-moove-notes">
                        Observações Adicionais (Opcional)
                      </label>
                      <textarea
                        id="modal-moove-notes"
                        rows={2}
                        placeholder="Ex: Embarque no bolsão de vans T2."
                        value={mooveObservacoes}
                        onChange={(e) => setMooveObservacoes(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </>
                )}

                {/* 1.1 Modal Moove Atender Taxi (Taxi, Motorista, Horário, Obs) */}
                {actionModalItem.type === 'moove_attend_taxi' && (
                  <>
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs">
                      <p className="font-semibold">Preencha os dados do Táxi e motorista acionados pela Moove:</p>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1" htmlFor="modal-moove-taxi">
                        Identificação / Dados do Táxi *
                      </label>
                      <input
                        id="modal-moove-taxi"
                        type="text"
                        required
                        placeholder="Ex: Guarucoop Prefixo 142 - Chevrolet Spin Branca - Placa GCO-5678"
                        value={mooveDadosTaxi}
                        onChange={(e) => setMooveDadosTaxi(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1" htmlFor="modal-moove-driver-taxi">
                          Nome do Motorista *
                        </label>
                        <input
                          id="modal-moove-driver-taxi"
                          type="text"
                          required
                          placeholder="Ex: Marcos Santos"
                          value={mooveNomeMotorista}
                          onChange={(e) => setMooveNomeMotorista(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1" htmlFor="modal-moove-arrival-taxi">
                          Horário Previsto de Chegada *
                        </label>
                        <input
                          id="modal-moove-arrival-taxi"
                          type="text"
                          required
                          placeholder="Ex: 23:30 ou em 15 min"
                          value={mooveHorarioChegada}
                          onChange={(e) => setMooveHorarioChegada(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1" htmlFor="modal-moove-notes-taxi">
                        Ponto de Encontro / Observações (Opcional)
                      </label>
                      <textarea
                        id="modal-moove-notes-taxi"
                        rows={2}
                        placeholder="Ex: Ponto de encontro Táxi - Desembarque Terminal 2."
                        value={mooveObservacoes}
                        onChange={(e) => setMooveObservacoes(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </>
                )}

                {/* 2. Modal Moove Recusar e Enviar para o COI */}
                {actionModalItem.type === 'moove_send_coi' && (
                  <>
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs">
                      <p className="font-semibold">
                        A Moove não atenderá com Van nem Táxi. A solicitação será encaminhada para a 2ª etapa (Análise do COI para Uber).
                      </p>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1" htmlFor="modal-moove-refusal">
                        Motivo da Recusa / Justificativa para o COI *
                      </label>
                      <textarea
                        id="modal-moove-refusal"
                        rows={3}
                        required
                        placeholder="Ex: Sem capacidade de frota de van ou táxi para a região solicitada neste horário. Encaminhado ao COI para acionamento de Uber."
                        value={mooveMotivoRecusaCOI}
                        onChange={(e) => setMooveMotivoRecusaCOI(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <span className="text-[11px] text-slate-400 mt-1 block">
                        Esta justificativa será registrada e visualizada pela equipe do COI e no rastreamento do colaborador.
                      </span>
                    </div>
                  </>
                )}

                {/* 3. Modal COI Atender (Voucher Uber) */}
                {(actionModalItem.type === 'coi_attend' || actionModalItem.type === 'approve') && (
                  <>
                    <div className="p-3 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 text-xs flex items-start gap-2.5 shadow-xs">
                      <div className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
                        <Car className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-0.5">
                          Mensagem e Orientações de Embarque
                        </span>
                        <p className="text-slate-200 leading-relaxed font-normal">
                          Seu pedido será atendido via <strong>Uber</strong>. Fique atento ao número de WhatsApp informado na solicitação. Em caso de dúvidas, contate o responsável que realizou o pedido.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1" htmlFor="modal-voucher">
                        Código do Voucher / Controle Uber *
                      </label>
                      <input
                        id="modal-voucher"
                        type="text"
                        required
                        placeholder="Ex: UBER-WFS-GRU-9841"
                        value={voucherCode}
                        onChange={(e) => setVoucherCode(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="text-[11px] text-slate-400 mt-1 block">
                        Código do Uber que será disponibilizado imediatamente ao colaborador.
                      </span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1" htmlFor="modal-notes">
                        Observações do COI (Opcional)
                      </label>
                      <textarea
                        id="modal-notes"
                        rows={3}
                        placeholder="Ex: Voucher emitido para viagem direta. Horário noturno confirmado."
                        value={managerNotes}
                        onChange={(e) => setManagerNotes(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </>
                )}

                {/* 4. Modal COI Recusar */}
                {(actionModalItem.type === 'coi_reject' || actionModalItem.type === 'reject') && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1" htmlFor="modal-notes">
                      Motivo da Recusa no COI (Obrigatório) *
                    </label>
                    <textarea
                      id="modal-notes"
                      rows={3}
                      required
                      placeholder="Ex: Transporte público regular em pleno funcionamento no horário (Linha 331 da EMTU)."
                      value={managerNotes}
                      onChange={(e) => setManagerNotes(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                )}

                {/* 5. Modal COI Devolver para Moove */}
                {actionModalItem.type === 'coi_return_moove' && (
                  <div className="space-y-3">
                    <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200 text-indigo-900 text-xs leading-relaxed">
                      <p className="font-bold mb-1">Retorno à esteira de validação Moove (Van/Táxi):</p>
                      <p>
                        A solicitação sairá do COI e retornará imediatamente para a fila da Moove,
                        permitindo que os operadores aloquem uma Van com rota compatível ou Táxi credenciado.
                      </p>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1" htmlFor="modal-return-notes">
                        Motivo / Justificativa da Devolução para a Moove (Obrigatório) *
                      </label>
                      <textarea
                        id="modal-return-notes"
                        rows={3}
                        required
                        placeholder="Ex: Identificada rota de van disponível no horário solicitado ou viabilidade de atendimento via táxi credenciado."
                        value={managerNotes}
                        onChange={(e) => setManagerNotes(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setActionModalItem(null)}
                    className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors font-medium cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={
                      isProcessingAction ||
                      ((actionModalItem.type === 'moove_attend_van' || actionModalItem.type === 'moove_attend') && (!mooveDadosVan.trim() || !mooveNomeMotorista.trim() || !mooveHorarioChegada.trim())) ||
                      (actionModalItem.type === 'moove_attend_taxi' && (!mooveDadosTaxi.trim() || !mooveNomeMotorista.trim() || !mooveHorarioChegada.trim())) ||
                      (actionModalItem.type === 'moove_send_coi' && !mooveMotivoRecusaCOI.trim()) ||
                      ((actionModalItem.type === 'coi_attend' || actionModalItem.type === 'approve') && !voucherCode.trim()) ||
                      ((actionModalItem.type === 'coi_reject' || actionModalItem.type === 'reject') && !managerNotes.trim()) ||
                      (actionModalItem.type === 'coi_return_moove' && !managerNotes.trim())
                    }
                    onClick={handleConfirmAction}
                    className={`px-5 py-2 text-white font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 cursor-pointer ${
                      actionModalItem.type === 'moove_attend_van' || actionModalItem.type === 'moove_attend' || actionModalItem.type === 'coi_attend' || actionModalItem.type === 'approve'
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : actionModalItem.type === 'moove_attend_taxi'
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : actionModalItem.type === 'moove_send_coi'
                        ? 'bg-rose-600 hover:bg-rose-700'
                        : actionModalItem.type === 'coi_return_moove'
                        ? 'bg-indigo-600 hover:bg-indigo-700'
                        : 'bg-rose-600 hover:bg-rose-700'
                    }`}
                  >
                    {isProcessingAction
                      ? 'Salvando...'
                      : actionModalItem.type === 'moove_attend_van' || actionModalItem.type === 'moove_attend'
                      ? actionModalItem.items && actionModalItem.items.length > 1
                        ? `Confirmar Atendimento em Grupo (${actionModalItem.items.length} Passageiros)`
                        : 'Confirmar Atendimento (Van)'
                      : actionModalItem.type === 'moove_attend_taxi'
                      ? 'Confirmar Atendimento (Táxi)'
                      : actionModalItem.type === 'moove_send_coi'
                      ? 'Confirmar e Enviar para o COI'
                      : actionModalItem.type === 'coi_return_moove'
                      ? 'Confirmar Devolução para a Moove'
                      : actionModalItem.type === 'coi_attend' || actionModalItem.type === 'approve'
                      ? 'Autorizar e Gravar Uber'
                      : 'Confirmar Recusa no COI'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Confirmação de Exclusão Definitiva (irreversível) */}
      <AnimatePresence>
        {deleteModalItem && (
          <div
            id="delete-modal-backdrop"
            onClick={() => !isDeletingRequest && setDeleteModalItem(null)}
            className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6">
                <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-4 border border-red-100">
                  <Trash2 className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1.5">
                  Excluir solicitação definitivamente?
                </h3>
                <p className="text-sm text-slate-600 mb-4">
                  Esta ação remove a solicitação de{' '}
                  <strong className="text-slate-800">
                    {deleteModalItem.nome} {deleteModalItem.sobrenome}
                  </strong>{' '}
                  (protocolo <strong className="text-slate-800">{deleteModalItem.protocolo}</strong>) do
                  sistema e tenta remover a linha correspondente na planilha. Essa ação{' '}
                  <strong className="text-red-600">não pode ser desfeita</strong>.
                </p>
                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={isDeletingRequest}
                    onClick={() => setDeleteModalItem(null)}
                    className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors font-medium disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingRequest}
                    onClick={handleConfirmDelete}
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all shadow-sm disabled:opacity-60 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    {isDeletingRequest ? 'Excluindo...' : 'Excluir Definitivamente'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Ação em Massa com Alerta em Destaque (Aprovação / Recusa Coletiva) */}
      <AnimatePresence>
        {bulkActionModal && (
          <div
            id="bulk-action-modal-backdrop"
            onClick={() => setBulkActionModal(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
          >
            <motion.div
              id="bulk-action-modal-card"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="bg-white rounded-3xl shadow-2xl max-w-xl w-full p-6 sm:p-8 relative border border-slate-200 my-8 flex flex-col"
            >
              {/* Header com Ícone e Alerta de Ação em Massa */}
              <div className="flex items-start gap-4 pb-4 border-b border-slate-100">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                    bulkActionModal.type === 'approve'
                      ? 'bg-amber-100 text-amber-700 border border-amber-300'
                      : 'bg-rose-100 text-rose-700 border border-rose-300'
                  }`}
                >
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <span
                    className={`inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full mb-1 ${
                      bulkActionModal.type === 'approve'
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-rose-100 text-rose-900 border border-rose-300'
                    }`}
                  >
                    ⚠️ Ação em Massa no Acesso COI
                  </span>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
                    {bulkActionModal.type === 'approve'
                      ? 'Aprovação em Massa de Solicitações'
                      : 'Recusa em Massa de Solicitações'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {bulkActionModal.items.length}{' '}
                    {bulkActionModal.items.length === 1
                      ? 'colaborador selecionado'
                      : 'colaboradores selecionados'}{' '}
                    para alteração simultânea
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBulkActionModal(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
                  title="Fechar (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* ALERTA VISÍVEL E EVIDENTE (Mandato: alertar ao usuário que está fazendo uma aprovação em massa) */}
              <div
                className={`mt-4 p-4 rounded-2xl border-2 flex items-start gap-3 ${
                  bulkActionModal.type === 'approve'
                    ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                    : 'bg-rose-50/90 border-rose-300 text-rose-950'
                }`}
              >
                <AlertTriangle
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    bulkActionModal.type === 'approve' ? 'text-amber-600' : 'text-rose-600'
                  }`}
                />
                <div className="text-xs leading-relaxed">
                  <strong className="block font-black text-sm uppercase tracking-wide mb-0.5">
                    {bulkActionModal.type === 'approve'
                      ? 'Atenção: Você está realizando uma Aprovação em Massa!'
                      : 'Atenção: Você está realizando uma Recusa em Massa!'}
                  </strong>
                  <p className="mt-1">
                    Você está prestes a{' '}
                    <strong className="underline font-bold">
                      {bulkActionModal.type === 'approve' ? 'APROVAR' : 'RECUSAR'} simultaneamente{' '}
                      {bulkActionModal.items.length} solicitações
                    </strong>
                    .{' '}
                    {bulkActionModal.type === 'approve'
                      ? 'Cada solicitação receberá um Número de Controle Interno individual e exclusivo (ex: WFS-TRP-GRU-XXXX) gerado pelo sistema. O status de todos passará para "Atendido / Aprovado", gravando no sistema e sincronizando com a planilha oficial.'
                      : 'Todas as solicitações selecionadas serão marcadas como "Recusado" com a respectiva justificativa registrada no histórico e sincronizada.'}
                  </p>
                </div>
              </div>

              {/* Lista Resumo dos Itens Selecionados */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>Colaboradores e Protocolos Selecionados ({bulkActionModal.items.length}):</span>
                  <span className="text-[11px] text-slate-400 font-normal">Rolagem disponível</span>
                </div>

                <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-slate-50/70 p-1.5">
                  {bulkActionModal.items.map((item) => (
                    <div key={item.id} className="p-2 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 truncate">
                            {item.nome} {item.sobrenome}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">
                            ({item.protocolo})
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 block truncate">
                          {new Date(item.dataEvento + 'T00:00:00').toLocaleDateString('pt-BR')} •{' '}
                          {item.horarioInicio === 'Entrada' || item.horarioInicio === 'Saída'
                            ? item.horarioInicio
                            : `Horário: ${item.horarioInicio}`}{' '}
                          {item.horarioTermino ? `às ${item.horarioTermino}` : ''}
                        </span>
                      </div>
                      <div className="shrink-0">
                        {renderStatusBadge(item.status, item)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Se houver itens que já foram aprovados ou recusados no lote, avisar e permitir filtrar apenas pendentes */}
                {bulkActionModal.items.some((it) => it.status !== 'Pendente') && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                    <span className="text-amber-900 text-[11px]">
                      ⚠️ <strong>{bulkActionModal.items.filter((it) => it.status !== 'Pendente').length}</strong> solicitação(ões) selecionada(s) já estavam aprovadas ou recusadas.
                    </span>
                    {bulkActionModal.items.some((it) => it.status === 'Pendente') && (
                      <button
                        type="button"
                        onClick={() => {
                          const onlyPendings = bulkActionModal.items.filter((it) => it.status === 'Pendente');
                          setBulkActionModal((prev) => (prev ? { ...prev, items: onlyPendings } : null));
                          setSelectedIds(onlyPendings.map((it) => it.id));
                        }}
                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-[10px] transition-colors shrink-0 shadow-2xs"
                      >
                        Manter apenas pendentes ({bulkActionModal.items.filter((it) => it.status === 'Pendente').length})
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Formulário de Configuração do Lote */}
              <div className="mt-4 space-y-3 text-xs">
                {bulkActionModal.type === 'approve' ? (
                  <>
                    <div className="p-3.5 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 flex items-start gap-2.5 shadow-xs">
                      <div className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
                        <Car className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-0.5">
                          Orientações de Embarque Uber aos Colaboradores
                        </span>
                        <p className="text-slate-200 leading-relaxed font-normal text-[11px]">
                          Seu pedido será atendido via <strong>Uber</strong>. Fique atento ao número de WhatsApp informado no momento da solicitação. Em caso de dúvidas, entre em contato com a pessoa responsável que realizou o pedido.
                        </p>
                      </div>
                    </div>

                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="text-emerald-900">
                        <strong className="block font-bold">Numeração de Controle Interno Automática:</strong>
                        <p className="text-[11px] mt-0.5 text-emerald-800 leading-normal">
                          Cada um dos {bulkActionModal.items.length} pedidos receberá automaticamente um número individual no formato{' '}
                          <code className="font-mono font-bold bg-white px-1 py-0.5 rounded border border-emerald-300">
                            WFS-TRP-GRU-[XXXX]
                          </code>{' '}
                          para rastreio e conferência.
                        </p>
                      </div>
                    </div>
                  </>
                ) : null}

                <div>
                  <label className="block font-bold text-slate-700 mb-1" htmlFor="bulk-manager-notes">
                    {bulkActionModal.type === 'approve'
                      ? 'Observações do Gestor / Justificativa da Liberação em Lote'
                      : 'Motivo da Recusa em Massa (Obrigatório) *'}
                  </label>
                  <textarea
                    id="bulk-manager-notes"
                    rows={2}
                    required={bulkActionModal.type === 'reject'}
                    value={bulkManagerNotes}
                    onChange={(e) => setBulkManagerNotes(e.target.value)}
                    placeholder={
                      bulkActionModal.type === 'approve'
                        ? 'Ex: Aprovado em lote pelo plantão COI. Horário sem transporte público regular disponível.'
                        : 'Ex: Transporte público municipal operando normalmente no horário solicitado.'
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-[#E31837]/30"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setBulkActionModal(null)}
                  className="px-4 py-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors font-semibold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isProcessingBulk || (bulkActionModal.type === 'reject' && !bulkManagerNotes.trim())}
                  onClick={handleConfirmBulkAction}
                  className={`px-5 py-2.5 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-2 ${
                    bulkActionModal.type === 'approve'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isProcessingBulk ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Processando em massa...</span>
                    </>
                  ) : bulkActionModal.type === 'approve' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirmar Aprovação de {bulkActionModal.items.length} Solicitações</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4" />
                      <span>Confirmar Recusa de {bulkActionModal.items.length} Solicitações</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Barra Flutuante de Ação Rápida em Massa (dock inferior enquanto navega) */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-xl bg-slate-900/95 text-white backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl p-3 sm:px-5 sm:py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center">
                {selectedIds.length}
              </span>
              <span className="text-xs font-bold text-slate-100">
                {selectedIds.length} {selectedIds.length === 1 ? 'item selecionado' : 'itens selecionados'}
              </span>
              <button
                type="button"
                onClick={handleClearSelection}
                className="text-[11px] text-slate-400 hover:text-white underline ml-2 cursor-pointer"
              >
                Limpar
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpenBulkActionModal('approve')}
                className="px-3.5 py-1.5 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Aprovar em Massa</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenBulkActionModal('reject')}
                className="px-3.5 py-1.5 rounded-xl font-bold text-xs bg-rose-600 hover:bg-rose-500 text-white shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <XCircle className="w-4 h-4" />
                <span>Recusar em Massa</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Evident Confirmation Popup (5 seconds countdown, dismissible) */}
      {confirmationData && (
        <ConfirmationPopup
          isOpen={confirmationData.isOpen}
          onClose={() => setConfirmationData(null)}
          title={confirmationData.title}
          subtitle={confirmationData.subtitle}
          instructionsMessage={confirmationData.instructionsMessage}
          protocol={confirmationData.protocol}
          controlNumber={confirmationData.controlNumber}
          collaboratorName={confirmationData.collaboratorName}
          type={confirmationData.type}
          durationSeconds={5}
        />
      )}
    </div>
  );
};

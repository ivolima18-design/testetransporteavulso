import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar,
  Clock,
  User,
  Phone,
  MapPin,
  Car,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Copy,
  Check,
  PlaneTakeoff,
  Home,
  ShieldCheck,
  Sparkles,
  Info,
  Lock,
  Printer
} from 'lucide-react';
import { printUberRequests } from '../utils/printOrder';
import { NewUberRequestPayload, UberRequest, GRU_TERMINAL_OPTIONS } from '../types';
import { createUberRequest, getCurrentSession, getLocalWorkflowConfig } from '../services/api';
import { ConfirmationPopup } from './ConfirmationPopup';
import { isSystemLocked, SYSTEM_LOCK_MESSAGE } from '../utils/lockWindow';

interface UberRequestFormProps {
  onSuccess: (request: UberRequest) => void;
  onNavigateToTracker: (protocolo: string) => void;
  uberSuspenso?: boolean;
}

export const UberRequestForm: React.FC<UberRequestFormProps> = ({
  onSuccess,
  onNavigateToTracker,
  uberSuspenso: propUberSuspenso,
}) => {
  // Funções utilitárias de data com garantia de fuso horário local
  const getLocalDateString = (d: Date = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDateBR = (isoDate: string) => {
    if (!isoDate) return '';
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const todayStr = getLocalDateString(new Date());
  const tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return getLocalDateString(d);
  })();
  const session = getCurrentSession();

  // Estado do regime de transporte (Uber Suspenso / Operação Moove)
  const [isUberSuspenso, setIsUberSuspenso] = useState<boolean>(() => {
    if (typeof propUberSuspenso === 'boolean') return propUberSuspenso;
    return getLocalWorkflowConfig().uberSuspenso !== false;
  });

  useEffect(() => {
    if (typeof propUberSuspenso === 'boolean') {
      setIsUberSuspenso(propUberSuspenso);
    }
  }, [propUberSuspenso]);

  useEffect(() => {
    const handleConfigChange = (e: any) => {
      if (e?.detail?.uberSuspenso !== undefined) {
        setIsUberSuspenso(e.detail.uberSuspenso !== false);
      }
    };
    window.addEventListener('wfs:workflow-config-changed', handleConfigChange);
    return () => window.removeEventListener('wfs:workflow-config-changed', handleConfigChange);
  }, []);

  const [showConfirmationPopup, setShowConfirmationPopup] = useState(false);
  const [showUrgentNoticeModal, setShowUrgentNoticeModal] = useState(false);

  // Janela de bloqueio operacional (00:01–04:59): recalcula a cada minuto
  // para a tela reabrir sozinha às 05:00, sem precisar recarregar a página.
  const [isLocked, setIsLocked] = useState<boolean>(() => isSystemLocked());
  useEffect(() => {
    const checkLock = () => setIsLocked(isSystemLocked());
    checkLock();
    const interval = setInterval(checkLock, 30000);
    return () => clearInterval(interval);
  }, []);

  // Informações da Operação & Colaborador (inicia por padrão com a data de amanhã)
  const [formData, setFormData] = useState({
    dataEvento: tomorrowStr,
    horarioInicio: 'Saída', // Solicitação: "Entrada" ou "Saída"
    horarioTermino: '04:30', // Horário do Transporte
    nomeEvento: '',
    nome: '',
    sobrenome: '',
    telefone: '',
  });

  // Verificação da regra operacional e horários limites:
  // "Pedidos para saída no outro dia devem ser feito até as 23:30, e pedidos para entrada no outro dia, devem ser feito até as 17:30."
  const getDateStatus = () => {
    if (!formData.dataEvento) return null;
    try {
      const now = new Date();
      const isToday = formData.dataEvento === todayStr;
      const isTomorrow = formData.dataEvento === tomorrowStr;
      const isFutureMultipleDays = formData.dataEvento > tomorrowStr;
      const isPast = formData.dataEvento < todayStr;
      const isPast23h30 = now.getHours() > 23 || (now.getHours() === 23 && now.getMinutes() >= 30);
      const isPast17h30 = now.getHours() > 17 || (now.getHours() === 17 && now.getMinutes() >= 30);

      const isEntrada = formData.horarioInicio === 'Entrada';
      const isPastMooveCutoff = isEntrada ? isPast17h30 : isPast23h30;
      const isPastCutoff = isUberSuspenso ? isPastMooveCutoff : isPast23h30;
      const cutoffHour = isUberSuspenso && isEntrada ? '17:30' : '23:30';

      // Requer alerta e confirmação se NÃO for o dia seguinte OU se amanhã for após o horário de corte
      const requiresConfirmation = !isTomorrow || (isTomorrow && isPastCutoff);

      return {
        isToday,
        isTomorrow,
        isFutureMultipleDays,
        isPast,
        isPast23h30,
        isPast17h30,
        isPastCutoff,
        cutoffHour,
        tipoViagem: isEntrada ? 'Entrada' : 'Saída',
        requiresConfirmation,
      };
    } catch {
      return null;
    }
  };

  const dateStatus = getDateStatus();

  // Endereço Base: formulário estruturado com preenchimento obrigatório
  const [baseAddress, setBaseAddress] = useState({
    rua: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: 'Guarulhos',
    cep: '',
  });

  // Endereço do Evento (Local de Partida): Apenas Terminais 1, 2 ou 3 do Aeroporto GRU
  const [selectedTerminalId, setSelectedTerminalId] = useState<string>('terminal-1');

  // Necessidade de Viagem: apenas uma opção (Ida OU Volta)
  // Caso precise de ida e volta, o usuário deve fazer dois pedidos.
  const [tripChoice, setTripChoice] = useState<'IDA' | 'VOLTA'>('VOLTA');

  // Responsável pela Solicitação: Nome, Função, Matrícula
  const [responsavel, setResponsavel] = useState({
    nome: session?.user?.nome || '',
    funcao: session?.user?.funcao || '',
    matricula: session?.user?.matricula || '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdRequest, setCreatedRequest] = useState<UberRequest | null>(null);
  const [copiedProtocol, setCopiedProtocol] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Popup modal de alerta de validação (exibido na tela para o usuário não ficar perdido)
  const [validationModal, setValidationModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    fieldIdToFocus?: string;
  } | null>(null);

  const triggerValidationError = (message: string, fieldIdToFocus?: string) => {
    setErrorMessage(message);
    setValidationModal({
      isOpen: true,
      title: 'Atenção ao preencher',
      message,
      fieldIdToFocus,
    });
  };

  const handleCloseValidationModal = () => {
    const fieldId = validationModal?.fieldIdToFocus;
    setValidationModal(null);
    if (fieldId) {
      setTimeout(() => {
        const el = document.getElementById(fieldId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus();
        }
      }, 120);
    }
  };

  // Máscara de telefone WhatsApp
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 11) val = val.slice(0, 11);

    let formatted = val;
    if (val.length > 2) {
      formatted = `(${val.slice(0, 2)}) ${val.slice(2)}`;
    }
    if (val.length > 7) {
      formatted = `(${val.slice(0, 2)}) ${val.slice(2, 7)}-${val.slice(7)}`;
    }
    setFormData((prev) => ({ ...prev, telefone: formatted }));
  };

  // Máscara de CEP (00000-000)
  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 8) val = val.slice(0, 8);
    let formatted = val;
    if (val.length > 5) {
      formatted = `${val.slice(0, 5)}-${val.slice(5)}`;
    }
    setBaseAddress((prev) => ({ ...prev, cep: formatted }));
  };

  const selectedTerminal = GRU_TERMINAL_OPTIONS.find((t) => t.id === selectedTerminalId) || GRU_TERMINAL_OPTIONS[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Reconfirma o bloqueio no momento do envio (o horário pode ter mudado
    // enquanto a pessoa preenchia o formulário). O servidor também recusa
    // esse envio de qualquer forma — esta checagem é só para dar o motivo
    // correto na hora, sem esperar a resposta da API.
    if (isSystemLocked()) {
      setIsLocked(true);
      triggerValidationError(SYSTEM_LOCK_MESSAGE);
      return;
    }

    // Validações obrigatórias com exibição de popup modal e foco no campo
    if (!formData.nomeEvento.trim()) {
      triggerValidationError('O campo "Nome do Evento / Motivo Operacional" é obrigatório.', 'nomeEvento');
      return;
    }
    if (!formData.nome.trim()) {
      triggerValidationError('Por favor, informe o Nome do colaborador.', 'nome');
      return;
    }
    if (!formData.sobrenome.trim()) {
      triggerValidationError('Por favor, informe o Sobrenome do colaborador.', 'sobrenome');
      return;
    }
    // Validação estrita de 11 dígitos no telefone
    const phoneDigits = formData.telefone.replace(/\D/g, '');
    if (phoneDigits.length !== 11) {
      triggerValidationError('O número de telefone WhatsApp deve conter obrigatoriamente 11 dígitos com DDD (ex: (11) 98765-4321).', 'telefone');
      return;
    }

    // Validação do Endereço Base estruturado
    if (!baseAddress.rua.trim()) {
      triggerValidationError('No Endereço Base, o preenchimento da Rua/Logradouro é obrigatório.', 'base-rua');
      return;
    }
    if (!baseAddress.numero.trim()) {
      triggerValidationError('No Endereço Base, o preenchimento do Número é obrigatório.', 'base-numero');
      return;
    }
    if (!baseAddress.bairro.trim()) {
      triggerValidationError('No Endereço Base, o preenchimento do Bairro é obrigatório.', 'base-bairro');
      return;
    }
    if (!baseAddress.cidade.trim()) {
      triggerValidationError('No Endereço Base, o preenchimento da Cidade é obrigatório.', 'base-cidade');
      return;
    }
    if (baseAddress.cep.replace(/\D/g, '').length < 8) {
      triggerValidationError('No Endereço Base, o preenchimento do CEP completo é obrigatório (8 dígitos).', 'base-cep');
      return;
    }

    // Validação do Responsável pela Solicitação
    if (!responsavel.nome.trim()) {
      triggerValidationError('O campo "Responsável pela solicitação: Nome" é obrigatório.', 'resp-nome');
      return;
    }
    if (!responsavel.funcao.trim()) {
      triggerValidationError('O campo "Responsável pela solicitação: Função" é obrigatório.', 'resp-funcao');
      return;
    }
    if (!responsavel.matricula.trim()) {
      triggerValidationError('O campo "Responsável pela solicitação: Matrícula" é obrigatório.', 'resp-matricula');
      return;
    }

    // Trava de data: O transporte deve ser sempre para o dia seguinte.
    // Se o pedido for para o dia atual ou para dois ou mais dias à frente, o sistema alerta e pede confirmação antes de seguir.
    if (dateStatus?.requiresConfirmation) {
      setShowUrgentNoticeModal(true);
      return;
    }

    await executeSubmit();
  };

  const executeSubmit = async () => {
    setShowUrgentNoticeModal(false);

    // Composição do endereço residencial completo
    const complementoStr = baseAddress.complemento.trim() ? ` (${baseAddress.complemento.trim()})` : '';
    const enderecoBaseFormatado = `${baseAddress.rua.trim()}, nº ${baseAddress.numero.trim()}${complementoStr} - ${baseAddress.bairro.trim()}, ${baseAddress.cidade.trim()} - CEP ${baseAddress.cep.trim()}`;

    // Viagem única: Ida OU Volta
    const viagemIda = tripChoice === 'IDA' ? 'Sim' : 'Não';
    const viagemVolta = tripChoice === 'VOLTA' ? 'Sim' : 'Não';

    setIsSubmitting(true);
    try {
      // O horário informado no formulário ("Horário do Transporte") vira o horário
      // real de início OU término do evento, conforme a Solicitação escolhida:
      // - "Entrada": preenche Horário de Início do Evento, deixa Término em branco.
      // - "Saída": preenche Horário de Término do Evento, deixa Início em branco.
      const horarioInicioEvento = formData.horarioInicio === 'Entrada' ? formData.horarioTermino : '';
      const horarioTerminoEvento = formData.horarioInicio === 'Saída' ? formData.horarioTermino : '';

      const payload: NewUberRequestPayload = {
        dataEvento: formData.dataEvento,
        horarioInicio: formData.horarioInicio,
        horarioTermino: formData.horarioTermino,
        horarioInicioEvento,
        horarioTerminoEvento,
        nomeEvento: formData.nomeEvento.trim(),
        nome: formData.nome.trim(),
        sobrenome: formData.sobrenome.trim(),
        telefone: formData.telefone.trim(),
        enderecoBase: enderecoBaseFormatado,
        enderecoEvento: selectedTerminal.address,
        viagemIda,
        viagemVolta,
        responsavelNome: responsavel.nome.trim(),
        responsavelFuncao: responsavel.funcao.trim(),
        responsavelMatricula: responsavel.matricula.trim(),
      };

      const res = await createUberRequest(payload);
      setCreatedRequest(res.request);
      setShowConfirmationPopup(true);
      onSuccess(res.request);
    } catch (err: any) {
      triggerValidationError(err.message || 'Erro ao registrar solicitação. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyProtocol = () => {
    if (createdRequest?.protocolo) {
      navigator.clipboard.writeText(createdRequest.protocolo);
      setCopiedProtocol(true);
      setTimeout(() => setCopiedProtocol(false), 2500);
    }
  };

  const handleResetForm = () => {
    setCreatedRequest(null);
    setFormData({
      dataEvento: tomorrowStr,
      horarioInicio: 'Saída',
      horarioTermino: '04:30',
      nomeEvento: '',
      nome: '',
      sobrenome: '',
      telefone: '',
    });
    setBaseAddress({
      rua: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: 'Guarulhos',
      cep: '',
    });
    setSelectedTerminalId('terminal-1');
    setTripChoice('VOLTA');
  };

  if (isLocked) {
    return (
      <div className="w-full max-w-4xl mx-auto">
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-10 sm:p-14 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center text-[#E31837]">
              <Lock className="w-7 h-7" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Sistema fechado para lançamentos
            </h2>
            <p className="text-sm sm:text-base text-slate-600 max-w-xl leading-relaxed">
              {SYSTEM_LOCK_MESSAGE}
            </p>
            <button
              type="button"
              onClick={() => onNavigateToTracker('')}
              className="mt-2 px-5 py-2 text-sm font-semibold text-[#E31837] bg-red-50 hover:bg-red-100 rounded-xl transition-colors inline-flex items-center gap-2"
            >
              Acompanhar uma solicitação já feita
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Modal de Alerta e Confirmação de Data de Transporte */}
      <AnimatePresence>
        {showUrgentNoticeModal && (
          <div
            id="urgent-notice-modal-backdrop"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs"
          >
            <motion.div
              id="urgent-notice-modal"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden"
            >
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-slate-800 text-[#E31837]">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Confirmação da Data do Transporte</h3>
                    <p className="text-xs text-slate-300">Regra Operacional de Transporte Avulso</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowUrgentNoticeModal(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors text-lg font-bold"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Mensagens dinâmicas conforme a regra solicitada */}
                <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-amber-200 text-amber-900 font-extrabold text-[11px] uppercase tracking-wide">
                      {dateStatus?.isToday
                        ? 'Pedido para HOJE'
                        : dateStatus?.isFutureMultipleDays
                        ? 'Pedido para 2+ dias à frente'
                        : dateStatus?.isPast
                        ? 'Data no Passado'
                        : 'Atenção ao Prazo'}
                    </span>
                    <strong className="text-sm font-bold text-slate-900">
                      Data informada: {formatDateBR(formData.dataEvento)}
                    </strong>
                  </div>

                  <p className="leading-relaxed text-slate-800 font-medium">
                    {dateStatus?.isToday && (
                      <>
                        Você selecionou a data de <strong>HOJE ({formatDateBR(formData.dataEvento)})</strong>.
                        O transporte avulso deve ser <strong>sempre solicitado para o DIA SEGUINTE ({formatDateBR(tomorrowStr)})</strong>.
                        Solicitações para o mesmo dia dependem de análise operacional emergencial.
                      </>
                    )}
                    {dateStatus?.isFutureMultipleDays && (
                      <>
                        Você selecionou a data de <strong>{formatDateBR(formData.dataEvento)} (2 ou mais dias à frente)</strong>.
                        O transporte avulso é rotineiramente programado para o <strong>DIA SEGUINTE ({formatDateBR(tomorrowStr)})</strong>.
                        Para evitar pedidos duplicados ou com datas incorretas, confirme com atenção.
                      </>
                    )}
                    {dateStatus?.isPast && (
                      <>
                        A data selecionada (<strong>{formatDateBR(formData.dataEvento)}</strong>) já passou. O agendamento correto deve ser sempre para o <strong>DIA SEGUINTE ({formatDateBR(tomorrowStr)})</strong>.
                      </>
                    )}
                    {dateStatus?.isTomorrow && dateStatus?.isPastCutoff && (
                      <>
                        {isUberSuspenso ? (
                          <>
                            No regime exclusivo Moove, pedidos para <strong>{dateStatus.tipoViagem.toUpperCase()}</strong> no outro dia devem ser realizados impreterivelmente até às <strong>{dateStatus.cutoffHour}</strong> do dia atual. Seu envio está ocorrendo após esse horário limite.
                          </>
                        ) : (
                          <>
                            Os pedidos para atendimento no dia seguinte devem ser realizados até às <strong>23:30</strong> do dia atual; após esse horário, qualquer solicitação será desconsiderada.
                          </>
                        )}
                      </>
                    )}
                  </p>

                  <div className="pt-2 border-t border-amber-200/60 text-slate-600 text-[11px]">
                    Deseja prosseguir com o pedido para <strong>{formatDateBR(formData.dataEvento)}</strong> ou ajustar para o dia seguinte?
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, dataEvento: tomorrowStr }));
                      setShowUrgentNoticeModal(false);
                    }}
                    className="w-full sm:flex-1 py-2.5 px-3 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    Ajustar para Amanhã ({formatDateBR(tomorrowStr)})
                  </button>
                  <button
                    type="button"
                    onClick={executeSubmit}
                    disabled={isSubmitting}
                    className="w-full sm:flex-1 py-2.5 px-3 rounded-xl bg-[#E31837] hover:bg-[#c4122d] text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    {isSubmitting ? 'Enviando...' : `Confirmar para ${formatDateBR(formData.dataEvento)}`}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal / Popup de Alerta de Validação com foco e instrução imediata */}
      <AnimatePresence>
        {validationModal?.isOpen && (
          <div
            id="validation-error-modal-backdrop"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs"
            onClick={handleCloseValidationModal}
          >
            <motion.div
              id="validation-error-modal"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-red-950/80 border border-red-500/30 text-[#E31837]">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold">{validationModal.title}</h3>
                    <p className="text-xs text-slate-300">Validação Operacional de Transporte</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCloseValidationModal}
                  className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors text-lg font-bold"
                  aria-label="Fechar popup"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-950 space-y-2">
                  <p className="font-bold text-sm text-red-900 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-[#E31837] shrink-0" />
                    Campo precisa de correção
                  </p>
                  <p className="leading-relaxed text-slate-800 font-medium text-xs">
                    {validationModal.message}
                  </p>
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Por favor, ajuste a informação indicada acima para que sua solicitação de transporte seja concluída e enviada com sucesso.
                </p>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleCloseValidationModal}
                    className="w-full py-3 px-4 rounded-xl bg-[#E31837] hover:bg-[#c4122d] text-white font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Entendido, vou corrigir</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal / Feedback de Sucesso */}
      <AnimatePresence>
        {createdRequest && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="mb-8 p-6 sm:p-8 bg-white border border-emerald-200 rounded-2xl shadow-xl shadow-emerald-900/5 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600" />
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 mb-1">
                    Solicitação Registrada no Sistema
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">
                    Pedido Enviado para Avaliação do Gestor
                  </h3>
                  <p className="text-sm text-slate-600 mt-0.5">
                    Os dados foram gravados na planilha oficial WFS. Guarde seu protocolo para acompanhar.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:items-end w-full sm:w-auto mt-2 sm:mt-0 pt-4 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Número de Protocolo
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-lg font-mono font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                    {createdRequest.protocolo}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyProtocol}
                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Copiar protocolo"
                  >
                    {copiedProtocol ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Informações registradas do Solicitante */}
            <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex flex-wrap items-center gap-y-1 gap-x-4">
              <span>
                <strong>Solicitação:</strong> {createdRequest.horarioInicio}
              </span>
              <span>•</span>
              <span>
                <strong>Horário do Transporte:</strong> {createdRequest.horarioTermino}
              </span>
              <span>•</span>
              <span>
                <strong>Responsável:</strong> {createdRequest.responsavelNome}
              </span>
              <span>•</span>
              <span>
                <strong>Função:</strong> {createdRequest.responsavelFuncao}
              </span>
              <span>•</span>
              <span>
                <strong>Matrícula:</strong> {createdRequest.responsavelMatricula}
              </span>
              <span>•</span>
              <span>
                <strong>Trajeto:</strong> {createdRequest.viagemIda === 'Sim' ? 'Viagem de IDA' : 'Viagem de VOLTA'}
              </span>
            </div>

            <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Status Atual: <strong className="text-slate-800">Pendente de Confirmação pelo Gestor</strong>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => printUberRequests(createdRequest)}
                  className="px-4 py-2 text-sm font-bold text-slate-700 hover:text-slate-950 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  title="Imprimir comprovante da solicitação"
                >
                  <Printer className="w-4 h-4 text-slate-600" />
                  <span>Imprimir Pedido</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Nova Solicitação
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateToTracker(createdRequest.protocolo)}
                  className="px-5 py-2 text-sm font-semibold text-white bg-[#E31837] hover:bg-[#c4122d] rounded-xl shadow-sm transition-all inline-flex items-center gap-2 cursor-pointer"
                >
                  Acompanhar Status
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Formulário Principal */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
        {/* Banner Superior */}
        <div className="p-6 sm:p-8 border-b border-slate-100 bg-gradient-to-b from-slate-50/70 to-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-[#E31837] border border-red-100 mb-2">
                <Car className="w-3.5 h-3.5" />
                {isUberSuspenso
                  ? 'Operação Moove (Van / Táxi) • Uber Suspenso'
                  : 'Transporte Avulso Fora de Horário Regular'}
              </div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                Solicitação de Transporte Avulso para Operação
              </h2>
              <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
                Utilize este formulário quando seu expediente em Guarulhos (GRU) iniciar ou terminar
                em horários sem disponibilidade de transporte público coletivo.
              </p>
            </div>

            <div className="hidden sm:flex flex-col items-end text-right">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Base Operacional</span>
              <span className="text-xs font-bold text-slate-800 mt-0.5">Aeroporto GRU (Guarulhos)</span>
              <span className="text-[11px] text-slate-500">WFS A SATS COMPANY</span>
            </div>
          </div>
        </div>

        {/* Mensagem de Erro / Validação */}
        {errorMessage && (
          <div
            id="form-error-banner"
            className="mx-6 sm:mx-8 mt-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start justify-between gap-3"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-[#E31837]" />
              <div>
                <strong className="font-semibold block">Atenção ao preencher:</strong>
                {errorMessage}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-red-700 p-1 rounded-lg text-sm font-bold transition-colors"
              aria-label="Dispensar aviso"
            >
              ✕
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-8">
          {/* Seção 1: Informações da Operação & Horário */}
          <div>
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-[#E31837]">
                <Calendar className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                1. Informações da Operação &amp; Horário
              </h3>
            </div>

            {/* Aviso Informativo: Antecedência e Regras Operacionais */}
            {isUberSuspenso ? (
              <div className="mb-6 p-4 sm:p-5 bg-gradient-to-br from-amber-50 via-orange-50/60 to-amber-100/40 border-2 border-amber-300 rounded-2xl text-slate-800 shadow-xs">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-amber-500 text-white shrink-0 mt-0.5 shadow-xs">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="flex-1 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-950 font-black text-[11px] uppercase tracking-wider border border-amber-300">
                          Aviso Operacional WFS
                        </span>
                        <h4 className="text-sm sm:text-base font-extrabold text-slate-900">
                          Transporte com a Uber Suspenso • Atendimento Exclusivo Moove
                        </h4>
                      </div>
                      <span className="text-[11px] font-bold text-amber-950 bg-white/90 border border-amber-300 px-2.5 py-0.5 rounded-full">
                        Novos Prazos Mandatórios
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                      O transporte com a Uber foi suspenso, ficaremos apenas com a <strong>Moove (Van / Táxi)</strong>, que segue as seguintes regras de antecedência:
                    </p>

                    {/* Destaque nos Horários com visual de alto contraste */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {/* Saída */}
                      <div className="p-3.5 bg-white rounded-xl border-2 border-amber-300/90 shadow-2xs flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-50 text-[#E31837] border border-red-200 flex items-center justify-center font-bold shrink-0">
                          <Clock className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                            Pedidos para SAÍDA no outro dia:
                          </span>
                          <div className="text-xs font-semibold text-slate-800 mt-0.5 flex items-baseline gap-1.5 flex-wrap">
                            <span>Devem ser feitos até às</span>
                            <span className="text-base sm:text-lg font-black text-[#E31837] bg-red-50 px-2 py-0.5 rounded-md border border-red-200 tracking-tight">
                              23:30
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Entrada */}
                      <div className="p-3.5 bg-white rounded-xl border-2 border-amber-300/90 shadow-2xs flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center font-bold shrink-0">
                          <Clock className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                            Pedidos para ENTRADA no outro dia:
                          </span>
                          <div className="text-xs font-semibold text-slate-800 mt-0.5 flex items-baseline gap-1.5 flex-wrap">
                            <span>Devem ser feitos até às</span>
                            <span className="text-base sm:text-lg font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 tracking-tight">
                              17:30
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-amber-950 font-medium pt-0.5 flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <span>
                        Após esses horários estipulados, qualquer alteração ou solicitação será desconsiderada pela escala operacional.
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* Comunicado Padrão (Uber Ativo) */
              <div className="mb-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-[#E31837] shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold text-slate-900 block text-xs">
                    2. Antecedência mínima
                  </strong>
                  <p className="text-slate-600 mt-0.5 leading-relaxed">
                    Os pedidos devem ser realizados ou alterados até às 23:30 do dia atual para atendimento no dia seguinte; após esse período, qualquer alteração ou solicitação será desconsiderada.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              {/* DATA DO EVENTO* (com aviso contextual) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase" htmlFor="dataEvento">
                  DATA DO EVENTO *
                </label>
                <input
                  id="dataEvento"
                  type="date"
                  required
                  value={formData.dataEvento}
                  onChange={(e) => setFormData({ ...formData, dataEvento: e.target.value })}
                  className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 transition-all ${
                    dateStatus?.isTomorrow
                      ? 'border-emerald-300 focus:border-emerald-500'
                      : 'border-amber-300 focus:border-amber-500'
                  }`}
                />
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, dataEvento: tomorrowStr })}
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-md transition-colors ${
                      formData.dataEvento === tomorrowStr
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'text-[#E31837] hover:underline'
                    }`}
                  >
                    Amanhã (Padrão)
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, dataEvento: todayStr })}
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-md transition-colors ${
                      formData.dataEvento === todayStr
                        ? 'bg-amber-100 text-amber-900 font-bold'
                        : 'text-slate-600 hover:underline'
                    }`}
                  >
                    Hoje
                  </button>
                </div>

                {/* Feedback contextual de validação da data */}
                {dateStatus?.isTomorrow && !dateStatus?.isPastCutoff && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50/90 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Transporte para o dia seguinte ({formatDateBR(tomorrowStr)}) — Padrão Operacional</span>
                  </div>
                )}
                {dateStatus?.isTomorrow && dateStatus?.isPastCutoff && (
                  <div className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold text-amber-950 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      Atenção: Horário limite ({dateStatus.cutoffHour}) para {dateStatus.tipoViagem.toLowerCase()} no dia seguinte ultrapassado.
                    </span>
                  </div>
                )}
                {dateStatus?.isToday && (
                  <div className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold text-amber-900 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>Atenção: Pedido para HOJE. O sistema pedirá confirmação antes do envio.</span>
                  </div>
                )}
                {dateStatus?.isFutureMultipleDays && (
                  <div className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold text-amber-900 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>Atenção: Pedido para 2 ou mais dias à frente. O sistema pedirá confirmação antes do envio.</span>
                  </div>
                )}
                {dateStatus?.isPast && (
                  <div className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold text-rose-900 bg-rose-50 px-2.5 py-1.5 rounded-lg border border-rose-200">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                    <span>Atenção: Data no passado. O transporte deve ser para o dia seguinte.</span>
                  </div>
                )}
              </div>

              {/* Solicitação (Caixa de seleção: Entrada ou Saída) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="solicitacao">
                  Solicitação *
                </label>
                <select
                  id="solicitacao"
                  required
                  value={formData.horarioInicio}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData({ ...formData, horarioInicio: val });
                    if (val === 'Entrada') {
                      setTripChoice('IDA');
                    } else if (val === 'Saída') {
                      setTripChoice('VOLTA');
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] transition-all cursor-pointer"
                >
                  <option value="Entrada">Entrada</option>
                  <option value="Saída">Saída</option>
                </select>
                <span className="text-[11px] text-slate-400 mt-1 block">Opção de Entrada ou Saída</span>
              </div>

              {/* Horário do Transporte */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="horarioTransporte">
                  Horário do Transporte *
                </label>
                <input
                  id="horarioTransporte"
                  type="time"
                  required
                  value={formData.horarioTermino}
                  onChange={(e) => setFormData({ ...formData, horarioTermino: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] transition-all"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">Horário do transporte avulso</span>
              </div>
            </div>

            {/* Alerta caso a data esteja fora do padrão de agendamento para o dia seguinte */}
            {dateStatus?.requiresConfirmation && (
              <div className="mt-3.5 p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold text-amber-950 block text-xs">
                    Confirmação de Data Necessária
                  </strong>
                  <p className="mt-0.5 leading-relaxed text-slate-700">
                    O transporte deve ser sempre para o dia seguinte ({formatDateBR(tomorrowStr)}). Como a data selecionada é diferente ({formatDateBR(formData.dataEvento)}), o sistema exigirá confirmação expressa antes do envio para evitar pedidos com datas incorretas.
                  </p>
                </div>
              </div>
            )}

            {/* Nome do evento / Motivo Operacional */}
            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="nomeEvento">
                Nome do Evento / Motivo Operacional *
              </label>
              <textarea
                id="nomeEvento"
                required
                rows={2}
                placeholder="Descreva detalhadamente a justificativa (ex: Término de expediente às 04h30 sem transporte público para a residência, voo extraordinário, escala noturna...)"
                value={formData.nomeEvento}
                onChange={(e) => setFormData({ ...formData, nomeEvento: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] transition-all resize-none"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Campo obrigatório: o solicitante deve justificar a necessidade do transporte avulso.
              </span>
            </div>
          </div>

          {/* Seção 2: Identificação do Colaborador Transportado */}
          <div>
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-[#E31837]">
                <User className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                2. Colaborador que Utilizará o Transporte
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="nome">
                  Nome *
                </label>
                <input
                  id="nome"
                  type="text"
                  required
                  placeholder="Ex: Carlos"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="sobrenome">
                  Sobrenome *
                </label>
                <input
                  id="sobrenome"
                  type="text"
                  required
                  placeholder="Ex: Silva Santos"
                  value={formData.sobrenome}
                  onChange={(e) => setFormData({ ...formData, sobrenome: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="telefone">
                  Telefone WhatsApp *
                </label>
                <input
                  id="telefone"
                  type="tel"
                  required
                  placeholder="(11) 98765-4321"
                  maxLength={15}
                  value={formData.telefone}
                  onChange={handlePhoneChange}
                  className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 transition-all ${
                    formData.telefone && formData.telefone.replace(/\D/g, '').length !== 11
                      ? 'border-amber-300 focus:border-amber-500'
                      : formData.telefone && formData.telefone.replace(/\D/g, '').length === 11
                      ? 'border-emerald-300 focus:border-emerald-500'
                      : 'border-slate-300 focus:border-[#E31837]'
                  }`}
                />
                <div className="flex items-center justify-between text-[11px] mt-1">
                  <span className={formData.telefone && formData.telefone.replace(/\D/g, '').length !== 11 ? 'text-amber-800 font-medium' : 'text-slate-500'}>
                    Obrigatório 11 dígitos com DDD
                  </span>
                  <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    formData.telefone.replace(/\D/g, '').length === 11
                      ? 'bg-emerald-100 text-emerald-800'
                      : formData.telefone.replace(/\D/g, '').length > 0
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {formData.telefone.replace(/\D/g, '').length}/11 dígitos
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Seção 3: Endereços & Necessidade de Viagem */}
          <div>
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-[#E31837]">
                <MapPin className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                3. Endereços &amp; Decisão de Viagem
              </h3>
            </div>

            <div className="space-y-6">
              {/* Endereço do Evento (Local de Partida): Apenas Terminais 1, 2 e 3 do GRU Airport */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Endereço do Evento (Ponto Operacional GRU) *
                  </label>
                  <span className="text-xs font-semibold text-[#E31837] flex items-center gap-1">
                    <PlaneTakeoff className="w-3.5 h-3.5" />
                    Terminais GRU Airport
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-3.5">
                  Selecione o terminal do Aeroporto Internacional de Guarulhos para o ponto de embarque/desembarque:
                </p>

                {/* Seleção exclusiva dos Terminais 1, 2 e 3 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {GRU_TERMINAL_OPTIONS.map((term) => {
                    const isSelected = selectedTerminalId === term.id;
                    return (
                      <button
                        key={term.id}
                        type="button"
                        onClick={() => setSelectedTerminalId(term.id)}
                        className={`p-3.5 rounded-xl text-left border transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'bg-red-50/80 border-[#E31837] ring-1 ring-[#E31837] shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <strong className={`text-sm font-bold ${isSelected ? 'text-[#E31837]' : 'text-slate-900'}`}>
                            {term.label}
                          </strong>
                          <div
                            className={`w-4 h-4 rounded-full flex items-center justify-center border ${
                              isSelected ? 'border-[#E31837] bg-[#E31837]' : 'border-slate-300'
                            }`}
                          >
                            {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                          {term.address}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Endereço Base: Formulário Estruturado Residencial */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Endereço Base (Residência do Colaborador) *
                  </label>
                  <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                    <Home className="w-3.5 h-3.5 text-[#E31837]" />
                    Preenchimento Obrigatório
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Preencha os campos obrigatórios da residência para cálculo correto da rota e emissão do transporte:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 sm:gap-4">
                  {/* Rua / Logradouro */}
                  <div className="sm:col-span-4">
                    <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="base-rua">
                      Rua / Avenida / Logradouro *
                    </label>
                    <input
                      id="base-rua"
                      type="text"
                      required
                      placeholder="Ex: Av. Tiradentes"
                      value={baseAddress.rua}
                      onChange={(e) => setBaseAddress({ ...baseAddress, rua: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] transition-all"
                    />
                  </div>

                  {/* Número */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="base-numero">
                      Número *
                    </label>
                    <input
                      id="base-numero"
                      type="text"
                      required
                      placeholder="Ex: 1420"
                      value={baseAddress.numero}
                      onChange={(e) => setBaseAddress({ ...baseAddress, numero: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] transition-all"
                    />
                  </div>

                  {/* Complemento (Opcional) */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="base-complemento">
                      Complemento (Opcional)
                    </label>
                    <input
                      id="base-complemento"
                      type="text"
                      placeholder="Ex: Apto 42, Bloco B"
                      value={baseAddress.complemento}
                      onChange={(e) => setBaseAddress({ ...baseAddress, complemento: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] transition-all"
                    />
                  </div>

                  {/* Bairro */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="base-bairro">
                      Bairro *
                    </label>
                    <input
                      id="base-bairro"
                      type="text"
                      required
                      placeholder="Ex: Centro"
                      value={baseAddress.bairro}
                      onChange={(e) => setBaseAddress({ ...baseAddress, bairro: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] transition-all"
                    />
                  </div>

                  {/* Cidade */}
                  <div className="sm:col-span-1">
                    <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="base-cidade">
                      Cidade *
                    </label>
                    <input
                      id="base-cidade"
                      type="text"
                      required
                      placeholder="Guarulhos"
                      value={baseAddress.cidade}
                      onChange={(e) => setBaseAddress({ ...baseAddress, cidade: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] transition-all"
                    />
                  </div>

                  {/* CEP */}
                  <div className="sm:col-span-1">
                    <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="base-cep">
                      CEP *
                    </label>
                    <input
                      id="base-cep"
                      type="text"
                      required
                      placeholder="00000-000"
                      maxLength={9}
                      value={baseAddress.cep}
                      onChange={handleCepChange}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Necessidade de Viagem (Decisão Obrigatória - Apenas UMA opção) */}
              <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-slate-50/50">
                <div className="mb-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Necessidade de Viagem (Decisão Obrigatória) *
                    </h4>
                    <span className="text-[11px] font-bold text-[#E31837] uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded-md border border-red-100">
                      Escolha única
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Selecione apenas o trajeto necessário para este pedido.
                  </p>
                </div>

                {/* Nota operacional destacada */}
                <div className="p-3 mb-4 bg-amber-50/90 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong>Regra Operacional WFS:</strong> O sistema permite selecionar apenas uma opção por solicitação. 
                    Caso o colaborador precise de <strong>ida e volta</strong>, é obrigatório realizar <strong>dois pedidos separados</strong> (um para a IDA e outro para a VOLTA).
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Opção 1: Apenas IDA */}
                  <button
                    type="button"
                    onClick={() => setTripChoice('IDA')}
                    className={`p-4 rounded-xl text-left border transition-all flex items-start gap-3.5 ${
                      tripChoice === 'IDA'
                        ? 'bg-red-50/80 border-[#E31837] ring-1 ring-[#E31837] shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border ${
                        tripChoice === 'IDA' ? 'border-[#E31837] bg-[#E31837]' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {tripChoice === 'IDA' && <span className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div>
                      <strong className={`text-sm font-bold block ${tripChoice === 'IDA' ? 'text-[#E31837]' : 'text-slate-900'}`}>
                        Apenas Viagem de IDA
                      </strong>
                      <span className="text-xs text-slate-600 font-medium block mt-0.5">
                        Residência → Aeroporto GRU
                      </span>
                      <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                        Para início do turno extraordinário/noturno quando não há transporte público saindo da residência.
                      </p>
                    </div>
                  </button>

                  {/* Opção 2: Apenas VOLTA */}
                  <button
                    type="button"
                    onClick={() => setTripChoice('VOLTA')}
                    className={`p-4 rounded-xl text-left border transition-all flex items-start gap-3.5 ${
                      tripChoice === 'VOLTA'
                        ? 'bg-red-50/80 border-[#E31837] ring-1 ring-[#E31837] shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border ${
                        tripChoice === 'VOLTA' ? 'border-[#E31837] bg-[#E31837]' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {tripChoice === 'VOLTA' && <span className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div>
                      <strong className={`text-sm font-bold block ${tripChoice === 'VOLTA' ? 'text-[#E31837]' : 'text-slate-900'}`}>
                        Apenas Viagem de VOLTA
                      </strong>
                      <span className="text-xs text-slate-600 font-medium block mt-0.5">
                        Aeroporto GRU → Residência
                      </span>
                      <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                        Para término de expediente de madrugada/madrugadas sem ônibus municipal/intermunicipal disponível.
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Seção 4: Responsável pela Solicitação (Sempre Obrigatório) */}
          <div className="p-5 sm:p-6 bg-slate-50/90 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200/80">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center text-[#E31837]">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    4. Responsável pela Solicitação
                  </h3>
                  <span className="text-xs text-slate-500">
                    Registro mandatório de auditoria operacional WFS
                  </span>
                </div>
              </div>

              {session && (
                <button
                  type="button"
                  onClick={() => {
                    setResponsavel({
                      nome: session.user.nome,
                      funcao: session.user.funcao || 'Gestor de Operações',
                      matricula: session.user.matricula || 'MAT-WFS',
                    });
                  }}
                  className="text-xs font-semibold text-[#E31837] hover:underline flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Preencher com meu usuário logado
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              {/* Nome do Responsável */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="resp-nome">
                  Nome do Responsável *
                </label>
                <input
                  id="resp-nome"
                  type="text"
                  required
                  placeholder="Nome do supervisor / solicitante"
                  value={responsavel.nome}
                  onChange={(e) => setResponsavel({ ...responsavel, nome: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] transition-all"
                />
              </div>

              {/* Função */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="resp-funcao">
                  Função *
                </label>
                <input
                  id="resp-funcao"
                  type="text"
                  required
                  placeholder="Ex: Supervisor de Rampa, Coordenador"
                  value={responsavel.funcao}
                  onChange={(e) => setResponsavel({ ...responsavel, funcao: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] transition-all"
                />
              </div>

              {/* Matrícula */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="resp-matricula">
                  Matrícula *
                </label>
                <input
                  id="resp-matricula"
                  type="text"
                  required
                  placeholder="Ex: 104829"
                  value={responsavel.matricula}
                  onChange={(e) => setResponsavel({ ...responsavel, matricula: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] transition-all"
                />
              </div>
            </div>
          </div>

          {/* Aviso Institucional WFS */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-800 font-semibold block mb-0.5">
                Política Corporativa WFS (A SATS Company):
              </strong>
              O benefício de transporte avulso é destinado para jornadas extraordinárias sem disponibilidade de transporte público.
              Todas as solicitações são sincronizadas na base Google Sheets oficial da WFS e validadas pelo gestor de plantão.
            </div>
          </div>

          {/* Botão de Envio */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
            <span className="text-xs text-slate-400">
              * Todos os campos são de preenchimento obrigatório
            </span>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-8 py-3.5 bg-[#E31837] hover:bg-[#c4122d] text-white font-bold text-sm rounded-xl shadow-md hover:shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Gravando na Planilha...
                </>
              ) : (
                <>
                  <Car className="w-4 h-4" />
                  Enviar Solicitação de Transporte Avulso
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Popup de confirmação evidente de 5 segundos */}
      {createdRequest && (
        <ConfirmationPopup
          isOpen={showConfirmationPopup}
          onClose={() => setShowConfirmationPopup(false)}
          title="Solicitação Enviada com Sucesso!"
          subtitle="Sua solicitação de transporte avulso foi gravada no sistema e na planilha oficial WFS. Guarde o número de protocolo."
          protocol={createdRequest.protocolo}
          collaboratorName={`${createdRequest.nome} ${createdRequest.sobrenome}`}
          type="success"
          durationSeconds={5}
        />
      )}
    </div>
  );
};

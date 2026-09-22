import React from 'react';
import {
  CheckCircle2,
  Clock,
  XCircle,
  Car,
  ArrowRight,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  Copy,
  ExternalLink,
  User,
  Info,
  Navigation,
  MessageSquare
} from 'lucide-react';
import { UberRequest, RequestStatus, isMooveTaxi, mooveObservacoesTexto, getRecusaOrigem } from '../types';

interface WorkflowTimelineProps {
  request: UberRequest;
  onCopyVoucher?: (code: string) => void;
  showUberLink?: boolean;
}

export const WorkflowTimeline: React.FC<WorkflowTimelineProps> = ({
  request,
  onCopyVoucher,
  showUberLink = true,
}) => {
  const isVolta = request.viagemVolta === 'Sim';
  const pickup = isVolta ? request.enderecoEvento : request.enderecoBase;
  const dropoff = isVolta ? request.enderecoBase : request.enderecoEvento;

  const getUberLink = () => {
    const url = new URL('https://m.uber.com/ul/');
    url.searchParams.set('action', 'setPickup');
    url.searchParams.set('pickup[formatted_address]', pickup);
    url.searchParams.set('dropoff[formatted_address]', dropoff);
    return url.toString();
  };

  // Status flags
  const isPendenteMoove =
    request.status === 'Pendente Moove' ||
    request.status === 'Pendente' ||
    (!request.status.includes('COI') && !request.mooveStatus && request.status !== 'Atendido Moove');

  const isAtendidoMoove = request.status === 'Atendido Moove' || request.mooveStatus === 'Atendido';
  const isAtendidoTaxi = isAtendidoMoove && isMooveTaxi(request);

  const isMooveSentToCoi =
    request.status === 'Pendente COI' ||
    request.status === 'Aprovado COI' ||
    request.status === 'Recusado COI' ||
    request.mooveStatus === 'Recusado_Enviado_COI';

  const isPendenteCoi = request.status === 'Pendente COI';
  const isAprovadoCoi = request.status === 'Aprovado COI' || request.status === 'Aprovado';
  const isRecusado = request.status === 'Recusado COI' || request.status === 'Recusado';
  const isRecusadoMoove = isRecusado && getRecusaOrigem(request) === 'Moove';
  const isRecusadoCoi = isRecusado && !isRecusadoMoove;

  return (
    <div className="space-y-6">
      {/* Header com indicador de etapa atual */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
            Fluxo Operacional de Transporte
          </span>
          <h4 className="text-base font-bold text-white flex items-center gap-2">
            <span>Esteira:</span>
            <span className="text-slate-300 font-normal">Nova Solicitação</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
            <span className={isPendenteMoove || isAtendidoMoove ? 'text-amber-400 font-bold' : 'text-slate-300'}>
              Validação Moove
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
            <span className={isMooveSentToCoi ? 'text-purple-400 font-bold' : 'text-slate-400'}>
              Validação COI
            </span>
          </h4>
        </div>

        <div>
          {isAtendidoMoove && (
            isAtendidoTaxi ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <Car className="w-4 h-4 text-amber-400" />
                Atendido com Táxi (Moove)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Atendido com Van (Moove)
              </span>
            )
          )}
          {isPendenteMoove && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
              1ª Etapa: Em Análise na Moove
            </span>
          )}
          {isPendenteCoi && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
              <Clock className="w-4 h-4 text-purple-400 animate-pulse" />
              2ª Etapa: Repassado ao COI
            </span>
          )}
          {isAprovadoCoi && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-blue-500/20 text-blue-300 border border-blue-500/30">
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
              Atendido pelo COI (Uber)
            </span>
          )}
          {isRecusadoCoi && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">
              <XCircle className="w-4 h-4 text-rose-400" />
              Recusado pelo COI
            </span>
          )}
          {isRecusadoMoove && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">
              <XCircle className="w-4 h-4 text-rose-400" />
              Recusado pela Moove
            </span>
          )}
        </div>
      </div>

      {/* Três Etapas Sequenciais Detalhadas */}
      <div className="space-y-4">
        {/* ETAPA 1: Nova Solicitação Realizada */}
        <div className="border border-slate-200 rounded-2xl bg-white p-4 sm:p-5 shadow-2xs relative">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-200">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Etapa 1 • Concluída
                  </span>
                  <h5 className="text-sm font-bold text-slate-900 mt-1">
                    Nova Solicitação de Transporte Registrada
                  </h5>
                </div>
                {request.dataCriacao && (
                  <span className="text-[11px] text-slate-400">
                    {new Date(request.dataCriacao).toLocaleString('pt-BR')}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3 text-xs">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 text-[11px] block">Colaborador</span>
                  <strong className="text-slate-800 block truncate">
                    {request.nome} {request.sobrenome}
                  </strong>
                  <span className="text-slate-500 text-[11px]">{request.telefone}</span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 text-[11px] block">Horário &amp; Sentido</span>
                  <strong className="text-slate-800 block">
                    {request.horarioTermino}
                    {request.viagemIda ? ` • ${request.viagemIda === 'Sim' ? 'IDA' : 'VOLTA'}` : ''}
                  </strong>
                  <span className="text-slate-500 text-[11px] truncate block" title={request.nomeEvento}>
                    {request.nomeEvento}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 text-[11px] block">Responsável</span>
                  <strong className="text-slate-800 block truncate">
                    {request.responsavelNome || 'Auto-solicitação'}
                  </strong>
                  <span className="text-slate-500 text-[11px]">
                    Matrícula: {request.responsavelMatricula || 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ETAPA 2: Validação Moove (Primeira Linha de Atendimento) */}
        <div
          className={`border rounded-2xl p-4 sm:p-5 shadow-2xs relative transition-all ${
            isRecusadoMoove
              ? 'bg-rose-50/40 border-rose-200'
              : isAtendidoMoove
              ? 'bg-emerald-50/40 border-emerald-200'
              : isMooveSentToCoi
              ? 'bg-amber-50/40 border-amber-200'
              : 'bg-amber-50/20 border-amber-300'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border ${
                isRecusadoMoove
                  ? 'bg-rose-100 text-rose-700 border-rose-200'
                  : isAtendidoMoove
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  : isMooveSentToCoi
                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                  : 'bg-amber-500 text-white border-amber-600 animate-pulse'
              }`}
            >
              {isRecusadoMoove ? (
                <XCircle className="w-5 h-5" />
              ) : isAtendidoMoove ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : isMooveSentToCoi ? (
                <ArrowRight className="w-5 h-5" />
              ) : (
                <Clock className="w-5 h-5" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                      isRecusadoMoove
                        ? 'bg-rose-100 text-rose-900 border-rose-300'
                        : isAtendidoTaxi
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : isAtendidoMoove
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : isMooveSentToCoi
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-amber-200 text-amber-950 border-amber-400'
                    }`}
                  >
                    {isRecusadoMoove
                      ? 'Etapa 2 • Recusado pela Moove'
                      : isAtendidoTaxi
                      ? 'Etapa 2 • Atendido pela Moove (Táxi Confirmado)'
                      : isAtendidoMoove
                      ? 'Etapa 2 • Atendido pela Moove (Van Confirmada)'
                      : isMooveSentToCoi
                      ? 'Etapa 2 • Recusado pela Moove e Enviado ao COI'
                      : 'Etapa 2 • Em Validação na Moove (1ª Etapa Obrigatória)'}
                  </span>
                  <h5 className="text-sm font-bold text-slate-900 mt-1">
                    {isRecusadoMoove
                      ? 'Solicitação Recusada pela Moove'
                      : isAtendidoTaxi
                      ? 'Táxi Acionado pela Equipe Moove'
                      : isAtendidoMoove
                      ? 'Van Alocada pela Equipe Moove'
                      : isMooveSentToCoi
                      ? 'Repasse Operacional para Validação do COI'
                      : 'Aguardando Verificação de Disponibilidade de Frota'}
                  </h5>
                </div>
                {request.mooveDataAvaliacao && (
                  <span className="text-[11px] text-slate-500">
                    {new Date(request.mooveDataAvaliacao).toLocaleString('pt-BR')}
                  </span>
                )}
              </div>

              {/* Caso 2A: Moove Atendeu com Van ou Táxi */}
              {isAtendidoMoove && (
                <div
                  className={`mt-3 p-4 bg-white rounded-xl border shadow-2xs space-y-3 ${
                    isAtendidoTaxi ? 'border-amber-200' : 'border-emerald-200'
                  }`}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div
                      className={`p-2.5 rounded-lg border ${
                        isAtendidoTaxi
                          ? 'bg-amber-50/50 border-amber-100'
                          : 'bg-emerald-50/50 border-emerald-100'
                      }`}
                    >
                      <span className="text-slate-500 font-medium block text-[11px]">
                        {isAtendidoTaxi ? '🚕 Dados do Táxi' : '🚐 Dados da Van'}
                      </span>
                      {isAtendidoTaxi ? (
                        request.mooveDadosTaxi ? (
                          <strong className="text-amber-950 font-black text-sm block mt-0.5">
                            {request.mooveDadosTaxi}
                          </strong>
                        ) : (
                          <span className="text-xs font-normal italic text-slate-400 block mt-0.5">
                            Não preenchido
                          </span>
                        )
                      ) : request.mooveDadosVan ? (
                        <strong className="text-emerald-950 font-black text-sm block mt-0.5">
                          {request.mooveDadosVan}
                        </strong>
                      ) : (
                        <span className="text-xs font-normal italic text-slate-400 block mt-0.5">
                          Não preenchido
                        </span>
                      )}
                    </div>
                    <div
                      className={`p-2.5 rounded-lg border ${
                        isAtendidoTaxi
                          ? 'bg-amber-50/50 border-amber-100'
                          : 'bg-emerald-50/50 border-emerald-100'
                      }`}
                    >
                      <span className="text-slate-500 font-medium block text-[11px]">👤 Nome do Motorista</span>
                      {request.mooveNomeMotorista ? (
                        <strong
                          className={`font-black text-sm block mt-0.5 ${
                            isAtendidoTaxi ? 'text-amber-950' : 'text-emerald-950'
                          }`}
                        >
                          {request.mooveNomeMotorista}
                        </strong>
                      ) : (
                        <span className="text-xs font-normal italic text-slate-400 block mt-0.5">
                          Não preenchido
                        </span>
                      )}
                    </div>
                    <div
                      className={`p-2.5 rounded-lg border ${
                        isAtendidoTaxi
                          ? 'bg-amber-50/50 border-amber-100'
                          : 'bg-emerald-50/50 border-emerald-100'
                      }`}
                    >
                      <span className="text-slate-500 font-medium block text-[11px]">⏰ Horário de Chegada</span>
                      <strong
                        className={`font-black text-sm block mt-0.5 ${
                          isAtendidoTaxi ? 'text-amber-950' : 'text-emerald-950'
                        }`}
                      >
                        {request.mooveHorarioChegada || request.horarioTermino}
                      </strong>
                    </div>
                  </div>

                  {request.mooveObservacoes && (
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700">
                      <span className="font-bold text-slate-600 block text-[11px]">
                        Observações da Moove / Ponto de Encontro:
                      </span>
                      <p className="mt-0.5 font-medium">{mooveObservacoesTexto(request)}</p>
                    </div>
                  )}

                  {request.mooveAtendidoPor && (
                    <span className="text-[11px] text-slate-400 block text-right">
                      Atendido por: <strong>{request.mooveAtendidoPor}</strong>
                    </span>
                  )}
                </div>
              )}

              {/* Caso 2D: Moove Recusou definitivamente (sem repasse ao COI) */}
              {isRecusadoMoove && (
                <div className="mt-3 p-3.5 bg-white rounded-xl border border-rose-200 shadow-2xs space-y-2 text-xs">
                  <div className="flex items-start gap-2 text-rose-900">
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold block">Justificativa da Recusa na Moove:</strong>
                      <p className="text-slate-700 mt-1 leading-relaxed font-medium bg-rose-50/70 p-2.5 rounded-lg border border-rose-200">
                        {request.motivoRecusa || request.observacoesGestor || 'Não informada.'}
                      </p>
                    </div>
                  </div>
                  {(request.aprovadoPor || request.mooveAtendidoPor) && (
                    <span className="text-[11px] text-slate-400 block text-right">
                      Avaliador Moove: <strong>{request.aprovadoPor || request.mooveAtendidoPor}</strong>
                    </span>
                  )}
                </div>
              )}

              {/* Caso 2B: Moove Recusou e Enviou para o COI */}
              {isMooveSentToCoi && (
                <div className="mt-3 p-3.5 bg-white rounded-xl border border-amber-200 shadow-2xs space-y-2 text-xs">
                  <div className="flex items-start gap-2 text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold block">
                        Motivo do Repasse para o COI informado pela Moove:
                      </strong>
                      <p className="text-slate-700 mt-1 leading-relaxed font-medium bg-amber-50/70 p-2.5 rounded-lg border border-amber-200">
                        {request.mooveMotivoRecusaCOI || request.mooveObservacoes || 'Sem disponibilidade de van ou táxi na base no horário solicitado.'}
                      </p>
                    </div>
                  </div>
                  {request.mooveAtendidoPor && (
                    <span className="text-[11px] text-slate-400 block text-right">
                      Operador Moove: <strong>{request.mooveAtendidoPor}</strong>
                    </span>
                  )}
                </div>
              )}

              {/* Caso 2C: Ainda aguardando na Moove */}
              {isPendenteMoove && (
                <div className="mt-3 p-3 bg-white/80 rounded-xl border border-amber-200 text-xs text-amber-950 flex items-center gap-2">
                  <Info className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    A equipe operacional da <strong>Moove</strong> está avaliando a escala e a alocação de Van ou Táxi para este atendimento.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ETAPA 3: Validação COI (Segunda Linha / Liberação de Uber) */}
        <div
          className={`border rounded-2xl p-4 sm:p-5 shadow-2xs relative transition-all ${
            isAprovadoCoi
              ? 'bg-blue-50/40 border-blue-200'
              : isRecusadoCoi
              ? 'bg-rose-50/40 border-rose-200'
              : isPendenteCoi
              ? 'bg-purple-50/30 border-purple-300'
              : 'bg-slate-50/50 border-slate-200 opacity-80'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border ${
                isAprovadoCoi
                  ? 'bg-blue-100 text-blue-700 border-blue-200'
                  : isRecusadoCoi
                  ? 'bg-rose-100 text-rose-700 border-rose-200'
                  : isPendenteCoi
                  ? 'bg-purple-100 text-purple-700 border-purple-300 animate-pulse'
                  : 'bg-slate-100 text-slate-400 border-slate-200'
              }`}
            >
              {isAprovadoCoi ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : isRecusadoCoi ? (
                <XCircle className="w-5 h-5" />
              ) : isPendenteCoi ? (
                <Clock className="w-5 h-5" />
              ) : (
                <Car className="w-5 h-5" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                      isAprovadoCoi
                        ? 'bg-blue-100 text-blue-900 border-blue-300'
                        : isRecusadoCoi
                        ? 'bg-rose-100 text-rose-900 border-rose-300'
                        : isPendenteCoi
                        ? 'bg-purple-100 text-purple-900 border-purple-300'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    {isAprovadoCoi
                      ? 'Etapa 3 • Atendido pelo COI (Uber Liberado)'
                      : isRecusadoCoi
                      ? 'Etapa 3 • Recusado pelo COI'
                      : isPendenteCoi
                      ? 'Etapa 3 • Em Validação no COI'
                      : isRecusadoMoove
                      ? 'Etapa 3 • Dispensada (Recusado pela Moove)'
                      : isAtendidoMoove
                      ? `Etapa 3 • Dispensada (Atendido com ${isAtendidoTaxi ? 'Táxi' : 'Van'} pela Moove)`
                      : 'Etapa 3 • Aguardando Etapa Moove'}
                  </span>
                  <h5 className="text-sm font-bold text-slate-900 mt-1">
                    {isAprovadoCoi
                      ? 'Voucher / Transporte Autorizado pelo COI'
                      : isRecusadoCoi
                      ? 'Solicitação Recusada pelo COI'
                      : isPendenteCoi
                      ? 'Plantão COI Analisando Liberação de Transporte'
                      : isRecusadoMoove
                      ? 'Sem Repasse ao COI (Recusado pela Moove)'
                      : isAtendidoMoove
                      ? (isAtendidoTaxi ? 'Transporte Concluído via Táxi Moove' : 'Transporte Concluído via Frota de Vans Moove')
                      : 'Aguardando Avaliação Inicial da Moove'}
                  </h5>
                </div>

                {request.coiDataAvaliacao && (
                  <span className="text-[11px] text-slate-500">
                    {new Date(request.coiDataAvaliacao).toLocaleString('pt-BR')}
                  </span>
                )}
              </div>

              {/* Caso 3A: COI Aprovou (Uber emitido) */}
              {isAprovadoCoi && (
                <div className="mt-3 p-4 bg-white rounded-xl border border-blue-200 shadow-2xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-blue-50/70 rounded-xl border border-blue-100">
                    <div>
                      <span className="text-[11px] text-slate-500 block font-medium">
                        Número de Controle Interno / Voucher Uber:
                      </span>
                      <strong className="font-mono text-base text-blue-900 font-black block mt-0.5">
                        {request.voucherUber || request.coiVoucherUber || 'WFS-TRP-AUTORIZADO'}
                      </strong>
                    </div>

                    <div className="flex items-center gap-2">
                      {onCopyVoucher && (request.voucherUber || request.coiVoucherUber) && (
                        <button
                          type="button"
                          onClick={() =>
                            onCopyVoucher(request.voucherUber || request.coiVoucherUber || '')
                          }
                          className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold rounded-lg text-xs flex items-center gap-1 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copiar
                        </button>
                      )}

                      {showUberLink && (
                        <a
                          href={getUberLink()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-black hover:bg-zinc-800 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Abrir App Uber
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Orientação em destaque (fundo escuro de alto contraste) */}
                  <div className="p-3.5 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 text-xs shadow-xs">
                    <div className="flex items-start gap-2.5">
                      <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-0.5">
                          Orientações de Embarque
                        </span>
                        <p className="text-slate-200 leading-relaxed font-normal">
                          Seu pedido será atendido via <strong>Uber</strong>. Fique atento ao número de WhatsApp informado no momento da solicitação. Em caso de dúvidas, entre em contato com a pessoa responsável que realizou o pedido.
                        </p>
                      </div>
                    </div>
                  </div>

                  {(request.observacoesGestor || request.coiObservacoes) && (
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700">
                      <span className="font-bold text-slate-600 block text-[11px]">
                        Observações do COI:
                      </span>
                      <p className="mt-0.5 font-medium">
                        {request.observacoesGestor || request.coiObservacoes}
                      </p>
                    </div>
                  )}

                  {(request.aprovadoPor || request.coiAtendidoPor) && (
                    <span className="text-[11px] text-slate-400 block text-right">
                      Autorizado por: <strong>{request.aprovadoPor || request.coiAtendidoPor}</strong>
                    </span>
                  )}
                </div>
              )}

              {/* Caso 3B: COI Recusou */}
              {isRecusadoCoi && (
                <div className="mt-3 p-3.5 bg-white rounded-xl border border-rose-200 shadow-2xs space-y-2 text-xs">
                  <div className="flex items-start gap-2 text-rose-900">
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold block">Justificativa da Recusa no COI:</strong>
                      <p className="text-slate-700 mt-1 leading-relaxed font-medium bg-rose-50/70 p-2.5 rounded-lg border border-rose-200">
                        {request.motivoRecusa || request.coiMotivoRecusa || request.observacoesGestor || 'Transporte público disponível no horário solicitado.'}
                      </p>
                    </div>
                  </div>
                  {(request.aprovadoPor || request.coiAtendidoPor) && (
                    <span className="text-[11px] text-slate-400 block text-right">
                      Avaliador COI: <strong>{request.aprovadoPor || request.coiAtendidoPor}</strong>
                    </span>
                  )}
                </div>
              )}

              {/* Caso 3C: Pendente no COI */}
              {isPendenteCoi && (
                <div className="mt-3 p-3 bg-white rounded-xl border border-purple-200 text-xs text-purple-950 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>
                    A solicitação foi recusada na Moove e repassada ao plantão do <strong>COI</strong> para análise de autorização de transporte e emissão de voucher Uber.
                  </span>
                </div>
              )}

              {/* Caso 3D: Dispensada ou Aguardando */}
              {!isAprovadoCoi && !isRecusadoCoi && !isPendenteCoi && (
                <div className="mt-2 text-xs text-slate-400 italic">
                  {isAtendidoMoove
                    ? `Esta solicitação foi suprida por ${isAtendidoTaxi ? 'Táxi' : 'Van'} da Moove, dispensando a necessidade de acionamento do COI / Uber.`
                    : isRecusadoMoove
                    ? 'Esta solicitação foi recusada pela Moove e não foi repassada ao COI.'
                    : 'A solicitação precisa ser avaliada primeiro pela Moove antes de qualquer repasse ao COI.'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Histórico Completo de Auditoria se disponível */}
      {request.historico && request.historico.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5">
          <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-slate-500" />
            Histórico Detalhado de Movimentações
          </h5>
          <div className="divide-y divide-slate-200/80 text-xs">
            {request.historico.map((h, i) => (
              <div key={i} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">{h.etapa}</span>
                    <span className="text-[10px] px-2 py-0.2 rounded-full font-bold bg-slate-200 text-slate-700">
                      {h.status}
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px] leading-relaxed">{h.descricao}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[11px] text-slate-500 block">
                    {new Date(h.data).toLocaleDateString('pt-BR')}{' '}
                    {new Date(h.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-[10px] text-slate-400 block">{h.usuario}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

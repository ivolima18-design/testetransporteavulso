import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Copy,
  Check,
  Car,
  Calendar,
  RefreshCw,
  User,
  ArrowRight,
  List,
  LayoutGrid,
  Eye,
  X,
  Printer
} from 'lucide-react';
import { printUberRequests } from '../utils/printOrder';
import { UberRequest, RequestStatus, isAtendidoMoove, isMooveTaxi, mooveObservacoesTexto } from '../types';
import { fetchRequestsSummary } from '../services/api';
import { WorkflowTimeline } from './WorkflowTimeline';

interface RequestTrackerProps {
  initialQuery?: string;
  onNewRequestClick: () => void;
}

export const RequestTracker: React.FC<RequestTrackerProps> = ({
  initialQuery = '',
  onNewRequestClick,
}) => {
  const [allRequests, setAllRequests] = useState<UberRequest[]>([]);
  const [requests, setRequests] = useState<UberRequest[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedDate, setSelectedDate] = useState('');
  const [viewMode, setViewMode] = useState<'linha' | 'card'>('linha');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<UberRequest | null>(null);
  const [copiedDetailProtocol, setCopiedDetailProtocol] = useState(false);

  const loadRequests = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      // Carregar todas para contadores e filtros
      const data = await fetchRequestsSummary();
      setAllRequests(data);
    } catch (err) {
      console.error('Erro ao buscar solicitações:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
    // Auto refresh a cada 10 segundos
    const interval = setInterval(() => {
      loadRequests(true);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (initialQuery) {
      setSearchQuery(initialQuery);
    }
  }, [initialQuery]);

  // Filtragem e ordenação
  useEffect(() => {
    let filtered = [...allRequests];

    if (filterStatus !== 'Todos') {
      if (filterStatus === 'Aguardando Moove') {
        filtered = filtered.filter((r) => !isAtendidoMoove(r) && (r.status === 'Pendente Moove' || r.status === 'Pendente'));
      } else if (filterStatus === 'Atendido Moove') {
        filtered = filtered.filter((r) => isAtendidoMoove(r));
      } else if (filterStatus === 'Aguardando COI') {
        filtered = filtered.filter((r) => !isAtendidoMoove(r) && r.status === 'Pendente COI');
      } else if (filterStatus === 'Atendido COI') {
        filtered = filtered.filter((r) => !isAtendidoMoove(r) && (r.status === 'Aprovado COI' || r.status === 'Aprovado'));
      } else if (filterStatus === 'Recusado') {
        filtered = filtered.filter((r) => !isAtendidoMoove(r) && (r.status === 'Recusado COI' || r.status === 'Recusado'));
      } else {
        filtered = filtered.filter((r) => r.status.toLowerCase() === filterStatus.toLowerCase());
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((r) => {
        return (
          r.nome.toLowerCase().includes(q) ||
          r.sobrenome.toLowerCase().includes(q) ||
          r.protocolo.toLowerCase().includes(q) ||
          (r.voucherUber && r.voucherUber.toLowerCase().includes(q)) ||
          (r.mooveDadosVan && r.mooveDadosVan.toLowerCase().includes(q)) ||
          (r.mooveDadosTaxi && r.mooveDadosTaxi.toLowerCase().includes(q)) ||
          (r.mooveNomeMotorista && r.mooveNomeMotorista.toLowerCase().includes(q)) ||
          (r.responsavelNome && r.responsavelNome.toLowerCase().includes(q))
        );
      });
    }

    if (selectedDate) {
      filtered = filtered.filter((r) => r.dataEvento === selectedDate);
    }

    // Ordenação: mais recentes primeiro
    const sorted = filtered.sort((a, b) => {
      const timeA = a.dataCriacao ? new Date(a.dataCriacao).getTime() : 0;
      const timeB = b.dataCriacao ? new Date(b.dataCriacao).getTime() : 0;
      if (timeB !== timeA) return timeB - timeA;
      return (b.protocolo || '').localeCompare(a.protocolo || '');
    });

    setRequests(sorted);
  }, [allRequests, filterStatus, searchQuery, selectedDate]);

  // Contadores para as pílulas
  const pendingMooveCount = allRequests.filter(
    (r) => r.status === 'Pendente Moove' || r.status === 'Pendente'
  ).length;
  const attendedMooveCount = allRequests.filter(
    (r) => isAtendidoMoove(r)
  ).length;
  const pendingCoiCount = allRequests.filter((r) => r.status === 'Pendente COI').length;
  const approvedCoiCount = allRequests.filter(
    (r) => r.status === 'Aprovado COI' || r.status === 'Aprovado'
  ).length;
  const rejectedCount = allRequests.filter(
    (r) => r.status === 'Recusado COI' || r.status === 'Recusado'
  ).length;

  // Badge animado com distinção por etapa
  const renderStatusBadge = (status: RequestStatus, item?: UberRequest) => {
    switch (status) {
      case 'Pendente Moove':
      case 'Pendente':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-900 border border-amber-300 shadow-2xs whitespace-nowrap">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-80"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
            Aguardando Moove
          </span>
        );
      case 'Atendido Moove':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-2xs whitespace-nowrap">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            {item ? (isMooveTaxi(item) ? 'Atendido Moove Taxi' : 'Atendido Moove Van') : 'Atendido Moove'}
          </span>
        );
      case 'Pendente COI':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-purple-50 text-purple-900 border border-purple-300 shadow-2xs whitespace-nowrap">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-80"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500"></span>
            </span>
            Aguardando COI
          </span>
        );
      case 'Aprovado COI':
      case 'Aprovado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-900 border border-blue-300 shadow-2xs whitespace-nowrap">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
            🚗 Atendido (Uber COI)
          </span>
        );
      case 'Recusado COI':
      case 'Recusado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 whitespace-nowrap">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500"></span>
            Recusado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300 whitespace-nowrap">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Search Bar & Banner Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-6 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 mb-2">
              <Search className="w-3.5 h-3.5 text-[#E31837]" />
              Acompanhamento de Solicitações
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Acompanhar Transporte Avulso
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Consulte pelo número de protocolo ou nome do colaborador.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => loadRequests()}
              className="p-2.5 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              title="Atualizar lista"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#E31837]' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onNewRequestClick}
              className="px-4 py-2.5 bg-[#E31837] hover:bg-[#c4122d] text-white font-bold text-xs rounded-xl transition-all shadow-xs inline-flex items-center gap-1.5"
            >
              <Car className="w-4 h-4" />
              Nova Solicitação
            </button>
          </div>
        </div>
      </div>

      {/* Filter & View Controls Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Status Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: 'Todos', label: 'Todos', count: allRequests.length },
            { key: 'Aguardando Moove', label: '1ª Etapa (Moove)', count: pendingMooveCount },
            { key: 'Atendido Moove', label: 'Atendido Moove', count: attendedMooveCount },
            { key: 'Aguardando COI', label: '2ª Etapa (COI)', count: pendingCoiCount },
            { key: 'Atendido COI', label: '🚗 Uber (COI)', count: approvedCoiCount },
            { key: 'Recusado', label: 'Recusados', count: rejectedCount },
          ].map((st) => (
            <button
              key={st.key}
              type="button"
              onClick={() => setFilterStatus(st.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                filterStatus === st.key
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{st.label}</span>
              {st.count > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    filterStatus === st.key
                      ? 'bg-white/20 text-white'
                      : st.key.includes('Moove') && st.key.includes('Aguardando')
                      ? 'bg-amber-500 text-white'
                      : st.key.includes('Van')
                      ? 'bg-emerald-600 text-white'
                      : st.key.includes('COI') && st.key.includes('Aguardando')
                      ? 'bg-purple-600 text-white'
                      : st.key.includes('Uber')
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-300 text-slate-800'
                  }`}
                >
                  {st.count}
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
              placeholder="Buscar colaborador, protocolo..."
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

      {/* Requests Management Table / List */}
      <div className="space-y-4">
        {requests.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-3">
              <Car className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">
              Nenhuma solicitação encontrada
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto mb-5">
              Não encontramos nenhum pedido associado aos filtros aplicados.
            </p>
            <button
              type="button"
              onClick={onNewRequestClick}
              className="px-5 py-2.5 bg-[#E31837] text-white text-xs font-bold rounded-xl shadow-xs hover:bg-[#c4122d] transition-all inline-flex items-center gap-1.5"
            >
              Nova Solicitação
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : viewMode === 'linha' ? (
          /* VISÃO DE LINHA (TABELA OPERACIONAL CONFORME MODELO) */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4 whitespace-nowrap">Status</th>
                    <th className="py-3 px-4 whitespace-nowrap">Nº de Controle</th>
                    <th className="py-3 px-4 whitespace-nowrap">Data Evento</th>
                    <th className="py-3 px-4 whitespace-nowrap">Solicitação</th>
                    <th className="py-3 px-4 whitespace-nowrap">Horário</th>
                    <th className="py-3 px-4 whitespace-nowrap">Colaborador</th>
                    {filterStatus === 'Atendido Moove' ? (
                      <>
                        <th className="py-3 px-4 whitespace-nowrap bg-emerald-50 text-emerald-900 border-x border-emerald-100">
                          {requests.length > 0 && requests.every((r) => isMooveTaxi(r))
                            ? '🚕 Dados do Táxi'
                            : requests.length > 0 && requests.every((r) => !isMooveTaxi(r))
                            ? '🚐 Dados da Van'
                            : '🚐🚕 Dados da Van / Táxi'}
                        </th>
                        <th className="py-3 px-4 whitespace-nowrap bg-emerald-50 text-emerald-900 border-r border-emerald-100">
                          👤 Motorista Escalado
                        </th>
                      </>
                    ) : (
                      <th className="py-3 px-4 whitespace-nowrap">Solicitante</th>
                    )}
                    <th className="py-3 px-4 text-right whitespace-nowrap">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {requests.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedOrderDetail(item)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer group"
                    >
                      {/* Status com luz piscante */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {renderStatusBadge(item.status, item)}
                      </td>

                      {/* Nº de Controle (Protocolo) */}
                      <td className="py-3 px-4 whitespace-nowrap font-mono font-bold text-slate-900 group-hover:text-[#E31837] transition-colors">
                        {item.protocolo}
                      </td>

                      {/* Data do Evento */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-800 font-medium">
                        {new Date(item.dataEvento + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </td>

                      {/* Solicitação: Entrada ou Saída */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-md font-bold text-[11px] ${
                            item.horarioInicio === 'Entrada'
                              ? 'bg-blue-50 text-blue-800 border border-blue-200'
                              : 'bg-purple-50 text-purple-800 border border-purple-200'
                          }`}
                        >
                          {item.horarioInicio === 'Entrada' || item.horarioInicio === 'Saída'
                            ? item.horarioInicio
                            : item.horarioInicio || 'Saída'}
                        </span>
                      </td>

                      {/* Horário do Transporte */}
                      <td className="py-3 px-4 whitespace-nowrap font-bold text-slate-900">
                        {item.horarioTermino}
                      </td>

                      {/* Colaborador */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-bold text-slate-900 block">
                          {item.nome} {item.sobrenome}
                        </span>
                        {filterStatus !== 'Atendido Moove' && isAtendidoMoove(item) && (
                          <div className={`mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold ${
                            isMooveTaxi(item)
                              ? 'text-amber-800'
                              : 'text-emerald-700'
                          }`}>
                            {isMooveTaxi(item) ? (
                              <span>🚕 {item.mooveDadosTaxi || <span className="text-slate-400 font-normal italic">Não preenchido</span>}</span>
                            ) : (
                              <span>🚐 {item.mooveDadosVan || <span className="text-slate-400 font-normal italic">Não preenchido</span>}</span>
                            )}
                            <span>•</span>
                            <span>👤 {item.mooveNomeMotorista || <span className="text-slate-400 font-normal italic">Não preenchido</span>}</span>
                          </div>
                        )}
                      </td>

                      {/* Solicitante ou Dados da Van/Táxi + Motorista quando na guia Moove */}
                      {filterStatus === 'Atendido Moove' ? (
                        <>
                          <td className={`py-3 px-4 whitespace-nowrap border-x ${
                            isMooveTaxi(item)
                              ? 'bg-amber-50/40 border-amber-100/60'
                              : 'bg-emerald-50/40 border-emerald-100/60'
                          }`}>
                            <div className={`flex items-center gap-1.5 font-bold ${
                              isMooveTaxi(item)
                                ? 'text-amber-950'
                                : 'text-emerald-950'
                            }`}>
                              <span className={`px-1.5 py-0.5 rounded font-semibold text-[10px] ${
                                isMooveTaxi(item)
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {isMooveTaxi(item) ? '🚕' : '🚐'}
                              </span>
                              {isMooveTaxi(item) ? (
                                item.mooveDadosTaxi ? (
                                  <span className="text-xs font-black">{item.mooveDadosTaxi}</span>
                                ) : (
                                  <span className="text-[11px] font-normal italic text-slate-400">Não preenchido</span>
                                )
                              ) : item.mooveDadosVan ? (
                                <span className="text-xs font-black">{item.mooveDadosVan}</span>
                              ) : (
                                <span className="text-[11px] font-normal italic text-slate-400">Não preenchido</span>
                              )}
                            </div>
                            {item.mooveHorarioChegada && (
                              <span className={`text-[10px] block mt-0.5 font-medium ${
                                isMooveTaxi(item)
                                  ? 'text-amber-800'
                                  : 'text-emerald-700'
                              }`}>
                                Chegada: {item.mooveHorarioChegada}
                              </span>
                            )}
                          </td>
                          <td className={`py-3 px-4 whitespace-nowrap border-r ${
                            isMooveTaxi(item)
                              ? 'bg-amber-50/40 border-amber-100/60'
                              : 'bg-emerald-50/40 border-emerald-100/60'
                          }`}>
                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-semibold text-[10px]">👤</span>
                              {item.mooveNomeMotorista ? (
                                <span className="text-xs font-bold">{item.mooveNomeMotorista}</span>
                              ) : (
                                <span className="text-[11px] font-normal italic text-slate-400">Não preenchido</span>
                              )}
                            </div>
                          </td>
                        </>
                      ) : (
                        <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-medium">
                          {item.responsavelNome || 'N/A'}
                        </td>
                      )}

                      {/* Ações */}
                      <td
                        className="py-3 px-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedOrderDetail(item)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs transition-colors flex items-center gap-1 shadow-2xs"
                            title="Abrir detalhes completos do pedido"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-600" />
                            <span>Abrir Pedido</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => printUberRequests(item)}
                            className="p-1.5 bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-950 border border-slate-200 rounded-lg text-xs transition-colors flex items-center justify-center shadow-2xs cursor-pointer"
                            title="Imprimir Ficha do Pedido"
                          >
                            <Printer className="w-3.5 h-3.5 text-slate-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* VISÃO EM CARTÕES */
          requests.map((req) => {
            const isApproved = req.status === 'Aprovado';
            const isPending = req.status === 'Pendente';
            const isRejected = req.status === 'Recusado';

            return (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-white rounded-2xl border transition-all overflow-hidden ${
                  isApproved
                    ? 'border-emerald-200 shadow-xs'
                    : isRejected
                    ? 'border-rose-200 bg-rose-50/10'
                    : 'border-amber-200 shadow-2xs'
                }`}
              >
                {/* Card Status Banner */}
                <div
                  className={`px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b ${
                    isApproved
                      ? 'bg-emerald-50/80 border-emerald-100 text-emerald-900'
                      : isRejected
                      ? 'bg-rose-50/80 border-rose-100 text-rose-900'
                      : 'bg-amber-50/80 border-amber-100 text-amber-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {renderStatusBadge(req.status, req)}
                    <span className="font-mono text-xs font-bold text-slate-700 bg-white/80 px-2 py-0.5 rounded border border-slate-200">
                      {req.protocolo}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedOrderDetail(req)}
                      className="px-3 py-1.5 text-xs font-bold bg-white hover:bg-slate-50 text-slate-800 rounded-lg border border-slate-200 shadow-2xs transition-colors flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-600" />
                      Abrir Pedido
                    </button>
                    <button
                      type="button"
                      onClick={() => printUberRequests(req)}
                      className="px-2.5 py-1.5 text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 rounded-lg border border-slate-200 shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                      title="Imprimir Ficha do Pedido"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-600" />
                      Imprimir
                    </button>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-6">
                  {/* Main Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    {/* Colaborador */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-slate-400 font-medium block">Colaborador</span>
                      <strong className="text-slate-900 text-sm font-bold block mt-0.5">
                        {req.nome} {req.sobrenome}
                      </strong>
                    </div>

                    {/* Data do Evento */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-slate-400 font-medium block">Data do Evento</span>
                      <strong className="text-slate-900 text-sm font-bold block mt-0.5 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(req.dataEvento + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </strong>
                    </div>

                    {/* Solicitação & Horário */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-slate-400 font-medium block">Solicitação &amp; Horário</span>
                      <strong className="text-slate-900 text-sm font-bold block mt-0.5">
                        {req.horarioInicio || 'Saída'} • {req.horarioTermino}
                      </strong>
                    </div>

                    {/* Solicitante */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-slate-400 font-medium block">Solicitante</span>
                      <strong className="text-slate-900 text-sm font-bold block mt-0.5">
                        {req.responsavelNome || 'N/A'}
                      </strong>
                    </div>
                  </div>

                  {/* Quando atendido pela Moove (Van ou Táxi), exibe os dados em destaque */}
                  {isAtendidoMoove(req) && (
                    <div
                      className={`mt-3.5 p-3.5 border rounded-xl space-y-2.5 ${
                        isMooveTaxi(req)
                          ? 'bg-amber-50/90 border-amber-200'
                          : 'bg-emerald-50/90 border-emerald-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-bold flex items-center gap-1.5 ${
                            isMooveTaxi(req)
                              ? 'text-amber-950'
                              : 'text-emerald-950'
                          }`}
                        >
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              isMooveTaxi(req)
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {isMooveTaxi(req) ? '🚕' : '🚐'}
                          </span>
                          {isMooveTaxi(req)
                            ? 'Atendimento Moove (Táxi Confirmado)'
                            : 'Atendimento Moove (Van Confirmada)'}
                        </span>
                        <span
                          className={`text-[11px] font-bold bg-white px-2 py-0.5 rounded-md border shadow-2xs ${
                            isMooveTaxi(req)
                              ? 'text-amber-800 border-amber-200'
                              : 'text-emerald-800 border-emerald-200'
                          }`}
                        >
                          Previsão: {req.mooveHorarioChegada || req.horarioTermino}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div
                          className={`bg-white p-2.5 rounded-lg border shadow-2xs ${
                            isMooveTaxi(req)
                              ? 'border-amber-100'
                              : 'border-emerald-100'
                          }`}
                        >
                          <span className="text-slate-500 font-medium block text-[11px]">
                            {isMooveTaxi(req)
                              ? '🚕 Dados do Táxi:'
                              : '🚐 Dados da Van:'}
                          </span>
                          {isMooveTaxi(req) ? (
                            req.mooveDadosTaxi ? (
                              <strong className="text-amber-950 font-black text-xs block mt-0.5">
                                {req.mooveDadosTaxi}
                              </strong>
                            ) : (
                              <span className="text-[11px] font-normal italic text-slate-400 block mt-0.5">
                                Não preenchido
                              </span>
                            )
                          ) : req.mooveDadosVan ? (
                            <strong className="text-emerald-950 font-black text-xs block mt-0.5">
                              {req.mooveDadosVan}
                            </strong>
                          ) : (
                            <span className="text-[11px] font-normal italic text-slate-400 block mt-0.5">
                              Não preenchido
                            </span>
                          )}
                        </div>
                        <div
                          className={`bg-white p-2.5 rounded-lg border shadow-2xs ${
                            isMooveTaxi(req)
                              ? 'border-amber-100'
                              : 'border-emerald-100'
                          }`}
                        >
                          <span className="text-slate-500 font-medium block text-[11px]">👤 Motorista Escalado:</span>
                          {req.mooveNomeMotorista ? (
                            <strong
                              className={`font-black text-xs block mt-0.5 ${
                                isMooveTaxi(req)
                                  ? 'text-amber-950'
                                  : 'text-emerald-950'
                              }`}
                            >
                              {req.mooveNomeMotorista}
                            </strong>
                          ) : (
                            <span className="text-[11px] font-normal italic text-slate-400 block mt-0.5">
                              Não preenchido
                            </span>
                          )}
                        </div>
                      </div>
                      {req.mooveObservacoes && (
                        <p
                          className={`text-[11px] text-slate-700 bg-white/70 p-2 rounded-lg border ${
                            isMooveTaxi(req)
                              ? 'border-amber-100/60'
                              : 'border-emerald-100/60'
                          }`}
                        >
                          <strong className="text-slate-600">Ponto de Encontro / Instruções: </strong>
                          {mooveObservacoesTexto(req)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Modal de Detalhes Completos do Pedido ("Abrir Pedido") */}
      <AnimatePresence>
        {selectedOrderDetail && (
          <div
            id="tracker-order-detail-backdrop"
            onClick={() => setSelectedOrderDetail(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
          >
            <motion.div
              id="tracker-order-detail-card"
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
                </div>

                {/* 2. Colaborador e Solicitante */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-[#E31837]" />
                    2. Colaborador e Solicitante
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <span className="text-slate-400 block font-medium">Colaborador</span>
                      <strong className="text-slate-900 text-sm block mt-0.5">
                        {selectedOrderDetail.nome} {selectedOrderDetail.sobrenome}
                      </strong>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <span className="text-slate-400 block font-medium">Solicitante</span>
                      <strong className="text-slate-900 text-sm block mt-0.5">
                        {selectedOrderDetail.responsavelNome || 'N/A'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Destaque Atendimento Moove: Van ou Táxi e Motorista */}
                {isAtendidoMoove(selectedOrderDetail) && (
                  <div
                    className={`border rounded-2xl p-4 sm:p-5 ${
                      isMooveTaxi(selectedOrderDetail)
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-emerald-50 border-emerald-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4
                        className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                          isMooveTaxi(selectedOrderDetail)
                            ? 'text-amber-900'
                            : 'text-emerald-900'
                        }`}
                      >
                        <span
                          className={`p-1 rounded text-xs ${
                            isMooveTaxi(selectedOrderDetail)
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {isMooveTaxi(selectedOrderDetail) ? '🚕' : '🚐'}
                        </span>
                        {isMooveTaxi(selectedOrderDetail)
                          ? 'Dados do Atendimento Moove (Táxi & Motorista)'
                          : 'Dados do Atendimento Moove (Van & Motorista)'}
                      </h4>
                      <span
                        className={`px-2.5 py-0.5 text-white font-black text-[10px] rounded-full uppercase tracking-wider ${
                          isMooveTaxi(selectedOrderDetail)
                            ? 'bg-amber-600'
                            : 'bg-emerald-600'
                        }`}
                      >
                        Confirmado
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div
                        className={`bg-white p-3 rounded-xl border shadow-2xs ${
                          isMooveTaxi(selectedOrderDetail)
                            ? 'border-amber-200'
                            : 'border-emerald-200'
                        }`}
                      >
                        <span className="text-slate-500 block font-medium">
                          {isMooveTaxi(selectedOrderDetail)
                            ? '🚕 Identificação do Táxi'
                            : '🚐 Identificação da Van'}
                        </span>
                        {isMooveTaxi(selectedOrderDetail) ? (
                          selectedOrderDetail.mooveDadosTaxi ? (
                            <strong className="text-amber-950 text-sm block mt-0.5 font-black">
                              {selectedOrderDetail.mooveDadosTaxi}
                            </strong>
                          ) : (
                            <span className="text-xs font-normal italic text-slate-400 block mt-0.5">
                              Não preenchido
                            </span>
                          )
                        ) : selectedOrderDetail.mooveDadosVan ? (
                          <strong className="text-emerald-950 text-sm block mt-0.5 font-black">
                            {selectedOrderDetail.mooveDadosVan}
                          </strong>
                        ) : (
                          <span className="text-xs font-normal italic text-slate-400 block mt-0.5">
                            Não preenchido
                          </span>
                        )}
                      </div>
                      <div
                        className={`bg-white p-3 rounded-xl border shadow-2xs ${
                          isMooveTaxi(selectedOrderDetail)
                            ? 'border-amber-200'
                            : 'border-emerald-200'
                        }`}
                      >
                        <span className="text-slate-500 block font-medium">👤 Motorista Escalado</span>
                        {selectedOrderDetail.mooveNomeMotorista ? (
                          <strong
                            className={`text-sm block mt-0.5 font-black ${
                              isMooveTaxi(selectedOrderDetail)
                                ? 'text-amber-950'
                                : 'text-emerald-950'
                            }`}
                          >
                            {selectedOrderDetail.mooveNomeMotorista}
                          </strong>
                        ) : (
                          <span className="text-xs font-normal italic text-slate-400 block mt-0.5">
                            Não preenchido
                          </span>
                        )}
                      </div>
                      <div
                        className={`bg-white p-3 rounded-xl border shadow-2xs ${
                          isMooveTaxi(selectedOrderDetail)
                            ? 'border-amber-200'
                            : 'border-emerald-200'
                        }`}
                      >
                        <span className="text-slate-500 block font-medium">⏰ Previsão de Chegada</span>
                        <strong
                          className={`text-sm block mt-0.5 font-black ${
                            isMooveTaxi(selectedOrderDetail)
                              ? 'text-amber-950'
                              : 'text-emerald-950'
                          }`}
                        >
                          {selectedOrderDetail.mooveHorarioChegada || selectedOrderDetail.horarioTermino}
                        </strong>
                      </div>
                    </div>

                    {selectedOrderDetail.mooveObservacoes && (
                      <div
                        className={`mt-3 p-2.5 bg-white rounded-xl border text-xs text-slate-700 ${
                          isMooveTaxi(selectedOrderDetail)
                            ? 'border-amber-100'
                            : 'border-emerald-100'
                        }`}
                      >
                        <span className="font-bold text-slate-600 block text-[11px]">
                          Ponto de Encontro / Instruções da Moove:
                        </span>
                        <p className="mt-0.5 font-medium">{mooveObservacoesTexto(selectedOrderDetail)}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Esteira e Acompanhamento Passo a Passo (Moove & COI) — feedback da área que avaliou */}
                <div className="pt-2">
                  <WorkflowTimeline
                    request={selectedOrderDetail}
                    showUberLink={false}
                    onCopyVoucher={(code) => {
                      navigator.clipboard.writeText(code);
                      setCopiedDetailProtocol(true);
                      setTimeout(() => setCopiedDetailProtocol(false), 2000);
                    }}
                  />
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedOrderDetail(null)}
                    className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    onClick={() => printUberRequests(selectedOrderDetail)}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                    title="Imprimir Ficha Completa do Pedido"
                  >
                    <Printer className="w-4 h-4 text-slate-700" />
                    <span>Imprimir Pedido</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {selectedOrderDetail.voucherUber && (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedOrderDetail.voucherUber) {
                          navigator.clipboard.writeText(selectedOrderDetail.voucherUber);
                        }
                      }}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-2xs flex items-center gap-1.5"
                    >
                      <Copy className="w-4 h-4" />
                      Copiar Nº de Controle
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};


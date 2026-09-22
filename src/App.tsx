import React, { useState, useEffect } from 'react';
import {
  Car,
  Search,
  Shield,
  Settings,
  Clock,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  User,
  LogOut,
  Lock,
  KeyRound,
  UserCog,
  AlertTriangle
} from 'lucide-react';
import { UberRequestForm } from './components/UberRequestForm';
import { RequestTracker } from './components/RequestTracker';
import { ManagerDashboard } from './components/ManagerDashboard';
import { SettingsModal } from './components/SettingsModal';
import { AuthModal } from './components/AuthModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import {
  UberRequest,
  AuthSession,
  UserAccount,
  isMasterAccount,
  canManageUsers,
  canOpenSettingsPanel,
  isRepassadoAoCoi,
  isAtendidoMoove,
  SystemWorkflowConfig,
  DEFAULT_WORKFLOW_CONFIG,
} from './types';
import {
  fetchRequests,
  getCurrentSession,
  logoutUser,
  saveCurrentSession,
  getLocalWorkflowConfig,
  fetchWorkflowConfig,
} from './services/api';

type ActiveTab = 'solicitar' | 'acompanhar' | 'coi' | 'moove';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('solicitar');
  const [trackedProtocol, setTrackedProtocol] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [moovePendingCount, setMoovePendingCount] = useState<number>(0);
  const [coiPendingCount, setCoiPendingCount] = useState<number>(0);

  // Dynamic Workflow Config State
  const [workflowConfig, setWorkflowConfig] = useState<SystemWorkflowConfig>(getLocalWorkflowConfig());

  // Authentication State
  const [session, setSession] = useState<AuthSession | null>(() => getCurrentSession());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authTarget, setAuthTarget] = useState<'coi' | 'moove' | 'configuracoes'>('coi');
  const [settingsInitialTab, setSettingsInitialTab] = useState<'sheets' | 'usuarios' | 'cloudflare'>('sheets');
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  // Forçar troca de senha caso deveTrocarSenha seja verdadeiro
  useEffect(() => {
    if (session?.user?.deveTrocarSenha) {
      setIsChangePasswordOpen(true);
    }
  }, [session?.user?.deveTrocarSenha]);

  // Sincronização em tempo real das regras de workflow (KV + localStorage)
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

  const isMaster = isMasterAccount(session?.user);

  // Redireciona automaticamente caso a aba ativa tenha sido desativada pelo Master
  useEffect(() => {
    if (isMaster) return;

    const isCurrentActive =
      (activeTab === 'solicitar' && workflowConfig.guiaSolicitarAtiva) ||
      (activeTab === 'acompanhar' && workflowConfig.guiaAcompanharAtiva) ||
      (activeTab === 'moove' && workflowConfig.guiaMooveAtiva) ||
      (activeTab === 'coi' && workflowConfig.guiaCoiAtiva);

    if (!isCurrentActive) {
      if (workflowConfig.guiaSolicitarAtiva) {
        setActiveTab('solicitar');
      } else if (workflowConfig.guiaAcompanharAtiva) {
        setActiveTab('acompanhar');
      } else if (workflowConfig.guiaMooveAtiva) {
        setActiveTab('moove');
      } else if (workflowConfig.guiaCoiAtiva) {
        setActiveTab('coi');
      }
    }
  }, [workflowConfig, activeTab, isMaster]);

  // Check pending counts periodically
  const updatePendingBadge = async () => {
    // Sem sessão não há consulta: a contagem de pendências é informação
    // interna e o endpoint exige autenticação.
    if (!getCurrentSession()) {
      setMoovePendingCount(0);
      setCoiPendingCount(0);
      return;
    }
    try {
      const requests = await fetchRequests();
      const mooveCount = requests.filter(
        (r) => !isRepassadoAoCoi(r) && (r.status === 'Pendente Moove' || (r.status === 'Pendente' && !r.mooveStatus))
      ).length;
      const coiCount = requests.filter(
        (r) => !isAtendidoMoove(r) && (r.status === 'Pendente COI' || (r.status === 'Pendente' && r.mooveStatus === 'Recusado_Enviado_COI'))
      ).length;
      setMoovePendingCount(mooveCount);
      setCoiPendingCount(coiCount);
    } catch (e) {
      console.warn('Erro ao atualizar contagem de pendentes:', e);
    }
  };

  useEffect(() => {
    if (!session) {
      setMoovePendingCount(0);
      setCoiPendingCount(0);
      return;
    }
    updatePendingBadge();
    const interval = setInterval(updatePendingBadge, 20000);
    return () => clearInterval(interval);
  }, [session]);

  const handleRequestCreated = (newReq: UberRequest) => {
    setTrackedProtocol(newReq.protocolo);
    updatePendingBadge();
  };

  const handleNavigateToTracker = (protocolo: string) => {
    setTrackedProtocol(protocolo);
    setActiveTab('acompanhar');
  };

  const handleOpenCoi = () => {
    if (!session) {
      setAuthTarget('coi');
      setIsAuthModalOpen(true);
    } else {
      setActiveTab('coi');
    }
  };

  const handleOpenMoove = () => {
    if (!session) {
      setAuthTarget('moove');
      setIsAuthModalOpen(true);
    } else {
      setActiveTab('moove');
    }
  };

  const handleOpenSettings = () => {
    if (!session) {
      setAuthTarget('configuracoes');
      setIsAuthModalOpen(true);
      return;
    }

    if (!canOpenSettingsPanel(session.user)) {
      setAccessDeniedMessage(
        'Área restrita. As configurações do sistema são exclusivas do Administrador Master. Seu acesso contempla toda a operação dos portais de Validação COI e Moove, incluindo exportação e sincronização com a planilha.'
      );
      return;
    }

    setSettingsInitialTab(isMasterAccount(session.user) ? 'sheets' : 'usuarios');
    setIsSettingsOpen(true);
  };

  const handleAuthSuccess = (newSession: AuthSession) => {
    setSession(newSession);
    if (authTarget === 'coi') {
      setActiveTab('coi');
    } else if (authTarget === 'moove') {
      setActiveTab('moove');
    } else if (authTarget === 'configuracoes') {
      if (canOpenSettingsPanel(newSession.user)) {
        setSettingsInitialTab(isMasterAccount(newSession.user) ? 'sheets' : 'usuarios');
        setIsSettingsOpen(true);
      } else {
        setAccessDeniedMessage(
          'Área restrita. As configurações do sistema são exclusivas do Administrador Master. Seu acesso contempla toda a operação dos portais de Validação COI e Moove, incluindo exportação e sincronização com a planilha.'
        );
      }
    }
  };

  const handleLogout = () => {
    logoutUser();
    setSession(null);
    if (activeTab === 'coi' || activeTab === 'moove') {
      setActiveTab('solicitar');
    }
  };

  const userManagesUsers = canManageUsers(session?.user);
  // A guia só existe para quem já está autenticado com permissão. Quem entra
  // apenas para fazer um pedido não vê nada de configuração.
  const showSettingsButton = Boolean(session) && (isMaster || userManagesUsers);
  const settingsButtonLabel = isMaster ? 'Configurações' : 'Cadastrar Usuários';

  // Regras de visibilidade das abas:
  // O Administrador Master tem visão completa para supervisão e testes operacionais.
  // Usuários comuns e operadores só têm acesso às guias marcadas como ativas.
  const showTabSolicitar = isMaster || workflowConfig.guiaSolicitarAtiva;
  const showTabAcompanhar = isMaster || workflowConfig.guiaAcompanharAtiva;
  const showTabMoove = isMaster || workflowConfig.guiaMooveAtiva;
  const showTabCoi = isMaster || workflowConfig.guiaCoiAtiva;
  const anyTabVisible = showTabSolicitar || showTabAcompanhar || showTabMoove || showTabCoi;

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans antialiased">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo & Brand Title */}
            <div className="flex items-center gap-4">
              <div className="cursor-pointer" onClick={() => showTabSolicitar && setActiveTab('solicitar')}>
                <img
                  src="/wfs-logo.svg.png"
                  alt="WFS - Worldwide Flight Services - A SATS Company"
                  className="h-9 sm:h-11 w-auto object-contain select-none flex-shrink-0"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (target.src.endsWith('/wfs-logo.svg.png')) {
                      target.src = '/wfs-logo.svg';
                    }
                  }}
                />
              </div>
              <div className="hidden sm:block h-8 w-px bg-slate-200" />
              <div className="hidden sm:block">
                <span className="text-xs font-extrabold uppercase tracking-widest text-[#E31837] block">
                  Operações Aeroportuárias GRU
                </span>
                <h1 className="text-sm font-bold text-slate-800 tracking-tight">
                  Sistema de Solicitação de Transporte Avulso
                </h1>
              </div>
            </div>

            {/* Top Navigation Tabs */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {showTabSolicitar && (
                <button
                  type="button"
                  onClick={() => setActiveTab('solicitar')}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'solicitar'
                      ? 'bg-[#E31837] text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Car className="w-4 h-4" />
                  <span>Nova Solicitação</span>
                  {isMaster && !workflowConfig.guiaSolicitarAtiva && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold border border-amber-300">
                      Suspensa
                    </span>
                  )}
                </button>
              )}

              {showTabAcompanhar && (
                <button
                  type="button"
                  onClick={() => setActiveTab('acompanhar')}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'acompanhar'
                      ? 'bg-[#E31837] text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Search className="w-4 h-4" />
                  <span>Acompanhar Pedido</span>
                  {isMaster && !workflowConfig.guiaAcompanharAtiva && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold border border-amber-300">
                      Suspensa
                    </span>
                  )}
                </button>
              )}

              {showTabMoove && (
                <button
                  type="button"
                  onClick={handleOpenMoove}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 relative ${
                    activeTab === 'moove'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  <span>Validação Moove</span>
                  {!session && <Lock className="w-3 h-3 text-slate-400" />}
                  {isMaster && !workflowConfig.guiaMooveAtiva && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold border border-amber-300">
                      Suspensa
                    </span>
                  )}
                  {moovePendingCount > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-extrabold text-white bg-[#E31837] rounded-full">
                      {moovePendingCount}
                    </span>
                  )}
                </button>
              )}

              {showTabCoi && (
                <button
                  type="button"
                  onClick={handleOpenCoi}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 relative ${
                    activeTab === 'coi'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  <span>Validação COI</span>
                  {!session && <Lock className="w-3 h-3 text-slate-400" />}
                  {isMaster && !workflowConfig.guiaCoiAtiva && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold border border-amber-300">
                      Suspensa
                    </span>
                  )}
                  {coiPendingCount > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-extrabold text-white bg-amber-600 rounded-full">
                      {coiPendingCount}
                    </span>
                  )}
                </button>
              )}

              <div className="hidden sm:block h-6 w-px bg-slate-200 mx-1" />

              {/* Master: "Configurações" completas. Gestor de usuários: apenas
                  "Cadastrar Usuários". Operadores: guia não é exibida. */}
              {showSettingsButton && (
                <button
                  type="button"
                  onClick={handleOpenSettings}
                  className="p-2 sm:px-3 sm:py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-semibold"
                  title={
                    isMaster
                      ? 'Configurações do Sistema, Google Sheets e Gestão de Usuários'
                      : 'Cadastro e gestão de usuários'
                  }
                >
                  {isMaster ? (
                    <Settings className="w-4 h-4 text-slate-500" />
                  ) : (
                    <UserCog className="w-4 h-4 text-slate-500" />
                  )}
                  <span className="hidden sm:inline">{settingsButtonLabel}</span>
                </button>
              )}

              {/* User Session Chip if logged in */}
              {session?.user && (
                <div className="hidden md:flex items-center gap-2 pl-2 border-l border-slate-200">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200 text-xs">
                    {isMaster ? (
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-600" title="Administrador Master" />
                    ) : (
                      <User className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span className="font-bold text-slate-800 max-w-[120px] truncate">
                      {session.user.nome.split(' ')[0]}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsChangePasswordOpen(true)}
                    className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Trocar minha senha"
                  >
                    <KeyRound className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="p-1.5 text-slate-400 hover:text-[#E31837] rounded-lg transition-colors"
                    title="Sair do sistema"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {!anyTabVisible && !isMaster ? (
          <div className="max-w-lg mx-auto bg-white rounded-3xl p-8 border border-slate-200 shadow-sm text-center my-12 space-y-4">
            <div className="w-14 h-14 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto text-amber-600">
              <Clock className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Portal em Pausa Operacional Temporária</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              O acesso às guias do sistema está temporariamente suspenso pelo Administrador Master para alinhamento operacional. Por favor, contate o plantão de operações ou aguarde a reativação.
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'solicitar' && (
              <UberRequestForm
                onSuccess={handleRequestCreated}
                onNavigateToTracker={handleNavigateToTracker}
                uberSuspenso={workflowConfig.uberSuspenso}
              />
            )}

            {activeTab === 'acompanhar' && (
              <RequestTracker
                initialQuery={trackedProtocol}
                onNewRequestClick={() => setActiveTab('solicitar')}
              />
            )}

            {activeTab === 'coi' && (
              <ManagerDashboard
                moduleType="coi"
                currentUser={session?.user || null}
                onRequireLogin={() => {
                  setAuthTarget('coi');
                  setIsAuthModalOpen(true);
                }}
                onLogout={handleLogout}
                onNavigateToTab={setActiveTab}
              />
            )}

            {activeTab === 'moove' && (
              <ManagerDashboard
                moduleType="moove"
                currentUser={session?.user || null}
                onRequireLogin={() => {
                  setAuthTarget('moove');
                  setIsAuthModalOpen(true);
                }}
                onLogout={handleLogout}
                onNavigateToTab={setActiveTab}
              />
            )}
          </>
        )}
      </main>

      {/* Footer limpo conforme solicitado: removido "Conectar Google Sheets & Cloudflare • Base Operacional GRU Airport" */}
      <footer className="bg-white border-t border-slate-200 mt-auto py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/wfs-logo.svg.png"
              alt="WFS - Worldwide Flight Services"
              className="h-6 w-auto opacity-90 object-contain select-none flex-shrink-0"
              onError={(e) => {
                const target = e.currentTarget;
                if (target.src.endsWith('/wfs-logo.svg.png')) {
                  target.src = '/wfs-logo.svg';
                }
              }}
            />
            <span className="text-slate-300">|</span>
            <span>Worldwide Flight Services • A SATS Company</span>
          </div>

          <div className="text-slate-400 text-[11px]">
            © {new Date().getFullYear()} WFS — Sistema Corporativo de Solicitação de Transporte Avulso
          </div>
        </div>
      </footer>

      {/* Modal de Autenticação (Login e Cadastro por e-mail e senha de escolha) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
        title={authTarget === 'gestor' ? 'Acesso COI' : 'Acesso às Configurações'}
        subtitle="Informe o e-mail e a senha cadastrados pelo administrador do sistema."
      />

      {/* Aviso de área restrita ao Administrador Master */}
      {accessDeniedMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Acesso restrito</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{accessDeniedMessage}</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setAccessDeniedMessage(null)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-colors"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Configurações (Google Sheets, Usuários e Deploy) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentUser={session?.user || null}
        onLogout={handleLogout}
        initialTab={settingsInitialTab}
      />

      {/* Modal de Troca de Senha (Obrigatória se deveTrocarSenha for true ou Voluntária via ícone da chave) */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen || !!session?.user?.deveTrocarSenha}
        onClose={() => {
          if (!session?.user?.deveTrocarSenha) {
            setIsChangePasswordOpen(false);
          }
        }}
        user={session?.user || null}
        isMandatory={!!session?.user?.deveTrocarSenha}
        onSuccess={(updatedUser: UserAccount) => {
          if (session) {
            const newSession = { ...session, user: updatedUser };
            setSession(newSession);
            // Corrigido: usava uma chave diferente da lida por getCurrentSession,
            // então a troca de senha não persistia de fato entre recarregamentos.
            saveCurrentSession(newSession);
          }
          setIsChangePasswordOpen(false);
        }}
      />
    </div>
  );
}

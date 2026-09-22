import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  FileSpreadsheet,
  Cloud,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  Code2,
  Play,
  Users,
  KeyRound,
  Shield,
  UserCheck,
  UserX,
  RefreshCw,
  Trash2,
  Lock,
  LogOut,
  UserPlus,
  UserCog,
  GitFork,
  ArrowRightLeft,
  CornerUpLeft,
  Layers,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
  Eye,
  EyeOff,
  Car,
  Clock,
} from 'lucide-react';
import {
  getLocalSheetsConfig,
  saveLocalSheetsConfig,
  fetchUsersList,
  createUserByAdmin,
  resetUserPasswordByMaster,
  toggleUserStatusByMaster,
  deleteUserByMaster,
  isMasterUser,
  GOOGLE_SHEETS_URL,
  GOOGLE_SHEETS_ID,
  fetchServerConfig,
  saveSheetsConfig,
  testSheetsWebhook,
  syncAllRequestsToSheets,
  getLocalWorkflowConfig,
  saveWorkflowConfig,
  fetchWorkflowConfig,
} from '../services/api';
import {
  UserAccount,
  AuthSession,
  canManageUsers,
  isMasterAccount,
  canAccessSystemConfig,
  SystemWorkflowConfig,
  DEFAULT_WORKFLOW_CONFIG,
} from '../types';

type SettingsTab = 'fluxo' | 'sheets' | 'usuarios' | 'cloudflare';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: UserAccount | null;
  onLogout?: () => void;
  initialTab?: SettingsTab;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLogout,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'sheets');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // User Management State (Master & Delegated Admins)
  const [usersList, setUsersList] = useState<UserAccount[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [selectedUserForReset, setSelectedUserForReset] = useState<UserAccount | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [userActionMessage, setUserActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New User Form State
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [newUserNome, setNewUserNome] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserSenha, setNewUserSenha] = useState('');
  const [newUserFuncao, setNewUserFuncao] = useState('Operador COI');
  const [newUserMatricula, setNewUserMatricula] = useState('');
  const [newUserPodeGerenciar, setNewUserPodeGerenciar] = useState(false);
  const [newUserRole, setNewUserRole] = useState<'admin' | 'gestor' | 'coi'>('coi');
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [serverConfig, setServerConfig] = useState<{
    sheetsConfigured: boolean;
    sheetsWebhookUrl: string;
    spreadsheetId: string;
    managerPinConfigured: boolean;
  } | null>(null);

  // Dynamic Workflow & Tab Visibility State (Master control)
  const [workflowConfig, setWorkflowConfig] = useState<SystemWorkflowConfig>(getLocalWorkflowConfig());
  const [isSavingWorkflow, setIsSavingWorkflow] = useState(false);
  const [workflowMessage, setWorkflowMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Master: acesso total. Gestor de usuários: apenas a aba de usuários.
  const isMaster = isMasterAccount(currentUser);
  const canSeeSystemConfig = canAccessSystemConfig(currentUser);
  const userCanManage = canManageUsers(currentUser);
  const hasAnyAccess = canSeeSystemConfig || userCanManage;

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const loadServerConfig = async () => {
    try {
      const cfg = await fetchServerConfig();
      setServerConfig(cfg);
      if (cfg.sheetsWebhookUrl) {
        setWebhookUrl(cfg.sheetsWebhookUrl);
      } else {
        const local = getLocalSheetsConfig();
        if (local.webhookUrl) {
          setWebhookUrl(local.webhookUrl);
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar server config:', e);
    }
  };

  const loadWorkflowConfig = async () => {
    try {
      const cfg = await fetchWorkflowConfig();
      setWorkflowConfig(cfg);
    } catch (e) {
      console.warn('Erro ao carregar workflow config:', e);
    }
  };

  const handleSaveWorkflow = async () => {
    setIsSavingWorkflow(true);
    setWorkflowMessage(null);
    try {
      const res = await saveWorkflowConfig(workflowConfig);
      setWorkflowConfig(res.config);
      setWorkflowMessage({
        type: 'success',
        text: 'Regras de transição operacional e visibilidade das guias salvas e sincronizadas com sucesso!',
      });
      setTimeout(() => setWorkflowMessage(null), 5000);
    } catch (e: any) {
      setWorkflowMessage({
        type: 'error',
        text: e.message || 'Erro ao salvar regras de fluxo.',
      });
    } finally {
      setIsSavingWorkflow(false);
    }
  };

  // Garante que um usuário sem permissão de Master nunca fique numa aba restrita
  useEffect(() => {
    if (!isOpen) return;
    if (!canSeeSystemConfig && activeTab !== 'usuarios') {
      setActiveTab('usuarios');
    }
  }, [isOpen, canSeeSystemConfig, activeTab]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(canSeeSystemConfig ? initialTab || 'fluxo' : 'usuarios');
  }, [isOpen, canSeeSystemConfig, initialTab]);

  useEffect(() => {
    if (isOpen) {
      if (canSeeSystemConfig) {
        loadServerConfig();
        loadWorkflowConfig();
      }
      if (userCanManage) {
        loadUsers();
      }
    }
  }, [isOpen, canSeeSystemConfig, userCanManage]);

  const loadUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const users = await fetchUsersList();
      setUsersList(users);
    } catch (e) {
      console.warn('Erro ao carregar usuários:', e);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleSaveWebhook = async () => {
    setSaveError(null);
    try {
      await saveSheetsConfig(webhookUrl.trim());
      setIsSaved(true);
      await loadServerConfig();
      setTimeout(() => setIsSaved(false), 3500);
    } catch (e: any) {
      setSaveError(e.message || 'Erro ao salvar configuração.');
    }
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl.trim()) {
      setTestResult({
        success: false,
        message: 'Insira a URL do Webhook do Google Apps Script antes de testar.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      // Test directly from server to avoid CORS blocks and inspect the real Google Sheets output
      const result = await testSheetsWebhook(webhookUrl.trim());
      setTestResult({
        success: true,
        message: result.message || 'Conexão confirmada! Uma linha de teste foi gravada na sua planilha Google Sheets.',
      });
      await handleSaveWebhook();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Falha na conexão: ${err.message}. Verifique se a implantação do Apps Script está como 'Executar como: Eu' e 'Quem pode acessar: Qualquer pessoa'.`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await syncAllRequestsToSheets();
      setSyncResult({
        success: true,
        message: res.message || `${res.syncedCount} solicitações sincronizadas com a planilha Google Sheets!`,
      });
    } catch (e: any) {
      setSyncResult({
        success: false,
        message: e.message || 'Erro ao sincronizar com Google Sheets. Verifique a URL do Webhook.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const resetNewUserForm = () => {
    setNewUserNome('');
    setNewUserEmail('');
    setNewUserSenha('');
    setNewUserFuncao('Operador COI');
    setNewUserMatricula('');
    setNewUserPodeGerenciar(false);
    setNewUserRole('coi');
  };

  // Cadastro de novo usuário (Master / Administrador / usuário com permissão delegada)
  const handleCreateUser = async () => {
    if (!userCanManage) {
      setUserActionMessage({
        type: 'error',
        text: 'Você não possui permissão para cadastrar novos usuários.',
      });
      return;
    }

    if (!newUserNome.trim() || !newUserEmail.trim() || !newUserSenha.trim()) {
      setUserActionMessage({
        type: 'error',
        text: 'Preencha nome, e-mail e senha para cadastrar o novo usuário.',
      });
      return;
    }

    if (newUserSenha.trim().length < 4) {
      setUserActionMessage({
        type: 'error',
        text: 'A senha inicial deve possuir no mínimo 4 caracteres.',
      });
      return;
    }

    setIsSubmittingUser(true);
    try {
      const created = await createUserByAdmin({
        nome: newUserNome.trim(),
        email: newUserEmail.trim(),
        senha: newUserSenha.trim(),
        funcao: newUserFuncao.trim(),
        matricula: newUserMatricula.trim(),
        // Somente o Master pode criar administradores ou delegar a gestão
        role: isMaster ? newUserRole : newUserRole === 'gestor' ? 'gestor' : 'coi',
        podeGerenciarUsuarios: isMaster ? newUserPodeGerenciar : false,
      });

      setUserActionMessage({
        type: 'success',
        text: `Usuário ${created.nome} (${created.email}) cadastrado com sucesso!`,
      });
      resetNewUserForm();
      setIsCreatingUser(false);
      await loadUsers();
    } catch (e: any) {
      setUserActionMessage({ type: 'error', text: e.message || 'Erro ao cadastrar novo usuário.' });
    } finally {
      setIsSubmittingUser(false);
    }
  };

  // Master Actions
  const handleToggleUserStatus = async (user: UserAccount) => {
    if (!userCanManage) {
      setUserActionMessage({
        type: 'error',
        text: 'Você não possui permissão para ativar ou inativar usuários.',
      });
      return;
    }
    if (isMasterUser(user.email) || user.role === 'master') {
      setUserActionMessage({ type: 'error', text: 'A conta Master não pode ser inativada.' });
      return;
    }
    try {
      const updated = await toggleUserStatusByMaster(user.id);
      setUserActionMessage({
        type: 'success',
        text: `Status do usuário ${user.nome} alterado para ${updated.status}.`,
      });
      await loadUsers();
    } catch (e: any) {
      setUserActionMessage({ type: 'error', text: e.message || 'Erro ao alterar status.' });
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUserForReset || !newPasswordInput.trim()) return;
    if (!userCanManage) {
      setUserActionMessage({
        type: 'error',
        text: 'Você não possui permissão para redefinir senhas.',
      });
      return;
    }
    try {
      await resetUserPasswordByMaster(
        selectedUserForReset.id,
        newPasswordInput.trim()
      );
      setUserActionMessage({
        type: 'success',
        text: `Senha de ${selectedUserForReset.nome} redefinida com sucesso!`,
      });
      setSelectedUserForReset(null);
      setNewPasswordInput('');
      await loadUsers();
    } catch (e: any) {
      setUserActionMessage({ type: 'error', text: e.message || 'Erro ao redefinir senha.' });
    }
  };

  const isProtectedMaster = (user: UserAccount) =>
    isMasterUser(user.email) || user.role === 'master';

  const handleDeleteUser = async (user: UserAccount) => {
    // Exclusão de contas é exclusiva do Administrador Master. Gestores de
    // usuários cadastram, ativam/inativam e redefinem senha, mas não excluem.
    if (!isMaster) {
      setUserActionMessage({
        type: 'error',
        text: 'Apenas o Administrador Master pode excluir contas de usuário.',
      });
      return;
    }
    if (isProtectedMaster(user)) {
      setUserActionMessage({ type: 'error', text: 'A conta Master não pode ser excluída.' });
      return;
    }
    if (!confirm(`Deseja realmente remover o acesso de ${user.nome} (${user.email})?`)) {
      return;
    }
    try {
      await deleteUserByMaster(user.id);
      setUserActionMessage({ type: 'success', text: `Usuário ${user.nome} removido do sistema.` });
      await loadUsers();
    } catch (e: any) {
      setUserActionMessage({ type: 'error', text: e.message || 'Erro ao excluir usuário.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200"
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#E31837] flex items-center justify-center text-white shadow-sm">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">Configurações</h3>
              <p className="text-xs text-slate-500">
                Gerenciamento de integrações, sincronização da planilha e acessos ao sistema WFS
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User identification bar */}
        {currentUser && (
          <div className="px-6 py-2.5 bg-slate-900 text-white flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className={`w-4 h-4 ${isMaster ? 'text-slate-200' : 'text-emerald-400'}`} />
              <span>
                Conectado como:{' '}
                <strong className="text-white font-bold">{currentUser.nome}</strong> (
                {currentUser.email})
              </span>
              {isMaster && (
                <span className="px-2 py-0.5 rounded bg-white/10 text-slate-200 font-bold uppercase text-[10px] tracking-wider border border-white/20">
                  Administrador Master
                </span>
              )}
            </div>

            {onLogout && (
              <button
                type="button"
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                className="text-xs text-slate-300 hover:text-white flex items-center gap-1 hover:underline"
              >
                <LogOut className="w-3.5 h-3.5" />
                Encerrar Sessão
              </button>
            )}
          </div>
        )}

        {/* Tab Navigation — abas de configuração/base de dados/scripts
            aparecem apenas para o Administrador Master */}
        <div className="flex border-b border-slate-200 px-6 gap-2 bg-white overflow-x-auto">
          {canSeeSystemConfig && (
            <button
              type="button"
              onClick={() => setActiveTab('fluxo')}
              className={`py-3 px-4 font-bold text-xs border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'fluxo'
                  ? 'border-[#E31837] text-[#E31837]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <GitFork className="w-4 h-4 text-[#E31837]" />
              <span>Controle de Guias &amp; Fluxo</span>
            </button>
          )}

          {canSeeSystemConfig && (
          <button
            type="button"
            onClick={() => setActiveTab('sheets')}
            className={`py-3 px-4 font-bold text-xs border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'sheets'
                ? 'border-[#E31837] text-[#E31837]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Google Sheets &amp; Webhook
          </button>
          )}

          {userCanManage && (
          <button
            type="button"
            onClick={() => setActiveTab('usuarios')}
            className={`py-3 px-4 font-bold text-xs border-b-2 transition-all flex items-center gap-2 relative whitespace-nowrap ${
              activeTab === 'usuarios'
                ? 'border-[#E31837] text-[#E31837]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Gestão de Usuários &amp; Acessos</span>
            {userCanManage && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" title="Você pode gerenciar usuários" />
            )}
          </button>
          )}

          {canSeeSystemConfig && (
          <button
            type="button"
            onClick={() => setActiveTab('cloudflare')}
            className={`py-3 px-4 font-bold text-xs border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'cloudflare'
                ? 'border-[#E31837] text-[#E31837]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shield className="w-4 h-4 text-[#E31837]" />
            <span>Segurança &amp; Cloudflare</span>
          </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
          {/* Usuário sem nenhuma permissão administrativa */}
          {!hasAnyAccess && (
            <div className="p-5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
              <Lock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold mb-1 text-sm">Área restrita</strong>
                As configurações do sistema são exclusivas do Administrador Master. Seu perfil tem
                acesso completo aos portais de Validação COI e Validação Moove: avaliar solicitações,
                registrar justificativa, exportar em Excel e sincronizar com a planilha.
              </div>
            </div>
          )}

          {/* Aviso de escopo para gestores de usuários (não Master) */}
          {!canSeeSystemConfig && userCanManage && (
            <div className="p-4 rounded-xl bg-slate-900 text-white text-xs flex items-start gap-3">
              <UserCog className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold mb-0.5">Acesso ao módulo de usuários</strong>
                Você pode cadastrar e administrar os acessos dos operadores. Promover usuários e as
                configurações do sistema (integrações, scripts e Cloudflare) permanecem restritos ao
                Administrador Master.
              </div>
            </div>
          )}

          {/* TAB 0: CONTROLE DE FLUXO & ATIVAÇÃO DE GUIAS (Exclusivo Master) */}
          {canSeeSystemConfig && activeTab === 'fluxo' && (
            <div className="space-y-6">
              {/* Feedback Message */}
              {workflowMessage && (
                <div
                  className={`p-4 rounded-xl flex items-center gap-3 text-xs font-semibold ${
                    workflowMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                      : 'bg-rose-50 text-rose-900 border border-rose-200'
                  }`}
                >
                  {workflowMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  )}
                  <span>{workflowMessage.text}</span>
                </div>
              )}

              {/* Informação Geral do Painel */}
              <div className="p-4 bg-slate-900 text-white rounded-2xl flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-slate-200 mt-0.5 flex-shrink-0" />
                <div className="text-xs space-y-1">
                  <p className="font-bold text-white text-sm">Controle Master de Esteira e Visibilidade</p>
                  <p className="text-slate-300">
                    Defina diretamente as regras de permissão para repasse entre as equipes Moove e COI,
                    alterne o regime operacional entre Moove Exclusivo e Uber Ativo, e ligue ou desligue qualquer guia da aplicação em tempo real.
                  </p>
                </div>
              </div>

              {/* Seção Nova: Regime de Transporte & Comunicado Oficial (Uber vs. Moove) */}
              <div className="p-4 sm:p-5 rounded-2xl border-2 transition-all bg-gradient-to-r from-amber-50/80 via-orange-50/60 to-amber-50/80 border-amber-300 shadow-xs">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                      <Car className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-amber-950">
                          Regime de Transporte &amp; Comunicado Oficial
                        </h4>
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            workflowConfig.uberSuspenso
                              ? 'bg-amber-200 text-amber-950 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          }`}
                        >
                          {workflowConfig.uberSuspenso ? 'Modo Moove Exclusivo' : 'Uber Ativo'}
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-900 mt-0.5">
                        Alterne instantaneamente o comunicado e as regras de horários quando a Uber for suspensa ou retornar.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setWorkflowConfig((prev) => ({
                        ...prev,
                        uberSuspenso: !prev.uberSuspenso,
                      }))
                    }
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      workflowConfig.uberSuspenso ? 'bg-amber-600' : 'bg-slate-300'
                    }`}
                    role="switch"
                    aria-checked={workflowConfig.uberSuspenso}
                    title="Alternar entre Uber Suspenso (Moove Exclusivo) e Uber Ativo"
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        workflowConfig.uberSuspenso ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3 bg-white/90 rounded-xl border border-amber-200 text-xs text-slate-700 leading-relaxed mb-3">
                  {workflowConfig.uberSuspenso ? (
                    <div className="space-y-1.5">
                      <p className="font-semibold text-amber-950">
                        ⚠️ <strong>Uber Temporariamente Suspenso (Operação Moove Ativa):</strong>
                      </p>
                      <p className="text-slate-700">
                        O formulário de solicitação exibirá o comunicado de suspensão da Uber com as regras de horário limite da Moove:
                      </p>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-800 font-medium pl-1 text-[11px]">
                        <li>
                          Pedidos para <strong>SAÍDA</strong> no outro dia: devem ser feitos até às <strong className="text-[#E31837] font-bold">23:30</strong>
                        </li>
                        <li>
                          Pedidos para <strong>ENTRADA</strong> no outro dia: devem ser feitos até às <strong className="text-blue-700 font-bold">17:30</strong>
                        </li>
                      </ul>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="font-semibold text-emerald-950">
                        ✓ <strong>Uber Ativo (Operação Normal / Padrão):</strong>
                      </p>
                      <p className="text-slate-600">
                        Exibe o comunicado padrão de antecedência mínima de 23:30 do dia atual para atendimento no dia seguinte.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between text-[11px] pt-2 border-t border-amber-200/80">
                  <span className="text-amber-900 font-medium">Como retornar a Uber no futuro?</span>
                  <span className="text-slate-600">
                    Basta desligar a chave acima e salvar. O comunicado anterior voltará imediatamente.
                  </span>
                </div>
              </div>

              {/* Seção 1: Controle de Transição entre Moove e COI */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ArrowRightLeft className="w-4 h-4 text-[#E31837]" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Regras de Transição Operacional (Moove ⇄ COI)
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Card 1: Permitir Moove enviar para COI */}
                  <div
                    className={`p-4 rounded-2xl border transition-all ${
                      workflowConfig.permitirMooveEnviarCoi
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : 'bg-slate-50 border-slate-300 opacity-90'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                            workflowConfig.permitirMooveEnviarCoi
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-400 text-white'
                          }`}
                        >
                          1ª
                        </span>
                        <h5 className="font-bold text-slate-900 text-xs">
                          Envio da Moove para o COI
                        </h5>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setWorkflowConfig((prev) => ({
                            ...prev,
                            permitirMooveEnviarCoi: !prev.permitirMooveEnviarCoi,
                          }))
                        }
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          workflowConfig.permitirMooveEnviarCoi ? 'bg-emerald-600' : 'bg-slate-300'
                        }`}
                        role="switch"
                        aria-checked={workflowConfig.permitirMooveEnviarCoi}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            workflowConfig.permitirMooveEnviarCoi ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-relaxed mb-3">
                      Quando ativado, os operadores da Moove podem recusar o atendimento por Van/Táxi e
                      repassar o pedido para emissão de Uber pelo plantão COI.
                    </p>

                    <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-200/60">
                      <span className="text-slate-500">Estado na Guia Moove:</span>
                      <span
                        className={`font-bold px-2 py-0.5 rounded ${
                          workflowConfig.permitirMooveEnviarCoi
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {workflowConfig.permitirMooveEnviarCoi ? '✓ Repasse Liberado' : '✕ Repasse Bloqueado'}
                      </span>
                    </div>
                  </div>

                  {/* Card 2: Permitir COI devolver para Moove */}
                  <div
                    className={`p-4 rounded-2xl border transition-all ${
                      workflowConfig.permitirCoiDevolverMoove
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : 'bg-slate-50 border-slate-300 opacity-90'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                            workflowConfig.permitirCoiDevolverMoove
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-400 text-white'
                          }`}
                        >
                          2ª
                        </span>
                        <h5 className="font-bold text-slate-900 text-xs">
                          Devolução do COI para a Moove
                        </h5>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setWorkflowConfig((prev) => ({
                            ...prev,
                            permitirCoiDevolverMoove: !prev.permitirCoiDevolverMoove,
                          }))
                        }
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          workflowConfig.permitirCoiDevolverMoove ? 'bg-indigo-600' : 'bg-slate-300'
                        }`}
                        role="switch"
                        aria-checked={workflowConfig.permitirCoiDevolverMoove}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            workflowConfig.permitirCoiDevolverMoove ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-relaxed mb-3">
                      Quando ativado, os operadores do COI podem devolver solicitações para a Moove caso
                      verifiquem viabilidade operacional ou rota disponível na van.
                    </p>

                    <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-200/60">
                      <span className="text-slate-500">Estado na Guia COI:</span>
                      <span
                        className={`font-bold px-2 py-0.5 rounded ${
                          workflowConfig.permitirCoiDevolverMoove
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {workflowConfig.permitirCoiDevolverMoove ? '✓ Devolução Liberada' : '✕ Devolução Bloqueada'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção 2: Ativação / Desativação de Guias */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="w-4 h-4 text-[#E31837]" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Visibilidade e Ativação de Guias no Menu Superior
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Guia Validação Moove */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3 shadow-2xs">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <strong className="text-xs text-slate-900">Guia Validação Moove</strong>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            workflowConfig.guiaMooveAtiva
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {workflowConfig.guiaMooveAtiva ? 'Ativa' : 'Suspensa'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Validação operacional de Vans e Táxis.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setWorkflowConfig((prev) => ({
                          ...prev,
                          guiaMooveAtiva: !prev.guiaMooveAtiva,
                        }))
                      }
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        workflowConfig.guiaMooveAtiva ? 'bg-emerald-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          workflowConfig.guiaMooveAtiva ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Guia Validação COI */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3 shadow-2xs">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <strong className="text-xs text-slate-900">Guia Validação COI</strong>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            workflowConfig.guiaCoiAtiva
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {workflowConfig.guiaCoiAtiva ? 'Ativa' : 'Suspensa'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Validação do plantão COI e emissão de vouchers Uber.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setWorkflowConfig((prev) => ({
                          ...prev,
                          guiaCoiAtiva: !prev.guiaCoiAtiva,
                        }))
                      }
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        workflowConfig.guiaCoiAtiva ? 'bg-purple-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          workflowConfig.guiaCoiAtiva ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Guia Nova Solicitação */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3 shadow-2xs">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <strong className="text-xs text-slate-900">Guia Nova Solicitação</strong>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            workflowConfig.guiaSolicitarAtiva
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {workflowConfig.guiaSolicitarAtiva ? 'Ativa' : 'Suspensa'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Formulário para colaboradores pedirem transporte.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setWorkflowConfig((prev) => ({
                          ...prev,
                          guiaSolicitarAtiva: !prev.guiaSolicitarAtiva,
                        }))
                      }
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        workflowConfig.guiaSolicitarAtiva ? 'bg-blue-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          workflowConfig.guiaSolicitarAtiva ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Guia Acompanhar Pedido */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3 shadow-2xs">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <strong className="text-xs text-slate-900">Guia Acompanhar Pedido</strong>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            workflowConfig.guiaAcompanharAtiva
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {workflowConfig.guiaAcompanharAtiva ? 'Ativa' : 'Suspensa'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Consulta de status e voucher pelos colaboradores.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setWorkflowConfig((prev) => ({
                          ...prev,
                          guiaAcompanharAtiva: !prev.guiaAcompanharAtiva,
                        }))
                      }
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        workflowConfig.guiaAcompanharAtiva ? 'bg-emerald-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          workflowConfig.guiaAcompanharAtiva ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Botão de Salvar Regras de Fluxo */}
              <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-[11px] text-slate-500">
                  {workflowConfig.atualizadoEm ? (
                    <span>
                      Última atualização por {workflowConfig.atualizadoPor || 'Master'} em{' '}
                      {new Date(workflowConfig.atualizadoEm).toLocaleString('pt-BR')}
                    </span>
                  ) : (
                    <span>Valores padrão do sistema ativos.</span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isSavingWorkflow}
                  onClick={handleSaveWorkflow}
                  className="w-full sm:w-auto px-5 py-2.5 bg-[#E31837] hover:bg-[#c4142e] text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span>{isSavingWorkflow ? 'Salvando Regras...' : 'Salvar Regras de Fluxo'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 1: GOOGLE SHEETS (somente Master) */}
          {canSeeSystemConfig && activeTab === 'sheets' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900 leading-relaxed">
                  <strong className="block font-bold text-emerald-950 mb-0.5">
                    Planilha Oficial WFS Conectada
                  </strong>
                  As solicitações são mapeadas com o cabeçalho exato: Data do evento, Horário de início,
                  Horário de término, Motivo Operacional, Colaborador, Telefone, Endereço Base estruturado,
                  Local de Partida (Terminais GRU), Viagem de Ida/Volta, Responsável pela Solicitação, Status e Voucher.
                  <div className="mt-2">
                    <a
                      href={GOOGLE_SHEETS_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 font-bold text-emerald-800 hover:underline"
                    >
                      <span>Abrir Planilha de Produção WFS</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide mb-1.5" htmlFor="webhook-input">
                    URL do Webhook do Google Apps Script
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="webhook-input"
                      type="url"
                      placeholder="https://script.google.com/macros/s/.../exec"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
                    />
                    <button
                      type="button"
                      onClick={handleSaveWebhook}
                      className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors shadow-xs"
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      disabled={isTesting}
                      onClick={handleTestWebhook}
                      className="px-4 py-2.5 bg-[#E31837] hover:bg-[#c4122d] text-white font-bold text-xs rounded-xl transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {isTesting ? 'Testando...' : 'Testar'}
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Ao preencher esta URL, toda solicitação ou aprovação é gravada diretamente na planilha em tempo real.
                  </span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                  <span>
                    Esta configuração é aplicada com a autenticação da sua sessão de Administrador
                    Master. O antigo atalho por <strong>PIN</strong> foi desativado para que toda ação
                    fique vinculada a um usuário identificado.
                  </span>
                </div>
              </div>

              {saveError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <div>{saveError}</div>
                </div>
              )}

              {isSaved && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  Configuração gravada e persistida no servidor com sucesso!
                </div>
              )}

              {testResult && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                    testResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div>{testResult.message}</div>
                </div>
              )}

              {/* Sincronização em Massa de Solicitações Existentes */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 text-[#E31837]" />
                      Sincronizar Pedidos Existentes com a Planilha
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Envie todos os lançamentos já registrados no banco local para as colunas do Google Sheets.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isSyncing}
                    onClick={handleSyncAll}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Sincronizando...' : 'Sincronizar Todos'}
                  </button>
                </div>

                {syncResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                      syncResult.success
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {syncResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    )}
                    <span>{syncResult.message}</span>
                  </div>
                )}
              </div>

              {/* Guia de Implantação do Script */}
              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950 space-y-2">
                <strong className="block font-bold text-amber-950">
                  ⚠️ Ponto Crítico da Implantação no Google Apps Script:
                </strong>
                <p className="text-[11px] leading-relaxed text-amber-900">
                  Ao criar a implantação em <strong>Extensões &gt; Apps Script &gt; Implantar &gt; Nova implantação (App da Web)</strong>:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-[11px] text-amber-900">
                  <li><strong>Executar como:</strong> <span className="underline font-bold">Eu ({currentUser?.email || 'seu e-mail corporativo'})</span></li>
                  <li><strong>Quem pode acessar:</strong> <span className="underline font-bold">Qualquer pessoa (Anyone)</span> — <em>Se não selecionar &quot;Qualquer pessoa&quot;, o Google bloqueia os lançamentos do sistema com erro de login.</em></li>
                  <li>Copie a URL final gerada terminada em <code>/exec</code> e cole no campo acima.</li>
                </ul>

                <div className="mt-2 pt-2 border-t border-amber-200/80 text-[11px] text-amber-900 leading-relaxed">
                  <strong>ℹ️ Dúvida comum sobre &quot;Propriedades do script&quot; / Variáveis:</strong><br />
                  Você <strong>não</strong> precisa cadastrar nada em <em>Configurações do Projeto &gt; Propriedades do script</em> no Google Apps Script. O código oficial já contém o ID da planilha WFS fixado. A única coisa necessária é a <strong>URL do Web App (/exec)</strong> informada no campo acima ou na variável <code>GOOGLE_SHEETS_WEBHOOK_URL</code> do Cloudflare.
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GESTÃO DE USUÁRIOS E ACESSOS (PRIORIDADE MASTER) */}
          {userCanManage && activeTab === 'usuarios' && (
            <div className="space-y-5">
              {/* Aviso de permissões de acesso */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs flex items-start gap-3">
                <UserCog className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold text-slate-900 mb-0.5">
                    Controle de Acesso &amp; Permissões
                  </strong>
                  {isMaster ? (
                    <>
                      Como Administrador Master você cadastra, redefine senhas, ativa/inativa e exclui
                      acessos. Marque <strong>&quot;Pode cadastrar usuários&quot;</strong> para que o novo
                      usuário, além dos portais COI e Moove, também acesse apenas o módulo de cadastro de
                      usuários — sem acesso a configurações, base de dados ou scripts.
                    </>
                  ) : userCanManage ? (
                    <>
                      Você pode cadastrar operadores dos portais COI e Moove, redefinir a senha deles e
                      ativar/inativar esses acessos. Excluir contas, promover alguém a gestor/administrador
                      e as configurações do sistema são exclusivos do Administrador Master.
                    </>
                  ) : (
                    <>
                      Seu perfil possui apenas visualização da lista de usuários. Para cadastrar, excluir ou
                      inativar acessos, solicite a permissão a um administrador do sistema.
                    </>
                  )}
                </div>
              </div>

              {/* Cadastro de novo usuário */}
              {userCanManage && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <UserPlus className="w-3.5 h-3.5 text-[#E31837]" />
                      Cadastrar Novo Usuário
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingUser((prev) => !prev);
                        setUserActionMessage(null);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        isCreatingUser
                          ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                          : 'bg-[#E31837] text-white hover:bg-[#c4122d]'
                      }`}
                    >
                      {isCreatingUser ? 'Cancelar' : '+ Novo Usuário'}
                    </button>
                  </div>

                  {isCreatingUser && (
                    <div className="p-4 space-y-3 bg-white">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1" htmlFor="new-user-nome">
                            Nome Completo *
                          </label>
                          <input
                            id="new-user-nome"
                            type="text"
                            placeholder="Ex: Maria Souza"
                            value={newUserNome}
                            onChange={(e) => setNewUserNome(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1" htmlFor="new-user-email">
                            E-mail de Acesso *
                          </label>
                          <input
                            id="new-user-email"
                            type="email"
                            placeholder="usuario@empresa.com"
                            value={newUserEmail}
                            onChange={(e) => setNewUserEmail(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1" htmlFor="new-user-senha">
                            Senha Inicial * (mínimo 4 caracteres)
                          </label>
                          <input
                            id="new-user-senha"
                            type="text"
                            placeholder="Senha que o usuário utilizará no primeiro acesso"
                            value={newUserSenha}
                            onChange={(e) => setNewUserSenha(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1" htmlFor="new-user-matricula">
                            Matrícula
                          </label>
                          <input
                            id="new-user-matricula"
                            type="text"
                            placeholder="Ex: WFS-00123"
                            value={newUserMatricula}
                            onChange={(e) => setNewUserMatricula(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1" htmlFor="new-user-funcao">
                            Função / Cargo
                          </label>
                          <input
                            id="new-user-funcao"
                            type="text"
                            placeholder="Ex: Operador COI"
                            value={newUserFuncao}
                            onChange={(e) => setNewUserFuncao(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1" htmlFor="new-user-role">
                            Nível de Acesso
                          </label>
                          <select
                            id="new-user-role"
                            value={newUserRole}
                            onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'gestor' | 'coi')}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
                          >
                            <option value="coi">Operador COI (avalia solicitações)</option>
                            <option value="gestor">Operador Moove / Gestor de Operações</option>
                            {isMaster && (
                              <option value="admin">Administrador (gerencia usuários)</option>
                            )}
                          </select>
                          {!isMaster && (
                            <p className="text-[10px] text-slate-500 mt-1">
                              Somente o Administrador Master pode criar perfis com poder de gestão.
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Delegar a gestão de usuários é prerrogativa do Master */}
                      {isMaster && (
                        <label className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newUserPodeGerenciar || newUserRole === 'admin'}
                            disabled={newUserRole === 'admin'}
                            onChange={(e) => setNewUserPodeGerenciar(e.target.checked)}
                            className="mt-0.5 w-4 h-4 accent-[#E31837]"
                          />
                          <span className="text-[11px] text-slate-700 leading-relaxed">
                            <strong className="block text-slate-900">Pode cadastrar usuários</strong>
                            Além de toda a operação dos portais COI e Moove, este usuário terá acesso ao
                            módulo de cadastro de usuários — sem poder promover ninguém a gestor. As
                            configurações do sistema continuam restritas ao Administrador Master.
                          </span>
                        </label>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            resetNewUserForm();
                            setIsCreatingUser(false);
                          }}
                          className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={isSubmittingUser}
                          onClick={handleCreateUser}
                          className="px-5 py-2 bg-[#E31837] hover:bg-[#c4122d] text-white font-bold text-xs rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          {isSubmittingUser ? 'Cadastrando...' : 'Cadastrar Usuário'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {userActionMessage && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                    userActionMessage.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  <span>{userActionMessage.text}</span>
                  <button
                    type="button"
                    onClick={() => setUserActionMessage(null)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Reset password modal inline */}
              {selectedUserForReset && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-300 space-y-3">
                  <div className="flex items-center justify-between">
                    <strong className="text-xs text-slate-800 flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4 text-[#E31837]" />
                      Redefinir Senha do Usuário: {selectedUserForReset.nome} (
                      {selectedUserForReset.email})
                    </strong>
                    <button
                      type="button"
                      onClick={() => setSelectedUserForReset(null)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder="Digite a nova senha para o usuário..."
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleResetPassword}
                      className="px-4 py-2 bg-[#E31837] text-white font-bold text-xs rounded-lg hover:bg-[#c4122d]"
                    >
                      Confirmar Nova Senha
                    </button>
                  </div>
                </div>
              )}

              {/* Users List Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Usuários Cadastrados ({usersList.length})
                  </span>
                  <button
                    type="button"
                    onClick={loadUsers}
                    className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingUsers ? 'animate-spin' : ''}`} />
                    Atualizar Lista
                  </button>
                </div>

                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {usersList.map((user) => {
                    const isUserMaster = isMasterUser(user.email) || user.role === 'master';
                    const isBlocked = user.status === 'bloqueado';

                    return (
                      <div
                        key={user.id}
                        className="p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs hover:bg-slate-50/70 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <strong className="text-slate-900 font-bold">{user.nome}</strong>
                            {isUserMaster && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-200 text-slate-800 text-[10px] font-bold flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3 text-slate-600" />
                                Master
                              </span>
                            )}
                            {!isUserMaster && (user.role === 'admin' || user.podeGerenciarUsuarios) && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 text-[10px] font-bold flex items-center gap-1 border border-slate-200">
                                <UserCog className="w-3 h-3 text-slate-500" />
                                Gerencia usuários
                              </span>
                            )}
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                isBlocked
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {user.status || 'ativo'}
                            </span>
                          </div>
                          <div className="text-slate-500 text-[11px] mt-0.5 flex flex-wrap items-center gap-x-2">
                            <span>{user.email}</span>
                            <span>•</span>
                            <span>{user.funcao || 'Gestor'}</span>
                            {user.matricula && (
                              <>
                                <span>•</span>
                                <span>Matrícula: {user.matricula}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        {!userCanManage ? (
                          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex-shrink-0">
                            Somente leitura
                          </span>
                        ) : (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUserForReset(user);
                              setNewPasswordInput('');
                            }}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1"
                            title="Redefinir senha deste usuário"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Resetar Senha</span>
                          </button>

                          {!isUserMaster && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleUserStatus(user)}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                                  isBlocked
                                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                }`}
                                title={isBlocked ? 'Ativar usuário' : 'Inativar usuário'}
                              >
                                {isBlocked ? (
                                  <>
                                    <UserCheck className="w-3.5 h-3.5" />
                                    <span>Ativar</span>
                                  </>
                                ) : (
                                  <>
                                    <UserX className="w-3.5 h-3.5" />
                                    <span>Inativar</span>
                                  </>
                                )}
                              </button>

                              {isMaster && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(user)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                  title="Excluir usuário"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SEGURANÇA & CLOUDFLARE (somente Master) */}
          {canSeeSystemConfig && activeTab === 'cloudflare' && (
            <div className="space-y-5 text-xs">
              {/* Diagnóstico em tempo real */}
              <div className="p-4 rounded-xl bg-slate-900 text-white space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-sm text-slate-100">Diagnóstico do Ambiente em Produção</span>
                  </div>
                  <button
                    type="button"
                    onClick={loadServerConfig}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Atualizar Diagnóstico
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700">
                    <span className="text-[11px] text-slate-400 block mb-1">Webhook Google Sheets:</span>
                    <span className={`font-bold flex items-center gap-1.5 ${serverConfig?.sheetsConfigured ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {serverConfig?.sheetsConfigured ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Configurado e Ativo
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Pendente de Configuração
                        </>
                      )}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700">
                    <span className="text-[11px] text-slate-400 block mb-1">ID da Planilha Oficial:</span>
                    <span className="font-mono text-emerald-400 text-[11px] truncate block" title={GOOGLE_SHEETS_ID}>
                      {GOOGLE_SHEETS_ID.substring(0, 18)}...
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700">
                    <span className="text-[11px] text-slate-400 block mb-1">Autenticação das ações:</span>
                    <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Token de sessão obrigatório
                    </span>
                  </div>
                </div>
              </div>

              {/* Guia de Variáveis no Cloudflare */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <strong className="block text-sm font-bold text-slate-900">
                  Como Configurar as Variáveis no Cloudflare Pages / Workers
                </strong>
                <p className="text-slate-600 leading-relaxed">
                  Para que a sincronização funcione automaticamente e com segurança sem expor chaves públicas no repositório GitHub, configure as seguintes variáveis no painel da sua conta Cloudflare:
                </p>

                <div className="space-y-2.5 pt-1">
                  <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[#E31837] text-xs">GOOGLE_SHEETS_WEBHOOK_URL</span>
                      <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-bold text-[10px] uppercase border border-rose-200">
                        Secret (Criptografada)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      URL completa gerada na implantação do Apps Script (terminada em <code className="font-mono text-slate-800 bg-slate-100 px-1 py-0.5 rounded">/exec</code>).
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-800 text-xs">AUTH_SECRET</span>
                      <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-bold text-[10px] uppercase border border-rose-200">
                        Secret (Obrigatória em Produção)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Chave usada para assinar os tokens de login. Sem ela o sistema não autentica
                      ninguém. Use um valor longo e aleatório, exclusivo deste ambiente.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-800 text-xs">MASTER_PASSWORD</span>
                      <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-bold text-[10px] uppercase border border-rose-200">
                        Secret (Obrigatória em Produção)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Senha de acesso do Administrador Master (<strong className="text-slate-800 font-semibold">ivoaltctrl@gmail.com</strong>). Deve ser configurada nas variáveis secretas do Cloudflare Pages.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-800 text-xs">GOOGLE_SHEETS_WEBHOOK_SECRET</span>
                      <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-bold text-[10px] uppercase border border-rose-200">
                        Secret (Obrigatória em Produção)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Precisa ser idêntica ao <code className="font-mono text-slate-800 bg-slate-100 px-1 py-0.5 rounded">WEBHOOK_SECRET</code> definido
                      dentro do <code className="font-mono text-slate-800 bg-slate-100 px-1 py-0.5 rounded">google-apps-script.js</code>. Sem isso, a
                      URL do webhook sozinha permite ler ou apagar a planilha inteira sem passar pelo login do sistema.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-800 text-xs">GOOGLE_SHEETS_ID</span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px] uppercase border border-slate-200">
                        Environment Variable
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 font-mono">
                      1kyCEVV5pNQS0bqnOCzVcCPF-yVh6fRqqQOOfLqDLhYM
                    </p>
                  </div>
                </div>
              </div>

              {/* Passo a Passo no Painel */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <strong className="block text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Passo a Passo no Cloudflare Dashboard
                </strong>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-700 leading-relaxed pl-1">
                  <li>Acesse o painel <strong>Cloudflare</strong> &gt; <strong>Workers &amp; Pages</strong>.</li>
                  <li>Selecione o seu projeto (ex: <code className="font-mono bg-slate-200 px-1 rounded">wfs-transporte-avulso</code>).</li>
                  <li>Acesse a aba <strong>Settings</strong> (Configurações) &gt; <strong>Variables and Secrets</strong>.</li>
                  <li>Clique em <strong>Add variable / secret</strong>:
                    <ul className="list-disc list-inside pl-4 pt-1 text-slate-600 space-y-0.5">
                      <li>Adicione <code className="font-mono">GOOGLE_SHEETS_WEBHOOK_URL</code> marcando como <strong>Secret (Encrypt)</strong>.</li>
                      <li>Adicione <code className="font-mono">GOOGLE_SHEETS_WEBHOOK_SECRET</code> com o mesmo valor definido em <code className="font-mono">WEBHOOK_SECRET</code> no <code className="font-mono">google-apps-script.js</code>.</li>
                      <li>Adicione <code className="font-mono">AUTH_SECRET</code> como <strong>Secret (Encrypt)</strong> — obrigatória para o login funcionar.</li>
                    </ul>
                  </li>
                  <li>Clique em <strong>Save and Deploy</strong> para que as novas variáveis entrem em vigor.</li>
                </ol>
              </div>

              {/* Comandos Wrangler CLI */}
              <div className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs space-y-2">
                <div className="text-slate-400">// Configuração via Wrangler CLI (opcional):</div>
                <div className="text-emerald-400">npx wrangler pages secret put GOOGLE_SHEETS_WEBHOOK_URL</div>
                <div className="text-emerald-400">npx wrangler pages secret put GOOGLE_SHEETS_WEBHOOK_SECRET</div>
                <div className="text-emerald-400">npx wrangler pages secret put AUTH_SECRET</div>
                <div className="text-emerald-400">npx wrangler pages secret put MASTER_PASSWORD</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors"
          >
            Fechar
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// Backwards-compatible export alias
export const SheetsSettingsModal = SettingsModal;

import {
  UberRequest,
  NewUberRequestPayload,
  SheetsConfig,
  UserAccount,
  AuthSession,
  RequestStatus,
  isAtendidoMoove,
  SystemWorkflowConfig,
  DEFAULT_WORKFLOW_CONFIG,
  GroupingSuggestionsResponse,
} from '../types';
import { buildXlsxBlob, downloadBlob } from '../utils/excelExport';
import { deduplicateRequestsKeepLatest, getDuplicateFingerprint } from '../utils/deduplication';
import { exportToCsv, exportToExcel, exportToPdf, formatTimeToAmPm, formatDateToIso } from '../utils/exportGenerators';

export type ExportFormat = 'csv' | 'excel' | 'pdf';
export { exportToCsv, exportToExcel, exportToPdf };

export const GOOGLE_SHEETS_ID = '1kyCEVV5pNQS0bqnOCzVcCPF-yVh6fRqqQOOfLqDLhYM';
export const GOOGLE_SHEETS_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEETS_ID}/edit`;
export const MASTER_EMAIL = 'ivoaltctrl@gmail.com';

export function isMasterUser(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === MASTER_EMAIL.toLowerCase();
}

/**
 * Safe JSON parser to prevent 'Unexpected end of JSON input' or empty body crashes
 */
export async function safeJsonParse<T = any>(res: Response, fallback?: T): Promise<T> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) {
      return (fallback !== undefined ? fallback : {}) as T;
    }
    return JSON.parse(text);
  } catch {
    return (fallback !== undefined ? fallback : {}) as T;
  }
}

const STORAGE_KEY = 'wfs_uber_requests_cache';
const SHEETS_CONFIG_KEY = 'wfs_uber_sheets_config';
const AUTH_SESSION_KEY = 'wfs_auth_session';
const USERS_CACHE_KEY = 'wfs_users_cache';

// Helper to get cached users from localStorage
export function getLocalCachedUsers(): UserAccount[] {
  try {
    const raw = localStorage.getItem(USERS_CACHE_KEY);
    if (raw) {
      const parsed: UserAccount[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Erro ao ler cache local de usuários:', e);
  }
  // Default fallback contains the Master account
  return [
    {
      id: 'usr-master',
      email: MASTER_EMAIL,
      nome: 'Ivo - Administrador Master',
      funcao: 'Administrador Master WFS',
      matricula: 'MASTER-01',
      role: 'master',
      status: 'ativo',
      podeGerenciarUsuarios: true,
      criadoEm: new Date().toISOString(),
    },
  ];
}

export function saveLocalCachedUsers(users: UserAccount[]) {
  try {
    localStorage.setItem(USERS_CACHE_KEY, JSON.stringify(users));
  } catch (e) {
    console.error('Erro ao salvar cache local de usuários:', e);
  }
}

// Helper to get cached requests from localStorage (filters out any legacy mock items)
export function getLocalCachedRequests(): UberRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: UberRequest[] = JSON.parse(raw);
      const cleaned = parsed.filter((r) => r.id !== 'req-1' && r.id !== 'req-2' && r.id !== 'req-3');
      const healed = cleaned.map((r) => {
        if (isAtendidoMoove(r)) {
          let van = r.mooveDadosVan;
          let taxi = r.mooveDadosTaxi;
          let motorista = r.mooveNomeMotorista;
          const text = `${r.voucherUber || ''} ${r.observacoesGestor || ''}`;
          if (!van && !taxi && text) {
            const matchVan = text.match(/Van:\s*([^|\n\r]+)/i);
            if (matchVan) van = matchVan[1].trim();
            const matchTaxi = text.match(/T[aá]xi:\s*([^|\n\r]+)/i);
            if (!van && matchTaxi) taxi = matchTaxi[1].trim();
          }
          if (!motorista && text) {
            const matchMot = text.match(/Motorista:\s*([^|\n\r]+)/i) || text.match(/Mot:\s*([^|\n\r]+)/i);
            if (matchMot) motorista = matchMot[1].trim();
          }
          return {
            ...r,
            mooveDadosVan: van || r.mooveDadosVan,
            mooveDadosTaxi: taxi || r.mooveDadosTaxi,
            mooveTipoTransporte: r.mooveTipoTransporte || (taxi ? 'Taxi' : r.mooveTipoTransporte),
            mooveNomeMotorista: motorista || r.mooveNomeMotorista,
            mooveHorarioChegada: r.mooveHorarioChegada || r.horarioTermino,
          };
        }
        return r;
      });
      // Assume o segundo pedido e ignora o primeiro em duplicatas de mesma pessoa/endereço/data/hora
      const deduplicated = deduplicateRequestsKeepLatest(healed);
      if (deduplicated.length !== parsed.length) {
        saveLocalCachedRequests(deduplicated);
      }
      return deduplicated;
    }
  } catch (e) {
    console.error('Erro ao ler cache local:', e);
  }
  return [];
}

export function saveLocalCachedRequests(requests: UberRequest[]) {
  try {
    const deduplicated = deduplicateRequestsKeepLatest(requests);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deduplicated));
  } catch (e) {
    console.error('Erro ao salvar cache local:', e);
  }
}

export function getLocalSheetsConfig(): SheetsConfig {
  try {
    const raw = localStorage.getItem(SHEETS_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Erro ao ler config de sheets:', e);
  }
  return {
    webhookUrl: '',
    ativo: false,
    statusConexao: 'desconectado',
  };
}

export function saveLocalSheetsConfig(config: SheetsConfig) {
  try {
    localStorage.setItem(SHEETS_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Erro ao salvar config de sheets:', e);
  }
}

// ----------------------------------------------------
// WORKFLOW & TABS DYNAMIC CONFIGURATION (MASTER CONTROL)
// ----------------------------------------------------
const WORKFLOW_CONFIG_KEY = 'wfs_workflow_config_v1';

export function getLocalWorkflowConfig(): SystemWorkflowConfig {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem(WORKFLOW_CONFIG_KEY);
      if (raw) {
        return { ...DEFAULT_WORKFLOW_CONFIG, ...JSON.parse(raw) };
      }
    }
  } catch (e) {
    console.error('Erro ao carregar regras de fluxo locais:', e);
  }
  return { ...DEFAULT_WORKFLOW_CONFIG };
}

export function saveLocalWorkflowConfig(config: SystemWorkflowConfig): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(WORKFLOW_CONFIG_KEY, JSON.stringify(config));
      window.dispatchEvent(new CustomEvent('wfs:workflow-config-changed', { detail: config }));
    }
  } catch (e) {
    console.error('Erro ao salvar regras de fluxo locais:', e);
  }
}

export async function fetchWorkflowConfig(): Promise<SystemWorkflowConfig> {
  const session = getCurrentSession();
  const headers: Record<string, string> = {};
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }

  try {
    const res = await fetch('/api/config/workflow', { headers });
    if (res.ok) {
      const data = await safeJsonParse<{ success?: boolean; config?: SystemWorkflowConfig }>(res, {});
      if (data?.config) {
        const merged = { ...DEFAULT_WORKFLOW_CONFIG, ...data.config };
        saveLocalWorkflowConfig(merged);
        return merged;
      }
    }
  } catch (err) {
    console.warn('Falha ao buscar /api/config/workflow do servidor, usando local:', err);
  }

  return getLocalWorkflowConfig();
}

export async function saveWorkflowConfig(
  config: Partial<SystemWorkflowConfig>
): Promise<{ success: boolean; config: SystemWorkflowConfig; message: string }> {
  const current = getLocalWorkflowConfig();
  const session = getCurrentSession();
  const updated: SystemWorkflowConfig = {
    ...current,
    ...config,
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: session?.user ? `${session.user.nome} (${session.user.email})` : 'Administrador Master',
  };

  // Salva no cache local imediatamente para resposta instantânea
  saveLocalWorkflowConfig(updated);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }

  try {
    const res = await fetch('/api/config/workflow', {
      method: 'POST',
      headers,
      body: JSON.stringify(updated),
    });

    if (res.ok) {
      const data = await safeJsonParse<{ success?: boolean; config?: SystemWorkflowConfig; message?: string }>(res, {});
      if (data?.config) {
        saveLocalWorkflowConfig(data.config);
        return {
          success: true,
          config: data.config,
          message: data.message || 'Configuração de fluxo salva com sucesso!',
        };
      }
    }
  } catch (err) {
    console.warn('Servidor indisponível para salvar workflow, mantido no navegador:', err);
  }

  return {
    success: true,
    config: updated,
    message: 'Configurações de fluxo e guias salvas com sucesso no dispositivo.',
  };
}

// ----------------------------------------------------
// AUTHENTICATION & MASTER USER PRIVILEGES
// ----------------------------------------------------

export function getCurrentSession(): AuthSession | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem(AUTH_SESSION_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Erro ao recuperar sessão:', e);
  }
  return null;
}

export function saveCurrentSession(session: AuthSession | null) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (session) {
        localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(AUTH_SESSION_KEY);
      }
    }
  } catch (e) {
    console.error('Erro ao salvar sessão:', e);
  }
}

/**
 * Limpa todo o cache local do navegador: sessão, solicitações (nomes,
 * telefones e endereços de colaboradores), lista de usuários e a URL do
 * webhook do Google Sheets. Sem isso, o próximo turno numa máquina
 * compartilhada (portais COI/Moove) enxergaria os dados do operador
 * anterior mesmo sem estar logado.
 */
export function clearAllLocalCaches() {
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SHEETS_CONFIG_KEY);
    localStorage.removeItem(USERS_CACHE_KEY);
  } catch (e) {
    console.error('Erro ao limpar cache local:', e);
  }
}

export function logoutUser() {
  clearAllLocalCaches();
}

/**
 * Encerra a sessão localmente quando o servidor responde 401 numa chamada
 * autenticada. O backend agora revalida o token contra o cadastro atual a
 * cada requisição (conta bloqueada, excluída ou com senha trocada pelo
 * Master faz o token cair na hora, não só no vencimento de 7 dias) — isto
 * aqui é o que faz essa revogação aparecer de fato na tela do usuário,
 * em vez de deixar a sessão "pendurada" mostrando dados antigos do cache.
 */
export function forceLogoutIfUnauthorized(status: number): boolean {
  if (status === 401 && getCurrentSession()) {
    clearAllLocalCaches();
    return true;
  }
  return false;
}

export async function loginUser(email: string, senha: string): Promise<AuthSession> {
  const cleanEmail = email.trim().toLowerCase();
  let res: Response;
  try {
    res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, senha }),
    });
  } catch (netErr) {
    throw new Error('Não foi possível conectar ao servidor de autenticação. Verifique sua conexão com a internet.');
  }

  if (res.ok) {
    const data = await res.json();
    const session: AuthSession = {
      user: data.user,
      token: data.token,
    };
    saveCurrentSession(session);
    return session;
  }

  const err = await res.json().catch(() => ({}));
  throw new Error(err.error || 'Credenciais inválidas.');
}

/**
 * Alterar senha voluntariamente ou de forma obrigatória
 */
export async function changeUserPassword(params: {
  email: string;
  newPassword: string;
  currentPassword?: string;
}): Promise<{ success: boolean; user: UserAccount; message: string }> {
  const cleanEmail = params.email.trim().toLowerCase();
  const session = getCurrentSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }
  if (session?.user?.email) {
    headers['X-User-Email'] = session.user.email;
  }

  let res: Response;
  try {
    res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: cleanEmail,
        newPassword: params.newPassword,
        currentPassword: params.currentPassword || undefined,
      }),
    });
  } catch (netErr) {
    console.warn('Falha de conexão ao salvar nova senha no servidor. Atualizando sessão local.');
    // Fallback local se rede indisponível
    const cur = getCurrentSession();
    if (cur && cur.user.email.toLowerCase() === cleanEmail) {
      cur.user = { ...cur.user, deveTrocarSenha: false };
      saveCurrentSession(cur);
      const updatedList = getLocalCachedUsers().map((u) =>
        u.email.toLowerCase() === cleanEmail ? { ...u, deveTrocarSenha: false } : u
      );
      saveLocalCachedUsers(updatedList);
      return {
        success: true,
        user: cur.user,
        message: 'Nova senha cadastrada com sucesso!',
      };
    }
    throw new Error('Falha de conexão com o servidor ao alterar senha.');
  }

  if (res.ok) {
    const data = await res.json();
    const cur = getCurrentSession();
    if (cur && cur.user.email.toLowerCase() === cleanEmail) {
      cur.user = { ...cur.user, ...data.user, deveTrocarSenha: false };
      if (data.token) {
        cur.token = data.token;
      }
      saveCurrentSession(cur);
    }
    // Atualiza também a lista local de usuários para não ficar pendente
    const updatedList = getLocalCachedUsers().map((u) =>
      u.email.toLowerCase() === cleanEmail ? { ...u, deveTrocarSenha: false } : u
    );
    saveLocalCachedUsers(updatedList);
    return data;
  }

  const err = await res.json().catch(() => ({}));
  throw new Error(err.error || 'Erro ao alterar senha.');
}

/**
 * Auto-cadastro desativado.
 * Novos usuários são criados somente por pessoas autorizadas, em
 * Configurações > Gestão de Usuários & Acessos (createUserByAdmin).
 */
export async function registerUser(_payload: {
  email: string;
  senha: string;
  nome: string;
  funcao?: string;
  matricula?: string;
}): Promise<AuthSession> {
  throw new Error(
    'O auto-cadastro está desativado. Solicite a criação do seu acesso a um usuário autorizado do sistema.'
  );
}

export async function fetchUsersList(): Promise<UserAccount[]> {
  const session = getCurrentSession();
  const headers: Record<string, string> = {};
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }
  if (session?.user?.email) {
    headers['X-User-Email'] = session.user.email;
  }

  let res: Response;
  try {
    res = await fetch('/api/auth/users', { headers });
  } catch (e) {
    console.warn('Falha de rede ao conectar ao servidor de usuários. Utilizando cache persistente local.');
    return getLocalCachedUsers();
  }

  if (res.ok) {
    const data: UserAccount[] = await res.json();
    if (Array.isArray(data)) {
      saveLocalCachedUsers(data);
      return data;
    }
  }

  if (forceLogoutIfUnauthorized(res.status)) {
    window.location.reload();
    return [];
  }

  // Fallback apenas para falha de rede/servidor — nunca para 401/403, que
  // significa sessão inválida e não deve exibir a lista antiga em cache.
  const cached = getLocalCachedUsers();
  if (cached.length > 0 && res.status !== 401 && res.status !== 403) {
    return cached;
  }

  const err = await res.json().catch(() => ({}));
  throw new Error(err.error || 'Acesso não autorizado para listar usuários.');
}

export async function createUserByAdmin(
  payload: {
    nome: string;
    email: string;
    senha: string;
    funcao?: string;
    matricula?: string;
    role?: 'master' | 'admin' | 'gestor' | 'coi';
    podeGerenciarUsuarios?: boolean;
    deveTrocarSenha?: boolean;
  }
): Promise<UserAccount> {
  const cleanEmail = payload.email.trim().toLowerCase();
  const session = getCurrentSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }
  if (session?.user?.email) {
    headers['X-User-Email'] = session.user.email;
  }

  let res: Response;
  try {
    res = await fetch('/api/auth/users/create', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...payload, email: cleanEmail }),
    });
  } catch (netErr) {
    throw new Error('Falha de conexão com o servidor ao cadastrar usuário.');
  }

  if (res.ok) {
    const data = await res.json();
    const created = data.user;
    const currentList = getLocalCachedUsers();
    if (!currentList.some((u) => u.id === created.id || u.email.toLowerCase() === created.email.toLowerCase())) {
      saveLocalCachedUsers([...currentList, created]);
    }
    return created;
  }

  const err = await res.json().catch(() => ({}));
  throw new Error(err.error || 'Erro ao cadastrar novo usuário.');
}

export async function resetUserPasswordByMaster(targetUserId: string, newPassword: string): Promise<string> {
  const session = getCurrentSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }
  if (session?.user?.email) {
    headers['X-User-Email'] = session.user.email;
  }

  let res: Response;
  try {
    res = await fetch('/api/auth/users/reset-password', {
      method: 'POST',
      headers,
      body: JSON.stringify({ targetUserId, newPassword }),
    });
  } catch (netErr) {
    throw new Error('Falha de conexão com o servidor ao redefinir senha.');
  }

  if (res.ok) {
    const data = await res.json();
    return data.message;
  }

  const err = await res.json().catch(() => ({}));
  throw new Error(err.error || 'Erro ao redefinir senha.');
}

export async function toggleUserStatusByMaster(targetUserId: string): Promise<UserAccount> {
  const session = getCurrentSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }
  if (session?.user?.email) {
    headers['X-User-Email'] = session.user.email;
  }

  let res: Response;
  try {
    res = await fetch('/api/auth/users/toggle-status', {
      method: 'POST',
      headers,
      body: JSON.stringify({ targetUserId }),
    });
  } catch (netErr) {
    throw new Error('Falha de conexão com o servidor ao alterar status do usuário.');
  }

  if (res.ok) {
    const data = await res.json();
    const updated = data.user;
    const currentList = getLocalCachedUsers().map((u) => (u.id === targetUserId ? { ...u, status: updated.status } : u));
    saveLocalCachedUsers(currentList);
    return updated;
  }

  const err = await res.json().catch(() => ({}));
  throw new Error(err.error || 'Erro ao alterar status do usuário.');
}

export async function deleteUserByMaster(targetUserId: string): Promise<boolean> {
  const session = getCurrentSession();
  const headers: Record<string, string> = {};
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }
  if (session?.user?.email) {
    headers['X-User-Email'] = session.user.email;
  }

  let res: Response;
  try {
    res = await fetch(`/api/auth/users/${targetUserId}`, {
      method: 'DELETE',
      headers,
    });
  } catch (netErr) {
    throw new Error('Falha de conexão com o servidor ao excluir usuário.');
  }

  if (res.ok) {
    const currentList = getLocalCachedUsers().filter((u) => u.id !== targetUserId);
    saveLocalCachedUsers(currentList);
    return true;
  }
  const err = await res.json().catch(() => ({}));
  throw new Error(err.error || 'Erro ao remover usuário.');
}

/**
 * Fetch all requests from backend API or local cache
 */
export function sortRequestsNewestFirst(list: UberRequest[]): UberRequest[] {
  return [...list].sort((a, b) => {
    const timeA = new Date(a.dataCriacao || 0).getTime();
    const timeB = new Date(b.dataCriacao || 0).getTime();
    if (timeB !== timeA) return timeB - timeA;
    return String(b.protocolo || b.id).localeCompare(String(a.protocolo || a.id));
  });
}

/**
 * Versão restrita para a aba "Acompanhar Pedido": não traz telefone,
 * endereços nem dados do responsável além do nome — só o necessário para
 * status, identificação básica do colaborador e feedback de quem avaliou.
 */
export async function fetchRequestsSummary(): Promise<UberRequest[]> {
  const session = getCurrentSession();
  const headers: Record<string, string> = {};
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }

  try {
    const res = await fetch('/api/requests/summary', { headers });
    if (res.ok) {
      const data = await safeJsonParse<UberRequest[] | null>(res, null);
      if (Array.isArray(data)) {
        return deduplicateRequestsKeepLatest(sortRequestsNewestFirst(data));
      }
    }
    if (forceLogoutIfUnauthorized(res.status)) {
      window.location.reload();
      return [];
    }
    const err = await safeJsonParse<{ error?: string }>(res, {});
    if (err.error) {
      throw new Error(err.error);
    }
  } catch (netErr: any) {
    console.warn('API /api/requests/summary indisponível ou resposta inválida:', netErr);
  }

  // Fallback seguro para cache local se API retornar erro ou HTML
  return deduplicateRequestsKeepLatest(sortRequestsNewestFirst(getLocalCachedRequests()));
}

export async function fetchRequests(params?: {
  status?: string;
  search?: string;
  date?: string;
}): Promise<UberRequest[]> {
  const query = new URLSearchParams();
  if (params?.status && params.status !== 'Todos') query.append('status', params.status);
  if (params?.search) query.append('search', params.search);
  if (params?.date) query.append('date', params.date);

  const session = getCurrentSession();
  const headers: Record<string, string> = {};
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }

  try {
    const res = await fetch(`/api/requests?${query.toString()}`, { headers });
    if (res.ok) {
      const data = await safeJsonParse<UberRequest[] | null>(res, null);
      if (Array.isArray(data)) {
        const sorted = deduplicateRequestsKeepLatest(sortRequestsNewestFirst(data));
        saveLocalCachedRequests(sorted);
        return sorted;
      }
    }
    if (forceLogoutIfUnauthorized(res.status)) {
      // Sessão revogada (bloqueada/excluída/senha alterada pelo Master):
      // não cai no fallback de cache local, que mostraria dados obsoletos.
      window.location.reload();
      return [];
    }
  } catch (err) {
    console.warn('API indisponível, usando cache local:', err);
  }

  // Fallback to local cache (com desduplicação garantida)
  let cached = deduplicateRequestsKeepLatest(getLocalCachedRequests());
  if (params?.status && params.status !== 'Todos') {
    const s = params.status.toLowerCase();
    cached = cached.filter((r) => {
      const rStatus = (r.status || '').toLowerCase();
      if (s === 'pendente moove') {
        return rStatus === 'pendente moove' || (rStatus === 'pendente' && (!r.mooveStatus || r.mooveStatus === 'Pendente'));
      }
      if (s === 'pendente coi') {
        return rStatus === 'pendente coi' || (rStatus === 'pendente' && r.mooveStatus === 'Recusado_Enviado_COI');
      }
      if (s === 'atendido moove' || s.includes('atendido') || s.includes('van')) {
        return isAtendidoMoove(r);
      }
      if (s === 'aprovado coi') {
        return rStatus === 'aprovado coi' || rStatus === 'aprovado';
      }
      if (s === 'recusado coi') {
        return rStatus === 'recusado coi' || rStatus === 'recusado';
      }
      if (s === 'pendente') {
        return rStatus === 'pendente' || rStatus === 'pendente moove' || rStatus === 'pendente coi';
      }
      if (s === 'aprovado') {
        return rStatus === 'aprovado' || rStatus === 'aprovado coi' || rStatus === 'atendido moove';
      }
      if (s === 'recusado') {
        return rStatus === 'recusado' || rStatus === 'recusado coi';
      }
      return rStatus === s;
    });
  }
  if (params?.search) {
    const q = params.search.toLowerCase();
    cached = cached.filter(
      (r) =>
        r.nome.toLowerCase().includes(q) ||
        r.sobrenome.toLowerCase().includes(q) ||
        r.telefone.includes(q) ||
        r.protocolo.toLowerCase().includes(q)
    );
  }
  if (params?.date) {
    cached = cached.filter((r) => r.dataEvento === params.date);
  }
  return deduplicateRequestsKeepLatest(sortRequestsNewestFirst(cached));
}

/**
 * Track requests by phone or protocol (for workers)
 */
export async function trackRequests(queryText: string): Promise<UberRequest[]> {
  try {
    const res = await fetch(`/api/requests/track?query=${encodeURIComponent(queryText)}`);
    if (res.ok) {
      const data = await safeJsonParse<UberRequest[] | null>(res, null);
      if (Array.isArray(data)) {
        return deduplicateRequestsKeepLatest(data);
      }
    }
  } catch (err) {
    console.warn('Busca de acompanhamento via API falhou, consultando local:', err);
  }

  const clean = queryText.trim().toLowerCase().replace(/\D/g, '');
  const raw = queryText.trim().toLowerCase();
  const cached = deduplicateRequestsKeepLatest(getLocalCachedRequests());

  const results = cached.filter((r) => {
    const phoneClean = r.telefone.replace(/\D/g, '');
    const protocolClean = r.protocolo.toLowerCase();
    return (
      (clean.length >= 4 && phoneClean.includes(clean)) ||
      protocolClean.includes(raw) ||
      `${r.nome} ${r.sobrenome}`.toLowerCase().includes(raw)
    );
  });
  return deduplicateRequestsKeepLatest(results);
}

/**
 * Create new Transporte Avulso Request
 */
export async function createUberRequest(
  payload: NewUberRequestPayload
): Promise<{ success: boolean; protocolo: string; request: UberRequest; message: string; sheetsSynced?: boolean }> {
  const localCfg = getLocalSheetsConfig();
  const enhancedPayload = {
    ...payload,
    webhookUrl: localCfg.webhookUrl || undefined,
  };

  let res: Response;
  try {
    res = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enhancedPayload),
    });
  } catch (netErr: any) {
    console.error('Falha de conexão ao criar solicitação:', netErr);
    throw new Error(
      'Não foi possível conectar ao servidor para registrar a solicitação. Verifique sua conexão com a internet e tente novamente.'
    );
  }

  if (res.ok) {
    const data = await safeJsonParse(res, null);
    if (data && data.request) {
      // Se o servidor Cloudflare não sincronizou com a planilha e o navegador tem o Webhook configurado,
      // faz a chamada direta de contingência:
      if (data.sheetsSynced === false && localCfg.ativo && localCfg.webhookUrl) {
        try {
          await fetch(localCfg.webhookUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'create',
              ...data.request,
            }),
          });
          data.sheetsSynced = true;
          data.request.sincronizadoSheets = true;
        } catch (clientSyncErr) {
          console.warn('Tentativa de sincronização cliente-Google Sheets falhou:', clientSyncErr);
        }
      }

      // Atualiza o cache local para histórico no dispositivo
      const cached = getLocalCachedRequests();
      const newFingerprint = getDuplicateFingerprint(data.request);
      const filtered = newFingerprint
        ? cached.filter((r) => getDuplicateFingerprint(r) !== newFingerprint)
        : cached;
      filtered.unshift(data.request);
      saveLocalCachedRequests(filtered);
      return data;
    }
    throw new Error('O servidor processou a requisição, mas não retornou os dados da solicitação.');
  }

  const errorData = await safeJsonParse<{ error?: string }>(res, {});
  throw new Error(errorData.error || `Erro ao registrar solicitação no servidor (Código HTTP ${res.status}).`);
}

/**
 * Update Request Status (Manager)
 */
export async function updateRequestStatus(
  id: string,
  params: {
    status: RequestStatus;
    observacoesGestor?: string;
    aprovadoPor?: string;
    voucherUber?: string;
    motivoRecusa?: string;
    pin?: string;
    mooveStatus?: 'Pendente' | 'Atendido' | 'Recusado_Enviado_COI';
    mooveTipoTransporte?: 'Van' | 'Taxi';
    mooveAtendidoPor?: string;
    mooveDataAvaliacao?: string;
    mooveObservacoes?: string;
    mooveDadosVan?: string;
    mooveDadosTaxi?: string;
    mooveNomeMotorista?: string;
    mooveHorarioChegada?: string;
    mooveMotivoRecusaCOI?: string;
    coiStatus?: 'Pendente' | 'Atendido' | 'Recusado';
    coiAtendidoPor?: string;
    coiDataAvaliacao?: string;
    coiObservacoes?: string;
    coiVoucherUber?: string;
    coiMotivoRecusa?: string;
    recusadoPor?: 'Moove' | 'COI';
    coiMotivoDevolucaoMoove?: string;
    coiDevolvidoPor?: string;
    coiDataDevolucao?: string;
  }
): Promise<{ success: boolean; request: UberRequest; message: string }> {
  const session = getCurrentSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }

  let res: Response | null = null;
  try {
    res = await fetch(`/api/requests/${id}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(params),
    });
  } catch (netErr: any) {
    console.warn('Falha de rede ao conectar à API /api/requests/:id/status, usando persistência local:', netErr);
  }

  if (res && res.ok) {
    const data = await safeJsonParse(res, null);
    if (data && data.request) {
      const mergedRequest = {
        ...params,
        ...data.request,
      };
      const cached = getLocalCachedRequests();
      const idx = cached.findIndex((r) => r.id === id || r.protocolo === id);
      if (idx !== -1) {
        cached[idx] = {
          ...cached[idx],
          ...mergedRequest,
        };
        saveLocalCachedRequests(cached);
      }
      return {
        ...data,
        request: mergedRequest,
      };
    }
  }

  // Fallback de contingência local quando a API Cloudflare Functions não está ativa no ambiente Vite
  const cached = getLocalCachedRequests();
  const idx = cached.findIndex((r) => r.id === id || r.protocolo === id);
  if (idx !== -1) {
    const updated: UberRequest = {
      ...cached[idx],
      ...params,
      dataAtualizacao: new Date().toISOString(),
    };
    cached[idx] = updated;
    saveLocalCachedRequests(cached);

    // Sincroniza diretamente com o Webhook da planilha Google Sheets se configurado
    const localCfg = getLocalSheetsConfig();
    if (localCfg.ativo && localCfg.webhookUrl) {
      try {
        fetch(localCfg.webhookUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_status',
            protocolo: updated.protocolo,
            ...params,
          }),
        }).catch((e) => console.warn('Erro sync sheets fallback:', e));
      } catch (errSync) {
        console.warn('Erro ao disparar webhook sheets fallback:', errSync);
      }
    }

    return {
      success: true,
      request: updated,
      message: 'Status atualizado com sucesso no dispositivo!',
    };
  }

  if (res) {
    const errorData = await safeJsonParse<{ error?: string }>(res, {});
    throw new Error(errorData.error || `Erro ao atualizar status (Código HTTP ${res.status}).`);
  }

  throw new Error('Falha de conexão com o servidor ao atualizar status da solicitação.');
}

export interface BulkStatusUpdateItem {
  id: string;
  status: 'Aprovado' | 'Recusado' | 'Pendente' | 'Atendido Moove' | string;
  observacoesGestor?: string;
  aprovadoPor?: string;
  voucherUber?: string;
  motivoRecusa?: string;
  pin?: string;
  mooveStatus?: string;
  mooveTipoTransporte?: string;
  mooveDadosVan?: string;
  mooveDadosTaxi?: string;
  mooveNomeMotorista?: string;
  mooveHorarioChegada?: string;
  mooveObservacoes?: string;
  recusadoPor?: 'Moove' | 'COI';
}

/**
 * Delete Request (Manager action) — exclusão real e definitiva.
 * Remove do backend (KV) e tenta remover a linha correspondente na planilha.
 * Restrito a usuários Master/Gestor autorizado (checado no servidor).
 */
export async function deleteUberRequest(
  id: string
): Promise<{ success: boolean; sheetsSynced?: boolean; message: string }> {
  const session = getCurrentSession();
  const headers: Record<string, string> = {};
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }

  let res: Response;
  try {
    res = await fetch(`/api/requests/${id}`, {
      method: 'DELETE',
      headers,
    });
  } catch (netErr) {
    throw new Error('Falha de conexão com o servidor ao excluir a solicitação.');
  }

  const data = await safeJsonParse<{ success?: boolean; sheetsSynced?: boolean; message?: string; error?: string }>(
    res,
    {}
  );

  if (res.ok && data.success) {
    // Remove também do cache local, se existir
    const cached = getLocalCachedRequests();
    const idx = cached.findIndex((r) => r.id === id || r.protocolo === id);
    if (idx !== -1) {
      cached.splice(idx, 1);
      saveLocalCachedRequests(cached);
    }
    return { success: true, sheetsSynced: data.sheetsSynced, message: data.message || 'Solicitação excluída.' };
  }

  throw new Error(data.error || `Erro ao excluir solicitação (Código HTTP ${res.status}).`);
}

/**
 * Update Bulk Request Status (Manager)
 */
export async function updateBulkRequestStatus(
  items: BulkStatusUpdateItem[]
): Promise<{ success: boolean; updatedCount: number; message: string }> {
  const session = getCurrentSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }

  let res: Response;
  try {
    res = await fetch('/api/requests/bulk-status', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ items }),
    });
  } catch (err) {
    throw new Error('Falha de conexão com o servidor ao executar atualização em lote.');
  }

  if (res.ok) {
    const data = await safeJsonParse(res, null);
    if (data) {
      // Update local cache
      const cached = getLocalCachedRequests();
      for (const item of items) {
        const idx = cached.findIndex((r) => r.id === item.id || r.protocolo === item.id);
        if (idx !== -1) {
          cached[idx].status = item.status as any;
          if (item.observacoesGestor !== undefined) cached[idx].observacoesGestor = item.observacoesGestor;
          if (item.aprovadoPor !== undefined) cached[idx].aprovadoPor = item.aprovadoPor;
          if (item.voucherUber !== undefined) cached[idx].voucherUber = item.voucherUber;
          if (item.motivoRecusa !== undefined) cached[idx].motivoRecusa = item.motivoRecusa;
          if (item.mooveStatus !== undefined) cached[idx].mooveStatus = item.mooveStatus as any;
          if (item.mooveDadosVan !== undefined) cached[idx].mooveDadosVan = item.mooveDadosVan;
          if (item.mooveNomeMotorista !== undefined) cached[idx].mooveNomeMotorista = item.mooveNomeMotorista;
          if (item.mooveHorarioChegada !== undefined) cached[idx].mooveHorarioChegada = item.mooveHorarioChegada;
          if (item.mooveObservacoes !== undefined) cached[idx].mooveObservacoes = item.mooveObservacoes;
          cached[idx].dataAtualizacao = new Date().toISOString();
        }
      }
      saveLocalCachedRequests(cached);
      return data;
    }
  }

  const errorData = await safeJsonParse<{ error?: string }>(res, {});
  throw new Error(errorData.error || 'Erro ao processar atualização em lote no servidor.');
}

/**
 * Download CSV matching exact columns of image.png
 */
export function triggerCsvDownload() {
  window.location.href = '/api/export/csv';
}

/**
 * Colunas oficiais da planilha (exatamente as colunas da imagem de transporte)
 */
export const SHEETS_EXPORT_COLUMNS = [
  'Data do evento',
  'Horário de início do evento',
  'Horário de término do evento',
  'Nome do evento',
  'Nome',
  'Sobrenome',
  'Número de telefone',
  'Endereço base',
  'Endereço do evento',
  'Viagem de ida necessária',
  'Viagem de volta necessária',
];

/**
 * Exportar em Excel (.xlsx) com exatamente as colunas da imagem
 */
export async function triggerExcelDownload(customRequests?: UberRequest[]): Promise<{
  source: 'sistema';
  message: string;
}> {
  const fileName = `WFS_Transporte_Avulso_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const requests = customRequests && customRequests.length > 0 ? customRequests : await fetchRequests();

  const formatYesNo = (val?: string) => {
    if (!val) return 'N';
    const upper = String(val).trim().toUpperCase();
    return upper === 'SIM' || upper === 'Y' || upper === 'YES' ? 'Y' : 'N';
  };

  const formatPhone = (phone?: string) => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) {
      return `55${digits}`;
    }
    return digits || phone;
  };

  const rows: (string | number)[][] = [
    SHEETS_EXPORT_COLUMNS,
    ...requests.map((r) => [
      formatDateToIso(r.dataEvento),
      formatTimeToAmPm(r.horarioInicioEvento),
      formatTimeToAmPm(r.horarioTerminoEvento),
      r.nomeEvento || '',
      r.nome || '',
      r.sobrenome || '',
      formatPhone(r.telefone),
      r.enderecoBase || '',
      r.enderecoEvento || '',
      formatYesNo(r.viagemIda),
      formatYesNo(r.viagemVolta),
    ]),
  ];

  downloadBlob(buildXlsxBlob(rows, 'Solicitações'), fileName);

  return {
    source: 'sistema',
    message: 'Planilha Excel exportada com sucesso contendo as colunas solicitadas!',
  };
}

/**
 * Fetch server configuration
 */
export async function fetchServerConfig(): Promise<{
  sheetsConfigured: boolean;
  sheetsWebhookUrl: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
}> {
  try {
    const session = getCurrentSession();
    const headers: Record<string, string> = {};
    if (session?.token) {
      headers['Authorization'] = `Bearer ${session.token}`;
    }

    const res = await fetch('/api/config', { headers });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err) {
    console.warn('Não foi possível carregar config do backend:', err);
  }
  const local = getLocalSheetsConfig();
  return {
    sheetsConfigured: local.ativo && Boolean(local.webhookUrl),
    sheetsWebhookUrl: local.webhookUrl,
    spreadsheetId: GOOGLE_SHEETS_ID,
    spreadsheetUrl: GOOGLE_SHEETS_URL,
  };
}

/**
 * Save Google Sheets Webhook to Backend & Local
 */
export async function saveSheetsConfig(
  webhookUrl: string
): Promise<{ success: boolean; message: string; sheetsConfigured?: boolean; sheetsWebhookUrl?: string }> {
  const cleanUrl = webhookUrl.trim();
  const session = getCurrentSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }

  const res = await fetch('/api/config/sheets', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      webhookUrl: cleanUrl,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao salvar configuração no servidor. Verifique suas permissões de Administrador Master.');
  }

  // Atualiza localmente após confirmação do backend
  saveLocalSheetsConfig({
    webhookUrl: cleanUrl,
    ativo: Boolean(cleanUrl),
    statusConexao: cleanUrl ? 'conectado' : 'desconectado',
    ultimoEnvio: new Date().toISOString(),
  });

  return {
    success: true,
    message: data.message || 'Configuração persistida com sucesso no backend!',
    sheetsConfigured: data.sheetsConfigured,
    sheetsWebhookUrl: data.sheetsWebhookUrl,
  };
}

/**
 * Test Google Sheets Webhook via backend (avoids CORS)
 */
export async function testSheetsWebhook(webhookUrl?: string): Promise<{ success: boolean; message: string; data?: any }> {
  const session = getCurrentSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }

  try {
    // Tenta primeiro /api/test-sheets e se falhar /api/config/test-sheets
    let res = await fetch('/api/test-sheets', {
      method: 'POST',
      headers,
      body: JSON.stringify({ webhookUrl }),
    });

    if (res.status === 404) {
      res = await fetch('/api/config/test-sheets', {
        method: 'POST',
        headers,
        body: JSON.stringify({ webhookUrl }),
      });
    }

    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, message: data.message, data };
    } else {
      throw new Error(data.error || 'Falha ao testar webhook');
    }
  } catch (err: any) {
    throw new Error(err.message || 'Erro ao conectar ao Google Sheets');
  }
}

/**
 * Bulk sync all requests to Google Sheets
 */
export async function syncAllRequestsToSheets(
  items?: UberRequest[]
): Promise<{
  success: boolean;
  total: number;
  syncedCount: number;
  message: string;
  errors: string[];
}> {
  const localCfg = getLocalSheetsConfig();
  const cachedRequests = getLocalCachedRequests();
  // Prioriza a lista passada explicitamente (ex: do painel operacional)
  const itemsToSend: UberRequest[] = items && items.length > 0 ? items : cachedRequests;

  const session = getCurrentSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }

  try {
    const res = await fetch('/api/requests/sync-all', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        webhookUrl: localCfg.webhookUrl || undefined,
        items: itemsToSend,
      }),
    });

    const data = await safeJsonParse(res, null);

    if (res.ok && data && data.success) {
      // Atualiza os registros do cache local para marcá-los como sincronizados
      if (itemsToSend.length > 0) {
        itemsToSend.forEach((r) => {
          r.sincronizadoSheets = true;
        });
        saveLocalCachedRequests(itemsToSend);
      }
      return data;
    } else if (data && data.error) {
      throw new Error(data.error);
    } else if (!res.ok) {
      throw new Error(`Servidor retornou status HTTP ${res.status}`);
    }
  } catch (err: any) {
    console.warn('Sincronização via API /api/requests/sync-all falhou, avaliando fallback:', err);

    // Fallback: se o webhook do Google Sheets estiver configurado localmente no navegador
    if (localCfg.ativo && localCfg.webhookUrl && itemsToSend.length > 0) {
      try {
        let syncedCount = 0;
        for (const req of itemsToSend) {
          try {
            await fetch(localCfg.webhookUrl, {
              method: 'POST',
              mode: 'no-cors',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'create', // Script possui idempotência e upsert
                ...req,
              }),
            });
            req.sincronizadoSheets = true;
            syncedCount++;
          } catch (e) {
            console.warn(`Erro no envio direto de ${req.protocolo}:`, e);
          }
        }
        saveLocalCachedRequests(itemsToSend);
        return {
          success: true,
          total: itemsToSend.length,
          syncedCount,
          errors: [],
          message: `${syncedCount} de ${itemsToSend.length} solicitações foram enviadas diretamente à planilha Google Sheets!`,
        };
      } catch (fallbackErr: any) {
        console.error('Fallback direto no webhook falhou:', fallbackErr);
      }
    }

    throw new Error(
      err.message ||
        'Erro ao sincronizar com Google Sheets. Verifique se a URL do Webhook está configurada em Configurações > Google Sheets.'
    );
  }

  return {
    success: true,
    total: itemsToSend.length,
    syncedCount: 0,
    errors: [],
    message: 'Nenhuma solicitação para sincronizar.',
  };
}

/**
 * Busca sugestões inteligentes de agrupamento para vans/táxis Moove
 */
export async function fetchGroupingSuggestions(params?: {
  janelaMinutos?: number;
  raioKm?: number;
  maxPorVeiculo?: number;
}): Promise<GroupingSuggestionsResponse> {
  const query = new URLSearchParams();
  if (params?.janelaMinutos) query.set('janelaMinutos', String(params.janelaMinutos));
  if (params?.raioKm) query.set('raioKm', String(params.raioKm));
  if (params?.maxPorVeiculo) query.set('maxPorVeiculo', String(params.maxPorVeiculo));

  const session = getCurrentSession();
  const headers: Record<string, string> = {};
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }
  if (session?.user?.email) {
    headers['X-User-Email'] = session.user.email;
  }

  const queryString = query.toString() ? `?${query.toString()}` : '';
  const response = await fetch(`/api/requests/grouping-suggestions${queryString}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    let errMsg = 'Erro ao buscar sugestões de agrupamento';
    try {
      const errData = await response.json();
      if (errData.error) errMsg = errData.error;
    } catch (_) {}
    throw new Error(errMsg);
  }

  return response.json();
}

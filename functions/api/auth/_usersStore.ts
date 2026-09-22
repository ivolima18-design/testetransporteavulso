/**
 * =========================================================================
 * WFS - Utilitários compartilhados de Gestão de Usuários (Cloudflare KV)
 * =========================================================================
 * Mesmas regras de permissão usadas em todo o backend do sistema:
 * podem gerenciar usuários: conta Master, role 'master', role 'admin'
 * ou usuários com a permissão 'podeGerenciarUsuarios'.
 * =========================================================================
 */

import {
  AuthTokenPayload,
  extractBearerToken,
  getSystemSecret,
  hashPassword,
  needsPasswordRehash,
  signAuthToken,
  verifyAuthToken,
  verifyPassword,
} from './_security';

export {
  AuthTokenPayload,
  getSystemSecret,
  hashPassword,
  needsPasswordRehash,
  signAuthToken,
  verifyAuthToken,
  verifyPassword,
};

export const MASTER_EMAIL = 'ivoaltctrl@gmail.com';
export const USERS_KEY = 'USERS_LIST';

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

export interface UsersEnv {
  WFS_KV?: KVNamespace;
  MASTER_PASSWORD?: string;
  AUTH_SECRET?: string;
  JWT_SECRET?: string;
  MANAGER_PIN?: string;
  GOOGLE_SHEETS_WEBHOOK_SECRET?: string;
}

/**
 * Segredo compartilhado com o Google Apps Script (ver WEBHOOK_SECRET em
 * google-apps-script.js). Injetado no corpo de toda chamada ao webhook para
 * que a URL sozinha não seja suficiente para ler ou apagar a planilha.
 */
export function withWebhookSecret<T extends Record<string, unknown>>(
  env: { GOOGLE_SHEETS_WEBHOOK_SECRET?: string },
  body: T
): T & { webhookSecret?: string } {
  if (!env.GOOGLE_SHEETS_WEBHOOK_SECRET) return body;
  return { ...body, webhookSecret: env.GOOGLE_SHEETS_WEBHOOK_SECRET };
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function masterAccount(): UserAccount {
  return {
    id: 'usr-master',
    email: MASTER_EMAIL,
    nome: 'Ivo - Administrador Master',
    funcao: 'Administrador Master WFS',
    matricula: 'MASTER-01',
    role: 'master',
    status: 'ativo',
    podeGerenciarUsuarios: true,
    criadoEm: new Date().toISOString(),
  };
}

export async function loadUsers(env: UsersEnv): Promise<UserAccount[]> {
  let users: UserAccount[] = [];
  if (env.WFS_KV) {
    const raw = await env.WFS_KV.get(USERS_KEY);
    if (raw) {
      try {
        users = JSON.parse(raw);
      } catch {
        users = [];
      }
    }
  }

  if (!users.some((u) => String(u.email || '').toLowerCase() === MASTER_EMAIL)) {
    users.unshift(masterAccount());
  }

  return users;
}

export async function saveUsers(env: UsersEnv, users: UserAccount[]): Promise<void> {
  if (env.WFS_KV) {
    await env.WFS_KV.put(USERS_KEY, JSON.stringify(users));
  }
}

/**
 * =========================================================================
 * AUTENTICAÇÃO COM REVALIDAÇÃO EM TEMPO REAL
 * =========================================================================
 * O token assinado (JWT-like) tem validade de 7 dias e antes carregava
 * role/permissão "congeladas" no momento do login: inativar alguém, mudar
 * a senha ou trocar o nível de acesso só valia no próximo login — a sessão
 * antiga continuava funcionando com os dados antigos.
 *
 * Esta função substitui a antiga getAuthenticatedUser (que só decodificava
 * o token) por uma versão que, após validar a assinatura, confere o estado
 * ATUAL do usuário no KV a cada requisição:
 *   - conta excluída -> sessão encerrada (retorna null);
 *   - conta bloqueada/inativada -> sessão encerrada (retorna null);
 *   - role ou podeGerenciarUsuarios alterados -> o payload retornado já
 *     reflete o valor atual, então a checagem de permissão da própria
 *     requisição usa o dado fresco, não o congelado no token.
 *
 * Custo: uma leitura do KV por requisição autenticada — aceitável para o
 * volume deste sistema e necessário para revogação/alteração de permissão
 * ter efeito imediato.
 * =========================================================================
 */
export async function getAuthenticatedUser(
  request: Request,
  env: UsersEnv
): Promise<AuthTokenPayload | null> {
  const token = extractBearerToken(request);
  if (!token) return null;

  const secret = getSystemSecret(env);
  const payload = await verifyAuthToken(token, secret);
  if (!payload) return null;

  // Master: não fica na lista de usuários a menos que tenha sido
  // sobrescrito no KV; se não houver KV configurado, confia no token
  // (mesmo comportamento de antes, sem regressão em ambiente sem KV).
  if (!env.WFS_KV) {
    return payload;
  }

  const users = await loadUsers(env);
  const liveUser = users.find(
    (u) => u.id === payload.sub || u.email.toLowerCase() === payload.email.toLowerCase()
  );

  if (!liveUser) {
    // Conta excluída após o token ter sido emitido
    return null;
  }

  if (liveUser.status === 'bloqueado') {
    // Conta inativada após o token ter sido emitido
    return null;
  }

  // Retorna o payload com os campos de permissão atualizados a partir do
  // registro atual, para que a checagem desta requisição use o dado vivo.
  return {
    ...payload,
    role: liveUser.role,
    podeGerenciar: Boolean(
      liveUser.podeGerenciarUsuarios || liveUser.role === 'master' || liveUser.role === 'admin'
    ),
  };
}

/**
 * =========================================================================
 * NÍVEIS DE ACESSO DO SISTEMA (fonte única de verdade do backend)
 * =========================================================================
 * 1) MASTER  -> acesso total: configurações, integrações, base de dados,
 *               scripts, exportação, sincronização, exclusões e usuários.
 * 2) GESTOR DE USUÁRIOS (role 'admin' ou flag podeGerenciarUsuarios)
 *            -> acesso de operador + módulo de cadastro de usuários.
 *               NÃO acessa configurações, base de dados nem scripts.
 * 3) OPERADOR (role 'gestor' / 'coi')
 *            -> somente os portais COI e Moove (atender/recusar + justificar).
 * =========================================================================
 */

/** Exclusivo do Administrador Master (configurações, base de dados, scripts). */
export function isMasterAuth(authUser: AuthTokenPayload | null): boolean {
  if (!authUser) return false;
  return (
    authUser.role === 'master' ||
    authUser.email.toLowerCase() === MASTER_EMAIL.toLowerCase()
  );
}

/** Resposta padrão de bloqueio para recursos exclusivos do Master. */
export function masterOnlyDenied(acao = 'executar esta operação'): Response {
  return json(
    {
      error: `Acesso restrito ao Administrador Master. Somente o Master pode ${acao}.`,
    },
    403
  );
}

/**
 * Operador: qualquer usuário autenticado (COI / Moove / gestor de usuários /
 * master). Habilita apenas a gestão dos portais de decisão.
 */
export function checkOperatorAccess(authUser: AuthTokenPayload | null): boolean {
  return Boolean(authUser);
}

/**
 * Gestão de USUÁRIOS apenas (cadastrar/ativar/redefinir senha).
 * Não concede acesso a configurações, base de dados ou scripts.
 */
export function checkAuthorizedManager(authUser: AuthTokenPayload | null): boolean {
  if (!authUser) return false;
  if (isMasterAuth(authUser)) return true;
  return Boolean(authUser.role === 'admin' || authUser.podeGerenciar);
}

export function toSafeUser(user: UserAccount) {
  const { senha, ...safe } = user;
  return safe;
}

export function kvUnavailable(): Response {
  return json(
    {
      error:
        'Persistência de usuários indisponível: vincule o KV namespace "WFS_KV" ao projeto no painel do Cloudflare (Settings > Functions > KV namespace bindings).',
    },
    503
  );
}

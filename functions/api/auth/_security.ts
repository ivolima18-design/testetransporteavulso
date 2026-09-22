/**
 * =========================================================================
 * WFS - Módulo de Segurança Criptográfica & Autenticação
 * =========================================================================
 * - Compatível nativamente com Cloudflare Pages Functions & Node.js (Web Crypto API).
 * - Tokens assinados criptograficamente via HMAC-SHA256 (JWT-like).
 * - Hashes de senha robustos via PBKDF2 (SHA-256, 10.000 iterações, salt aleatório de 16 bytes).
 * =========================================================================
 */

export interface AuthTokenPayload {
  sub: string;             // User ID
  email: string;           // Clean email
  nome: string;            // User name
  role: 'master' | 'admin' | 'gestor' | 'coi';
  podeGerenciar: boolean;  // Permissão de gerenciar usuários
  exp: number;             // Timestamp de expiração (ms)
  iat: number;             // Timestamp de emissão (ms)
}

/**
 * A chave de assinatura vem SEMPRE do ambiente. A antiga chave padrão fixa
 * no código foi removida: com ela publicada no repositório, qualquer pessoa
 * conseguiria forjar um token de Administrador Master.
 * Sem AUTH_SECRET (ou JWT_SECRET / MASTER_PASSWORD) configurado, o sistema
 * não emite nem valida tokens.
 */
export function getSystemSecret(env: any): string {
  const secret = env?.AUTH_SECRET || env?.JWT_SECRET || env?.MASTER_PASSWORD;
  if (secret && typeof secret === 'string' && secret.trim().length > 0) {
    return secret.trim();
  }
  console.error(
    '[WFS Security] AUTH_SECRET não configurado no Cloudflare Pages. Autenticação desativada até que o segredo seja definido.'
  );
  return '';
}

/**
 * Iterações atuais do PBKDF2 (hashes antigos continuam sendo validados).
 * IMPORTANTE: o runtime do Cloudflare Workers (workerd) rejeita
 * crypto.subtle.deriveBits com PBKDF2 acima de 100.000 iterações
 * ("iteration counts above 100000 are not supported"). O valor recomendado
 * pela OWASP (210.000) NÃO funciona em produção no Cloudflare — 100.000 é
 * o máximo permitido pela plataforma e o valor usado aqui.
 */
export const PBKDF2_ITERATIONS = 100000;
const LEGACY_PBKDF2_ITERATIONS = 10000;

async function derivePbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<string> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    stringToBytes(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    passwordKey,
    256
  );

  return toHex(new Uint8Array(derivedBits));
}

// Utilitários Base64URL
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Assina um token de autenticação seguro usando HMAC-SHA256
 */
export async function signAuthToken(
  user: { id: string; email: string; nome: string; role: string; podeGerenciarUsuarios?: boolean },
  secret: string,
  expiresInDays = 7
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Date.now();
  const payload: AuthTokenPayload = {
    sub: user.id,
    email: user.email.toLowerCase().trim(),
    nome: user.nome,
    role: (user.role as any) || 'gestor',
    podeGerenciar: Boolean(user.podeGerenciarUsuarios || user.role === 'master' || user.role === 'admin'),
    iat: now,
    exp: now + expiresInDays * 24 * 60 * 60 * 1000,
  };

  const encodedHeader = base64UrlEncode(stringToBytes(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(stringToBytes(JSON.stringify(payload)));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  if (!secret) {
    throw new Error(
      'AUTH_SECRET não configurado no ambiente. Defina o segredo no Cloudflare Pages antes de usar o sistema.'
    );
  }

  const key = await crypto.subtle.importKey(
    'raw',
    stringToBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, stringToBytes(dataToSign))
  );
  const encodedSignature = base64UrlEncode(signatureBytes);

  return `${dataToSign}.${encodedSignature}`;
}

/**
 * Valida a assinatura e expiração de um token de autenticação
 */
export async function verifyAuthToken(
  token: string | null | undefined,
  secret: string
): Promise<AuthTokenPayload | null> {
  if (!token || typeof token !== 'string') return null;

  if (!secret) return null;

  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const dataToVerify = `${encodedHeader}.${encodedPayload}`;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      stringToBytes(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBytes = base64UrlDecode(encodedSignature);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      stringToBytes(dataToVerify)
    );

    if (!isValid) return null;

    const payloadJson = bytesToString(base64UrlDecode(encodedPayload));
    const payload: AuthTokenPayload = JSON.parse(payloadJson);

    // Checar expiração
    if (Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * Extrai o token do cabeçalho HTTP Authorization (Bearer <token>)
 */
export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Obtém os dados do usuário autenticado a partir da requisição HTTP
 */
export async function getAuthenticatedUser(
  request: Request,
  env: any
): Promise<AuthTokenPayload | null> {
  const token = extractBearerToken(request);
  if (!token) return null;
  const secret = getSystemSecret(env);
  return verifyAuthToken(token, secret);
}

/**
 * Gera um Hash de Senha seguro usando PBKDF2 com SHA-256 e Salt de 16 bytes
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const hashHex = await derivePbkdf2(password, salt, PBKDF2_ITERATIONS);
  const saltHex = toHex(salt);

  // Formato versionado: pbkdf2$v2$<iterações>$<salt>$<hash>
  return `pbkdf2$v2$${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`;
}

/** Indica se o hash gravado está em formato antigo e deve ser reescrito. */
export function needsPasswordRehash(storedHash: string | undefined): boolean {
  if (!storedHash) return true;
  if (!storedHash.startsWith('pbkdf2$')) return true;
  return !storedHash.startsWith(`pbkdf2$v2$${PBKDF2_ITERATIONS}$`);
}

/**
 * Verifica se a senha informada corresponde ao hash gravado
 * (possui retrocompatibilidade com senhas legadas em texto puro, permitindo upgrade imediato)
 */
export async function verifyPassword(
  passwordAttempt: string,
  storedHashOrPlain: string | undefined
): Promise<boolean> {
  if (!storedHashOrPlain || !passwordAttempt) return false;

  // Formato versionado atual: pbkdf2$v2$<iterações>$<salt>$<hash>
  if (storedHashOrPlain.startsWith('pbkdf2$v2$')) {
    const parts = storedHashOrPlain.split('$');
    if (parts.length !== 5) return false;
    const iterations = parseInt(parts[2], 10);
    if (!Number.isFinite(iterations) || iterations <= 0) return false;
    const calculated = await derivePbkdf2(passwordAttempt, fromHex(parts[3]), iterations);
    return constantTimeCompare(calculated, parts[4]);
  }

  // Formato legado: pbkdf2$<salt>$<hash> (10.000 iterações)
  if (storedHashOrPlain.startsWith('pbkdf2$')) {
    const parts = storedHashOrPlain.split('$');
    if (parts.length !== 3) return false;
    const calculated = await derivePbkdf2(
      passwordAttempt,
      fromHex(parts[1]),
      LEGACY_PBKDF2_ITERATIONS
    );
    return constantTimeCompare(calculated, parts[2]);
  }

  // Retrocompatibilidade temporária com senha antiga em texto puro
  return constantTimeCompare(passwordAttempt, storedHashOrPlain);
}

/**
 * Comparação em tempo constante para evitar ataques de timing
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

import {
  loadUsers,
  saveUsers,
  toSafeUser,
  signAuthToken,
  verifyPassword,
  hashPassword,
  needsPasswordRehash,
  getSystemSecret,
  MASTER_EMAIL,
  UserAccount,
  UsersEnv,
} from './_usersStore';

// -------------------------------------------------------------------------
// Proteção contra força bruta: 8 tentativas falhas por e-mail+IP a cada 15
// minutos. O contador vive no KV e é apagado no primeiro login bem-sucedido.
// -------------------------------------------------------------------------
const MAX_ATTEMPTS = 8;
const LOCK_WINDOW_SECONDS = 15 * 60;

function attemptsKey(email: string, ip: string): string {
  return `LOGIN_ATTEMPTS:${email}:${ip}`;
}

async function getAttempts(env: UsersEnv, key: string): Promise<number> {
  if (!env.WFS_KV) return 0;
  const raw = await env.WFS_KV.get(key);
  const value = parseInt(raw || '0', 10);
  return Number.isFinite(value) ? value : 0;
}

async function registerFailure(env: UsersEnv, key: string): Promise<void> {
  if (!env.WFS_KV) return;
  const current = await getAttempts(env, key);
  await env.WFS_KV.put(key, String(current + 1), { expirationTtl: LOCK_WINDOW_SECONDS });
}

async function clearFailures(env: UsersEnv, key: string): Promise<void> {
  if (!env.WFS_KV) return;
  await env.WFS_KV.delete(key);
}

export const onRequestPost: PagesFunction<UsersEnv> = async (context) => {
  const env = context.env;
  try {
    // Sem segredo de assinatura configurado, nenhum token pode ser emitido
    // com segurança — melhor falhar do que autenticar com chave previsível.
    if (!getSystemSecret(env)) {
      return new Response(
        JSON.stringify({
          error:
            'Sistema não configurado: defina o segredo AUTH_SECRET no Cloudflare Pages (Settings > Variables and Secrets) para habilitar o login.',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body: any = await context.request.json();
    const { email, senha } = body;

    if (!email || !senha) {
      return new Response(JSON.stringify({ error: 'Informe e-mail e senha.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const isMaster = cleanEmail === MASTER_EMAIL.toLowerCase();
    const secret = getSystemSecret(env);

    const clientIp =
      context.request.headers.get('CF-Connecting-IP') ||
      context.request.headers.get('X-Forwarded-For') ||
      'ip-desconhecido';
    const rateKey = attemptsKey(cleanEmail, clientIp);

    if ((await getAttempts(env, rateKey)) >= MAX_ATTEMPTS) {
      return new Response(
        JSON.stringify({
          error:
            'Muitas tentativas de login sem sucesso. Aguarde 15 minutos antes de tentar novamente ou contate o Administrador Master.',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Caso Master User (ivoaltctrl@gmail.com)
    if (isMaster) {
      let masterPassword = env.MASTER_PASSWORD;
      let masterHash = '';

      if (env.WFS_KV) {
        masterHash = (await env.WFS_KV.get('MASTER_PASSWORD_HASH')) || '';
      }

      // Validação segura: confere contra hash gravado ou MASTER_PASSWORD explícita no ambiente
      let isMasterValid = false;
      if (masterHash) {
        isMasterValid = await verifyPassword(senha, masterHash);
      }
      if (!isMasterValid && masterPassword) {
        isMasterValid = senha === masterPassword || (await verifyPassword(senha, masterPassword));
      }

      if (!isMasterValid) {
        await registerFailure(env, rateKey);
        return new Response(JSON.stringify({ error: 'Credenciais inválidas.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      await clearFailures(env, rateKey);

      const masterUser: UserAccount = {
        id: 'usr-master',
        email: MASTER_EMAIL,
        nome: 'Ivo - Administrador Master',
        funcao: 'Administrador Master WFS',
        matricula: 'MASTER-01',
        role: 'master',
        status: 'ativo',
        podeGerenciarUsuarios: true,
        criadoEm: new Date().toISOString(),
        ultimoAcesso: new Date().toISOString(),
      };

      const token = await signAuthToken(masterUser, secret);

      return new Response(
        JSON.stringify({
          success: true,
          user: masterUser,
          token,
          isMaster: true,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Outros usuários no KV
    if (!env.WFS_KV) {
      return new Response(
        JSON.stringify({
          error:
            'Armazenamento de usuários não configurado no Cloudflare (vincule o KV namespace "WFS_KV").',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const users = await loadUsers(env);
    const userIndex = users.findIndex((u) => String(u.email || '').toLowerCase() === cleanEmail);

    if (userIndex === -1) {
      await registerFailure(env, rateKey);
      // Mensagem genérica: não revela se o e-mail existe na base
      return new Response(
        JSON.stringify({ error: 'Credenciais inválidas.' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const user = users[userIndex];

    if (user.status === 'bloqueado') {
      return new Response(
        JSON.stringify({
          error: 'Acesso bloqueado. Contate o Administrador Master (ivoaltctrl@gmail.com).',
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const isPasswordValid = await verifyPassword(senha, user.senha);
    if (!isPasswordValid) {
      await registerFailure(env, rateKey);
      return new Response(JSON.stringify({ error: 'Credenciais inválidas.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await clearFailures(env, rateKey);

    // Upgrade transparente: senha em texto puro ou hash antigo (10k iterações)
    // é reescrita no formato atual no primeiro login bem-sucedido.
    if (needsPasswordRehash(user.senha)) {
      user.senha = await hashPassword(senha);
    }

    user.ultimoAcesso = new Date().toISOString();
    users[userIndex] = user;
    await saveUsers(env, users);

    const token = await signAuthToken(user, secret);

    return new Response(
      JSON.stringify({
        success: true,
        user: toSafeUser(user),
        token,
        isMaster: false,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Erro no login: ' + (err.message || err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

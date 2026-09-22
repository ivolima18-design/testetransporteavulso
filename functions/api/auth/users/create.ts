import {
  loadUsers,
  saveUsers,
  checkAuthorizedManager,
  isMasterAuth,
  getAuthenticatedUser,
  hashPassword,
  toSafeUser,
  json,
  kvUnavailable,
  MASTER_EMAIL,
  UserAccount,
  UsersEnv,
} from '../_usersStore';

/**
 * POST /api/auth/users/create — Cadastra um novo usuário
 * Permitido para: Administradores e gestores autorizados via Token criptografado.
 */
export const onRequestPost: PagesFunction<UsersEnv> = async (context) => {
  try {
    const authUser = await getAuthenticatedUser(context.request, context.env);
    if (!checkAuthorizedManager(authUser)) {
      return json(
        { error: 'Acesso negado. Apenas administradores e gestores autorizados podem cadastrar usuários.' },
        403
      );
    }

    const body: any = await context.request.json();
    const { nome, email, senha, funcao, matricula, role, podeGerenciarUsuarios, deveTrocarSenha } = body;

    if (!nome || !email || !senha) {
      return json({ error: 'Nome, e-mail e senha são obrigatórios.' }, 400);
    }

    if (String(senha).length < 4) {
      return json({ error: 'A senha provisória deve ter no mínimo 4 caracteres.' }, 400);
    }

    if (!context.env.WFS_KV) {
      return kvUnavailable();
    }

    const users = await loadUsers(context.env);
    const cleanEmail = String(email).trim().toLowerCase();

    if (users.some((u) => String(u.email || '').toLowerCase() === cleanEmail)) {
      return json({ error: 'Este e-mail já está cadastrado no sistema.' }, 409);
    }

    const isTargetMaster = cleanEmail === MASTER_EMAIL.toLowerCase();

    // Apenas o próprio Master autenticado pode criar ou delegar privilégios
    const isRequesterMaster = isMasterAuth(authUser);
    if (role === 'master' && !isRequesterMaster) {
      return json({ error: 'Apenas o Administrador Master pode criar outros usuários Master.' }, 403);
    }

    // Um gestor de usuários NÃO pode criar administradores nem delegar a
    // permissão de gerenciar usuários — isso é prerrogativa do Master.
    if (!isRequesterMaster && (role === 'admin' || podeGerenciarUsuarios)) {
      return json(
        {
          error:
            'Somente o Administrador Master pode conceder a permissão de gerenciar usuários ou criar administradores. Cadastre o novo acesso como Operador COI ou Operador Moove.',
        },
        403
      );
    }

    if (!isRequesterMaster && isTargetMaster) {
      return json({ error: 'Apenas o Administrador Master pode criar a conta Master.' }, 403);
    }

    const finalRole: UserAccount['role'] = isTargetMaster
      ? 'master'
      : isRequesterMaster
        ? (role || 'coi')
        : role === 'gestor'
          ? 'gestor'
          : 'coi';

    const finalPodeGerenciar = isRequesterMaster
      ? Boolean(podeGerenciarUsuarios) || isTargetMaster
      : false;

    // Hash da senha com PBKDF2
    const hashedPassword = await hashPassword(String(senha));

    const newUser: UserAccount = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      email: cleanEmail,
      senha: hashedPassword,
      nome: String(nome).trim(),
      funcao: funcao ? String(funcao).trim() : 'Operador COI',
      matricula: matricula ? String(matricula).trim() : '',
      role: finalRole,
      status: 'ativo',
      podeGerenciarUsuarios: finalPodeGerenciar,
      deveTrocarSenha: deveTrocarSenha !== false,
      criadoEm: new Date().toISOString(),
    };

    users.push(newUser);
    await saveUsers(context.env, users);

    return json(
      {
        success: true,
        user: toSafeUser(newUser),
        message: `Usuário ${newUser.nome} cadastrado com sucesso!`,
      },
      201
    );
  } catch (err: any) {
    return json({ error: 'Erro ao cadastrar usuário: ' + (err?.message || err) }, 500);
  }
};

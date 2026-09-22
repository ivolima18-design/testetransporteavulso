import {
  loadUsers,
  saveUsers,
  checkAuthorizedManager,
  isMasterAuth,
  getAuthenticatedUser,
  hashPassword,
  json,
  kvUnavailable,
  MASTER_EMAIL,
  UsersEnv,
} from '../_usersStore';

/**
 * POST /api/auth/users/reset-password — Redefine a senha de um usuário
 */
export const onRequestPost: PagesFunction<UsersEnv> = async (context) => {
  try {
    const authUser = await getAuthenticatedUser(context.request, context.env);
    if (!checkAuthorizedManager(authUser)) {
      return json({ error: 'Você não possui permissão para redefinir senhas.' }, 403);
    }

    const body: any = await context.request.json();
    const { targetUserId, newPassword, deveTrocarSenha } = body;

    if (!newPassword || String(newPassword).length < 4) {
      return json({ error: 'A nova senha deve possuir no mínimo 4 caracteres.' }, 400);
    }

    if (!context.env.WFS_KV) {
      return kvUnavailable();
    }

    const users = await loadUsers(context.env);

    const user = users.find(
      (u) =>
        u.id === targetUserId ||
        String(u.email || '').toLowerCase() === String(targetUserId || '').toLowerCase()
    );

    if (!user) {
      return json({ error: 'Usuário não localizado.' }, 404);
    }

    // A senha do Administrador Master só pode ser redefinida pelo próprio Master
    const isTargetMaster =
      user.email.toLowerCase() === MASTER_EMAIL.toLowerCase() || user.role === 'master';
    const isRequesterMaster = isMasterAuth(authUser);
    if (isTargetMaster && !isRequesterMaster) {
      return json(
        { error: 'Apenas o Administrador Master pode redefinir as credenciais da conta Master.' },
        403
      );
    }

    // Gestor de usuários só redefine senha de operadores
    if (!isRequesterMaster && (user.role === 'admin' || user.podeGerenciarUsuarios)) {
      return json(
        { error: 'Apenas o Administrador Master pode redefinir a senha de contas com permissão de gerenciar usuários.' },
        403
      );
    }

    user.senha = await hashPassword(String(newPassword));
    user.deveTrocarSenha = deveTrocarSenha !== false;
    await saveUsers(context.env, users);

    return json({
      success: true,
      message: `Senha do usuário ${user.nome} (${user.email}) redefinida com sucesso!`,
    });
  } catch (err: any) {
    return json({ error: 'Erro ao redefinir senha: ' + (err?.message || err) }, 500);
  }
};

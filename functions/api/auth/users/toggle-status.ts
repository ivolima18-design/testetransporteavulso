import {
  loadUsers,
  saveUsers,
  checkAuthorizedManager,
  isMasterAuth,
  getAuthenticatedUser,
  json,
  kvUnavailable,
  MASTER_EMAIL,
  UsersEnv,
} from '../_usersStore';

/**
 * POST /api/auth/users/toggle-status — Ativa ou inativa (bloqueia) um usuário
 */
export const onRequestPost: PagesFunction<UsersEnv> = async (context) => {
  try {
    const authUser = await getAuthenticatedUser(context.request, context.env);
    if (!checkAuthorizedManager(authUser)) {
      return json(
        { error: 'Você não possui permissão para alterar o status de acesso de outros usuários.' },
        403
      );
    }

    const body: any = await context.request.json();
    const { targetUserId } = body;

    if (!context.env.WFS_KV) {
      return kvUnavailable();
    }

    const users = await loadUsers(context.env);
    const user = users.find((u) => u.id === targetUserId);

    if (!user) {
      return json({ error: 'Usuário não localizado.' }, 404);
    }

    if (String(user.email || '').toLowerCase() === MASTER_EMAIL.toLowerCase() || user.role === 'master') {
      return json({ error: 'Não é permitido inativar ou alterar o status da conta Master.' }, 403);
    }

    // Gestor de usuários só administra operadores; contas com poder de gestão
    // só podem ser alteradas pelo Administrador Master.
    if (!isMasterAuth(authUser) && (user.role === 'admin' || user.podeGerenciarUsuarios)) {
      return json(
        { error: 'Apenas o Administrador Master pode alterar contas com permissão de gerenciar usuários.' },
        403
      );
    }

    // Usuário comum não pode inativar a si mesmo
    if (authUser?.sub === user.id) {
      return json({ error: 'Você não pode inativar o seu próprio usuário.' }, 400);
    }

    user.status = user.status === 'ativo' ? 'bloqueado' : 'ativo';
    await saveUsers(context.env, users);

    return json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        status: user.status,
      },
      message: `Status do usuário ${user.email} atualizado para ${user.status.toUpperCase()}.`,
    });
  } catch (err: any) {
    return json({ error: 'Erro ao alterar status: ' + (err?.message || err) }, 500);
  }
};

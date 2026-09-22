import {
  loadUsers,
  saveUsers,
  isMasterAuth,
  masterOnlyDenied,
  getAuthenticatedUser,
  json,
  kvUnavailable,
  MASTER_EMAIL,
  UsersEnv,
} from '../_usersStore';

/**
 * DELETE /api/auth/users/:id — Exclui um usuário do sistema
 * EXCLUSIVO DO ADMINISTRADOR MASTER. Gestores de usuários podem cadastrar,
 * ativar/inativar e redefinir senha de operadores, mas não excluir contas.
 */
export const onRequestDelete: PagesFunction<UsersEnv> = async (context) => {
  try {
    const authUser = await getAuthenticatedUser(context.request, context.env);
    if (!isMasterAuth(authUser)) {
      return masterOnlyDenied('excluir contas de usuário');
    }

    const id = String(context.params.id || '');
    if (!id) {
      return json({ error: 'Identificador de usuário não fornecido.' }, 400);
    }

    if (!context.env.WFS_KV) {
      return kvUnavailable();
    }

    const users = await loadUsers(context.env);
    const targetUser = users.find((u) => u.id === id);

    if (!targetUser) {
      return json({ error: 'Usuário não encontrado.' }, 404);
    }

    if (
      String(targetUser.email || '').toLowerCase() === MASTER_EMAIL.toLowerCase() ||
      targetUser.role === 'master'
    ) {
      return json({ error: 'A conta Master não pode ser excluída.' }, 403);
    }

    // Não permitir que um usuário se auto-exclua
    if (authUser?.sub === targetUser.id) {
      return json({ error: 'Você não pode excluir sua própria conta.' }, 400);
    }

    await saveUsers(
      context.env,
      users.filter((u) => u.id !== id)
    );

    return json({ success: true, message: `Usuário ${targetUser.email} removido com sucesso.` });
  } catch (err: any) {
    return json({ error: 'Erro ao excluir usuário: ' + (err?.message || err) }, 500);
  }
};

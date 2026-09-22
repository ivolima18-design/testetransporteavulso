import {
  loadUsers,
  toSafeUser,
  json,
  checkAuthorizedManager,
  getAuthenticatedUser,
  UsersEnv,
} from './_usersStore';

/**
 * GET /api/auth/users — Lista todos os usuários cadastrados (sem senhas)
 * Restrito para Administradores e Gestores autorizados.
 */
export const onRequestGet: PagesFunction<UsersEnv> = async (context) => {
  const authUser = await getAuthenticatedUser(context.request, context.env);
  if (!checkAuthorizedManager(authUser)) {
    return json(
      { error: 'Acesso não autorizado. Faça login com credenciais de gestor para acessar a lista de usuários.' },
      401
    );
  }

  const users = await loadUsers(context.env);
  return json(users.map(toSafeUser));
};


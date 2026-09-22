import {
  loadUsers,
  saveUsers,
  toSafeUser,
  json,
  kvUnavailable,
  getAuthenticatedUser,
  verifyPassword,
  hashPassword,
  signAuthToken,
  getSystemSecret,
  MASTER_EMAIL,
  UsersEnv,
} from './_usersStore';

/**
 * POST /api/auth/change-password — Permite ao usuário trocar sua própria senha
 * (voluntariamente ou de forma obrigatória no primeiro acesso).
 */
export const onRequestPost: PagesFunction<UsersEnv> = async (context) => {
  try {
    const body: any = await context.request.json();
    const { email, currentPassword, newPassword } = body;

    if (!newPassword || String(newPassword).length < 4) {
      return json({ error: 'A nova senha deve possuir no mínimo 4 caracteres.' }, 400);
    }

    if (!email) {
      return json({ error: 'E-mail do usuário é obrigatório.' }, 400);
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const users = await loadUsers(context.env);
    const userIndex = users.findIndex((u) => String(u.email || '').toLowerCase() === cleanEmail);

    if (userIndex === -1) {
      return json({ error: 'Usuário não localizado no sistema.' }, 404);
    }

    const user = users[userIndex];

    // Checagem de token se o usuário já estiver logado
    const authUser = await getAuthenticatedUser(context.request, context.env);
    if (authUser) {
      const isSelf = authUser.email.toLowerCase() === cleanEmail;
      const isMaster = authUser.email.toLowerCase() === MASTER_EMAIL.toLowerCase();
      if (!isSelf && !isMaster) {
        return json({ error: 'Você não tem permissão para alterar a senha de outro usuário.' }, 403);
      }
    }

    // Se informou a senha atual/temporária, valida
    if (currentPassword) {
      const isCurrentValid = await verifyPassword(String(currentPassword), user.senha);
      if (!isCurrentValid) {
        return json(
          {
            error: user.deveTrocarSenha
              ? 'A senha temporária atual informada está incorreta.'
              : 'Senha atual incorreta.',
          },
          401
        );
      }
    } else {
      // Se não informou a senha atual, só é permitido pular a verificação
      // quando a requisição já vem com um token válido (login prévio provou
      // que o solicitante conhece as credenciais). "deveTrocarSenha" sozinho
      // NUNCA autoriza a troca — do contrário, qualquer pessoa que soubesse
      // apenas o e-mail de um usuário recém-criado (sem saber a senha
      // temporária) poderia sequestrar a conta antes do primeiro login.
      const canBypassCurrent = Boolean(authUser);
      if (!canBypassCurrent) {
        return json(
          {
            error: 'A senha atual é obrigatória para realizar a troca.',
          },
          400
        );
      }
    }

    // Criptografa a nova senha com PBKDF2 (SHA-256 + salt de 16 bytes)
    user.senha = await hashPassword(String(newPassword));
    user.deveTrocarSenha = false;
    user.ultimoAcesso = new Date().toISOString();

    users[userIndex] = user;

    if (context.env.WFS_KV) {
      await saveUsers(context.env, users);
    }

    const secret = getSystemSecret(context.env);
    const newToken = await signAuthToken(user, secret);

    return json({
      success: true,
      user: toSafeUser(user),
      token: newToken,
      message: 'Senha atualizada com sucesso!',
    });
  } catch (err: any) {
    return json({ error: 'Erro ao alterar senha: ' + (err?.message || err) }, 500);
  }
};

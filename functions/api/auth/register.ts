/**
 * =========================================================================
 * WFS - Auto-cadastro DESATIVADO
 * =========================================================================
 * Novos usuários só podem ser criados por pessoas autorizadas, através de
 * Configurações > Gestão de Usuários & Acessos (POST /api/auth/users/create),
 * que valida a permissão de quem está cadastrando.
 * =========================================================================
 */

export const onRequestPost: PagesFunction = async () => {
  return new Response(
    JSON.stringify({
      error:
        'O auto-cadastro está desativado. Novos acessos são criados apenas por usuários autorizados do sistema.',
    }),
    { status: 403, headers: { 'Content-Type': 'application/json' } }
  );
};

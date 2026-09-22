/**
 * =========================================================================
 * WFS - Janela de bloqueio de novos lançamentos (Sistema de Transporte Avulso)
 * =========================================================================
 * Regra operacional: nenhuma NOVA solicitação (POST /api/requests) pode ser
 * registrada entre 00:01 e 04:59, horário de Brasília. O sistema reabre
 * automaticamente às 05:00, sem necessidade de configuração manual.
 *
 * Esta checagem é feita aqui no servidor (não só no front-end) para que a
 * regra valha mesmo se alguém chamar a API diretamente, sem passar pela
 * tela do formulário.
 * =========================================================================
 */

// 00:01 em minutos desde a meia-noite
export const LOCK_WINDOW_START_MINUTES = 1;
// 04:59 em minutos desde a meia-noite (limite inclusivo — libera às 05:00)
export const LOCK_WINDOW_END_MINUTES = 4 * 60 + 59;

export const SYSTEM_LOCK_MESSAGE =
  'O sistema está fechado para lançamentos, por está fora do horário padrão de lançamento. Será reaberto às 05:00am.';

/**
 * Retorna a hora atual em Brasília (America/Sao_Paulo) como minutos desde
 * a meia-noite (0–1439), independente do fuso horário do servidor/edge.
 */
export function getSaoPauloMinutesOfDay(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');

  // Alguns runtimes retornam "24" para meia-noite com hour12:false; normaliza.
  return (hour % 24) * 60 + minute;
}

/** true entre 00:01 e 04:59 (horário de Brasília); false no restante do dia. */
export function isWithinLockWindow(date: Date = new Date()): boolean {
  const minutes = getSaoPauloMinutesOfDay(date);
  return minutes >= LOCK_WINDOW_START_MINUTES && minutes <= LOCK_WINDOW_END_MINUTES;
}

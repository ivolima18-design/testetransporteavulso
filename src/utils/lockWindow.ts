/**
 * Janela de bloqueio de novos lançamentos: 00:01 às 04:59 (reabre às 05:00).
 * Usa o horário local do dispositivo, mesma convenção já adotada na regra
 * de antecedência mínima deste formulário (ver UberRequestForm.tsx).
 * A checagem definitiva (que não pode ser contornada) acontece no servidor,
 * em functions/api/_lib/timeLock.ts — isto aqui é só para a experiência
 * visual, evitando que a pessoa preencha o formulário todo pra depois levar
 * um erro no envio.
 */

export const SYSTEM_LOCK_MESSAGE =
  'O sistema está fechado para lançamentos, por está fora do horário padrão de lançamento. Será reaberto às 05:00am.';

const LOCK_WINDOW_START_MINUTES = 1; // 00:01
const LOCK_WINDOW_END_MINUTES = 4 * 60 + 59; // 04:59

export function isSystemLocked(date: Date = new Date()): boolean {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= LOCK_WINDOW_START_MINUTES && minutes <= LOCK_WINDOW_END_MINUTES;
}

/**
 * =========================================================================
 * WFS - Exportação em Excel (.xlsx) — gerada a partir dos dados do sistema
 * =========================================================================
 * GET /api/export/excel
 *
 * Antes, este endpoint baixava a planilha diretamente do Google Sheets pelo
 * endpoint público de exportação, o que exigia deixar a planilha
 * compartilhada como "Qualquer pessoa com o link — Leitor" (expondo todos
 * os dados pessoais das solicitações a qualquer pessoa que soubesse o ID
 * da planilha, sem precisar de login).
 *
 * Agora o arquivo .xlsx é gerado aqui mesmo, a partir dos registros já
 * salvos no KV (a mesma fonte usada por GET /api/requests), então a
 * planilha do Google pode voltar a ficar privada. O endpoint também passou
 * a exigir autenticação de gestor/administrador, assim como a listagem.
 * =========================================================================
 */

import {
  checkOperatorAccess,
  getAuthenticatedUser,
  UsersEnv,
} from '../auth/_usersStore';
import { buildXlsxBytes } from '../_lib/xlsx';

interface Env extends UsersEnv {
  GOOGLE_SHEETS_ID?: string;
}

interface UberRequest {
  dataEvento?: string;
  horarioInicioEvento?: string;
  horarioTerminoEvento?: string;
  nomeEvento?: string;
  nome?: string;
  sobrenome?: string;
  telefone?: string;
  enderecoBase?: string;
  enderecoEvento?: string;
  viagemIda?: string;
  viagemVolta?: string;
}

const SHEETS_EXPORT_COLUMNS = [
  'Data do evento',
  'Horário de início do evento',
  'Horário de término do evento',
  'Nome do evento',
  'Nome',
  'Sobrenome',
  'Número de telefone',
  'Endereço base',
  'Endereço do evento',
  'Viagem de ida necessária',
  'Viagem de volta necessária',
];

function formatYesNo(val?: string): string {
  if (!val) return 'N';
  const upper = String(val).trim().toUpperCase();
  return upper === 'SIM' || upper === 'Y' || upper === 'YES' ? 'Y' : 'N';
}

function formatPhone(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits || phone;
}

function formatTimeToAmPm(timeStr?: string): string {
  if (!timeStr) return '';
  const trimmed = String(timeStr).trim();
  if (!trimmed) return '';
  if (/AM|PM/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return `${hours}:${minutes} ${period}`;
  }
  return trimmed;
}

function formatDateToIso(dateStr?: string): string {
  if (!dateStr) return '';
  const trimmed = String(dateStr).trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const matchBr = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (matchBr) {
    const [, day, month, year] = matchBr;
    return `${year}-${month}-${day}`;
  }
  return trimmed;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const env = context.env;

  const authUser = await getAuthenticatedUser(context.request, env);
  // Rotina operacional: operadores COI/Moove precisam exportar os pedidos
  if (!checkOperatorAccess(authUser)) {
    return new Response(
      JSON.stringify({
        error: 'Acesso não autorizado. Faça login com um usuário do sistema para exportar as solicitações.',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    let requests: UberRequest[] = [];
    if (env.WFS_KV) {
      const stored = await env.WFS_KV.get('REQUESTS_LIST');
      if (stored) requests = JSON.parse(stored);
    }

    const rows: (string | number)[][] = [
      SHEETS_EXPORT_COLUMNS,
      ...requests.map((r) => [
        formatDateToIso(r.dataEvento),
        formatTimeToAmPm(r.horarioInicioEvento),
        formatTimeToAmPm(r.horarioTerminoEvento),
        r.nomeEvento || '',
        r.nome || '',
        r.sobrenome || '',
        formatPhone(r.telefone),
        r.enderecoBase || '',
        r.enderecoEvento || '',
        formatYesNo(r.viagemIda),
        formatYesNo(r.viagemVolta),
      ]),
    ];

    const xlsxBytes = buildXlsxBytes(rows, 'Solicitações');
    const fileName = `WFS_Transporte_Avulso_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new Response(xlsxBytes, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: 'Erro ao gerar a exportação em Excel: ' + (err?.message || err),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

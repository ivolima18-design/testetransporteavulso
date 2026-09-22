import { UberRequest } from '../types';
import { buildXlsxBlob, downloadBlob } from './excelExport';

/**
 * Cabeçalhos OFICIAIS EXATOS da planilha de transporte (idênticos à imagem do sistema):
 * Col A: Data do evento
 * Col B: Horário de início do evento
 * Col C: Horário de término do evento
 * Col D: Nome do evento
 * Col E: Nome
 * Col F: Sobrenome
 * Col G: Número de telefone
 * Col H: Endereço base
 * Col I: Endereço do evento
 * Col J: Viagem de ida necessária
 * Col K: Viagem de volta necessária
 */
export const SHEETS_OFFICIAL_HEADERS = [
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

/**
 * Converte data para o formato ISO YYYY-MM-DD (ex: "2026-09-14") conforme exibido na imagem padrão:
 * Se vier "14/09/2026", converte para "2026-09-14". Se já for "2026-09-14", preserva.
 */
export function formatDateToIso(dateStr?: string): string {
  if (!dateStr) return '';
  const trimmed = String(dateStr).trim();
  if (!trimmed) return '';

  // Se já for YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Se for DD/MM/YYYY
  const matchBr = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (matchBr) {
    const [, day, month, year] = matchBr;
    return `${year}-${month}-${day}`;
  }

  return trimmed;
}

/**
 * Converte horário para formato 12h AM/PM (ex: "06:00" -> "6:00 AM", "22:00" -> "10:00 PM")
 * Se já estiver com AM/PM ou vazio, preserva.
 */
export function formatTimeToAmPm(timeStr?: string): string {
  if (!timeStr) return '';
  const trimmed = String(timeStr).trim();
  if (!trimmed) return '';

  // Se já contém AM ou PM
  if (/AM|PM/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  // Se estiver no formato HH:MM ou H:MM
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12; // 00:00 -> 12:00 AM, 12:00 -> 12:00 PM
    return `${hours}:${minutes} ${period}`;
  }

  return trimmed;
}

/**
 * Formatação de 'Y' ou 'n' para as colunas J e K (conforme padrão visto na imagem)
 */
function formatYesNo(val?: string): string {
  if (!val) return 'n';
  const upper = String(val).trim().toUpperCase();
  return upper === 'SIM' || upper === 'Y' || upper === 'YES' ? 'Y' : 'n';
}

/**
 * Formatação do telefone como string de texto com 55 (ex: "55981589327")
 * Mantém como texto puro no Excel para evitar notação científica (ex: 5,51191E+12)
 */
function formatPhone(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits || phone;
}

/**
 * Mapeia o registro da solicitação para a linha EXATA da planilha conforme a imagem modelo:
 * - Col A (Data do evento): YYYY-MM-DD (ex: 2026-09-14)
 * - Col B (Horário início): AM/PM (ex: 6:00 AM)
 * - Col C (Horário término): AM/PM (ex: 10:00 PM)
 * - Col D (Nome evento): texto (ex: Escala Quarta)
 * - Col E (Nome): texto (ex: Susie)
 * - Col F (Sobrenome): texto (ex: Garcia)
 * - Col G (Número telefone): texto com DDI (ex: 55981589327)
 * - Col H (Endereço base): texto (ex: R. Brg. Galvão, 153...)
 * - Col I (Endereço evento): texto (ex: Av. Francisco Matarazzo, 2000...)
 * - Col J (Viagem de ida): Y / n
 * - Col K (Viagem de volta): Y / n
 */
function mapRequestToOfficialRow(r: UberRequest): (string | number)[] {
  return [
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
  ];
}

/**
 * 1. Exportação em formato Excel (.xlsx) com as 11 colunas oficiais no padrão exato da imagem
 */
export function exportToExcel(requests: UberRequest[], customFilename?: string): void {
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = customFilename || `WFS_Transporte_Avulso_${dateStr}.xlsx`;

  const rows: (string | number)[][] = [
    SHEETS_OFFICIAL_HEADERS,
    ...requests.map(mapRequestToOfficialRow),
  ];

  const blob = buildXlsxBlob(rows, 'Solicitações');
  downloadBlob(blob, filename);
}

/**
 * 2. Exportação em formato CSV (.csv) com as 11 colunas oficiais no padrão exato da imagem
 */
export function exportToCsv(requests: UberRequest[], customFilename?: string): void {
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = customFilename || `WFS_Transporte_Avulso_${dateStr}.csv`;

  // CSV para importação na plataforma, seguindo exatamente a planilha modelo dela:
  // - separador vírgula (,)
  // - data no padrão YYYY-MM-DD (ex.: 2026-09-18), horários em AM/PM
  // - telefone só com dígitos (ex.: 5511969836816)
  // - viagem de ida/volta em Y ou N (maiúsculas)
  // - sem formatação forçada (="valor") e sem aspas desnecessárias
  // - UTF-8 sem BOM (o modelo da plataforma também não usa)
  const toYN = (v: string | number) => (String(v).toUpperCase() === 'Y' ? 'Y' : 'N');
  const rows = [
    SHEETS_OFFICIAL_HEADERS,
    ...requests.map((r) => {
      const row = mapRequestToOfficialRow(r);
      row[9] = toYN(row[9]);
      row[10] = toYN(row[10]);
      return row;
    }),
  ];

  // Quebras de linha dentro de um campo (comuns em "Nome do evento") viram espaço:
  // o importador da plataforma lê o arquivo linha a linha e uma quebra no meio do
  // campo parte a linha em duas, gerando "index out of range".
  // Aspas só quando o campo contém vírgula ou aspas (ex.: "Rua X, nº 10").
  const escapeCsvCell = (cell: string | number): string => {
    const str = String(cell ?? '').replace(/[\r\n\t]+/g, ' ').trim();
    if (/[,"]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvContent = rows
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

/**
 * 3. Exportação em formato PDF (.pdf) com as 11 colunas oficiais no padrão exato da imagem
 */
export async function exportToPdf(requests: UberRequest[], customFilename?: string): Promise<void> {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = ((autoTableModule as any).default || autoTableModule) as (doc: any, options: any) => void;

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = customFilename || `WFS_Transporte_Avulso_${dateStr}.pdf`;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Cabeçalho institucional do documento PDF
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('Relatório Oficial de Transporte Avulso - WFS', 14, 15);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')} • Total de solicitações: ${requests.length}`,
    14,
    21
  );

  const head = [SHEETS_OFFICIAL_HEADERS];
  const body = requests.map(mapRequestToOfficialRow);

  autoTable(doc, {
    head: head,
    body: body,
    startY: 25,
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    theme: 'grid',
  });

  doc.save(filename);
}


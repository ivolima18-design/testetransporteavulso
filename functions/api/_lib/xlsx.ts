/**
 * =========================================================================
 * WFS - Gerador de arquivos Excel (.xlsx) — versão server-side (Functions)
 * =========================================================================
 * Porta da mesma implementação usada no frontend (src/utils/excelExport.ts),
 * sem nenhuma dependência de DOM/browser (não usa document, URL, etc.),
 * para poder rodar dentro de uma Cloudflare Pages Function.
 *
 * Configurado com estilo numérico 's="2"' (numFmtId="49" -> formato @ Texto Puro)
 * para travar expressamente datas e telefones como texto, impedindo que o
 * Excel converta datas para regionalizações automáticas ou números de telefone
 * para notação científica (ex: 5,51E+12).
 * =========================================================================
 */

export type CellValue = string | number | null | undefined;

let CRC_TABLE: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  CRC_TABLE = table;
  return table;
}

function crc32(data: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function writeUint16(arr: number[], value: number) {
  arr.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(arr: number[], value: number) {
  arr.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function buildZip(entries: ZipEntry[]): Uint8Array {
  const localParts: number[][] = [];
  const centralParts: number[][] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encodeText(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local: number[] = [];
    writeUint32(local, 0x04034b50);
    writeUint16(local, 20);
    writeUint16(local, 0x0800);
    writeUint16(local, 0);
    writeUint16(local, 0);
    writeUint16(local, 0);
    writeUint32(local, crc);
    writeUint32(local, size);
    writeUint32(local, size);
    writeUint16(local, nameBytes.length);
    writeUint16(local, 0);
    for (let i = 0; i < nameBytes.length; i++) local.push(nameBytes[i]);
    for (let i = 0; i < entry.data.length; i++) local.push(entry.data[i]);
    localParts.push(local);

    const central: number[] = [];
    writeUint32(central, 0x02014b50);
    writeUint16(central, 20);
    writeUint16(central, 20);
    writeUint16(central, 0x0800);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint32(central, crc);
    writeUint32(central, size);
    writeUint32(central, size);
    writeUint16(central, nameBytes.length);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint32(central, 0);
    writeUint32(central, offset);
    for (let i = 0; i < nameBytes.length; i++) central.push(nameBytes[i]);
    centralParts.push(central);

    offset += local.length;
  }

  const centralOffset = offset;
  let centralSize = 0;
  for (const p of centralParts) centralSize += p.length;

  const endRecord: number[] = [];
  writeUint32(endRecord, 0x06054b50);
  writeUint16(endRecord, 0);
  writeUint16(endRecord, 0);
  writeUint16(endRecord, entries.length);
  writeUint16(endRecord, entries.length);
  writeUint32(endRecord, centralSize);
  writeUint32(endRecord, centralOffset);
  writeUint16(endRecord, 0);

  const totalSize = offset + centralSize + endRecord.length;
  const result = new Uint8Array(totalSize);
  let ptr = 0;

  for (const part of localParts) {
    result.set(part, ptr);
    ptr += part.length;
  }
  for (const part of centralParts) {
    result.set(part, ptr);
    ptr += part.length;
  }
  result.set(endRecord, ptr);

  return result;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnLetter(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const rest = (n - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function sanitizeSheetName(name: string): string {
  const clean = (name || 'Planilha1').replace(/[\\/?*[\]:]/g, ' ').trim();
  return clean.substring(0, 31) || 'Planilha1';
}

/**
 * Gera os bytes de um .xlsx a partir de uma matriz de linhas.
 * - Linha 0 (cabeçalho): s="1" (fundo vermelho institucional WFS, texto branco, negrito)
 * - Demais linhas (dados): s="2" (estilo numFmtId="49" -> formato @ Texto Puro explícito)
 */
export function buildXlsxBytes(rows: CellValue[][], sheetName = 'Solicitações'): Uint8Array {
  const safeSheetName = sanitizeSheetName(sheetName);

  const rowsXml = rows
    .map((row, rowIndex) => {
      const isHeader = rowIndex === 0;
      const defaultStyle = isHeader ? ' s="1"' : ' s="2"';

      const cells = row
        .map((value, colIndex) => {
          const ref = `${columnLetter(colIndex)}${rowIndex + 1}`;

          if (value === null || value === undefined || value === '') {
            return `<c r="${ref}"${defaultStyle}/>`;
          }

          if (typeof value === 'number' && Number.isFinite(value) && !isHeader) {
            return `<c r="${ref}" s="0"><v>${value}</v></c>`;
          }

          return `<c r="${ref}"${defaultStyle} t="inlineStr"><is><t xml:space="preserve">${escapeXml(
            String(value)
          )}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');

  const columnsCount = rows.reduce((max, row) => Math.max(max, row.length), 1);
  const colsXml = `<cols><col min="1" max="${columnsCount}" width="26" customWidth="1"/></cols>`;

  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    colsXml +
    `<sheetData>${rowsXml}</sheetData>` +
    `</worksheet>`;

  const workbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${escapeXml(safeSheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  // Estilo 0 = geral padrão
  // Estilo 1 = cabeçalho vermelho institucional WFS (negrito, fundo vermelho, texto branco)
  // Estilo 2 = formato "@" (Texto Puro / numFmtId="49"), força o Excel a não interpretar como data regional nem número
  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2">` +
    `<font><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
    `</fonts>` +
    `<fills count="3">` +
    `<fill><patternFill patternType="none"/></fill>` +
    `<fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFE31837"/><bgColor indexed="64"/></patternFill></fill>` +
    `</fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="3">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
    `<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  return buildZip([
    { name: '[Content_Types].xml', data: encodeText(contentTypes) },
    { name: '_rels/.rels', data: encodeText(rootRels) },
    { name: 'xl/workbook.xml', data: encodeText(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: encodeText(workbookRels) },
    { name: 'xl/styles.xml', data: encodeText(stylesXml) },
    { name: 'xl/worksheets/sheet1.xml', data: encodeText(sheetXml) },
  ]);
}

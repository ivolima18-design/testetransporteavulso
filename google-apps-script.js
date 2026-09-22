/**
 * =========================================================================
 * WFS - SISTEMA DE SOLICITAÇÃO DE TRANSPORTE AVULSO - SCRIPT OFICIAL DO GOOGLE SHEETS
 * Planilha de Produção: 1kyCEVV5pNQS0bqnOCzVcCPF-yVh6fRqqQOOfLqDLhYM
 * =========================================================================
 * ℹ️ SOBRE AS VARIÁVEIS / PROPRIEDADES DO SCRIPT:
 * - Você NÃO precisa preencher nada em "Propriedades do script" no menu Configurações!
 * - O ID da planilha (SPREADSHEET_ID) já está definido diretamente abaixo.
 * - As variáveis de ambiente como GOOGLE_SHEETS_WEBHOOK_URL pertencem ao Cloudflare/servidor
 *   do sistema web, onde você apenas cola a URL gerada por este script.
 *
 * PRIMEIRA IMPLANTAÇÃO (script novo, ainda sem URL gerada):
 * 1. Abra a planilha oficial no Google Sheets.
 * 2. No menu superior, clique em "Extensões" > "Apps Script".
 * 3. Cole este código completo substituindo qualquer texto existente no editor (Código.gs).
 * 4. Preencha WEBHOOK_SECRET logo abaixo com um valor longo e aleatório (veja o
 *    bloco de comentários dele para detalhes) — obrigatório em produção.
 * 5. Clique em "Implantar" (Deploy) > "Nova implantação" (New deployment).
 *    - Tipo: Selecione "App da Web" (Web app).
 *    - Executar como: "Eu" (seu e-mail corporativo).
 *    - Quem tem acesso: "Qualquer pessoa" (Anyone) -> obrigatório para o Cloudflare
 *      conseguir chamar o script; é exatamente por isso que o WEBHOOK_SECRET existe.
 * 6. Copie a URL do Web App gerada (termina com /exec) e cole no Cloudflare
 *    (GOOGLE_SHEETS_WEBHOOK_URL) e o mesmo segredo do passo 4 em
 *    GOOGLE_SHEETS_WEBHOOK_SECRET.
 *
 * ATUALIZANDO UM SCRIPT JÁ IMPLANTADO (ex: para ligar o WEBHOOK_SECRET):
 * 1. Cole o código atualizado no editor, substituindo o conteúdo de Código.gs.
 * 2. Clique em "Implantar" > "Gerenciar implantações".
 * 3. Na implantação ATIVA (a que está em uso), clique no ícone de lápis (editar).
 * 4. Em "Versão", selecione "Nova versão" e clique em "Implantar".
 *    -> Isso atualiza o código SEM trocar a URL /exec: o Cloudflare continua
 *       apontando para o mesmo endereço, nada precisa mudar em Configurações.
 *    -> NÃO use "Nova implantação" para uma atualização: isso geraria uma
 *       URL /exec diferente e quebraria a sincronização até você trocar a
 *       URL salva no Cloudflare.
 * =========================================================================
 */

// ID fornecido oficialmente pela WFS:
const SPREADSHEET_ID = '1kyCEVV5pNQS0bqnOCzVcCPF-yVh6fRqqQOOfLqDLhYM';
const SHEET_NAME = 'Solicitações';

/**
 * =========================================================================
 * SEGREDO COMPARTILHADO (obrigatório)
 * =========================================================================
 * A implantação deste Web App precisa ficar como "Qualquer pessoa" para o
 * Cloudflare conseguir chamá-la — mas isso também significa que QUALQUER
 * pessoa que descobrir esta URL (por um log, print de tela, histórico do
 * navegador) consegue ler ou apagar todos os dados pessoais da planilha
 * sem precisar fazer login no sistema.
 *
 * Este segredo é a única proteção contra isso: toda chamada (GET ou POST)
 * precisa enviar o mesmo valor que está aqui, em WEBHOOK_SECRET.
 *
 * Como configurar:
 * 1. Gere um valor longo e aleatório (ex: em outra aba, no console do
 *    navegador: crypto.randomUUID() + crypto.randomUUID()).
 * 2. Cole esse valor abaixo, substituindo o texto entre aspas.
 * 3. Configure o MESMO valor no Cloudflare Pages como variável secreta
 *    GOOGLE_SHEETS_WEBHOOK_SECRET (Settings > Variables and Secrets, ou
 *    `npx wrangler pages secret put GOOGLE_SHEETS_WEBHOOK_SECRET`).
 * 4. Reimplante este script (veja o passo 7 mais abaixo).
 *
 * Enquanto o valor abaixo estiver vazio, a checagem fica DESATIVADA (modo
 * de compatibilidade, para não quebrar quem ainda não configurou o
 * segredo no Cloudflare) — mas em produção ele DEVE ser preenchido.
 * =========================================================================
 */
const WEBHOOK_SECRET = '';

function getEffectiveWebhookSecret() {
  if (WEBHOOK_SECRET && WEBHOOK_SECRET.trim()) {
    return WEBHOOK_SECRET.trim();
  }
  try {
    const prop = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    if (prop && prop.trim()) {
      return prop.trim();
    }
  } catch (e) {
    Logger.log('[WFS Webhook] Erro ao ler ScriptProperties: ' + e);
  }
  return '';
}

function isRequestAuthorized(data) {
  const secret = getEffectiveWebhookSecret();
  if (!secret) {
    Logger.log('[WFS Webhook] WEBHOOK_SECRET não configurado no script nem nas Propriedades do Script. Modo permissivo ativo.');
    return true; // Modo de compatibilidade — ver aviso acima
  }
  const provided = String(data.webhookSecret || '').trim();
  const authorized = provided === secret;
  if (!authorized) {
    Logger.log('[WFS Webhook] Acesso negado: segredo informado (' + provided.slice(0, 4) + '...) não confere com WEBHOOK_SECRET.');
  }
  return authorized;
}

function unauthorizedResponse() {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'error',
    message: 'Não autorizado: webhookSecret ausente ou incorreto.'
  })).setMimeType(ContentService.MimeType.JSON);
}

// Cabeçalhos oficiais completos (21 colunas, com dados do Responsável):
// Posições 2-5 cobrem as 4 informações de horário exigidas hoje:
//  2. Solicitação (Entrada/Saída)
//  3. Horário de início do evento  -> só preenchido quando Solicitação = "Entrada"
//  4. Horário de término do evento -> só preenchido quando Solicitação = "Saída"
//  5. Horário do Transporte        -> horário único informado no formulário
const COLUMNS_COM_RESPONSAVEL = [
  'Data do evento',
  'Solicitação',
  'Horário de início do evento',
  'Horário de término do evento',
  'Horário do Transporte',
  'Nome do evento',
  'Nome',
  'Sobrenome',
  'Número de telefone',
  'Endereço base',
  'Endereço do evento',
  'Viagem de ida necessária',
  'Viagem de volta necessária',
  'Responsável pela Solicitação',
  'Função do Responsável',
  'Matrícula do Responsável',
  'Status',
  'Protocolo',
  'Voucher Uber / Observações',
  'Aprovado por',
  'Data de Registro'
];

// Cabeçalhos simplificados (18 colunas, sem dados do Responsável):
const COLUMNS_SIMPLES = [
  'Data do evento',
  'Solicitação',
  'Horário de início do evento',
  'Horário de término do evento',
  'Horário do Transporte',
  'Nome do evento',
  'Nome',
  'Sobrenome',
  'Número de telefone',
  'Endereço base',
  'Endereço do evento',
  'Viagem de ida necessária',
  'Viagem de volta necessária',
  'Status',
  'Protocolo',
  'Voucher Uber / Observações',
  'Aprovado por',
  'Data de Registro'
];

/**
 * Obtém ou cria a aba na planilha configurada
 */
function getOrCreateSheet() {
  let ss;
  try {
    if (SPREADSHEET_ID) {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    }
  } catch (e) {
    Logger.log('Aviso ao abrir pelo ID, tentando planilha ativa: ' + e);
  }

  if (!ss) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }

  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    const activeSheets = ss.getSheets();
    if (activeSheets.length === 1 && activeSheets[0].getLastRow() === 0) {
      sheet = activeSheets[0];
      sheet.setName(SHEET_NAME);
    } else {
      sheet = ss.insertSheet(SHEET_NAME);
    }
  }

  // Cria os cabeçalhos se a planilha estiver em branco (usa 21 colunas por padrão)
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS_COM_RESPONSAVEL);
    const headerRange = sheet.getRange(1, 1, 1, COLUMNS_COM_RESPONSAVEL.length);
    headerRange.setBackground('#E31837'); // Vermelho institucional WFS
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');
    headerRange.setFontFamily('Arial');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, COLUMNS_COM_RESPONSAVEL.length);
  }

  return sheet;
}

/**
 * Normaliza strings para comparação de cabeçalhos sem acento
 */
function normalizeHeaderName(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Normalizações para identificar duplicidades na planilha:
 * Mesma Data, Horário do Transporte, Nome Completo, Telefone e Endereço.
 */
function normalizeDigits(s) {
  if (!s) return '';
  return String(s).replace(/\D/g, '');
}

function normalizeTime(s) {
  if (!s) return '';
  if (s instanceof Date) {
    const h = ('0' + s.getHours()).slice(-2);
    const m = ('0' + s.getMinutes()).slice(-2);
    return h + ':' + m;
  }
  const match = String(s).match(/\b\d{1,2}:\d{2}\b/);
  if (match) {
    const parts = match[0].split(':');
    return ('0' + parts[0]).slice(-2) + ':' + parts[1];
  }
  return String(s).trim();
}

function normalizeDate(d) {
  if (!d) return '';
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = ('0' + (d.getMonth() + 1)).slice(-2);
    const day = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
  }
  const str = String(d).trim();
  const match = str.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (match) return match[0];
  const brMatch = str.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (brMatch) {
    return brMatch[3] + '-' + ('0' + brMatch[2]).slice(-2) + '-' + ('0' + brMatch[1]).slice(-2);
  }
  return str;
}

function normalizeAddr(s) {
  if (!s) return '';
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(rua|avenida|av|alameda|travessa|rodovia|estrada|praca|nº|numero|num|cep)\b/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getRowFingerprint(dataEvento, hora, nome, sobrenome, telefone, endereco) {
  const d = normalizeDate(dataEvento);
  const h = normalizeTime(hora);
  const n = normalizeHeaderName((nome || '') + ' ' + (sobrenome || ''));
  const t = normalizeDigits(telefone);
  const a = normalizeAddr(endereco).slice(0, 40);

  if (!d || !h || !n || t.length < 8) return null;
  return d + '__' + h + '__' + n + '__' + t + '__' + a;
}

/**
 * Mapeia os nomes das colunas existentes para seus índices (1-based)
 */
function getHeaderColumnMap(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = {};
  for (let i = 0; i < headers.length; i++) {
    const rawName = String(headers[i] || '').trim().toLowerCase();
    const normalized = normalizeHeaderName(headers[i]);
    if (rawName) {
      map[rawName] = i + 1; // 1-indexed para o Google Sheets
    }
    if (normalized && !map[normalized]) {
      map[normalized] = i + 1;
    }
  }
  return { map, headers, count: headers.length };
}

/**
 * Monta a linha de dados de uma solicitação na ordem oficial das colunas.
 * hasResponsavel indica se a planilha usa o formato de 21 colunas (com
 * Responsável pela Solicitação) ou o formato simplificado de 18 colunas.
 */
function buildRow(data, dataCriacaoFormatada, hasResponsavel) {
  const base = [
    data.dataEvento || '',
    data.horarioInicio || '',           // Solicitação (Entrada/Saída)
    data.horarioInicioEvento || '',     // Horário de início do evento
    data.horarioTerminoEvento || '',    // Horário de término do evento
    data.horarioTermino || '',          // Horário do Transporte
    data.nomeEvento || '',
    data.nome || '',
    data.sobrenome || '',
    data.telefone || '',
    data.enderecoBase || '',
    data.enderecoEvento || '',
    data.viagemIda || 'Não',
    data.viagemVolta || 'Sim'
  ];

  if (hasResponsavel) {
    return base.concat([
      data.responsavelNome || '',
      data.responsavelFuncao || '',
      data.responsavelMatricula || '',
      data.status || 'Pendente',
      data.protocolo || '',
      data.voucherUber || data.observacoesGestor || '',
      data.aprovadoPor || '',
      dataCriacaoFormatada
    ]);
  }

  return base.concat([
    data.status || 'Pendente',
    data.protocolo || '',
    data.voucherUber || data.observacoesGestor || '',
    data.aprovadoPor || '',
    dataCriacaoFormatada
  ]);
}

/**
 * Endpoint POST: Recebe novas solicitações ou atualizações de status do Gestor
 */
function doPost(e) {
  try {
    let data;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      data = e.parameter;
    } else {
      data = {};
    }

    if (!isRequestAuthorized(data)) {
      return unauthorizedResponse();
    }

    const sheet = getOrCreateSheet();
    const action = data.action || 'create';
    const { map, headers } = getHeaderColumnMap(sheet);
    Logger.log('[WFS Webhook] Ação recebida: ' + action + ' | Protocolo: ' + (data.protocolo || 'N/A'));

    const colProtocolo = map['protocolo'] || (headers.length >= 21 ? 18 : 15);
    const colStatus = map['status'] || (headers.length >= 21 ? 17 : 14);
    const colVoucher = map['voucher uber / observações'] || map['voucher uber'] || map['voucher'] || (headers.length >= 21 ? 19 : 16);
    const colAprovadoPor = map['aprovado por'] || map['aprovadopor'] || (headers.length >= 21 ? 20 : 17);
    const colData = map['data do evento'] || 1;
    const colHoraTransp = map['horário do transporte'] || map['horario do transporte'] || 5;
    const colNome = map['nome'] || 7;
    const colSobrenome = map['sobrenome'] || 8;
    const colTelefone = map['número de telefone'] || map['numero de telefone'] || map['telefone'] || 9;
    const colEndBase = map['endereço base (endereço da residência do colaborador)'] || map['endereço base'] || map['endereco base'] || 10;
    const colEndEvento = map['endereço do evento (local de partida do transporte: terminais gru)'] || map['endereço do evento'] || map['endereco do evento'] || 11;

    const hasResponsavel = Boolean(
      map['responsável pela solicitação'] ||
      map['responsavel pela solicicao'] ||
      map['responsavel'] ||
      map['responsável'] ||
      headers.length >= 21
    );

    if (action === 'create' || !data.action) {
      const protocolo = String(data.protocolo || '').trim();
      const rows = sheet.getDataRange().getValues();
      let existingRowIndex = -1;

      // 1. Verifica se já existe por protocolo exato
      if (protocolo) {
        for (let i = 1; i < rows.length; i++) {
          const rowProto = String(rows[i][colProtocolo - 1] || '').trim();
          if (rowProto === protocolo) {
            existingRowIndex = i + 1;
            break;
          }
        }
      }

      // 2. Regra de desduplicação WFS: Se houver dois pedidos para a mesma pessoa no mesmo endereço,
      // mesma data e mesmo horário, assume o segundo apenas e substitui/ignora o primeiro.
      const incomingHora = data.horarioTermino || data.horarioInicioEvento || data.horarioTerminoEvento || data.horarioInicio || '';
      const incomingFingerprint = getRowFingerprint(
        data.dataEvento,
        incomingHora,
        data.nome,
        data.sobrenome,
        data.telefone,
        data.enderecoBase || data.enderecoEvento
      );

      if (existingRowIndex === -1 && incomingFingerprint) {
        for (let i = 1; i < rows.length; i++) {
          const rowData = rows[i][colData - 1];
          const rowHora = rows[i][colHoraTransp - 1] || rows[i][2] || rows[i][3];
          const rowNome = rows[i][colNome - 1];
          const rowSobrenome = rows[i][colSobrenome - 1];
          const rowTelefone = rows[i][colTelefone - 1];
          const rowEnd = rows[i][colEndBase - 1] || rows[i][colEndEvento - 1];

          const rowFp = getRowFingerprint(rowData, rowHora, rowNome, rowSobrenome, rowTelefone, rowEnd);
          if (rowFp && rowFp === incomingFingerprint) {
            existingRowIndex = i + 1;
            break;
          }
        }
      }

      const dataCriacaoFormatada = data.dataCriacao
        ? new Date(data.dataCriacao).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        : new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      const newRow = buildRow(data, dataCriacaoFormatada, hasResponsavel);

      if (existingRowIndex !== -1) {
        // Se já existe (seja por protocolo ou por duplicata de pessoa/endereço/horário),
        // atualiza a linha com os dados mais recentes do segundo pedido:
        sheet.getRange(existingRowIndex, 1, 1, newRow.length).setValues([newRow]);

        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          message: 'Solicitação existente atualizada na planilha (assumido o 2º pedido com sucesso)!',
          protocolo: data.protocolo,
          atualizado: true
        })).setMimeType(ContentService.MimeType.JSON);
      }

      sheet.appendRow(newRow);

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Solicitação gravada na planilha Google Sheets com sucesso!',
        protocolo: data.protocolo,
        colunas: newRow.length
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'update_status') {
      const protocolo = String(data.protocolo || '').trim();
      const rows = sheet.getDataRange().getValues();
      let updated = false;

      for (let i = 1; i < rows.length; i++) {
        const rowProto = String(rows[i][colProtocolo - 1] || '').trim();
        if (rowProto === protocolo) {
          const rowIndex = i + 1;
          if (data.status) sheet.getRange(rowIndex, colStatus).setValue(data.status);
          let obsText = data.voucherUber || data.observacoesGestor || '';
          if (!obsText && data.coiMotivoDevolucaoMoove) {
            obsText = '[Devolvido para Moove pelo COI]: ' + data.coiMotivoDevolucaoMoove;
          }
          if (obsText) {
            sheet.getRange(rowIndex, colVoucher).setValue(obsText);
          }
          if (data.aprovadoPor) sheet.getRange(rowIndex, colAprovadoPor).setValue(data.aprovadoPor);
          updated = true;
          break;
        }
      }

      // UPSERT: Se o protocolo ainda não constava na planilha, insere agora como nova linha
      if (!updated && protocolo) {
        Logger.log('[WFS Webhook] Protocolo ' + protocolo + ' não encontrado para update. Realizando UPSERT.');
        const dataCriacaoFormatada = data.dataCriacao
          ? new Date(data.dataCriacao).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
          : new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

        const newRow = buildRow(data, dataCriacaoFormatada, hasResponsavel);
        sheet.appendRow(newRow);
        updated = true;

        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          message: 'Solicitação não constava na planilha e foi inserida (upsert) com sucesso!',
          protocolo: protocolo,
          upsert: true
        })).setMimeType(ContentService.MimeType.JSON);
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: updated ? 'success' : 'not_found',
        message: updated ? 'Status atualizado na planilha!' : 'Protocolo não encontrado na planilha.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'bulk_sync') {
      const items = Array.isArray(data.items) ? data.items : [];
      const rows = sheet.getDataRange().getValues();

      // Mapeia protocolos existentes para o índice da linha
      const existingProtocols = {};
      for (let i = 1; i < rows.length; i++) {
        const proto = String(rows[i][colProtocolo - 1] || '').trim();
        if (proto) existingProtocols[proto] = i + 1;
      }

      let insertedCount = 0;
      let updatedCount = 0;

      for (let k = 0; k < items.length; k++) {
        const item = items[k];
        const proto = String(item.protocolo || '').trim();
        const existingRowIndex = existingProtocols[proto];

        if (existingRowIndex) {
          if (item.status) sheet.getRange(existingRowIndex, colStatus).setValue(item.status);
          if (item.voucherUber || item.observacoesGestor) {
            sheet.getRange(existingRowIndex, colVoucher).setValue(item.voucherUber || item.observacoesGestor);
          }
          if (item.aprovadoPor) sheet.getRange(existingRowIndex, colAprovadoPor).setValue(item.aprovadoPor);
          updatedCount++;
        } else {
          const dataCriacaoFormatada = item.dataCriacao
            ? new Date(item.dataCriacao).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
            : new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

          const newRow = buildRow(item, dataCriacaoFormatada, hasResponsavel);
          sheet.appendRow(newRow);
          insertedCount++;
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Sincronização em massa concluída com sucesso na planilha!',
        syncedCount: insertedCount + updatedCount,
        insertedCount: insertedCount,
        updatedCount: updatedCount
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'delete') {
      const protocolo = String(data.protocolo || '').trim();
      const rows = sheet.getDataRange().getValues();
      const colProtocolo = map['protocolo'] || (headers.length >= 21 ? 18 : 15);
      let deleted = false;

      // Percorre de baixo para cima para não desalinhar índices ao remover
      for (let i = rows.length - 1; i >= 1; i--) {
        const rowProto = String(rows[i][colProtocolo - 1] || '').trim();
        if (rowProto === protocolo) {
          sheet.deleteRow(i + 1);
          deleted = true;
          break;
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: deleted ? 'success' : 'not_found',
        message: deleted ? 'Linha removida da planilha!' : 'Protocolo não encontrado na planilha.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Ação não reconhecida: ' + action
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Endpoint GET: Consulta de dados ou teste de conexão.
 * O sistema web NÃO usa este endpoint (todas as chamadas são POST) — ele
 * fica protegido pelo mesmo segredo só para não ser um jeito mais fácil
 * de despejar a planilha inteira sem passar pela checagem do doPost.
 */
function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    if (!isRequestAuthorized(params)) {
      return unauthorizedResponse();
    }

    const sheet = getOrCreateSheet();
    const rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        spreadsheetId: SPREADSHEET_ID,
        total: 0,
        data: []
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const headers = rows[0];
    const data = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = row[j];
      }
      data.push(obj);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      spreadsheetId: SPREADSHEET_ID,
      total: data.length,
      data: data
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Menu Oficial WFS no Google Sheets
 */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('WFS Operações')
      .addItem('Remover duplicados (manter o segundo/mais recente)', 'removerDuplicadasMantendoUltima')
      .addToUi();
  } catch (e) {
    Logger.log('onOpen ignorado no contexto do Web App');
  }
}

/**
 * Executável diretamente pelo menu da planilha:
 * "WFS Operações" -> "Remover duplicados (manter o segundo/mais recente)"
 * 
 * Regra: Quando há duas ou mais solicitações para a mesma pessoa no mesmo endereço,
 * mesma data e mesmo horário, mantém o 2º pedido (linha inferior/mais recente) e
 * exclui o 1º pedido (linha superior/mais antiga).
 */
function removerDuplicadasMantendoUltima() {
  const sheet = getOrCreateSheet();
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 2) return;

  const { map } = getHeaderColumnMap(sheet);
  const colData = map['data do evento'] || 1;
  const colHoraTransp = map['horário do transporte'] || map['horario do transporte'] || 5;
  const colNome = map['nome'] || 7;
  const colSobrenome = map['sobrenome'] || 8;
  const colTelefone = map['número de telefone'] || map['numero de telefone'] || map['telefone'] || 9;
  const colEndBase = map['endereço base (endereço da residência do colaborador)'] || map['endereço base'] || map['endereco base'] || 10;
  const colEndEvento = map['endereço do evento (local de partida do transporte: terminais gru)'] || map['endereço do evento'] || map['endereco do evento'] || 11;

  const seen = {};
  let removedCount = 0;

  // Itera de baixo para cima: as linhas inferiores são os pedidos mais novos (2º pedido).
  // Se uma linha superior tiver o mesmo fingerprint, ela é o 1º pedido e é eliminada.
  for (let i = rows.length - 1; i >= 1; i--) {
    const row = rows[i];
    const rowData = row[colData - 1];
    const rowHora = row[colHoraTransp - 1] || row[2] || row[3];
    const rowNome = row[colNome - 1];
    const rowSobrenome = row[colSobrenome - 1];
    const rowTelefone = row[colTelefone - 1];
    const rowEnd = row[colEndBase - 1] || row[colEndEvento - 1];

    const fp = getRowFingerprint(rowData, rowHora, rowNome, rowSobrenome, rowTelefone, rowEnd);
    if (fp) {
      if (seen[fp]) {
        // Encontrou o pedido anterior (primeiro pedido): remove a linha
        sheet.deleteRow(i + 1);
        removedCount++;
      } else {
        seen[fp] = true;
      }
    }
  }

  try {
    const ui = SpreadsheetApp.getUi();
    if (ui) {
      ui.alert(
        'Limpeza de Duplicados WFS Concluída',
        removedCount > 0
          ? 'Foram identificadas e removidas ' + removedCount + ' solicitação(ões) duplicada(s) anterior(es). Apenas a solicitação mais recente de cada pessoa foi mantida.'
          : 'Nenhuma duplicata encontrada na planilha.',
        ui.ButtonSet.OK
      );
    }
  } catch (alertErr) {
    Logger.log('Removidas ' + removedCount + ' linhas duplicadas.');
  }
}


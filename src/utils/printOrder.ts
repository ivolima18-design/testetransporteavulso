import { UberRequest, isMooveTaxi, mooveObservacoesTexto, getRecusaOrigem } from '../types';

/**
 * Utilitário profissional de impressão de pedidos de transporte avulso WFS.
 * Gera layout formatado em folha A4 com regras @media print e aciona a caixa de diálogo de impressão.
 */

function formatDateBR(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-BR');
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

function formatDateTimeBR(isoDateStr?: string): string {
  if (!isoDateStr) return '—';
  try {
    const d = new Date(isoDateStr);
    if (!isNaN(d.getTime())) {
      return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return isoDateStr;
  } catch {
    return isoDateStr;
  }
}

function getStatusInfo(status: string, taxi: boolean = false) {
  switch (status) {
    case 'Aprovado COI':
    case 'Aprovado':
      return { label: 'Uber Autorizado (COI)', color: '#047857', bg: '#ecfdf5', border: '#a7f3d0' };
    case 'Atendido Moove':
      return { label: taxi ? 'Atendido pelo Táxi (Moove)' : 'Atendido pela Van (Moove)', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' };
    case 'Pendente COI':
      return { label: 'Repassado ao COI (Em Análise)', color: '#b45309', bg: '#fffbeb', border: '#fde68a' };
    case 'Pendente Moove':
    case 'Pendente':
      return { label: 'Pendente (Em Análise)', color: '#4338ca', bg: '#eef2ff', border: '#c7d2fe' };
    case 'Recusado COI':
    case 'Recusado':
      return { label: 'Recusado', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' };
    case 'Cancelado':
      return { label: 'Cancelado', color: '#475569', bg: '#f8fafc', border: '#e2e8f0' };
    default:
      return { label: status, color: '#334155', bg: '#f1f5f9', border: '#cbd5e1' };
  }
}

function generateOrderHTML(order: UberRequest, printTimestamp: string): string {
  const statusInfo = getStatusInfo(order.status, isMooveTaxi(order));
  const fullName = `${order.nome} ${order.sobrenome}`.trim();
  const sentido = order.viagemIda === 'Sim' && order.viagemVolta === 'Sim'
    ? 'Ida e Volta'
    : order.viagemIda === 'Sim'
    ? 'Apenas Viagem de IDA'
    : order.viagemVolta === 'Sim'
    ? 'Apenas Viagem de VOLTA'
    : 'Não especificado';

  const voucher = order.coiVoucherUber || order.voucherUber;
  const isUber = !!voucher || order.status === 'Aprovado COI' || order.status === 'Aprovado';
  const isTaxi = isMooveTaxi(order);
  const isMooveVan = (order.status === 'Atendido Moove' || !!order.mooveDadosVan) && !isTaxi;
  const isRecusado = order.status === 'Recusado COI' || order.status === 'Recusado';

  return `
    <div class="page-container">
      <!-- CABEÇALHO OFICIAL WFS -->
      <header class="header">
        <div class="brand">
          <div class="brand-badge">WFS</div>
          <div class="brand-text">
            <h1>WORLDWIDE FLIGHT SERVICES</h1>
            <p>Sistema de Gestão e Controle de Transporte Avulso • GRU Airport</p>
          </div>
        </div>
        <div class="protocol-box">
          <div class="protocol-label">PROTOCOLO DE TRANSPORTE</div>
          <div class="protocol-value">${order.protocolo || 'N/A'}</div>
          <div class="protocol-date">Emissão: ${printTimestamp}</div>
        </div>
      </header>

      <!-- BARRA DE STATUS -->
      <div class="status-bar" style="background-color: ${statusInfo.bg}; border-color: ${statusInfo.border}; color: ${statusInfo.color};">
        <div class="status-indicator" style="background-color: ${statusInfo.color};"></div>
        <div class="status-text">
          <span class="status-title">STATUS ATUAL:</span>
          <strong>${statusInfo.label}</strong>
          <span class="status-created">• Registrado em: ${formatDateTimeBR(order.dataCriacao)}</span>
        </div>
      </div>

      <!-- SEÇÃO 1: INFORMAÇÕES DA OPERAÇÃO & HORÁRIO -->
      <section class="section">
        <div class="section-title">
          <span class="num">1</span>
          <h2>INFORMAÇÕES DA OPERAÇÃO &amp; HORÁRIO</h2>
        </div>
        <div class="grid-3">
          <div class="field-card">
            <span class="field-label">Data do Evento</span>
            <strong class="field-value">${formatDateBR(order.dataEvento)}</strong>
          </div>
          <div class="field-card">
            <span class="field-label">Tipo de Solicitação</span>
            <strong class="field-value">${order.horarioInicio || 'Entrada'}</strong>
          </div>
          <div class="field-card">
            <span class="field-label">Horário do Transporte</span>
            <strong class="field-value">${order.horarioTermino || order.horarioInicioEvento || order.horarioTerminoEvento || '—'}</strong>
          </div>
        </div>
        <div class="field-card mt-2">
          <span class="field-label">Motivo Operacional / Justificativa</span>
          <strong class="field-value font-normal">${order.nomeEvento || '—'}</strong>
        </div>
      </section>

      <!-- SEÇÃO 2: IDENTIFICAÇÃO DO COLABORADOR TRANSPORTADO -->
      <section class="section">
        <div class="section-title">
          <span class="num">2</span>
          <h2>IDENTIFICAÇÃO DO COLABORADOR TRANSPORTADO</h2>
        </div>
        <div class="grid-2">
          <div class="field-card">
            <span class="field-label">Nome Completo do Colaborador</span>
            <strong class="field-value">${fullName}</strong>
          </div>
          <div class="field-card">
            <span class="field-label">Telefone / WhatsApp para Contato</span>
            <strong class="field-value">${order.telefone || '—'}</strong>
          </div>
        </div>
        <div class="field-card mt-2">
          <span class="field-label">Endereço Residencial Completo (Base)</span>
          <strong class="field-value font-normal">${order.enderecoBase || '—'}</strong>
        </div>
      </section>

      <!-- SEÇÃO 3: LOCAL DE EMBARQUE & SENTIDO -->
      <section class="section">
        <div class="section-title">
          <span class="num">3</span>
          <h2>LOCAL DE EMBARQUE / TERMINAL &amp; SENTIDO</h2>
        </div>
        <div class="grid-2">
          <div class="field-card">
            <span class="field-label">Ponto Operacional GRU (Terminal)</span>
            <strong class="field-value font-normal">${order.enderecoEvento || '—'}</strong>
          </div>
          <div class="field-card">
            <span class="field-label">Sentido do Transporte</span>
            <strong class="field-value">${sentido}</strong>
          </div>
        </div>
      </section>

      <!-- SEÇÃO 4: RESPONSÁVEL PELA SOLICITAÇÃO -->
      <section class="section">
        <div class="section-title">
          <span class="num">4</span>
          <h2>DADOS DO SOLICITANTE / COORDENAÇÃO</h2>
        </div>
        <div class="grid-3">
          <div class="field-card">
            <span class="field-label">Nome do Responsável</span>
            <strong class="field-value">${order.responsavelNome || '—'}</strong>
          </div>
          <div class="field-card">
            <span class="field-label">Função / Cargo</span>
            <strong class="field-value">${order.responsavelFuncao || '—'}</strong>
          </div>
          <div class="field-card">
            <span class="field-label">Matrícula WFS</span>
            <strong class="field-value">${order.responsavelMatricula || '—'}</strong>
          </div>
        </div>
      </section>

      <!-- SEÇÃO 5: DADOS DE DESPACHO E ATENDIMENTO OPERACIONAL -->
      <section class="section">
        <div class="section-title">
          <span class="num">5</span>
          <h2>DESPACHO &amp; ATENDIMENTO OPERACIONAL</h2>
        </div>
        ${
          isUber
            ? `
          <div class="highlight-card bg-emerald">
            <div class="highlight-header">
              <strong>ATENDIDO VIA UBER (CENTRO DE OPERAÇÕES INTEGRADO - COI)</strong>
            </div>
            <div class="grid-2 mt-2">
              <div class="field-card-clean">
                <span class="field-label">Código do Voucher / Controle Uber</span>
                <span class="voucher-code">${voucher || 'Não informado'}</span>
              </div>
              <div class="field-card-clean">
                <span class="field-label">Atendido por / Data</span>
                <strong class="field-value">${order.coiAtendidoPor || order.aprovadoPor || 'COI Operações'} • ${formatDateTimeBR(order.coiDataAvaliacao || order.dataAtualizacao)}</strong>
              </div>
            </div>
            ${
              order.coiObservacoes || order.observacoesGestor
                ? `
              <div class="mt-2 text-xs text-slate-700">
                <strong>Observações do COI:</strong> ${order.coiObservacoes || order.observacoesGestor}
              </div>
            `
                : ''
            }
          </div>
        `
            : isTaxi
            ? `
          <div class="highlight-card bg-amber">
            <div class="highlight-header text-amber">
              <strong>ATENDIDO VIA TÁXI (VALIDAÇÃO MOOVE)</strong>
            </div>
            <div class="grid-3 mt-2">
              <div class="field-card-clean">
                <span class="field-label">Identificação / Prefixo do Táxi</span>
                <strong class="field-value">${order.mooveDadosTaxi || '—'}</strong>
              </div>
              <div class="field-card-clean">
                <span class="field-label">Motorista</span>
                <strong class="field-value">${order.mooveNomeMotorista || '—'}</strong>
              </div>
              <div class="field-card-clean">
                <span class="field-label">Horário Previsto de Chegada</span>
                <strong class="field-value">${order.mooveHorarioChegada || '—'}</strong>
              </div>
            </div>
            ${
              order.mooveObservacoes
                ? `
              <div class="mt-2 text-xs text-slate-700">
                <strong>Orientações / Ponto de Encontro:</strong> ${mooveObservacoesTexto(order)}
              </div>
            `
                : ''
            }
            <div class="mt-2 text-xs text-slate-500">
              Despachado por: ${order.mooveAtendidoPor || 'Moove Operações'} • ${formatDateTimeBR(order.mooveDataAvaliacao || order.dataAtualizacao)}
            </div>
          </div>
        `
            : isMooveVan
            ? `
          <div class="highlight-card bg-blue">
            <div class="highlight-header">
              <strong>ATENDIDO VIA FROTA DE VAN (VALIDAÇÃO MOOVE)</strong>
            </div>
            <div class="grid-3 mt-2">
              <div class="field-card-clean">
                <span class="field-label">Identificação / Placa da Van</span>
                <strong class="field-value">${order.mooveDadosVan || '—'}</strong>
              </div>
              <div class="field-card-clean">
                <span class="field-label">Motorista</span>
                <strong class="field-value">${order.mooveNomeMotorista || '—'}</strong>
              </div>
              <div class="field-card-clean">
                <span class="field-label">Horário Previsto de Chegada</span>
                <strong class="field-value">${order.mooveHorarioChegada || '—'}</strong>
              </div>
            </div>
            ${
              order.mooveObservacoes
                ? `
              <div class="mt-2 text-xs text-slate-700">
                <strong>Observações Moove:</strong> ${mooveObservacoesTexto(order)}
              </div>
            `
                : ''
            }
          </div>
        `
            : isRecusado
            ? `
          <div class="highlight-card bg-rose">
            <div class="highlight-header text-red">
              <strong>SOLICITAÇÃO RECUSADA ${getRecusaOrigem(order) === 'Moove' ? 'PELA MOOVE' : 'PELO COI'}</strong>
            </div>
            <div class="mt-1 text-xs text-slate-800">
              <strong>Motivo da Recusa:</strong> ${order.coiMotivoRecusa || order.motivoRecusa || order.mooveMotivoRecusaCOI || 'Não informado'}
            </div>
            ${order.aprovadoPor ? `<div class="mt-1 text-xs text-slate-800"><strong>Avaliador ${getRecusaOrigem(order) === 'Moove' ? 'Moove' : 'COI'}:</strong> ${order.aprovadoPor}</div>` : ''}
          </div>
        `
            : `
          <div class="highlight-card bg-amber">
            <div class="text-xs text-slate-800 font-medium">
              Solicitação em análise operacional. Aguardando validação de frota de van ou táxi (Moove) ou direcionamento ao Centro de Operações Integrado (COI).
            </div>
          </div>
        `
        }
      </section>

      <!-- SEÇÃO DE ASSINATURAS E CIÊNCIA -->
      <section class="signatures-section">
        <div class="sig-box">
          <div class="sig-line"></div>
          <span class="sig-title">Assinatura do Solicitante / Gestor</span>
          <span class="sig-sub">${order.responsavelNome || 'Responsável Operacional'}</span>
        </div>
        <div class="sig-box">
          <div class="sig-line"></div>
          <span class="sig-title">Assinatura do Colaborador</span>
          <span class="sig-sub">${fullName}</span>
        </div>
        <div class="sig-box">
          <div class="sig-line"></div>
          <span class="sig-title">Visto da Coordenação WFS</span>
          <span class="sig-sub">Controle de Frota / COI</span>
        </div>
      </section>

      <!-- RODAPÉ DE PÁGINA -->
      <footer class="footer">
        <div class="footer-left">
          <span>Worldwide Flight Services (WFS) • Aeroporto Internacional de Guarulhos</span>
        </div>
        <div class="footer-right">
          <span>Protocolo: ${order.protocolo} • Uso Interno e Auditoria</span>
        </div>
      </footer>
    </div>
  `;
}

function getPrintStyles(): string {
  return `
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 10mm 12mm;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 11px;
      line-height: 1.35;
    }

    .page-container {
      width: 100%;
      max-width: 210mm;
      margin: 0 auto;
      padding: 4px;
      page-break-after: always;
      position: relative;
    }

    .page-container:last-child {
      page-break-after: avoid;
    }

    /* HEADER */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #E31837;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .brand-badge {
      background: #E31837;
      color: #ffffff;
      font-weight: 900;
      font-size: 18px;
      letter-spacing: 1px;
      padding: 6px 12px;
      border-radius: 6px;
      line-height: 1;
    }

    .brand-text h1 {
      margin: 0;
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: 0.5px;
    }

    .brand-text p {
      margin: 2px 0 0 0;
      font-size: 9.5px;
      color: #64748b;
      font-weight: 500;
    }

    .protocol-box {
      text-align: right;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 5px 10px;
    }

    .protocol-label {
      font-size: 8.5px;
      font-weight: 800;
      color: #64748b;
      letter-spacing: 0.5px;
    }

    .protocol-value {
      font-family: monospace;
      font-size: 13px;
      font-weight: 800;
      color: #E31837;
      letter-spacing: 0.5px;
    }

    .protocol-date {
      font-size: 8.5px;
      color: #94a3b8;
      margin-top: 1px;
    }

    /* STATUS BAR */
    .status-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border: 1px solid;
      border-radius: 6px;
      margin-bottom: 10px;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .status-text {
      font-size: 10.5px;
    }

    .status-title {
      font-weight: 700;
      margin-right: 4px;
    }

    .status-created {
      color: #64748b;
      font-size: 9.5px;
      margin-left: 6px;
    }

    /* SECTIONS */
    .section {
      margin-bottom: 9px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 10px;
    }

    .section-title {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid #f1f5f9;
    }

    .section-title .num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 15px;
      height: 15px;
      background: #E31837;
      color: #ffffff;
      font-size: 8.5px;
      font-weight: 800;
      border-radius: 3px;
    }

    .section-title h2 {
      margin: 0;
      font-size: 10px;
      font-weight: 800;
      color: #334155;
      letter-spacing: 0.5px;
    }

    /* GRIDS & FIELDS */
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    .grid-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 6px;
    }

    .field-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 5px 8px;
    }

    .field-card-clean {
      background: transparent;
      padding: 2px 0;
    }

    .field-label {
      display: block;
      font-size: 8.5px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-bottom: 1px;
    }

    .field-value {
      display: block;
      font-size: 10.5px;
      color: #0f172a;
      font-weight: 700;
      word-break: break-word;
    }

    .font-normal {
      font-weight: 500 !important;
    }

    .mt-2 {
      margin-top: 6px;
    }

    /* HIGHLIGHT CARDS */
    .highlight-card {
      border-radius: 5px;
      padding: 8px 10px;
      border: 1px solid;
    }

    .highlight-header {
      font-size: 9.5px;
      letter-spacing: 0.5px;
    }

    .bg-emerald {
      background-color: #ecfdf5;
      border-color: #a7f3d0;
      color: #065f46;
    }

    .bg-blue {
      background-color: #eff6ff;
      border-color: #bfdbfe;
      color: #1e40af;
    }

    .bg-rose {
      background-color: #fff1f2;
      border-color: #fecdd3;
      color: #9f1239;
    }

    .bg-amber {
      background-color: #fffbeb;
      border-color: #fde68a;
      color: #92400e;
    }

    .voucher-code {
      font-family: monospace;
      font-size: 13px;
      font-weight: 900;
      color: #047857;
      background: #ffffff;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #a7f3d0;
      display: inline-block;
      letter-spacing: 0.5px;
    }

    /* SIGNATURES */
    .signatures-section {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 15px;
      margin-top: 15px;
      margin-bottom: 12px;
      padding: 10px 5px 0 5px;
    }

    .sig-box {
      text-align: center;
    }

    .sig-line {
      border-bottom: 1px solid #94a3b8;
      height: 25px;
      margin-bottom: 4px;
    }

    .sig-title {
      display: block;
      font-size: 8.5px;
      font-weight: 700;
      color: #334155;
      text-transform: uppercase;
    }

    .sig-sub {
      display: block;
      font-size: 8px;
      color: #64748b;
      margin-top: 1px;
    }

    /* FOOTER */
    .footer {
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #e2e8f0;
      padding-top: 5px;
      font-size: 8px;
      color: #94a3b8;
    }
  `;
}

/**
 * Dispara a impressão de um pedido individual ou múltiplos pedidos em janela invisível.
 */
export function printUberRequests(orders: UberRequest | UberRequest[]) {
  const orderList = Array.isArray(orders) ? orders : [orders];
  if (orderList.length === 0) return;

  const now = new Date();
  const printTimestamp = `${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  const ordersHTML = orderList.map((order) => generateOrderHTML(order, printTimestamp)).join('\n');
  const styles = getPrintStyles();

  const title = orderList.length === 1
    ? `WFS-Transporte-${orderList[0].protocolo || 'Pedido'}`
    : `WFS-Transporte-Lote-${orderList.length}-pedidos`;

  // Cria um iframe oculto para impressão limpa sem afetar a página atual
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    // Fallback: abrir nova janela se iframe não responder
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="pt-BR">
          <head>
            <meta charset="UTF-8" />
            <title>${title}</title>
            <style>${styles}</style>
          </head>
          <body>
            ${ordersHTML}
            <script>
              window.onload = function() {
                window.print();
                setTimeout(function() { window.close(); }, 500);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
    return;
  }

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${title}</title>
        <style>${styles}</style>
      </head>
      <body>
        ${ordersHTML}
      </body>
    </html>
  `);
  doc.close();

  // Esperar carregar e acionar print
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error('Falha ao acionar impressão:', e);
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 2000);
    }
  }, 350);
}

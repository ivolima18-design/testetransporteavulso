import React, { useState, useRef, useEffect } from 'react';
import {
  Download,
  ChevronDown,
  FileSpreadsheet,
  FileCode,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { UberRequest } from '../types';
import { exportToCsv, exportToExcel, exportToPdf } from '../utils/exportGenerators';

interface ExportDropdownProps {
  requests: UberRequest[];
  disabled?: boolean;
  onExportStart?: (format: 'xlsx' | 'csv' | 'pdf') => void;
  onExportComplete?: (format: 'xlsx' | 'csv' | 'pdf', count: number) => void;
  onExportError?: (error: Error) => void;
}

export const ExportDropdown: React.FC<ExportDropdownProps> = ({
  requests,
  disabled = false,
  onExportStart,
  onExportComplete,
  onExportError,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeFormat, setActiveFormat] = useState<'xlsx' | 'csv' | 'pdf' | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fecha o menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Fecha o menu ao pressionar Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleExport = async (format: 'xlsx' | 'csv' | 'pdf') => {
    if (disabled || activeFormat !== null) return;
    if (!requests || requests.length === 0) {
      if (onExportError) {
        onExportError(new Error('Nenhuma solicitação disponível para exportação.'));
      } else {
        alert('Nenhuma solicitação disponível para exportação.');
      }
      setIsOpen(false);
      return;
    }

    try {
      setActiveFormat(format);
      setIsOpen(false);
      onExportStart?.(format);

      // Pequeno timeout para permitir atualização do DOM antes do download
      await new Promise((resolve) => setTimeout(resolve, 80));

      if (format === 'xlsx') {
        exportToExcel(requests);
      } else if (format === 'csv') {
        exportToCsv(requests);
      } else if (format === 'pdf') {
        await exportToPdf(requests);
      }

      onExportComplete?.(format, requests.length);
    } catch (err: any) {
      console.error(`Erro na exportação ${format}:`, err);
      onExportError?.(err);
    } finally {
      setActiveFormat(null);
    }
  };

  const isExporting = activeFormat !== null;

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Botão Gatilho Principal */}
      <button
        type="button"
        id="btn-export-dropdown"
        aria-haspopup="true"
        aria-expanded={isOpen}
        disabled={disabled || isExporting}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all flex items-center gap-2 border border-slate-200/80 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-slate-400 disabled:opacity-50 disabled:cursor-not-allowed ${
          isOpen ? 'bg-slate-200 ring-2 ring-slate-300' : ''
        }`}
        title="Baixar relatórios nos formatos Excel (.xlsx), CSV ou PDF"
      >
        {isExporting ? (
          <RefreshCw className="w-4 h-4 text-slate-600 animate-spin" />
        ) : (
          <Download className="w-4 h-4 text-slate-600" />
        )}

        <span>{isExporting ? 'Gerando arquivo...' : 'Exportar Planilha'}</span>

        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Menu Flutuante Dropdown */}
      {isOpen && (
        <div
          id="menu-export-options"
          className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-150 origin-top-right"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="btn-export-dropdown"
        >
          {/* Cabeçalho do Dropdown */}
          <div className="px-3 py-1.5 border-b border-slate-100 mb-1 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Formatos de Exportação
            </span>
            <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {requests.length} registro(s)
            </span>
          </div>

          {/* Opção 1: Excel (.xlsx) */}
          <button
            type="button"
            id="opt-export-excel"
            role="menuitem"
            onClick={() => handleExport('xlsx')}
            className="w-full text-left px-3.5 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors group"
          >
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 group-hover:bg-emerald-100 transition-colors">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 group-hover:text-emerald-800">
                  Excel (.xlsx)
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  OFICIAL
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                Planilha com as 11 colunas oficiais
              </p>
            </div>
          </button>

          {/* Opção 2: CSV (.csv) */}
          <button
            type="button"
            id="opt-export-csv"
            role="menuitem"
            onClick={() => handleExport('csv')}
            className="w-full text-left px-3.5 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors group"
          >
            <div className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 group-hover:bg-blue-100 transition-colors">
              <FileCode className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 group-hover:text-blue-800">
                  Texto CSV (.csv)
                </span>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                  UTF-8
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                Compatível com importação externa (ponto e vírgula)
              </p>
            </div>
          </button>

          {/* Opção 3: PDF (.pdf) */}
          <button
            type="button"
            id="opt-export-pdf"
            role="menuitem"
            onClick={() => handleExport('pdf')}
            className="w-full text-left px-3.5 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors group"
          >
            <div className="p-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-100 group-hover:bg-rose-100 transition-colors">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 group-hover:text-rose-800">
                  Documento PDF (.pdf)
                </span>
                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                  RELATÓRIO
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                Documento formatado pronto para impressão/arquivo
              </p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Copy, Check, X, Clock, ShieldCheck, Car, MessageSquare } from 'lucide-react';

export interface ConfirmationPopupProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  instructionsMessage?: string;
  type?: 'success' | 'info';
  protocol?: string;
  controlNumber?: string;
  collaboratorName?: string;
  actionButton?: {
    label: string;
    onClick: () => void;
  };
  durationSeconds?: number;
}

export const ConfirmationPopup: React.FC<ConfirmationPopupProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  instructionsMessage,
  type = 'success',
  protocol,
  controlNumber,
  collaboratorName,
  actionButton,
  durationSeconds = 5,
}) => {
  const [timeLeft, setTimeLeft] = useState(durationSeconds);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Reset timer on open
  useEffect(() => {
    if (!isOpen) {
      setTimeLeft(durationSeconds);
      return;
    }

    setTimeLeft(durationSeconds);

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, durationSeconds, onClose]);

  // ESC key listener to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        id="confirmation-popup-backdrop"
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-all"
      >
        <motion.div
          id="confirmation-popup-card"
          initial={{ opacity: 0, scale: 0.9, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200"
        >
          {/* Top animated progress bar for 5 seconds */}
          <div className="w-full bg-slate-100 h-1.5 overflow-hidden">
            <motion.div
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: durationSeconds, ease: 'linear' }}
              className={`h-full ${
                type === 'success' ? 'bg-emerald-500' : 'bg-[#E31837]'
              }`}
            />
          </div>

          <div className="p-6 sm:p-7">
            {/* Close Button */}
            <button
              id="confirmation-popup-close-btn"
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              title="Fechar (Esc)"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header with Icon */}
            <div className="flex items-start gap-3.5 mb-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm ${
                  type === 'success'
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-[#E31837] border border-red-200'
                }`}
              >
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div className="pr-6">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 inline-block mb-1">
                  Confirmação Operacional
                </span>
                <h3 className="text-lg font-bold text-slate-900 leading-snug tracking-tight">
                  {title}
                </h3>
                {collaboratorName && (
                  <p className="text-xs font-semibold text-slate-700 mt-0.5">
                    Colaborador: <span className="text-slate-900">{collaboratorName}</span>
                  </p>
                )}
              </div>
            </div>

            {subtitle && (
              <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                {subtitle}
              </p>
            )}

            {/* Protocol Badge */}
            {protocol && (
              <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Número de Protocolo
                  </span>
                  <span className="text-sm font-mono font-bold text-slate-900">
                    {protocol}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(protocol, 'proto')}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  {copiedKey === 'proto' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Control Number Badge (when approved) */}
            {controlNumber && (
              <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Número de Controle Interno
                  </span>
                  <span className="text-base font-mono font-extrabold text-emerald-950">
                    {controlNumber}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(controlNumber, 'ctrl')}
                  className="px-2.5 py-1.5 bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  {copiedKey === 'ctrl' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Caixa de Instrução Especial (WhatsApp / Orientações) */}
            {instructionsMessage && (
              <div className="mb-4 p-3.5 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 shadow-sm">
                <div className="flex items-start gap-2.5">
                  <div className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-0.5">
                      Orientações Importantes ao Colaborador
                    </span>
                    <p className="text-xs text-slate-200 leading-relaxed font-normal">
                      {instructionsMessage}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Actions and 5s Countdown Footer */}
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                <Clock className="w-3.5 h-3.5 text-slate-400 animate-pulse" />
                <span>Fechando em {timeLeft}s</span>
              </div>

              <div className="flex items-center gap-2">
                {actionButton && (
                  <button
                    type="button"
                    onClick={() => {
                      actionButton.onClick();
                      onClose();
                    }}
                    className="px-3.5 py-2 bg-[#E31837] hover:bg-[#c4122d] text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5"
                  >
                    <Car className="w-3.5 h-3.5" />
                    <span>{actionButton.label}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                >
                  Fechar (ou Esc)
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

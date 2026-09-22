import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, KeyRound, CheckCircle2, AlertTriangle, Eye, EyeOff, X } from 'lucide-react';
import { changeUserPassword } from '../services/api';
import { UserAccount } from '../types';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserAccount | null;
  isMandatory?: boolean;
  onSuccess: (updatedUser: UserAccount) => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  user,
  isMandatory = false,
  onSuccess,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isMandatory && !currentPassword) {
      setErrorMessage('Informe sua senha atual.');
      return;
    }

    if (!newPassword || newPassword.length < 4) {
      setErrorMessage('A nova senha deve possuir no mínimo 4 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('A confirmação da nova senha não confere.');
      return;
    }

    if (currentPassword && currentPassword === newPassword) {
      setErrorMessage('A nova senha deve ser diferente da senha atual.');
      return;
    }

    setLoading(true);
    try {
      const res = await changeUserPassword({
        email: user.email,
        currentPassword: currentPassword || undefined,
        newPassword,
      });

      setSuccessMessage(res.message || 'Senha alterada com sucesso!');
      setTimeout(() => {
        onSuccess(res.user);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setSuccessMessage(null);
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao alterar a senha. Verifique os dados informados.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div
        id="change-password-modal-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs"
        onClick={() => {
          if (!isMandatory) onClose();
        }}
      >
        <motion.div
          id="change-password-modal-content"
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden"
        >
          {/* Header */}
          <div className={`p-6 border-b ${isMandatory ? 'bg-amber-500 text-white' : 'bg-slate-900 text-white'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${isMandatory ? 'bg-amber-600/60' : 'bg-white/10'}`}>
                  {isMandatory ? <AlertTriangle className="w-6 h-6 text-white" /> : <KeyRound className="w-6 h-6 text-amber-400" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold">
                    {isMandatory ? 'Troca Obrigatória de Senha' : 'Alterar Minha Senha'}
                  </h3>
                  <p className={`text-xs ${isMandatory ? 'text-amber-100' : 'text-slate-300'}`}>
                    {user.nome} ({user.email})
                  </p>
                </div>
              </div>

              {!isMandatory && (
                <button
                  id="btn-close-change-pwd"
                  onClick={onClose}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            {isMandatory && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Segurança obrigatória:</strong> Por determinação do sistema ou após redefinição de acesso, você deve cadastrar uma nova senha pessoal antes de acessar as funcionalidades do COI.
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isMandatory && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Senha Atual *
                  </label>
                  <div className="relative">
                    <input
                      id="input-current-password"
                      type={showCurrent ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Sua senha atual"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 pr-10"
                      required={!isMandatory}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent(!showCurrent)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nova Senha * (mínimo 4 caracteres)
                </label>
                <div className="relative">
                  <input
                    id="input-new-password"
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Cadastre sua nova senha"
                    minLength={4}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Confirmar Nova Senha *
                </label>
                <input
                  id="input-confirm-password"
                  type={showNew ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  minLength={4}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  required
                />
              </div>

              <div className="pt-2 flex items-center gap-3">
                {!isMandatory && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-1/3 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-xs transition-colors"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 ${
                    isMandatory
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-slate-900 hover:bg-slate-800 text-white'
                  }`}
                >
                  <Lock className="w-4 h-4" />
                  {loading ? 'Salvando...' : 'Atualizar e Salvar Nova Senha'}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Smartphone, Monitor, Tv2, Wifi } from 'lucide-react';
import { PremiumModal } from './PremiumModal';
import type { PremiumPlanId } from './PremiumBenefitIcons';

interface ActionModalsProps {
  modal: 'pro' | 'app' | 'signin' | null;
  onClose: () => void;
  userEmail: string | null;
  premiumPlan: string | null;
  onSelectPlan: (planId: PremiumPlanId) => void;
  onSwitchModal: (next: 'pro' | 'app' | 'signin') => void;
  onSignIn: (email: string) => void;
  onSignOut: () => void;
}

export const ActionModals: React.FC<ActionModalsProps> = ({
  modal,
  onClose,
  userEmail,
  premiumPlan,
  onSelectPlan,
  onSwitchModal,
  onSignIn,
  onSignOut,
}) => {
  const [emailInput, setEmailInput] = useState(userEmail || '');

  if (!modal) return null;

  if (modal === 'pro') {
    return (
      <PremiumModal
        onClose={onClose}
        userEmail={userEmail}
        activePlan={premiumPlan}
        onActivatePlan={onSelectPlan}
        onOpenSignIn={() => onSwitchModal('signin')}
      />
    );
  }

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[110] bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-[#141821] border border-white/[0.1] p-6 shadow-2xl animate-modal relative"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-3 right-3 min-w-[44px] min-h-[44px] rounded-full bg-[#1E2430] text-[#94A3B8] hover:text-white flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>

        {modal === 'app' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-extrabold text-[#F8FAFC]">Get CinePulse Everywhere</h3>
              <p className="text-xs text-[#94A3B8] mt-1">
                Install the native client or open your local Wi-Fi URL directly from any phone or Smart TV.
              </p>
            </div>

            <div className="space-y-2.5">
              {[
                { icon: Smartphone, title: 'Android & iOS App', desc: 'Offline smart downloads & mobile data saver', tag: 'v4.2' },
                { icon: Monitor, title: 'Windows & macOS Desktop', desc: 'Hardware-accelerated 4K HLS & local drive sync', tag: 'EXE / DMG' },
                { icon: Tv2, title: 'Android TV & Fire TV', desc: 'Remote-friendly 10-foot leanback interface', tag: 'TV APK' },
              ].map(({ icon: Icon, title, desc, tag }) => (
                <div
                  key={title}
                  className="p-3 rounded-xl bg-[#0B0D12] border border-white/[0.07] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#1E2430] text-[#00E5FF] flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[#F8FAFC] truncate">{title}</div>
                      <div className="text-[11px] text-[#94A3B8] truncate">{desc}</div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-[#10B981]/15 text-[#10B981] text-[10px] font-bold shrink-0">
                    {tag}
                  </span>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-xl bg-[#00E5FF]/10 border border-[#00E5FF]/25 text-xs text-[#00E5FF] flex items-center gap-2">
              <Wifi className="w-4 h-4 shrink-0" />
              <span>Local Wi-Fi Stream URL: <strong>{window.location.origin}</strong></span>
            </div>
          </div>
        )}

        {modal === 'signin' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-extrabold text-[#F8FAFC]">
                {userEmail ? 'Account Profile' : 'Sign in to CinePulse'}
              </h3>
              <p className="text-xs text-[#94A3B8] mt-1">
                {userEmail
                  ? `Signed in as ${userEmail}. Your Watchlist is synced.`
                  : 'Sync your Watchlist, subtitle preferences, and continue watching.'}
              </p>
            </div>

            {userEmail ? (
              <button
                type="button"
                onClick={() => {
                  onSignOut();
                  onClose();
                }}
                className="w-full h-10 rounded-full bg-[#1E2430] hover:bg-rose-500/20 hover:text-rose-300 border border-white/10 text-sm font-bold transition-colors"
              >
                Sign Out
              </button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (emailInput.trim()) {
                    onSignIn(emailInput.trim());
                    onClose();
                  }
                }}
                className="space-y-3"
              >
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-white/10 focus:border-[#00E5FF] text-sm text-[#F8FAFC] outline-none"
                />
                <input
                  type="password"
                  required
                  placeholder="Password"
                  className="w-full h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-white/10 focus:border-[#00E5FF] text-sm text-[#F8FAFC] outline-none"
                />
                <button
                  type="submit"
                  className="w-full h-10 rounded-full bg-[#00E5FF] hover:bg-[#33ECFF] text-[#071018] font-extrabold text-sm transition-all"
                >
                  Continue
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

import React, { useEffect, useState } from 'react';
import {
  X,
  ChevronRight,
  ArrowLeft,
  CheckCircle2,
  Smartphone,
  CreditCard,
  User,
} from 'lucide-react';
import {
  PREMIUM_BENEFITS,
  PREMIUM_PLANS,
  PremiumHexBadge,
  PremiumHexCrown,
  type PremiumPlan,
  type PremiumPlanId,
} from './PremiumBenefitIcons';

interface PremiumModalProps {
  onClose: () => void;
  userEmail: string | null;
  activePlan: string | null;
  onActivatePlan: (planId: PremiumPlanId) => void;
  onOpenSignIn: () => void;
}

function computeExpiryDate(planId: PremiumPlanId): string {
  const d = new Date();
  if (planId === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (planId === 'quarterly') d.setMonth(d.getMonth() + 3);
  else d.setFullYear(d.getFullYear() + 1);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const PremiumModal: React.FC<PremiumModalProps> = ({
  onClose,
  userEmail,
  activePlan,
  onActivatePlan,
  onOpenSignIn,
}) => {
  const [pendingPlan, setPendingPlan] = useState<PremiumPlan | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'momo' | 'card'>('momo');
  const [unlockedPlan, setUnlockedPlan] = useState<PremiumPlan | null>(null);
  const [validUntil, setValidUntil] = useState<string>(() => {
    try {
      return localStorage.getItem('cinepulse_premium_until') || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const activePlanObj = PREMIUM_PLANS.find((p) => p.id === activePlan) || null;
  const userHandle = userEmail ? userEmail.split('@')[0] : 'Member';
  const effectiveValidUntil =
    validUntil || (activePlanObj ? computeExpiryDate(activePlanObj.id) : '');

  const handleConfirmActivate = () => {
    if (!pendingPlan) return;
    const expiry = computeExpiryDate(pendingPlan.id);
    try {
      localStorage.setItem('cinepulse_premium_until', expiry);
    } catch {
      // ignore storage quota errors
    }
    setValidUntil(expiry);
    onActivatePlan(pendingPlan.id);
    setUnlockedPlan(pendingPlan);
    setPendingPlan(null);
  };

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="premium-modal-heading"
      className="fixed inset-0 z-[110] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 pt-14 sm:p-6 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[600px] my-auto animate-modal overflow-visible"
      >
        {/* Floating Circular Close Button Above Stepped Top-Right Shoulder */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Premium modal"
          className="absolute -top-4 right-0 z-30 min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] rounded-full border border-white/70 bg-black/60 hover:bg-black/85 text-white flex items-center justify-center transition-colors shadow-lg"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top Stepped Espresso-Bronze Header */}
        <div className="mx-3 sm:mx-4 relative rounded-t-2xl bg-gradient-to-br from-[#6B4628] via-[#57351B] to-[#452813] px-5 sm:px-6 pt-5 pb-8 border-t border-x border-[#FCE293]/20">
          <div className="pr-24 sm:pr-28">
            {activePlanObj ? (
              <>
                <h2
                  id="premium-modal-heading"
                  className="text-xl sm:text-[26px] font-black italic tracking-tight text-[#FFF2C9] leading-[1.15] drop-shadow-sm"
                >
                  Keep My Premium Benefits
                </h2>

                <div className="mt-2.5 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#A78BFA] via-[#818CF8] to-[#00E5FF] border border-white/30 flex items-center justify-center text-white text-xs font-black shrink-0 shadow-sm">
                    {userEmail ? (
                      <span>{userHandle.slice(0, 1).toUpperCase()}</span>
                    ) : (
                      <User className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#FFF2C9] truncate">
                      {userHandle}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#5B67CA] text-white text-[10px] font-extrabold tracking-wide shadow-sm">
                        {activePlanObj.name}
                      </span>
                      <span className="text-[11px] font-medium text-[#EED7AB] tabular-nums">
                        Valid until {effectiveValidUntil}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h2
                  id="premium-modal-heading"
                  className="text-2xl sm:text-[27px] font-black italic tracking-tight text-[#FFF2C9] leading-[1.12] drop-shadow-sm"
                >
                  Unlock Premium
                  <br />
                  Benefits
                </h2>

                <div className="mt-2.5 flex flex-col items-start gap-1.5">
                  {userEmail ? (
                    <span className="text-xs font-semibold text-[#F6DFB0]">{userEmail}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={onOpenSignIn}
                      className="inline-flex items-center gap-0.5 text-xs font-bold text-[#F6DFB0] hover:text-white transition-colors"
                    >
                      <span>Log in</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <span className="px-2 py-0.5 rounded bg-black/30 text-[#F4D9A6] text-[10px] font-bold tracking-wide">
                    Free Plan
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Dedicated Top-Right Overlapping Hexagonal Metallic Crown Container */}
          <div className="absolute right-4 sm:right-7 -top-5 sm:-top-6 z-20 pointer-events-none">
            <PremiumHexCrown size="lg" />
          </div>
        </div>

        {/* Bottom Warm Ivory / Champagne Card */}
        <div className="relative z-10 -mt-3 rounded-2xl bg-gradient-to-b from-[#FFF6D6] via-[#FBF0C9] to-[#F5E4AE] px-4 sm:px-6 pt-5 pb-6 shadow-[0_-12px_32px_rgba(0,0,0,0.28)] text-[#38210E] border border-[#FFEFC2]/70">
          {/* 6 Benefit Badges Row */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-y-3 gap-x-2 mb-5">
            {PREMIUM_BENEFITS.map((benefit) => (
              <div key={benefit.id} className="flex flex-col items-center text-center gap-1">
                <PremiumHexBadge benefit={benefit} variant="light" />
                <span className="text-[11px] font-semibold leading-tight text-[#4D3219]">
                  {benefit.label}
                </span>
              </div>
            ))}
          </div>

          {/* State 1: Success Confirmation after activating plan */}
          {unlockedPlan ? (
            <div className="rounded-2xl bg-[#FFFDF4]/80 border border-[#D4B06A] p-6 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-[#10B981]/15 text-[#0F7B55] flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-black text-[#361F0D]">
                  Premium Unlocked — {unlockedPlan.name}
                </h3>
                <p className="text-xs text-[#6E4D2D] mt-1">
                  All 4K HD streams, ad-free playback, and multi-device logins (x3 Web, TV &amp; Phone) are now active on your account.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-8 rounded-full bg-gradient-to-r from-[#EA7234] to-[#D6551B] hover:brightness-105 text-white text-sm font-extrabold shadow-sm transition-all"
              >
                Start Watching
              </button>
            </div>
          ) : pendingPlan ? (
            /* State 2: Compact Interactive Checkout Step */
            <div className="rounded-2xl bg-[#FFFDF4]/85 border border-[#DFC487] p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setPendingPlan(null)}
                  className="min-h-[36px] px-2.5 -ml-1 rounded-lg hover:bg-[#EFE0B5] text-xs font-bold text-[#6E4D2D] inline-flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Change Plan
                </button>
                <div className="text-right tabular-nums">
                  <span className="text-xs font-bold text-[#7A5732]">{pendingPlan.name} Plan &bull; </span>
                  <span className="text-base font-black text-[#361F0D]">
                    {pendingPlan.currency} {pendingPlan.price}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-[#5C3D20] mb-2">Select Payment Method</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('momo')}
                    className={`min-h-[48px] px-3.5 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                      paymentMethod === 'momo'
                        ? 'bg-[#FFF5D9] border-[#D6551B] ring-2 ring-[#EA7234]/25 text-[#361F0D]'
                        : 'bg-[#FAF0CE] border-[#DFC68B] text-[#6E4D2D]'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-[#D6551B] shrink-0" />
                    <div>
                      <div className="text-xs font-extrabold">Mobile Money</div>
                      <div className="text-[10.5px] opacity-80">MTN / Telecel / AT</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`min-h-[48px] px-3.5 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                      paymentMethod === 'card'
                        ? 'bg-[#FFF5D9] border-[#D6551B] ring-2 ring-[#EA7234]/25 text-[#361F0D]'
                        : 'bg-[#FAF0CE] border-[#DFC68B] text-[#6E4D2D]'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-[#D6551B] shrink-0" />
                    <div>
                      <div className="text-xs font-extrabold">Debit / Credit Card</div>
                      <div className="text-[10.5px] opacity-80">Visa &bull; Mastercard</div>
                    </div>
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleConfirmActivate}
                className="w-full min-h-[44px] rounded-full bg-gradient-to-r from-[#EA7234] to-[#D6551B] hover:brightness-105 active:scale-[0.98] text-white text-sm font-extrabold shadow-sm transition-all"
              >
                Activate {pendingPlan.name} &mdash; {pendingPlan.currency} {pendingPlan.price}
              </button>
            </div>
          ) : (
            /* State 3: 3-Column Pricing Cards (Monthly / Quarterly / Yearly) */
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PREMIUM_PLANS.map((plan) => {
                const isActive = activePlan === plan.id;
                return (
                  <div
                    key={plan.id}
                    className={`rounded-2xl bg-gradient-to-b from-[#F5E6BC]/85 to-[#FCF3D8]/75 border p-4 flex flex-col items-center text-center transition-all ${
                      isActive
                        ? 'border-[#D6551B] ring-2 ring-[#EA7234]/30'
                        : 'border-[#E2CA8E] hover:border-[#DC5F22]'
                    }`}
                  >
                    <div className="text-xs sm:text-[13px] font-semibold text-[#5C3D20]">
                      {plan.name}
                    </div>

                    <div className="mt-2.5 flex items-baseline justify-center gap-0.5 text-[#361F0D] tabular-nums">
                      <span className="text-[15px] font-extrabold">{plan.currency}</span>
                      <span className="text-[32px] leading-none font-black tracking-tight">
                        {plan.price}
                      </span>
                    </div>

                    <div className="mt-1.5 text-[11px] font-medium text-[#8C6D46] tabular-nums">
                      {plan.perMonth}
                    </div>

                    <button
                      type="button"
                      onClick={() => setPendingPlan(plan)}
                      className="mt-4 w-full min-h-[40px] rounded-full bg-gradient-to-r from-[#EA7234] to-[#D6551B] hover:brightness-105 active:scale-[0.98] text-white text-xs font-extrabold shadow-sm transition-all"
                    >
                      {isActive ? 'Active Plan' : 'Choose'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

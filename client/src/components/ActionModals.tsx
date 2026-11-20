import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Smartphone,
  Monitor,
  Tv2,
  Wifi,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  LogOut,
  ArrowLeft,
} from 'lucide-react';
import { PremiumModal } from './PremiumModal';
import type { PremiumPlanId } from './PremiumBenefitIcons';
import {
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  type AuthUserProfile,
} from '../services/supabase';
import { trackEvent } from '../services/analytics';

interface ActionModalsProps {
  modal: 'pro' | 'app' | 'signin' | null;
  onClose: () => void;
  userEmail: string | null;
  userProfile?: AuthUserProfile | null;
  premiumPlan: string | null;
  onSelectPlan: (planId: PremiumPlanId) => void;
  onSwitchModal: (next: 'pro' | 'app' | 'signin') => void;
  onSignOut: () => Promise<void> | void;
  onOpenAdmin?: () => void;
}

const GoogleLogo: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.82-.07-1.64-.22-2.43H12v4.6h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.27-2.09 3.56-5.17 3.56-8.79Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.45 1.14-4.07 1.14-3.13 0-5.78-2.11-6.73-4.96H1.28v3.1A12 12 0 0 0 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.28a12 12 0 0 0 0 10.74l3.99-3.1Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.28 6.63l3.99 3.1C6.22 6.88 8.87 4.77 12 4.77Z"
    />
  </svg>
);

export const ActionModals: React.FC<ActionModalsProps> = ({
  modal,
  onClose,
  userEmail,
  userProfile = null,
  premiumPlan,
  onSelectPlan,
  onSwitchModal,
  onSignOut,
  onOpenAdmin,
}) => {
  const [authTab, setAuthTab] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [fullName, setFullName] = useState('');
  const [emailInput, setEmailInput] = useState(userEmail || '');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (modal === 'signin') {
      setErrorMsg(null);
      setInfoMsg(null);
      setPasswordInput('');
      setShowPassword(false);
      if (userEmail) setEmailInput(userEmail);
    }
  }, [modal, userEmail]);

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

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    const cleanEmail = emailInput.trim();
    if (!cleanEmail) return;

    setSubmitting(true);
    try {
      if (authTab === 'reset') {
        await sendPasswordReset(cleanEmail);
        setInfoMsg('Password reset link sent! Check your email inbox to set a new password.');
      } else if (authTab === 'signup') {
        if (passwordInput.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        const res = await signUpWithEmail(cleanEmail, passwordInput, fullName);
        trackEvent({ eventType: 'signup', pagePath: 'auth_modal' });
        if (res.session) {
          onClose();
        } else {
          setInfoMsg(
            'Account created! Check your email inbox to confirm your address, then sign in.'
          );
          setAuthTab('signin');
          setPasswordInput('');
        }
      } else {
        await signInWithEmail(cleanEmail, passwordInput);
        onClose();
      }
    } catch (err) {
      const msg = (err as Error).message || 'Authentication failed. Please try again.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const raw = (err as Error).message || '';
      if (/provider is not enabled|unsupported provider/i.test(raw)) {
        setErrorMsg(
          'Google sign-in is wired up and ready — enable the Google provider in your Supabase Auth settings to activate it.'
        );
      } else {
        setErrorMsg(raw || 'Could not start Google sign-in.');
      }
      setGoogleLoading(false);
    }
  };

  const handleSignOutClick = async () => {
    setSigningOut(true);
    try {
      await onSignOut();
      onClose();
    } finally {
      setSigningOut(false);
    }
  };

  const displayName =
    userProfile?.fullName || (userEmail ? userEmail.split('@')[0] : 'CinePulse Member');
  const isAdmin = userProfile?.role === 'admin';
  const initials = displayName
    .split(/\s+/)
    .map((p) => p[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[430px] rounded-2xl bg-[#111622] border border-white/[0.1] shadow-[0_30px_90px_rgba(0,0,0,0.85)] animate-modal relative overflow-hidden"
      >
        {/* Subtle top cyan specular accent bar */}
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#00E5FF] to-transparent opacity-80" />

        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-3.5 right-3.5 w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[#94A3B8] hover:text-white flex items-center justify-center transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {modal === 'app' && (
          <div className="p-6 space-y-4">
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
          <div className="p-6 sm:p-7">
            {userEmail ? (
              /* Signed-In Account Profile View */
              <div className="space-y-5">
                <div className="flex items-center gap-3.5 pr-8">
                  {userProfile?.avatarUrl ? (
                    <img
                      src={userProfile.avatarUrl}
                      alt={displayName}
                      className="w-12 h-12 rounded-full object-cover border border-[#00E5FF]/40"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#00E5FF] to-[#3B82F6] text-[#071018] font-black text-base flex items-center justify-center shrink-0">
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-extrabold text-[#F8FAFC] truncate">
                        {displayName}
                      </h3>
                      {isAdmin && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#00E5FF]/15 border border-[#00E5FF]/40 text-[10px] font-extrabold text-[#00E5FF] shrink-0">
                          <ShieldCheck className="w-3 h-3" />
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#94A3B8] truncate mt-0.5">{userEmail}</p>
                  </div>
                </div>

                <div className="rounded-xl bg-[#0B0D12] border border-white/[0.07] p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-[#94A3B8]">
                    <span>Account Status</span>
                    <span className="text-[#10B981] font-bold inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                      Verified Session
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#94A3B8]">
                    <span>Role</span>
                    <span className="text-[#F8FAFC] font-semibold">
                      {isAdmin ? 'Administrator' : 'Member'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {isAdmin && onOpenAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenAdmin();
                        onClose();
                      }}
                      className="w-full h-10 rounded-xl bg-[#00E5FF] hover:bg-[#33ECFF] text-[#071018] text-xs font-extrabold inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Open Admin Studio
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={signingOut}
                    onClick={handleSignOutClick}
                    className="w-full h-10 rounded-xl bg-[#1E2430] hover:bg-rose-500/20 hover:text-rose-300 border border-white/10 text-xs font-bold text-[#F8FAFC] inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                  >
                    {signingOut ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogOut className="w-4 h-4" />
                    )}
                    {signingOut ? 'Signing Out...' : 'Sign Out'}
                  </button>
                </div>
              </div>
            ) : (
              /* Signed-Out Professional Auth Form */
              <div className="space-y-5">
                <div className="pr-8">
                  {authTab === 'reset' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthTab('signin');
                        setErrorMsg(null);
                        setInfoMsg(null);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#00E5FF] hover:underline mb-2"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back to Sign In
                    </button>
                  ) : null}
                  <h3 className="text-xl font-extrabold text-[#F8FAFC] tracking-tight">
                    {authTab === 'signup'
                      ? 'Create your CinePulse account'
                      : authTab === 'reset'
                      ? 'Reset your password'
                      : 'Welcome back'}
                  </h3>
                  <p className="text-xs text-[#94A3B8] mt-1">
                    {authTab === 'signup'
                      ? 'Sync your Watchlist, continue watching, and downloads across devices.'
                      : authTab === 'reset'
                      ? 'Enter your account email and we will send a secure password reset link.'
                      : 'Sign in to CinePulse or access the Admin Studio.'}
                  </p>
                </div>

                {/* Mode Switcher Tabs */}
                {authTab !== 'reset' && (
                  <div className="grid grid-cols-2 p-1 rounded-xl bg-[#0B0D12] border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthTab('signin');
                        setErrorMsg(null);
                        setInfoMsg(null);
                      }}
                      className={`h-9 rounded-lg text-xs font-extrabold transition-all ${
                        authTab === 'signin'
                          ? 'bg-[#1B2232] text-[#F8FAFC] shadow-sm border border-white/10'
                          : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                      }`}
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthTab('signup');
                        setErrorMsg(null);
                        setInfoMsg(null);
                      }}
                      className={`h-9 rounded-lg text-xs font-extrabold transition-all ${
                        authTab === 'signup'
                          ? 'bg-[#1B2232] text-[#F8FAFC] shadow-sm border border-white/10'
                          : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                      }`}
                    >
                      Create Account
                    </button>
                  </div>
                )}

                {/* Google OAuth 1-Click Button */}
                {authTab !== 'reset' && (
                  <>
                    <button
                      type="button"
                      disabled={googleLoading || submitting}
                      onClick={handleGoogleLogin}
                      className="w-full h-11 rounded-xl bg-white hover:bg-slate-100 text-[#0F172A] text-xs font-extrabold inline-flex items-center justify-center gap-2.5 transition-colors shadow-sm disabled:opacity-60"
                    >
                      {googleLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-slate-700" />
                      ) : (
                        <GoogleLogo className="w-4 h-4" />
                      )}
                      {googleLoading ? 'Connecting to Google...' : 'Continue with Google'}
                    </button>

                    <div className="relative flex items-center">
                      <div className="flex-1 border-t border-white/[0.08]" />
                      <span className="px-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                        or continue with email
                      </span>
                      <div className="flex-1 border-t border-white/[0.08]" />
                    </div>
                  </>
                )}

                {/* Inline Error / Success Alerts */}
                {errorMsg && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/35 text-xs text-rose-200 flex items-start gap-2 leading-relaxed">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {infoMsg && (
                  <div className="p-3 rounded-xl bg-[#10B981]/10 border border-[#10B981]/35 text-xs text-emerald-200 flex items-start gap-2 leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
                    <span>{infoMsg}</span>
                  </div>
                )}

                {/* Email & Password Form */}
                <form onSubmit={handleEmailAuth} className="space-y-3">
                  {authTab === 'signup' && (
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-[#94A3B8] pl-0.5">
                        Full Name
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Your name"
                          autoComplete="name"
                          className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-[#0B0D12] border border-white/10 focus:border-[#00E5FF] text-sm text-[#F8FAFC] placeholder:text-[#475569] outline-none transition-colors"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#94A3B8] pl-0.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="email"
                        required
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                        className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-[#0B0D12] border border-white/10 focus:border-[#00E5FF] text-sm text-[#F8FAFC] placeholder:text-[#475569] outline-none transition-colors"
                      />
                    </div>
                  </div>

                  {authTab !== 'reset' && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between px-0.5">
                        <label className="text-[11px] font-bold text-[#94A3B8]">Password</label>
                        {authTab === 'signin' && (
                          <button
                            type="button"
                            onClick={() => {
                              setAuthTab('reset');
                              setErrorMsg(null);
                              setInfoMsg(null);
                            }}
                            className="text-[11px] font-semibold text-[#00E5FF] hover:underline"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          placeholder={
                            authTab === 'signup' ? 'At least 6 characters' : 'Enter your password'
                          }
                          autoComplete={
                            authTab === 'signup' ? 'new-password' : 'current-password'
                          }
                          className="w-full h-11 pl-10 pr-10 rounded-xl bg-[#0B0D12] border border-white/10 focus:border-[#00E5FF] text-sm text-[#F8FAFC] placeholder:text-[#475569] outline-none transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#CBD5E1] transition-colors"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || googleLoading}
                    className="w-full h-11 mt-1 rounded-xl bg-[#00E5FF] hover:bg-[#33ECFF] text-[#071018] font-extrabold text-sm inline-flex items-center justify-center gap-2 transition-all shadow-[0_8px_24px_rgba(0,229,255,0.25)] disabled:opacity-60"
                  >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {authTab === 'signup'
                      ? submitting
                        ? 'Creating Account...'
                        : 'Create Account'
                      : authTab === 'reset'
                      ? submitting
                        ? 'Sending Link...'
                        : 'Send Reset Link'
                      : submitting
                      ? 'Signing In...'
                      : 'Sign In'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

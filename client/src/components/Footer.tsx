import React, { useState } from 'react';
import {
  Globe,
  ChevronDown,
  X as CloseIcon,
  Play,
  Share2,
  Mail,
  Shield,
  FileText,
  Smartphone,
} from 'lucide-react';
import { UI_LANGUAGES } from '../data/catalog';
import type { NavRoute } from '../types/media';

interface FooterProps {
  onOpenAppModal?: () => void;
  uiLanguage: string;
  onChangeLanguage: (code: string) => void;
  onNavigate?: (route: NavRoute) => void;
}

// Custom clean SVG icons for Community platforms
const TwitterXIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const TikTokIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-2.891 2.891 2.896 2.896 0 0 1-2.89-2.891 2.896 2.896 0 0 1 2.89-2.89c.315 0 .619.051.902.144V9.458a6.31 6.31 0 0 0-.902-.065A6.335 6.335 0 0 0 3.15 15.728a6.335 6.335 0 0 0 6.333 6.334 6.336 6.336 0 0 0 6.334-6.334V8.347a8.163 8.163 0 0 0 4.772 1.529V6.431c-.34 0-.676-.086-1-.245z" />
  </svg>
);

const FacebookIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const WhatsAppIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M17.472 14.382c-.301-.15-1.78-.878-2.056-.978-.275-.1-.476-.15-.677.15-.201.301-.777.978-.953 1.179-.176.2-.351.226-.652.075-.301-.15-1.27-.468-2.42-1.494-.894-.798-1.498-1.784-1.674-2.085-.176-.301-.019-.464.132-.614.135-.135.301-.351.451-.527.151-.176.201-.301.301-.502.1-.2.05-.376-.025-.526-.075-.15-.677-1.632-.928-2.235-.245-.589-.494-.509-.677-.518-.176-.008-.376-.01-.577-.01-.201 0-.527.075-.803.376s-1.054 1.03-1.054 2.511 1.079 2.912 1.23 3.113c.15.2 2.124 3.243 5.145 4.549.718.311 1.28.497 1.718.636.723.23 1.381.197 1.902.12.58-.087 1.78-.727 2.03-1.43.251-.703.251-1.306.176-1.43-.075-.125-.276-.201-.577-.351zM12.04 2C6.517 2 2.025 6.49 2.025 12.01c0 1.916.541 3.704 1.48 5.23L2 22l4.908-1.455a9.98 9.98 0 0 0 5.132 1.465h.004c5.522 0 10.014-4.49 10.015-10.013C22.058 6.49 17.564 2 12.04 2z" />
  </svg>
);

const TelegramIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.52 2.77-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .34z" />
  </svg>
);

const AndroidRobotIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v6c0 .83.67 1.5 1.5 1.5S5 16.33 5 15.5v-6C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v6c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-6c0-.83-.67-1.5-1.5-1.5zm-4.97-4.84l1.3-1.3a.495.495 0 0 0-.7-.7l-1.48 1.48A7.994 7.994 0 0 0 12 2.1c-1.02 0-1.99.2-2.87.54L7.65 1.16a.495.495 0 0 0-.7.7l1.3 1.3A7.008 7.008 0 0 0 5.12 7h13.76a7.008 7.008 0 0 0-3.35-3.84zM9 5.5c-.41 0-.75-.34-.75-.75s.34-.75.75-.75.75.34.75.75-.34.75-.75.75zm6 0c-.41 0-.75-.34-.75-.75s.34-.75.75-.75.75.34.75.75-.34.75-.75.75z" />
  </svg>
);

export const Footer: React.FC<FooterProps> = ({
  onOpenAppModal,
  uiLanguage,
  onChangeLanguage,
  onNavigate,
}) => {
  const [langOpen, setLangOpen] = useState(false);
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | null>(null);
  const activeLang = UI_LANGUAGES.find((l) => l.code === uiLanguage) || UI_LANGUAGES[0];

  const handleShare = (platform: 'x' | 'tiktok' | 'fb' | 'wa' | 'tg') => {
    const url = encodeURIComponent('https://www.cenipluse.xyz');
    const text = encodeURIComponent('Watch movies, series & anime in HD on CeniPluse!');
    if (platform === 'x') {
      window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank');
    } else if (platform === 'fb') {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
    } else if (platform === 'wa') {
      window.open(`https://wa.me/?text=${text}%20${url}`, '_blank');
    } else if (platform === 'tg') {
      window.open(`https://t.me/share/url?url=${url}&text=${text}`, '_blank');
    } else if (platform === 'tiktok') {
      window.open('https://www.tiktok.com', '_blank');
    }
  };

  const backlinks = [
    { label: 'novelHub', href: '#' },
    { label: 'Free Movies', route: 'movies' as NavRoute },
    { label: 'netnaija movies', route: 'movies' as NavRoute },
    { label: 'ez jobs', href: '#' },
    { label: 'CeniPluse Download', action: () => onOpenAppModal?.() },
    { label: 'Sflix Film', route: 'movies' as NavRoute },
    { label: 'CeniPluse Backup', route: 'home' as NavRoute },
    { label: '123Movies', route: 'movies' as NavRoute },
    { label: 'The CeniPluse', route: 'home' as NavRoute },
    { label: 'CeniPluse online', route: 'movies' as NavRoute },
  ];

  return (
    <footer className="w-full bg-[#0D1017] border-t border-white/[0.06] text-[#94A3B8] text-xs pt-8 pb-12 px-5 sm:px-8 mt-12 select-none">
      <div className="max-w-6xl mx-auto space-y-7">
        {/* Brand & Language Selector */}
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#00E5FF] to-[#10B981] flex items-center justify-center shadow-lg shadow-[#00E5FF]/20">
              <Play className="w-4 h-4 text-[#071018] fill-current ml-0.5" />
            </div>
            <span className="text-lg font-black tracking-tight text-[#F8FAFC]">
              Ceni<span className="text-[#00E5FF]">Pluse</span>
            </span>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setLangOpen((o) => !o)}
              className="px-3 py-1.5 rounded-lg bg-[#141821] hover:bg-[#1E2430] border border-white/[0.08] text-[#F8FAFC] text-xs font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <Globe className="w-3.5 h-3.5 text-[#00E5FF]" />
              <span className="uppercase tracking-wider">{activeLang.label}</span>
              <ChevronDown
                className={`w-3 h-3 text-[#94A3B8] transition-transform ${
                  langOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {langOpen && (
              <div className="absolute right-0 bottom-full mb-1.5 w-40 bg-[#141821] border border-white/[0.1] rounded-xl shadow-2xl py-1 z-40">
                {UI_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => {
                      onChangeLanguage(lang.code);
                      setLangOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs font-medium flex items-center justify-between hover:bg-white/[0.06] ${
                      lang.code === uiLanguage ? 'text-[#00E5FF]' : 'text-[#F8FAFC]'
                    }`}
                  >
                    <span>{lang.label}</span>
                    <span className="text-[10px] text-[#94A3B8]">{lang.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Get CeniPluse App */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-bold text-[#F8FAFC] tracking-wide">Get CeniPluse app</h4>
          <div>
            <button
              type="button"
              onClick={onOpenAppModal}
              className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#141821] hover:bg-[#1C2230] border border-white/[0.08] text-left transition-all active:scale-[0.98] group"
            >
              <div className="text-[#10B981] group-hover:scale-105 transition-transform">
                <AndroidRobotIcon className="w-6 h-6 fill-current" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#94A3B8] leading-none">
                  Download our
                </div>
                <div className="text-xs font-bold text-[#F8FAFC] leading-tight">Android App</div>
              </div>
            </button>
          </div>
        </div>

        {/* Community */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-bold text-[#F8FAFC] tracking-wide">Community</h4>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleShare('x')}
              title="Share on X"
              aria-label="Share on X"
              className="w-9 h-9 rounded-full bg-[#141821] hover:bg-[#1E2430] border border-white/[0.08] text-[#CBD5E1] hover:text-[#00E5FF] flex items-center justify-center transition-colors"
            >
              <TwitterXIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleShare('tiktok')}
              title="TikTok"
              aria-label="TikTok"
              className="w-9 h-9 rounded-full bg-[#141821] hover:bg-[#1E2430] border border-white/[0.08] text-[#CBD5E1] hover:text-[#00E5FF] flex items-center justify-center transition-colors"
            >
              <TikTokIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleShare('fb')}
              title="Share on Facebook"
              aria-label="Share on Facebook"
              className="w-9 h-9 rounded-full bg-[#141821] hover:bg-[#1E2430] border border-white/[0.08] text-[#CBD5E1] hover:text-[#00E5FF] flex items-center justify-center transition-colors"
            >
              <FacebookIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleShare('wa')}
              title="Share on WhatsApp"
              aria-label="Share on WhatsApp"
              className="w-9 h-9 rounded-full bg-[#141821] hover:bg-[#1E2430] border border-white/[0.08] text-[#CBD5E1] hover:text-[#10B981] flex items-center justify-center transition-colors"
            >
              <WhatsAppIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleShare('tg')}
              title="Share on Telegram"
              aria-label="Share on Telegram"
              className="w-9 h-9 rounded-full bg-[#141821] hover:bg-[#1E2430] border border-white/[0.08] text-[#CBD5E1] hover:text-[#00E5FF] flex items-center justify-center transition-colors"
            >
              <TelegramIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Contact Us */}
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-[#F8FAFC] tracking-wide">Contact Us</h4>
          <p className="text-xs text-[#94A3B8]">
            Service Email:{' '}
            <a
              href="mailto:support@cenipluse.xyz"
              className="text-[#00E5FF] hover:underline font-medium"
            >
              support@cenipluse.xyz
            </a>
          </p>
        </div>

        {/* About CeniPluse */}
        <div className="space-y-2 pt-2 border-t border-white/[0.06]">
          <h4 className="text-xs font-bold text-[#F8FAFC] tracking-wide">About CeniPluse</h4>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText?.('https://www.cenipluse.xyz');
                alert('Official link copied: https://www.cenipluse.xyz');
              }}
              className="hover:text-[#F8FAFC] transition-colors"
            >
              Official Link Release
            </button>
            <button
              type="button"
              onClick={onOpenAppModal}
              className="hover:text-[#F8FAFC] transition-colors"
            >
              Download CeniPluse APK
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('privacy')}
              className="hover:text-[#F8FAFC] transition-colors"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('terms')}
              className="hover:text-[#F8FAFC] transition-colors"
            >
              User Agreement
            </button>
          </div>
        </div>

        {/* Backlink */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-[#F8FAFC] tracking-wide">Backlink</h4>
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-[#64748B]">
            {backlinks.map((link, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  if (link.action) link.action();
                  else if (link.route && onNavigate) onNavigate(link.route);
                }}
                className="hover:text-[#00E5FF] transition-colors"
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="space-y-2 pt-2 border-t border-white/[0.06]">
          <p className="text-[11px] leading-relaxed text-[#64748B]">
            Disclaimer: All videos and pictures on CeniPluse are from the Internet, and their
            copyrights belong to the original creators. We only provide webpage services and do not
            store, record, or upload any content.
          </p>
          <p className="text-[10px] text-[#475569]">
            © {new Date().getFullYear()} CeniPluse. All rights reserved.
          </p>
        </div>
      </div>

      {/* Legal Policy Modal */}
      {legalModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLegalModal(null)}
        >
          <div
            className="w-full max-w-lg bg-[#141821] border border-white/10 rounded-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-[#00E5FF]">
                {legalModal === 'privacy' ? (
                  <Shield className="w-5 h-5" />
                ) : (
                  <FileText className="w-5 h-5" />
                )}
                <h3 className="text-base font-bold text-[#F8FAFC]">
                  {legalModal === 'privacy' ? 'Privacy Policy' : 'User Agreement'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-[#94A3B8] hover:text-white"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-[#CBD5E1] space-y-3 leading-relaxed">
              {legalModal === 'privacy' ? (
                <>
                  <p>
                    <strong>CeniPluse</strong> respects and protects user privacy. We do not collect
                    or store sensitive personal data. Watchlist and viewing progress are stored
                    locally on your device.
                  </p>
                  <p>
                    All video metadata, covers, posters, and cast summaries are retrieved from TMDB
                    (The Movie Database) and public media discovery APIs.
                  </p>
                  <p>
                    Third-party video players and external mirrors adhere to their respective
                    independent privacy policies. We encourage users to browse securely.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <strong>CeniPluse User Agreement</strong>
                  </p>
                  <p>
                    By accessing or using CeniPluse, you acknowledge and agree that this website is an
                    indexing and discovery portal. CeniPluse does not host, upload, manage, or store
                    any media files or video streams on its servers.
                  </p>
                  <p>
                    All media streams are provided by independent third-party sources. CeniPluse is
                    not liable for the content, quality, or availability of third-party streams.
                  </p>
                  <p>
                    Users agree to utilize this service in accordance with local regulations and
                    respect all original copyright holders.
                  </p>
                </>
              )}
            </div>

            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="px-4 py-2 rounded-xl bg-[#00E5FF] text-[#071018] font-bold text-xs hover:bg-[#33ECFF]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
};

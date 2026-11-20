import { createClient, type Session, type User } from '@supabase/supabase-js';

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

const SUPABASE_URL =
  viteEnv?.VITE_SUPABASE_URL?.trim() ||
  'https://xtamnpttbtixulsgewav.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  viteEnv?.VITE_SUPABASE_ANON_KEY?.trim() ||
  'sb_publishable_yXAt3FBX-0ONT_G5up5X5g_SP9cr4bs';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'cinepulse_sb_auth',
  },
});

export interface AuthUserProfile {
  id: string;
  email: string;
  role: 'admin' | 'user';
  fullName: string;
  avatarUrl: string;
  provider: string;
}

export function extractAuthProfile(user: User | null | undefined): AuthUserProfile | null {
  if (!user || !user.email) return null;
  const appRole = String(user.app_metadata?.role || '').toLowerCase();
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  return {
    id: user.id,
    email: user.email,
    role: appRole === 'admin' ? 'admin' : 'user',
    fullName:
      String(meta.full_name || meta.name || '').trim() || user.email.split('@')[0],
    avatarUrl: String(meta.avatar_url || meta.picture || '').trim(),
    provider: String(user.app_metadata?.provider || 'email'),
  };
}

export function syncSessionToken(session: Session | null): void {
  try {
    if (session?.access_token) {
      localStorage.setItem('cinepulse_token', session.access_token);
      if (session.user?.email) {
        localStorage.setItem('cinepulse_user', session.user.email);
      }
    } else {
      localStorage.removeItem('cinepulse_token');
      localStorage.removeItem('cinepulse_user');
    }
  } catch {
    // ignore storage errors
  }
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new Error(error.message);
  syncSessionToken(data.session);
  return data;
}

export async function signUpWithEmail(email: string, password: string, fullName?: string) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: window.location.origin,
      data: fullName?.trim() ? { full_name: fullName.trim() } : undefined,
    },
  });
  if (error) throw new Error(error.message);
  if (data.session) {
    syncSessionToken(data.session);
  }
  return data;
}

export async function signInWithGoogle() {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
    },
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin,
  });
  if (error) throw new Error(error.message);
}

export async function signOutSupabase() {
  syncSessionToken(null);
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

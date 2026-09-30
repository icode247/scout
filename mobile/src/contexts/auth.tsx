import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import type { Provider, Session } from '@supabase/supabase-js';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const DEMO_KEY = 'scout-demo-preview';
const demoAllowed = __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEMO === 'true';

type AuthContextValue = {
  session: Session | null;
  isDemo: boolean;
  isAuthenticated: boolean;
  isReady: boolean;
  isConfigured: boolean;
  demoAllowed: boolean;
  signInWithProvider: (provider: 'google' | 'apple') => Promise<void>;
  signInWithApple: () => Promise<void>;
  sendMagicLink: (email: string) => Promise<void>;
  completeAuthUrl: (url: string) => Promise<void>;
  enterDemo: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function redirectUri() {
  return AuthSession.makeRedirectUri({ scheme: 'scout', path: 'auth/callback' });
}

function paramsFromUrl(url: string) {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  hash.forEach((value, key) => params.set(key, value));
  return params;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const completeAuthUrl = useCallback(async (url: string) => {
    if (!isSupabaseConfigured) throw new Error('Scout authentication is not configured for this build.');
    const params = paramsFromUrl(url);
    const error = params.get('error_description') || params.get('error');
    if (error) throw new Error(error.replaceAll('+', ' '));

    const code = params.get('code');
    if (code) {
      const result = await supabase.auth.exchangeCodeForSession(code);
      if (result.error) throw result.error;
      return;
    }

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) {
      const result = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (result.error) throw result.error;
      return;
    }

    const tokenHash = params.get('token_hash');
    const type = params.get('type');
    if (tokenHash && type) {
      const result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as 'email' });
      if (result.error) throw result.error;
      return;
    }

    throw new Error('The sign-in link is invalid or has expired.');
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      isSupabaseConfigured ? supabase.auth.getSession() : Promise.resolve({ data: { session: null } }),
      demoAllowed && Platform.OS === 'web'
        ? Promise.resolve(
            typeof window !== 'undefined' && (
              localStorage.getItem(DEMO_KEY) === '1' ||
              new URL(window.location.href).searchParams.get('preview') === '1'
            ),
          )
        : Promise.resolve(false),
    ]).then(([result, rememberedDemo]) => {
      if (!mounted) return;
      setSession(result.data.session);
      setIsDemo(Boolean(rememberedDemo));
      setIsReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || !isSupabaseConfigured) return;
    const update = (state: string) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    };
    update(AppState.currentState);
    const subscription = AppState.addEventListener('change', update);
    return () => subscription.remove();
  }, []);

  const signInWithProvider = useCallback(async (provider: 'google' | 'apple') => {
    if (!isSupabaseConfigured) throw new Error('Add Scout’s public Supabase values to mobile/.env.local first.');
    const callback = redirectUri();
    const result = await supabase.auth.signInWithOAuth({
      provider: provider as Provider,
      options: { redirectTo: callback, skipBrowserRedirect: true },
    });
    if (result.error) throw result.error;
    if (!result.data.url) throw new Error('The sign-in window could not be opened.');
    const browser = await WebBrowser.openAuthSessionAsync(result.data.url, callback);
    if (browser.type === 'success') await completeAuthUrl(browser.url);
  }, [completeAuthUrl]);

  const signInWithApple = useCallback(async () => {
    if (Platform.OS !== 'ios') return signInWithProvider('apple');
    if (!isSupabaseConfigured) throw new Error('Add Scout’s public Supabase values to mobile/.env.local first.');

    const AppleAuthentication = await import('expo-apple-authentication');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('Apple did not return an identity token.');

      const result = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (result.error) throw result.error;

      const nameParts = [
        credential.fullName?.givenName,
        credential.fullName?.middleName,
        credential.fullName?.familyName,
      ].map((part) => part?.trim()).filter((part): part is string => Boolean(part));
      if (nameParts.length && result.data.user) {
        const fullName = nameParts.join(' ');
        // Apple supplies the name only on first consent. Preserve it in both
        // auth metadata and Scout's user-owned profile while it is available.
        await Promise.all([
          supabase.auth.updateUser({
            data: {
              full_name: fullName,
              given_name: credential.fullName?.givenName,
              family_name: credential.fullName?.familyName,
            },
          }),
          supabase.from('profiles').update({ full_name: fullName }).eq('user_id', result.data.user.id),
        ]);
      }
    } catch (reason) {
      const code = reason && typeof reason === 'object' && 'code' in reason ? String(reason.code) : '';
      if (code === 'ERR_REQUEST_CANCELED') return;
      throw reason;
    }
  }, [signInWithProvider]);

  const sendMagicLink = useCallback(async (email: string) => {
    if (!isSupabaseConfigured) throw new Error('Add Scout’s public Supabase values to mobile/.env.local first.');
    const result = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUri(), shouldCreateUser: true },
    });
    if (result.error) throw result.error;
  }, []);

  const enterDemo = useCallback(() => {
    if (!demoAllowed) return;
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') localStorage.setItem(DEMO_KEY, '1');
    setIsDemo(true);
  }, []);

  const signOut = useCallback(async () => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') localStorage.removeItem(DEMO_KEY);
    setIsDemo(false);
    if (session) await supabase.auth.signOut();
  }, [session]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    isDemo,
    isAuthenticated: Boolean(session) || isDemo,
    isReady,
    isConfigured: isSupabaseConfigured,
    demoAllowed,
    signInWithProvider,
    signInWithApple,
    sendMagicLink,
    completeAuthUrl,
    enterDemo,
    signOut,
  }), [completeAuthUrl, enterDemo, isDemo, isReady, sendMagicLink, session, signInWithApple, signInWithProvider, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

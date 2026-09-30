import 'react-native-url-polyfill/auto';

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || '';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseKey &&
  !supabaseUrl.includes('YOUR_PROJECT') &&
  !supabaseKey.includes('YOUR_PUBLISHABLE'),
);

const CHUNK_SIZE = 1_800;

/**
 * Supabase sessions can exceed SecureStore's conservative per-value limit.
 * Chunking keeps the entire refreshable session in Keychain/Keystore instead
 * of falling back to unencrypted AsyncStorage.
 */
const secureSessionStorage = {
  async getItem(key: string) {
    if (Platform.OS === 'web') {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    }
    const metadata = await SecureStore.getItemAsync(`${key}.__chunks`);
    if (!metadata) return SecureStore.getItemAsync(key);
    const count = Number(metadata);
    if (!Number.isInteger(count) || count < 1) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(`${key}.${index}`)),
    );
    return chunks.some((chunk) => chunk == null) ? null : chunks.join('');
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      return;
    }
    const previous = Number(await SecureStore.getItemAsync(`${key}.__chunks`)) || 0;
    const chunks = Array.from(
      { length: Math.ceil(value.length / CHUNK_SIZE) },
      (_, index) => value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
    );
    await Promise.all(chunks.map((chunk, index) => SecureStore.setItemAsync(`${key}.${index}`, chunk)));
    await SecureStore.setItemAsync(`${key}.__chunks`, String(chunks.length));
    await SecureStore.deleteItemAsync(key);
    if (previous > chunks.length) {
      await Promise.all(
        Array.from({ length: previous - chunks.length }, (_, index) =>
          SecureStore.deleteItemAsync(`${key}.${chunks.length + index}`),
        ),
      );
    }
  },
  async removeItem(key: string) {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
      return;
    }
    const count = Number(await SecureStore.getItemAsync(`${key}.__chunks`)) || 0;
    await Promise.all([
      SecureStore.deleteItemAsync(key),
      SecureStore.deleteItemAsync(`${key}.__chunks`),
      ...Array.from({ length: count }, (_, index) => SecureStore.deleteItemAsync(`${key}.${index}`)),
    ]);
  },
};

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseKey : 'placeholder-publishable-key',
  {
    auth: {
      storage: secureSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  },
);


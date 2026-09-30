import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts as useManropeFonts,
} from '@expo-google-fonts/manrope';
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';

import { AuthProvider, useAuth } from '@/contexts/auth';
import { ToastProvider } from '@/contexts/toast';
import { ScoutApiError } from '@/lib/api';
import { colors, fonts } from '@/theme/tokens';

void SplashScreen.preventAutoHideAsync();

const scoutNavigationTheme = {
  ...DarkTheme,
  dark: false,
  colors: {
    ...DarkTheme.colors,
    primary: colors.signalDark,
    background: colors.brandSurface,
    card: colors.white,
    text: colors.ink,
    border: colors.line,
    notification: colors.brand,
  },
};

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { isAuthenticated, isReady } = useAuth();

  useEffect(() => {
    if (fontsReady && isReady) void SplashScreen.hideAsync();
  }, [fontsReady, isReady]);

  if (!fontsReady || !isReady) return null;

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.white },
        headerTitleStyle: { fontFamily: fonts.bodyExtraBold, fontSize: 16 },
        contentStyle: { backgroundColor: colors.brandSurface },
        animation: Platform.OS === 'android' ? 'slide_from_right' : 'default',
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="auth/callback" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="job/[id]" options={{ title: 'Job details', presentation: 'modal' }} />
        <Stack.Screen name="application/[id]" options={{ title: 'Application' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => error instanceof ScoutApiError && error.status < 500 ? false : failureCount < 2,
        refetchOnReconnect: true,
      },
    },
  }));
  const [fontsReady] = useManropeFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={scoutNavigationTheme}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>
              <RootNavigator fontsReady={fontsReady} />
              <StatusBar style="dark" />
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });

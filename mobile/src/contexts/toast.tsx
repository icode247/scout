import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { colors, radius, shadows, spacing } from '@/theme/tokens';

type Tone = 'success' | 'error' | 'info';
type ToastValue = { showToast: (message: string, tone?: Tone) => void };
const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ message: string; tone: Tone } | null>(null);
  const [translate] = useState(() => new Animated.Value(24));
  const [opacity] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, tone: Tone = 'success') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, tone });
    translate.setValue(24);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(translate, { toValue: 0, damping: 18, stiffness: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    timer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translate, { toValue: 16, duration: 170, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 170, useNativeDriver: true }),
      ]).start(() => setToast(null));
    }, 2800);
  }, [opacity, translate]);

  const palette = toast?.tone === 'error'
    ? { background: colors.danger, icon: 'alert-circle' as const }
    : toast?.tone === 'info'
      ? { background: colors.forestRaised, icon: 'info' as const }
      : { background: colors.forest, icon: 'check-circle' as const };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast ? (
        <View style={[StyleSheet.absoluteFill, styles.noPointer]}>
          <Animated.View style={[styles.toast, shadows.raised, { bottom: Math.max(92, insets.bottom + 80), backgroundColor: palette.background, opacity, transform: [{ translateY: translate }] }]}>
            <Icon name={palette.icon} size={19} color={colors.brandBright} />
            <AppText variant="label" tone="inverse" style={styles.message}>{toast.message}</AppText>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}

const styles = StyleSheet.create({
  noPointer: { pointerEvents: 'none' },
  toast: { position: 'absolute', left: spacing.lg, right: spacing.lg, minHeight: 54, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  message: { flex: 1 },
});

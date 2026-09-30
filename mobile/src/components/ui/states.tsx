import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from './app-text';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { colors, radius, spacing } from '@/theme/tokens';

export function LoadingState({ label = 'Loading your Scout desk…' }: { label?: string }) {
  return (
    <View style={styles.state} accessibilityRole="progressbar">
      <View style={styles.loadingMark}><ActivityIndicator color={colors.brandBright} /></View>
      <AppText variant="bodyMedium" tone="soft">{label}</AppText>
    </View>
  );
}

export function EmptyState({ icon = 'inbox', title, message, actionLabel, onAction }: {
  icon?: IconName; title: string; message: string; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <View style={styles.state}>
      <View style={styles.iconCircle}><Icon name={icon} size={23} color={colors.signalDark} /></View>
      <AppText variant="h3" style={styles.center}>{title}</AppText>
      <AppText tone="muted" style={styles.center}>{message}</AppText>
      {actionLabel ? <Button label={actionLabel} onPress={onAction} variant="secondary" /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.state}>
      <View style={[styles.iconCircle, { backgroundColor: colors.dangerSoft }]}><Icon name="alert-circle" size={23} color={colors.danger} /></View>
      <AppText variant="h3" style={styles.center}>Scout hit a snag</AppText>
      <AppText tone="muted" style={styles.center}>{message}</AppText>
      {onRetry ? <Button label="Try again" onPress={onRetry} variant="secondary" icon="refresh-cw" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  state: { flex: 1, minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xxl },
  center: { textAlign: 'center', maxWidth: 310 },
  iconCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.signalSoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  loadingMark: { width: 54, height: 54, borderRadius: radius.lg, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
});


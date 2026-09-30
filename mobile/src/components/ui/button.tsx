import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

type Variant = 'primary' | 'lime' | 'secondary' | 'ghost' | 'danger';
type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  trailing?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
};

const palette = {
  primary: { background: colors.forest, foreground: colors.white, pressed: colors.forestRaised, border: colors.forest },
  lime: { background: colors.brandBright, foreground: colors.forest, pressed: colors.brand, border: colors.brandBright },
  secondary: { background: colors.white, foreground: colors.ink, pressed: colors.surfaceSoft, border: colors.lineStrong },
  ghost: { background: colors.transparent, foreground: colors.inkSoft, pressed: colors.surfaceSoft, border: colors.transparent },
  danger: { background: colors.dangerSoft, foreground: colors.danger, pressed: '#F9DADD', border: colors.dangerSoft },
} as const;

export function Button({
  label, onPress, variant = 'primary', icon, trailing, loading = false, disabled = false, fullWidth = false,
  accessibilityLabel,
}: Props) {
  const colorsForVariant = palette[variant];
  const blocked = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        fullWidth && styles.fullWidth,
        {
          backgroundColor: pressed ? colorsForVariant.pressed : colorsForVariant.background,
          borderColor: colorsForVariant.border,
          opacity: blocked ? 0.48 : 1,
        },
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={colorsForVariant.foreground} /> : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={18} color={colorsForVariant.foreground} /> : null}
          <AppText style={[styles.label, { color: colorsForVariant.foreground }]}>{label}</AppText>
          {trailing}
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon, onPress, label, tone = 'default', size = 50, disabled = false,
}: { icon: IconName; onPress?: () => void; label: string; tone?: 'default' | 'apply' | 'skip' | 'save'; size?: number; disabled?: boolean }) {
  const toneStyle = {
    default: { background: colors.white, foreground: colors.inkSoft, border: colors.lineStrong },
    apply: { background: colors.forest, foreground: colors.brandBright, border: colors.forest },
    skip: { background: colors.white, foreground: colors.danger, border: colors.lineStrong },
    save: { background: colors.brandSoft, foreground: colors.forest, border: colors.brandSoft },
  }[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: toneStyle.background, borderColor: toneStyle.border },
        pressed && { transform: [{ scale: 0.94 }] },
        disabled && { opacity: 0.35 },
      ]}
    >
      <Icon name={icon} size={size * 0.4} color={toneStyle.foreground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    boxSizing: 'border-box',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { width: '100%' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  label: { fontFamily: fonts.bodyExtraBold, fontSize: 14, lineHeight: 18 },
  iconButton: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});

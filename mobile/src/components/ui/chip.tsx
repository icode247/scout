import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './app-text';
import { colors, radius, spacing } from '@/theme/tokens';

type Tone = 'neutral' | 'brand' | 'signal' | 'human' | 'dark';
const tones = {
  neutral: { background: colors.surface, foreground: colors.inkSoft, border: colors.line },
  brand: { background: colors.brandSoft, foreground: colors.forest, border: colors.brandSoft },
  signal: { background: colors.signalSoft, foreground: colors.signalDark, border: colors.signalSoft },
  human: { background: colors.humanSoft, foreground: colors.humanDark, border: colors.humanSoft },
  dark: { background: colors.forest, foreground: colors.white, border: colors.forest },
};

export function Chip({ label, tone = 'neutral', icon, onPress, selected = false }: {
  label: string; tone?: Tone; icon?: ReactNode; onPress?: () => void; selected?: boolean;
}) {
  const palette = selected ? tones.dark : tones[tone];
  const content = (
    <>
      {icon}
      <AppText variant="caption" style={{ color: palette.foreground }}>{label}</AppText>
    </>
  );
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ pressed }) => [styles.chip, { backgroundColor: palette.background, borderColor: palette.border }, pressed && { opacity: 0.72 }]}
      >
        {content}
      </Pressable>
    );
  }
  return <View style={[styles.chip, { backgroundColor: palette.background, borderColor: palette.border }]}>{content}</View>;
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
});


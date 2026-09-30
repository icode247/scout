import type { ComponentProps } from 'react';
import { Text, StyleSheet } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

type TextVariant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyMedium' | 'label' | 'caption' | 'eyebrow';
type Props = ComponentProps<typeof Text> & { variant?: TextVariant; tone?: 'default' | 'soft' | 'muted' | 'inverse' | 'brand' | 'signal' | 'human' | 'danger' };

export function AppText({ variant = 'body', tone = 'default', style, ...props }: Props) {
  return <Text {...props} style={[styles.base, styles[variant], tones[tone], style]} />;
}

const tones = StyleSheet.create({
  default: { color: colors.ink },
  soft: { color: colors.inkSoft },
  muted: { color: colors.inkMuted },
  inverse: { color: colors.white },
  brand: { color: colors.brandBright },
  signal: { color: colors.signalDark },
  human: { color: colors.humanDark },
  danger: { color: colors.danger },
});

const styles = StyleSheet.create({
  base: { fontFamily: fonts.body, color: colors.ink },
  display: { fontFamily: fonts.displayBold, fontSize: 42, lineHeight: 44, letterSpacing: -1.35 },
  h1: { fontFamily: fonts.displayBold, fontSize: 32, lineHeight: 35, letterSpacing: -0.8 },
  h2: { fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 28, letterSpacing: -0.45 },
  h3: { fontFamily: fonts.bodyExtraBold, fontSize: 17, lineHeight: 22, letterSpacing: -0.15 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 15 },
  eyebrow: { fontFamily: fonts.bodyExtraBold, fontSize: 10, lineHeight: 14, letterSpacing: 1.1, textTransform: 'uppercase' },
});


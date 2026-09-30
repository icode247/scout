import { Image, StyleSheet, View } from 'react-native';

import { AppText } from './app-text';
import { colors, fonts } from '@/theme/tokens';

export function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <Image
      source={require('../../../assets/images/scout-icon.png')}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.22) }}
      accessibilityLabel="Scout"
    />
  );
}

export function BrandLogo({ inverse = false, compact = false }: { inverse?: boolean; compact?: boolean }) {
  return (
    <View style={styles.logo}>
      <BrandMark size={compact ? 32 : 38} />
      <AppText style={[styles.wordmark, inverse && { color: colors.white }, compact && styles.compact]}>Scout</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  wordmark: { color: colors.forest, fontFamily: fonts.displayBold, fontSize: 25, lineHeight: 30, letterSpacing: -0.8 },
  compact: { fontSize: 22, lineHeight: 26 },
});

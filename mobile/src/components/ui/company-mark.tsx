import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { AppText } from './app-text';
import { initials } from '@/lib/format';
import { colors, fonts, radius } from '@/theme/tokens';

export function CompanyMark({ company, logo, size = 48 }: { company: string; logo?: string | null; size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: Math.max(radius.sm, size * 0.22) }]}>
      {logo ? (
        <Image source={{ uri: logo }} contentFit="contain" style={{ width: size - 14, height: size - 14 }} transition={150} />
      ) : (
        <AppText style={[styles.initials, { fontSize: Math.max(11, size * 0.26) }]}>{initials(company)}</AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  initials: { color: colors.forest, fontFamily: fonts.bodyExtraBold },
});


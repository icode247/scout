import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { BrandMark } from '@/components/ui/brand';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/states';
import { useAuth } from '@/contexts/auth';
import { colors, spacing } from '@/theme/tokens';

export default function AuthCallbackScreen() {
  const { completeAuthUrl, isAuthenticated } = useAuth();
  const incomingUrl = Linking.useURL();
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAuthenticated) router.replace('/(tabs)');
  }, [isAuthenticated]);

  useEffect(() => {
    if (!incomingUrl || isAuthenticated) return;
    void completeAuthUrl(incomingUrl).catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'This sign-in link could not be verified.');
    });
  }, [completeAuthUrl, incomingUrl, isAuthenticated]);

  return (
    <SafeAreaView style={styles.safe}>
      {error ? (
        <View style={styles.content}>
          <BrandMark size={58} />
          <AppText variant="h2" style={styles.center}>That link did not work</AppText>
          <AppText tone="muted" style={styles.center}>{error}</AppText>
          <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} />
        </View>
      ) : <LoadingState label="Opening your Scout desk…" />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandSurface },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  center: { textAlign: 'center', maxWidth: 330 },
});

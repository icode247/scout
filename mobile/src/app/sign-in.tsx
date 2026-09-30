import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { AppText } from '@/components/ui/app-text';
import { AppleSignInButton } from '@/components/auth/apple-sign-in-button';
import { BrandLogo, BrandMark } from '@/components/ui/brand';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useAuth } from '@/contexts/auth';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const { signInWithApple, signInWithProvider, sendMagicLink, enterDemo, demoAllowed, isConfigured } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState<'google' | 'apple' | 'email' | null>(null);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function withLoading(kind: 'google' | 'apple', action: () => Promise<void>) {
    setError('');
    setLoading(kind);
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign-in could not start.'); }
    finally { setLoading(null); }
  }

  async function submitEmail() {
    const normalized = email.trim().toLowerCase();
    if (!emailPattern.test(normalized)) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    setLoading('email');
    try {
      await sendMagicLink(normalized);
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not send that link.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.orbOne} />
      <View style={styles.orbTwo} />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.hero}>
              <BrandLogo inverse />
              <View style={styles.heroCopy}>
                <AppText variant="eyebrow" tone="brand">Your application desk</AppText>
                <AppText variant="display" tone="inverse">Swipe less. Interview more.</AppText>
                <AppText tone="inverse" style={styles.heroBody}>
                  Review matched roles in seconds. Scout prepares the application, keeps you in control, and leaves a clear record.
                </AppText>
              </View>
              <View style={styles.promiseRow}>
                {['Matched roles', 'Tailored resume', 'Visible proof'].map((label) => (
                  <View key={label} style={styles.promise}><Icon name="check" size={13} color={colors.brandBright} /><AppText variant="caption" tone="inverse">{label}</AppText></View>
                ))}
              </View>
            </View>

            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.mobileMark}><BrandMark size={42} /></View>
              <AppText variant="h2">Welcome to Scout</AppText>
              <AppText tone="muted" style={styles.sheetIntro}>Sign in with the same account you use on applyscout.app.</AppText>

              {!isConfigured ? (
                <View style={styles.configNotice}>
                  <Icon name="tool" size={17} color={colors.warning} />
                  <AppText variant="caption" style={styles.configText}>Live auth needs the public values in mobile/.env.local. Preview mode is ready below.</AppText>
                </View>
              ) : null}

              <View style={styles.actions}>
                {Platform.OS === 'ios' || Platform.OS === 'web' ? (
                  <AppleSignInButton
                    loading={loading === 'apple'}
                    disabled={Boolean(loading && loading !== 'apple')}
                    onPress={() => void withLoading('apple', signInWithApple)}
                  />
                ) : null}
                <Button
                  label="Continue with Google"
                  variant="secondary"
                  icon="chrome"
                  fullWidth
                  loading={loading === 'google'}
                  disabled={Boolean(loading && loading !== 'google')}
                  onPress={() => void withLoading('google', () => signInWithProvider('google'))}
                />
              </View>

              <View style={styles.divider}><View style={styles.line} /><AppText variant="eyebrow" tone="muted">or use email</AppText><View style={styles.line} /></View>

              {sent ? (
                <View style={styles.sentCard}>
                  <View style={styles.sentIcon}><Icon name="mail" size={20} color={colors.signalDark} /></View>
                  <View style={styles.sentCopy}>
                    <AppText variant="h3">Check your email</AppText>
                    <AppText variant="caption" tone="muted">We sent a secure sign-in link to {email.trim().toLowerCase()}.</AppText>
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => setSent(false)}><AppText variant="label" tone="signal">Change</AppText></Pressable>
                </View>
              ) : (
                <View style={styles.emailArea}>
                  <View style={[styles.inputWrap, error && styles.inputError]}>
                    <Icon name="mail" size={18} color={colors.inkMuted} />
                    <TextInput
                      accessibilityLabel="Email address"
                      value={email}
                      onChangeText={(value) => { setEmail(value); setError(''); }}
                      onSubmitEditing={() => void submitEmail()}
                      placeholder="you@example.com"
                      placeholderTextColor={colors.inkMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      keyboardType="email-address"
                      returnKeyType="go"
                      style={styles.input}
                    />
                  </View>
                  <Button label="Email me a secure link" variant="lime" fullWidth loading={loading === 'email'} disabled={Boolean(loading && loading !== 'email')} onPress={() => void submitEmail()} />
                </View>
              )}

              {error ? <AppText variant="caption" tone="danger" style={styles.error} accessibilityRole="alert">{error}</AppText> : null}

              {demoAllowed ? (
                <Pressable accessibilityRole="button" onPress={enterDemo} style={styles.previewButton}>
                  <Icon name="play-circle" size={17} color={colors.signalDark} />
                  <AppText variant="label" tone="signal">Preview the mobile experience</AppText>
                </Pressable>
              ) : null}

              <AppText variant="caption" tone="muted" style={styles.legal}>
                By continuing, you agree to Scout’s{' '}
                <AppText variant="caption" tone="soft" onPress={() => void Linking.openURL('https://applyscout.app/terms')}>Terms</AppText>
                {' '}and{' '}
                <AppText variant="caption" tone="soft" onPress={() => void Linking.openURL('https://applyscout.app/privacy')}>Privacy Policy</AppText>.
              </AppText>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.forest, overflow: 'hidden' },
  safe: { flex: 1 }, flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'flex-end', paddingTop: spacing.lg },
  orbOne: { position: 'absolute', width: 330, height: 330, borderRadius: 165, right: -180, top: -90, backgroundColor: 'rgba(127,201,43,0.12)' },
  orbTwo: { position: 'absolute', width: 210, height: 210, borderRadius: 105, left: -125, top: 210, borderWidth: 1, borderColor: 'rgba(157,222,71,0.16)' },
  hero: { width: '100%', boxSizing: 'border-box', paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.xl },
  heroCopy: { gap: spacing.sm, maxWidth: 530 },
  heroBody: { opacity: 0.78, lineHeight: 23, maxWidth: 500 },
  promiseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  promise: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sheet: { width: '100%', boxSizing: 'border-box', backgroundColor: colors.white, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xl, alignItems: 'center' },
  sheetHandle: { width: 36, height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceSunken, marginBottom: spacing.md },
  mobileMark: { display: 'none' },
  sheetIntro: { textAlign: 'center', marginTop: spacing.xs, maxWidth: 380 },
  configNotice: { marginTop: spacing.md, width: '100%', maxWidth: 460, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, backgroundColor: colors.warningSoft, padding: spacing.sm, borderRadius: radius.md },
  configText: { flex: 1, color: colors.warning },
  actions: { width: '100%', maxWidth: 460, gap: spacing.sm, marginTop: spacing.lg },
  divider: { width: '100%', maxWidth: 460, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.line },
  emailArea: { width: '100%', maxWidth: 460, gap: spacing.sm },
  inputWrap: { minHeight: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.white },
  inputError: { borderColor: colors.danger },
  input: { flex: 1, height: 50, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink, outlineStyle: 'none' } as never,
  error: { width: '100%', maxWidth: 460, marginTop: spacing.xs, textAlign: 'center' },
  sentCard: { width: '100%', maxWidth: 460, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.brandSurface, padding: spacing.md },
  sentIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.signalSoft, alignItems: 'center', justifyContent: 'center' },
  sentCopy: { flex: 1, gap: 2 },
  previewButton: { marginTop: spacing.md, minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm },
  legal: { textAlign: 'center', marginTop: spacing.sm, maxWidth: 400, lineHeight: 17 },
});

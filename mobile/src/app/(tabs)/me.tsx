import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { BrandLogo } from '@/components/ui/brand';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Icon, type IconName } from '@/components/ui/icon';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { useAuth } from '@/contexts/auth';
import { publicScoutUrl } from '@/lib/api';
import { initials, titleCase } from '@/lib/format';
import { useBootstrap } from '@/lib/queries';
import { colors, fonts, layout, radius, spacing } from '@/theme/tokens';

export default function MyScoutScreen() {
  const bootstrap = useBootstrap();
  const { signOut, isDemo } = useAuth();

  if (bootstrap.isLoading) return <SafeAreaView style={styles.safe}><LoadingState label="Loading your Scout…" /></SafeAreaView>;
  if (bootstrap.error || !bootstrap.data) return <SafeAreaView style={styles.safe}><ErrorState message={bootstrap.error?.message || 'Your account could not be loaded.'} onRetry={() => void bootstrap.refetch()} /></SafeAreaView>;

  const { profile, entitlement, jobProfiles } = bootstrap.data;
  const progress = entitlement.applicationsQuota
    ? Math.min(1, entitlement.applicationsUsed / entitlement.applicationsQuota)
    : 0;

  function confirmSignOut() {
    Alert.alert('Sign out of Scout?', 'Your application records will stay safe on your Scout desk.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}><BrandLogo compact />{isDemo ? <Chip label="Preview mode" tone="brand" /> : <Pressable accessibilityRole="button" onPress={() => void bootstrap.refetch()} style={styles.sync}><Icon name="refresh-cw" size={15} color={colors.inkSoft} /><AppText variant="caption" tone="soft">Sync</AppText></Pressable>}</View>

        <View style={styles.identity}>
          <View style={styles.avatar}><AppText style={styles.avatarText}>{initials(profile.full_name)}</AppText></View>
          <View style={styles.identityCopy}><AppText variant="h2">{profile.full_name}</AppText><AppText variant="caption" tone="muted">{profile.email}</AppText></View>
          <Pressable accessibilityRole="button" onPress={() => void Linking.openURL(publicScoutUrl('/settings'))} style={styles.edit}><Icon name="edit-2" size={17} color={colors.inkSoft} /></Pressable>
        </View>

        <View style={[styles.assistantCard, profile.assistant_type === 'human' && styles.humanCard]}>
          <View style={[styles.assistantMark, profile.assistant_type === 'human' && styles.humanMark]}>
            <Icon name={profile.assistant_type === 'human' ? 'user-check' : 'cpu'} size={24} color={profile.assistant_type === 'human' ? colors.humanDark : colors.signalDark} />
          </View>
          <View style={styles.assistantCopy}>
            <AppText variant="eyebrow" tone={profile.assistant_type === 'human' ? 'human' : 'signal'}>{profile.assistant_type === 'human' ? 'Human Assistant' : 'AI Assistant'}</AppText>
            <AppText variant="h3">{profile.assistant_name || (profile.assistant_type === 'ai' ? 'Scout AI' : 'Assistant pending')}</AppText>
            <AppText variant="caption" tone="muted">{profile.assistant_type === 'human' ? 'Human judgment for every application' : 'Fast application throughput with your controls'}</AppText>
          </View>
          {profile.assistant_type === 'human' && profile.whatsapp_url ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Open WhatsApp with assistant" onPress={() => void Linking.openURL(profile.whatsapp_url!)} style={styles.message}><Icon name="message-circle" size={19} color={colors.humanDark} /></Pressable>
          ) : <View style={styles.online}><View style={styles.onlineDot} /><AppText variant="caption" tone="signal">Ready</AppText></View>}
        </View>

        <View style={styles.planCard}>
          <View style={styles.planTop}>
            <View><AppText variant="eyebrow" tone="brand">Current plan</AppText><AppText variant="h2" tone="inverse">{entitlement.planCode ? titleCase(entitlement.planCode) : 'Free search'}</AppText></View>
            <Chip label={entitlement.status === 'active' ? 'Active' : entitlement.reason === 'past_due' ? 'Payment due' : 'Search only'} tone={entitlement.status === 'active' ? 'signal' : 'human'} />
          </View>
          <View style={styles.usageRow}><AppText variant="label" tone="inverse">{entitlement.applicationsRemaining} applications left</AppText><AppText variant="caption" tone="inverse" style={styles.faded}>{entitlement.applicationsUsed} of {entitlement.applicationsQuota || '—'} used</AppText></View>
          <View style={styles.track}><View style={[styles.fill, { width: `${progress * 100}%` }]} /></View>
          <Button label={entitlement.paid ? 'Manage plan' : 'Choose a plan'} variant="lime" fullWidth icon="external-link" onPress={() => void Linking.openURL(publicScoutUrl(entitlement.paid ? '/settings#billing' : `/pricing?lane=${profile.assistant_type}`))} />
        </View>

        <View style={styles.sectionHeader}><View><AppText variant="eyebrow" tone="signal">Job profiles</AppText><AppText variant="h3">What Scout is looking for</AppText></View><AppText variant="caption" tone="muted">{jobProfiles.length}/{entitlement.profileLimit}</AppText></View>
        <View style={styles.profileList}>
          {jobProfiles.map((jobProfile) => (
            <Pressable key={jobProfile.id} accessibilityRole="button" onPress={() => void Linking.openURL(publicScoutUrl('/profiles'))} style={styles.profileCard}>
              <View style={styles.target}><Icon name="target" size={18} color={colors.signalDark} /></View>
              <View style={styles.profileCopy}>
                <View style={styles.profileTitle}><AppText variant="label">{jobProfile.name}</AppText>{jobProfile.active ? <View style={styles.activeDot} /> : null}</View>
                <AppText variant="caption" tone="muted" numberOfLines={1}>{jobProfile.target_roles.join(' · ') || 'Add target roles'}</AppText>
                <AppText variant="caption" tone="muted" numberOfLines={1}>{jobProfile.locations.join(' · ') || 'Any location'}</AppText>
              </View>
              <Icon name="chevron-right" size={18} color={colors.inkMuted} />
            </Pressable>
          ))}
          <Button label={jobProfiles.length < entitlement.profileLimit ? 'Add job profile' : 'Manage job profiles'} variant="secondary" icon="plus" fullWidth onPress={() => void Linking.openURL(publicScoutUrl('/profiles'))} />
        </View>

        <View style={styles.menu}>
          <MenuRow icon="sliders" label="Search preferences" detail="Roles, locations, and companies" onPress={() => void Linking.openURL(publicScoutUrl('/jobs'))} />
          <MenuRow icon="file-text" label="Resumes and answers" detail="Keep your source of truth current" onPress={() => void Linking.openURL(publicScoutUrl('/profiles'))} />
          <MenuRow icon="life-buoy" label="Help and support" onPress={() => void Linking.openURL(publicScoutUrl('/support'))} />
          <MenuRow icon="shield" label="Safety and privacy" onPress={() => void Linking.openURL(publicScoutUrl('/safety'))} />
        </View>

        <Button label="Sign out" variant="ghost" icon="log-out" fullWidth onPress={confirmSignOut} />
        <AppText variant="caption" tone="muted" style={styles.version}>Scout mobile · Application operations in your pocket</AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuRow({ icon, label, detail, onPress }: { icon: IconName; label: string; detail?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: colors.surface }]}>
      <View style={styles.menuIcon}><Icon name={icon} size={18} color={colors.inkSoft} /></View>
      <View style={styles.menuCopy}><AppText variant="label">{label}</AppText>{detail ? <AppText variant="caption" tone="muted">{detail}</AppText> : null}</View>
      <Icon name="chevron-right" size={18} color={colors.inkMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandSurface },
  scroll: { width: '100%', boxSizing: 'border-box', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: layout.horizontal, paddingBottom: spacing.xxl, gap: spacing.md },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sync: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  avatar: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.forest },
  avatarText: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.brandBright },
  identityCopy: { flex: 1, gap: 3 },
  edit: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  assistantCard: { minHeight: 102, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, padding: spacing.md },
  humanCard: { backgroundColor: colors.warningSoft },
  assistantMark: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.signalSoft },
  humanMark: { backgroundColor: colors.humanSoft },
  assistantCopy: { flex: 1, gap: 2 },
  online: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: spacing.xs, paddingVertical: 5, backgroundColor: colors.brandSurface },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.signal },
  message: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.humanSoft },
  planCard: { borderRadius: radius.xl, backgroundColor: colors.forest, padding: spacing.lg, gap: spacing.md },
  planTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  usageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  faded: { opacity: 0.58 },
  track: { height: 7, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.13)', overflow: 'hidden' },
  fill: { height: 7, borderRadius: radius.pill, backgroundColor: colors.brandBright },
  sectionHeader: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  profileList: { gap: spacing.xs },
  profileCard: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  target: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.signalSoft },
  profileCopy: { flex: 1, gap: 3 },
  profileTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.signal },
  menu: { marginTop: spacing.sm, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  menuRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  menuIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  menuCopy: { flex: 1, gap: 2 },
  version: { textAlign: 'center', marginTop: -spacing.xs },
});

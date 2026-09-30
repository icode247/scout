import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { CompanyMark } from '@/components/ui/company-mark';
import { Icon } from '@/components/ui/icon';
import { publicScoutUrl } from '@/lib/api';
import type { Entitlement, Job, JobProfile } from '@/lib/types';
import { colors, radius, spacing } from '@/theme/tokens';

export function ApplyReviewSheet({ visible, job, profile, entitlement, assistantName, loading, onClose, onConfirm }: {
  visible: boolean;
  job: Job | null;
  profile: JobProfile | null;
  entitlement: Entitlement | null;
  assistantName: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!job) return null;
  const canApply = entitlement?.canApply ?? false;
  const isHuman = job.assistant_type === 'human';
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable accessibilityLabel="Close apply review" style={styles.backdrop} onPress={loading ? undefined : onClose} />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.jobRow}>
            <CompanyMark company={job.company} logo={job.companyLogo || job.fit_analysis?.logo_url} size={50} />
            <View style={styles.jobCopy}>
              <AppText variant="h3" numberOfLines={2}>{job.title}</AppText>
              <AppText variant="caption" tone="muted" numberOfLines={1}>{job.company} · {job.location}</AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" disabled={loading} onPress={onClose} style={styles.close}><Icon name="x" size={20} color={colors.inkSoft} /></Pressable>
          </View>

          <View style={styles.titleBlock}>
            <AppText variant="eyebrow" tone={isHuman ? 'human' : 'signal'}>{isHuman ? 'Human assistant handoff' : 'AI assistant handoff'}</AppText>
            <AppText variant="h2">Review before Scout takes it.</AppText>
            <AppText tone="muted">A right swipe opens this checkpoint so no application leaves your desk by accident.</AppText>
          </View>

          <View style={[styles.assistantCard, isHuman && styles.humanCard]}>
            <View style={[styles.assistantIcon, isHuman && styles.humanIcon]}><Icon name={isHuman ? 'user-check' : 'cpu'} size={21} color={isHuman ? colors.humanDark : colors.signalDark} /></View>
            <View style={styles.assistantCopy}>
              <AppText variant="label">{assistantName} is ready</AppText>
              <AppText variant="caption" tone="muted">Applying with {profile?.name || 'your active profile'}</AppText>
            </View>
            {entitlement?.paid ? <AppText variant="caption" tone="signal">{entitlement.applicationsRemaining} left</AppText> : null}
          </View>

          <View style={styles.checklist}>
            <ChecklistItem icon="file-text" text={profile?.resume_behavior === 'original' ? 'Use your original resume' : 'Prepare a tailored resume copy'} />
            <ChecklistItem icon="check-square" text="Use only answers saved in your Scout profile" />
            <ChecklistItem icon="clipboard" text="Track the result and keep the application record" />
          </View>

          {!canApply ? (
            <View style={styles.paywall}>
              <Icon name="lock" size={18} color={colors.warning} />
              <AppText variant="caption" style={styles.paywallCopy}>
                {entitlement?.reason === 'quota_exhausted' ? 'Your plan has no applications remaining.' : 'Choose a Scout plan to hand off applications.'}
              </AppText>
            </View>
          ) : null}

          <Button
            label={canApply ? `Apply with ${assistantName}` : entitlement?.reason === 'quota_exhausted' ? 'Top up applications' : 'View Scout plans'}
            variant={canApply ? 'lime' : 'primary'}
            icon={canApply ? 'arrow-right' : 'external-link'}
            fullWidth
            loading={loading}
            onPress={canApply ? onConfirm : () => void Linking.openURL(publicScoutUrl(`/pricing?lane=${job.assistant_type}`))}
          />
          {canApply ? <Button label="Not this one" variant="ghost" fullWidth disabled={loading} onPress={onClose} /> : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function ChecklistItem({ icon, text }: { icon: 'file-text' | 'check-square' | 'clipboard'; text: string }) {
  return <View style={styles.checkItem}><View style={styles.checkIcon}><Icon name={icon} size={17} color={colors.signalDark} /></View><AppText variant="bodyMedium" style={styles.checkCopy}>{text}</AppText><Icon name="check" size={16} color={colors.signal} /></View>;
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10, 20, 8, 0.58)' },
  sheet: { width: '100%', boxSizing: 'border-box', maxHeight: '92%', borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: colors.white, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceSunken, marginBottom: spacing.md },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  jobCopy: { flex: 1, gap: 3 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  titleBlock: { gap: spacing.xs, marginTop: spacing.lg },
  assistantCard: { marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.brandSurface, padding: spacing.md },
  humanCard: { backgroundColor: colors.warningSoft },
  assistantIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.signalSoft, alignItems: 'center', justifyContent: 'center' },
  humanIcon: { backgroundColor: colors.humanSoft },
  assistantCopy: { flex: 1, gap: 2 },
  checklist: { marginVertical: spacing.lg, gap: spacing.sm },
  checkItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  checkCopy: { flex: 1 },
  paywall: { marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.sm },
  paywallCopy: { flex: 1, color: colors.warning },
});

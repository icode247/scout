import { useLayoutEffect } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { CompanyMark } from '@/components/ui/company-mark';
import { Icon } from '@/components/ui/icon';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/contexts/toast';
import { applicationProgress, applicationStatus, compactDate } from '@/lib/format';
import { useBootstrap, useEvidenceUrl, useWithdrawApplication } from '@/lib/queries';
import type { Application } from '@/lib/types';
import { colors, layout, radius, spacing } from '@/theme/tokens';

const timeline = [
  ['Approved', 'You sent this role to Scout.'],
  ['Preparing', 'Scout checks the role, resume, and saved answers.'],
  ['Submitted', 'The application is sent and recorded.'],
  ['Interview', 'Mark the outcome when the company responds.'],
] as const;

export default function ApplicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const bootstrap = useBootstrap();
  const withdraw = useWithdrawApplication();
  const evidenceUrl = useEvidenceUrl();
  const { showToast } = useToast();
  const cached = queryClient.getQueryData<Application>(['application', id]);
  const application = cached || bootstrap.data?.applications.find((item) => item.id === id);

  useLayoutEffect(() => {
    if (application) navigation.setOptions({ title: application.job.company });
  }, [application, navigation]);

  if (!application) {
    return <SafeAreaView style={styles.safe}><EmptyState title="Application not found" message="Refresh your application desk and try again." /></SafeAreaView>;
  }

  const record: Application = application;
  const progress = applicationProgress(application);
  const canWithdraw = ['preparing', 'needs_input'].includes(application.status);

  function confirmWithdraw() {
    Alert.alert('Withdraw this application?', 'Scout will stop preparing it. Submitted applications cannot be withdrawn here.', [
      { text: 'Keep in queue', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: () => void runWithdraw() },
    ]);
  }

  async function runWithdraw() {
    try {
      await withdraw.mutateAsync(record.id);
      showToast('Application withdrawn', 'info');
      navigation.goBack();
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'Could not withdraw application', 'error');
    }
  }

  async function openEvidence(evidenceId: string) {
    try {
      const result = await evidenceUrl.mutateAsync(evidenceId);
      await Linking.openURL(result.url);
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'Could not open evidence', 'error');
    }
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.companyRow}>
            <CompanyMark company={application.job.company} logo={application.job.companyLogo || application.job.fit_analysis?.logo_url} size={58} />
            <View style={styles.companyCopy}><AppText variant="label" tone="inverse">{application.job.company}</AppText><AppText variant="caption" tone="inverse" style={{ opacity: 0.68 }}>{application.job.location || 'Location not set'}</AppText></View>
            <View style={styles.status}><View style={styles.statusDot} /><AppText variant="caption" tone="signal">{applicationStatus(application.status)}</AppText></View>
          </View>
          <AppText variant="h1" tone="inverse">{application.job.title}</AppText>
          <AppText tone="inverse" style={{ opacity: 0.72 }}>{application.submitted_at ? `Submitted ${compactDate(application.submitted_at)}` : 'Your assistant is preparing this application.'}</AppText>
        </View>

        <View style={styles.section}>
          <AppText variant="eyebrow" tone="signal">Application timeline</AppText>
          <View style={styles.timeline}>
            {timeline.map(([title, message], index) => {
              const step = index + 1;
              const active = step <= progress;
              return (
                <View key={title} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View style={[styles.timelineDot, active && styles.timelineDotActive]}>{step < progress ? <Icon name="check" size={11} color={colors.white} /> : null}</View>
                    {index < timeline.length - 1 ? <View style={[styles.timelineLine, step < progress && styles.timelineLineActive]} /> : null}
                  </View>
                  <View style={styles.timelineCopy}><AppText variant="label" tone={active ? 'default' : 'muted'}>{title}</AppText><AppText variant="caption" tone="muted">{message}</AppText></View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={[styles.section, styles.assistantSection]}>
          <View style={styles.sectionTitleRow}><View style={styles.assistantIcon}><Icon name={application.assistant_type === 'human' ? 'user-check' : 'cpu'} size={19} color={application.assistant_type === 'human' ? colors.humanDark : colors.signalDark} /></View><View><AppText variant="eyebrow" tone={application.assistant_type === 'human' ? 'human' : 'signal'}>{application.assistant_type === 'human' ? 'Human Assistant note' : 'Scout AI note'}</AppText><AppText variant="h3">What is happening</AppText></View></View>
          <AppText tone="soft">{application.notes || 'Scout is keeping this record up to date as the application moves forward.'}</AppText>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}><View><AppText variant="eyebrow" tone="signal">Documents</AppText><AppText variant="h3">Resume used</AppText></View><Icon name="shield" size={19} color={colors.signalDark} /></View>
          <View style={styles.documentRow}>
            <View style={styles.pdf}><AppText variant="eyebrow" tone="inverse">PDF</AppText></View>
            <View style={styles.documentCopy}><AppText variant="label" numberOfLines={1}>{application.resume?.name || 'Resume from your job profile'}</AppText><AppText variant="caption" tone="muted">Private · Attached to this application record</AppText></View>
          </View>
        </View>

        {application.assistant_type === 'human' || application.evidence.length ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}><View><AppText variant="eyebrow" tone="human">Submission proof</AppText><AppText variant="h3">Evidence from the form</AppText></View><AppText variant="caption" tone="muted">{application.evidence.length} files</AppText></View>
            {application.evidence.length ? application.evidence.map((item) => (
              <Pressable key={item.id} accessibilityRole="button" onPress={() => void openEvidence(item.id)} style={styles.evidenceRow}>
                <View style={styles.evidenceIcon}><Icon name={item.mime_type.startsWith('image/') ? 'image' : 'file-text'} size={18} color={colors.humanDark} /></View>
                <View style={styles.documentCopy}><AppText variant="label">{item.label}</AppText><AppText variant="caption" tone="muted">Open securely · Link expires in 60 seconds</AppText></View>
                <Icon name="external-link" size={17} color={colors.inkMuted} />
              </Pressable>
            )) : <AppText variant="caption" tone="muted">Proof appears here when your Human Assistant completes the application.</AppText>}
          </View>
        ) : null}

        <View style={styles.actions}>
          {application.job.external_url ? <Button label="Open original listing" variant="secondary" icon="external-link" fullWidth onPress={() => void Linking.openURL(application.job.external_url!)} /> : null}
          {canWithdraw ? <Button label="Withdraw from queue" variant="danger" fullWidth loading={withdraw.isPending} onPress={confirmWithdraw} /> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandSurface },
  scroll: { width: '100%', boxSizing: 'border-box', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  hero: { borderRadius: radius.xl, backgroundColor: colors.forest, padding: spacing.lg, gap: spacing.sm },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  companyCopy: { flex: 1, gap: 3 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, backgroundColor: colors.signalSoft, paddingHorizontal: spacing.xs, paddingVertical: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.signal },
  section: { borderRadius: radius.xl, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: spacing.md },
  assistantSection: { backgroundColor: colors.brandSurface },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  assistantIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.signalSoft, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeline: { gap: 0 },
  timelineRow: { minHeight: 68, flexDirection: 'row', gap: spacing.sm },
  timelineRail: { width: 22, alignItems: 'center' },
  timelineDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' },
  timelineDotActive: { backgroundColor: colors.signal },
  timelineLine: { flex: 1, width: 2, backgroundColor: colors.surfaceSunken },
  timelineLineActive: { backgroundColor: colors.signal },
  timelineCopy: { flex: 1, gap: 3, paddingBottom: spacing.md },
  documentRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pdf: { width: 42, height: 52, borderRadius: 7, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  documentCopy: { flex: 1, gap: 3 },
  evidenceRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.sm },
  evidenceIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.humanSoft, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
});

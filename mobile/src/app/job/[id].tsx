import { useLayoutEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { ApplyReviewSheet } from '@/components/jobs/apply-review-sheet';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { CompanyMark } from '@/components/ui/company-mark';
import { Icon } from '@/components/ui/icon';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/contexts/toast';
import { jobPostedAt, jobSignals, relativeDate, salaryLabel, titleCase } from '@/lib/format';
import { useApplyJob, useBootstrap, useSaveJob } from '@/lib/queries';
import type { Job } from '@/lib/types';
import { colors, layout, radius, spacing } from '@/theme/tokens';

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const bootstrap = useBootstrap();
  const apply = useApplyJob();
  const save = useSaveJob();
  const { showToast } = useToast();
  const cached = queryClient.getQueryData<Job>(['job', id]);
  const original = cached || bootstrap.data?.jobs.find((item) => item.id === id);
  const [localJob, setLocalJob] = useState<Job | null>(original || null);
  const [reviewing, setReviewing] = useState(false);
  const job = localJob || original;

  useLayoutEffect(() => {
    if (job) navigation.setOptions({ title: job.company });
  }, [job, navigation]);

  if (!job) {
    return <SafeAreaView style={styles.safe}><EmptyState title="Job not found" message="This role may have left your current search. Return to the deck for fresh matches." /></SafeAreaView>;
  }

  const currentJob: Job = job;
  const profile = bootstrap.data?.jobProfiles.find((item) => item.id === job.job_profile_id) || bootstrap.data?.jobProfiles[0] || null;
  const assistantName = bootstrap.data?.profile.assistant_type === 'human'
    ? bootstrap.data.profile.assistant_name || 'your Human Assistant'
    : 'Scout AI';
  const alreadyActive = bootstrap.data?.applications.some((application) => application.job_id === job.id || (application.job.external_url && application.job.external_url === job.external_url));
  const signals = jobSignals(job);
  const skills = Array.isArray(job.fit_analysis?.matched_skills) ? job.fit_analysis.matched_skills : [];

  async function toggleSave() {
    const next = !currentJob.is_saved;
    setLocalJob({ ...currentJob, is_saved: next });
    try {
      const result = await save.mutateAsync({ job: currentJob, saved: next });
      setLocalJob({ ...currentJob, ...result.job, is_saved: next });
      queryClient.setQueryData(['job', id], { ...currentJob, ...result.job, is_saved: next });
      showToast(next ? 'Saved for later' : 'Removed from saved jobs');
    } catch (reason) {
      setLocalJob(currentJob);
      showToast(reason instanceof Error ? reason.message : 'Could not save job', 'error');
    }
  }

  async function confirmApply() {
    if (!profile || !bootstrap.data) return;
    try {
      await apply.mutateAsync({ job: currentJob, profileId: profile.id, assistantType: bootstrap.data.profile.assistant_type });
      setReviewing(false);
      showToast(`Sent to ${assistantName}`);
      navigation.goBack();
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'Scout could not start this application', 'error');
    }
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <View style={styles.companyRow}>
            <CompanyMark company={job.company} logo={job.companyLogo || job.fit_analysis?.logo_url} size={58} />
            <View style={styles.companyCopy}>
              <AppText variant="h3">{job.company}</AppText>
              <AppText variant="caption" tone="muted">Posted {relativeDate(jobPostedAt(job)).toLowerCase()}</AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={job.is_saved ? 'Remove saved job' : 'Save job'} onPress={() => void toggleSave()} style={[styles.save, job.is_saved && styles.saveActive]}>
              <Icon name="bookmark" size={20} color={job.is_saved ? colors.forest : colors.inkMuted} />
            </Pressable>
          </View>
          <View style={styles.chips}>{signals.map((signal) => <Chip key={signal} label={signal} />)}<Chip label="Fresh match" tone="signal" /></View>
          <AppText variant="h1">{job.title}</AppText>
          <View style={styles.location}><Icon name="map-pin" size={16} color={colors.inkMuted} /><AppText tone="muted">{job.location || 'Location not listed'}</AppText></View>
        </View>

        <View style={styles.salaryCard}>
          <View><AppText variant="eyebrow" tone="brand">Estimated compensation</AppText><AppText variant="h2" tone="inverse">{salaryLabel(job)}</AppText></View>
          {job.employment_type ? <Chip label={titleCase(job.employment_type)} tone="brand" /> : null}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}><View style={styles.sectionIcon}><Icon name="zap" size={18} color={colors.brandBright} /></View><View><AppText variant="eyebrow" tone="signal">Scout’s read</AppText><AppText variant="h3">Why this role surfaced</AppText></View></View>
          <AppText tone="soft">{String(job.fit_analysis?.summary || job.fit_analysis?.match_reason || 'This role lines up with the targets saved in your active job profile.')}</AppText>
          {skills.length ? <View style={styles.chips}>{skills.slice(0, 5).map((skill) => <Chip key={skill} label={`✓ ${skill}`} tone="signal" />)}</View> : null}
        </View>

        <View style={[styles.section, job.assistant_type === 'human' && styles.humanSection]}>
          <View style={styles.sectionHeading}>
            <View style={[styles.assistantIcon, job.assistant_type === 'human' && styles.humanIcon]}><Icon name={job.assistant_type === 'human' ? 'user-check' : 'cpu'} size={20} color={job.assistant_type === 'human' ? colors.humanDark : colors.signalDark} /></View>
            <View style={styles.assistantCopy}><AppText variant="eyebrow" tone={job.assistant_type === 'human' ? 'human' : 'signal'}>{job.assistant_type === 'human' ? 'Human Assistant' : 'AI Assistant'}</AppText><AppText variant="h3">{assistantName} can take it from here.</AppText></View>
            <View style={styles.ready}><View style={styles.readyDot} /><AppText variant="caption" tone="signal">Ready</AppText></View>
          </View>
          <AppText tone="muted">Scout uses your {profile?.name || 'active'} profile, prepares the right resume, and records the application outcome.</AppText>
          <View style={styles.handoffMeta}><Icon name="file-text" size={16} color={colors.inkSoft} /><AppText variant="caption" tone="soft">{profile?.resume_behavior === 'original' ? 'Original resume' : 'Tailored resume'} + approved answers</AppText></View>
        </View>

        <View style={styles.section}>
          <AppText variant="eyebrow" tone="signal">About the role</AppText>
          <AppText variant="h3">Job description</AppText>
          <AppText tone="soft" style={styles.description}>{job.description || 'No description was included with this listing. Open the original role for complete details.'}</AppText>
          {job.external_url ? <Button label="Open original listing" variant="secondary" icon="external-link" fullWidth onPress={() => void Linking.openURL(job.external_url!)} /> : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerCopy}><AppText variant="caption" tone="muted">Applying with</AppText><AppText variant="label" numberOfLines={1}>{profile?.name || 'Active profile'}</AppText></View>
        <Button label={alreadyActive ? 'In Scout queue ✓' : 'Review & apply'} variant={alreadyActive ? 'secondary' : 'lime'} disabled={Boolean(alreadyActive)} onPress={() => setReviewing(true)} />
      </View>

      <ApplyReviewSheet
        visible={reviewing}
        job={job}
        profile={profile}
        entitlement={bootstrap.data?.entitlement || null}
        assistantName={assistantName}
        loading={apply.isPending}
        onClose={() => setReviewing(false)}
        onConfirm={() => void confirmApply()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandSurface },
  scroll: { width: '100%', boxSizing: 'border-box', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, gap: spacing.md, paddingBottom: 110 },
  heading: { gap: spacing.sm },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  companyCopy: { flex: 1, gap: 2 },
  save: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  saveActive: { backgroundColor: colors.brandSoft, borderColor: colors.brandSoft },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  location: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  salaryCard: { minHeight: 88, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderRadius: radius.xl, backgroundColor: colors.forest, padding: spacing.lg },
  section: { borderRadius: radius.xl, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: spacing.md },
  humanSection: { backgroundColor: colors.warningSoft },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.forest },
  assistantIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.signalSoft },
  humanIcon: { backgroundColor: colors.humanSoft },
  assistantCopy: { flex: 1, gap: 2 },
  ready: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: spacing.xs, paddingVertical: 5, backgroundColor: colors.white },
  readyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.signal },
  handoffMeta: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.sm },
  description: { lineHeight: 24 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line },
  footerCopy: { flex: 1, gap: 2 },
});

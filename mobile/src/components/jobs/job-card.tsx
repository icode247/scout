import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { CompanyMark } from '@/components/ui/company-mark';
import { Icon } from '@/components/ui/icon';
import { jobPostedAt, jobSignals, relativeDate, salaryLabel } from '@/lib/format';
import type { Job } from '@/lib/types';
import { colors, fonts, radius, shadows, spacing } from '@/theme/tokens';

export function JobCard({ job, height, onSave, onOpen, saving = false, interactive = true }: {
  job: Job; height: number; onSave?: () => void; onOpen?: () => void; saving?: boolean; interactive?: boolean;
}) {
  const compact = height < 450;
  const signals = jobSignals(job);
  const summary = job.fit_analysis?.summary || job.fit_analysis?.match_reason || 'This role lines up with the targets in your active job profile.';
  const posted = relativeDate(jobPostedAt(job));

  return (
    <View style={[styles.card, compact && styles.cardCompact, shadows.raised, { height }]}>
      <View style={styles.topRow}>
        <View style={styles.companyRow}>
          <CompanyMark company={job.company} logo={job.companyLogo || job.fit_analysis?.logo_url} />
          <View style={styles.companyCopy}>
            <AppText variant="label" numberOfLines={1}>{job.company}</AppText>
            <AppText variant="caption" tone="muted">Posted {posted.toLowerCase()}</AppText>
          </View>
        </View>
        {interactive ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={job.is_saved ? 'Remove saved job' : 'Save job'}
            disabled={saving}
            onPress={onSave}
            hitSlop={10}
            style={({ pressed }) => [styles.save, job.is_saved && styles.saveActive, pressed && { transform: [{ scale: 0.93 }] }]}
          >
            <Icon name="bookmark" size={19} color={job.is_saved ? colors.forest : colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.signalRow}>
        <Chip label="Fresh match" tone="signal" icon={<View style={styles.liveDot} />} />
        {signals.slice(0, compact ? 1 : 2).map((signal) => <Chip key={signal} label={signal} />)}
      </View>

      {interactive && onOpen ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${job.title} at ${job.company}`} onPress={onOpen} style={[styles.titleBlock, compact && styles.titleBlockCompact]}>
          <AppText variant="h1" numberOfLines={compact ? 2 : 3} style={[styles.title, compact && styles.titleCompact]}>{job.title}</AppText>
          <View style={styles.locationRow}><Icon name="map-pin" size={15} color={colors.inkMuted} /><AppText variant="label" tone="muted" numberOfLines={1}>{job.location || 'Location not listed'}</AppText></View>
        </Pressable>
      ) : (
        <View style={[styles.titleBlock, compact && styles.titleBlockCompact]}>
          <AppText variant="h1" numberOfLines={compact ? 2 : 3} style={[styles.title, compact && styles.titleCompact]}>{job.title}</AppText>
          <View style={styles.locationRow}><Icon name="map-pin" size={15} color={colors.inkMuted} /><AppText variant="label" tone="muted" numberOfLines={1}>{job.location || 'Location not listed'}</AppText></View>
        </View>
      )}

      <View style={[styles.salaryPanel, compact && styles.salaryPanelCompact]}>
        <View>
          <AppText variant="eyebrow" tone="muted">Estimated compensation</AppText>
          <AppText style={styles.salary}>{salaryLabel(job)}</AppText>
        </View>
        <View style={styles.compIcon}><Icon name="trending-up" size={18} color={colors.signalDark} /></View>
      </View>

      <View style={[styles.matchPanel, compact && styles.matchPanelCompact]}>
        <View style={styles.matchHeader}>
          <View style={styles.spark}><Icon name="zap" size={14} color={colors.brandBright} /></View>
          <AppText variant="eyebrow" tone="signal">Why Scout surfaced it</AppText>
        </View>
        <AppText variant="caption" tone="soft" numberOfLines={compact ? 2 : 3} style={styles.matchCopy}>{String(summary)}</AppText>
      </View>

      <View style={[styles.footer, compact && styles.footerCompact]}>
        <View style={styles.assistantMark}><Icon name={job.assistant_type === 'human' ? 'user-check' : 'cpu'} size={16} color={job.assistant_type === 'human' ? colors.humanDark : colors.signalDark} /></View>
        <View style={styles.footerCopy}>
          <AppText variant="caption" tone="muted">Ready for {job.assistant_type === 'human' ? 'your Human Assistant' : 'Scout AI'}</AppText>
          <AppText variant="label">Resume + saved answers attached</AppText>
        </View>
        <Icon name="arrow-up-right" size={17} color={colors.inkMuted} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', boxSizing: 'border-box', borderRadius: radius.xxl, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, overflow: 'hidden' },
  cardCompact: { padding: 18 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  companyRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  companyCopy: { flex: 1, gap: 2 },
  save: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  saveActive: { backgroundColor: colors.brandSoft, borderColor: colors.brandSoft },
  signalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.md },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.signal },
  titleBlock: { marginTop: spacing.md, gap: spacing.xs },
  titleBlockCompact: { marginTop: spacing.sm },
  title: { fontSize: 29, lineHeight: 32 },
  titleCompact: { fontSize: 27, lineHeight: 30 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  salaryPanel: { marginTop: spacing.md, minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radius.lg, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  salaryPanelCompact: { marginTop: spacing.sm, minHeight: 62 },
  salary: { marginTop: 2, fontFamily: fonts.displaySemiBold, fontSize: 19, lineHeight: 24, color: colors.ink },
  compIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.signalSoft, alignItems: 'center', justifyContent: 'center' },
  matchPanel: { marginTop: spacing.md, gap: 7, flexShrink: 1 },
  matchPanelCompact: { marginTop: spacing.sm },
  matchHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  spark: { width: 25, height: 25, borderRadius: 8, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  matchCopy: { lineHeight: 18 },
  footer: { marginTop: 'auto', paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  footerCompact: { paddingTop: spacing.xs },
  assistantMark: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.brandSurface, alignItems: 'center', justifyContent: 'center' },
  footerCopy: { flex: 1, gap: 1 },
});

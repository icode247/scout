import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { AppText } from '@/components/ui/app-text';
import { BrandLogo } from '@/components/ui/brand';
import { Chip } from '@/components/ui/chip';
import { CompanyMark } from '@/components/ui/company-mark';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Icon } from '@/components/ui/icon';
import { applicationProgress, applicationStatus, compactDate } from '@/lib/format';
import { useBootstrap } from '@/lib/queries';
import type { Application } from '@/lib/types';
import { colors, layout, radius, spacing } from '@/theme/tokens';

type Filter = 'all' | 'needs_input' | 'in_progress' | 'submitted' | 'interview';

export default function ActivityScreen() {
  const bootstrap = useBootstrap();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');

  const applications = useMemo(() => bootstrap.data?.applications || [], [bootstrap.data?.applications]);
  const filtered = useMemo(() => applications.filter((application) => {
    if (filter === 'all') return true;
    if (filter === 'needs_input') return application.status === 'needs_input';
    if (filter === 'in_progress') return ['preparing', 'needs_input'].includes(application.status);
    if (filter === 'submitted') return ['submitted', 'evidence_ready', 'rejected'].includes(application.status);
    return application.status === 'interview';
  }), [applications, filter]);

  function openApplication(application: Application) {
    queryClient.setQueryData(['application', application.id], application);
    router.push({ pathname: '/application/[id]', params: { id: application.id } });
  }

  if (bootstrap.isLoading) return <SafeAreaView style={styles.safe}><LoadingState label="Opening application records…" /></SafeAreaView>;
  if (bootstrap.error) return <SafeAreaView style={styles.safe}><ErrorState message={bootstrap.error.message} onRetry={() => void bootstrap.refetch()} /></SafeAreaView>;

  const submitted = applications.filter((item) => ['submitted', 'evidence_ready', 'interview', 'rejected'].includes(item.status)).length;
  const active = applications.filter((item) => ['preparing', 'needs_input'].includes(item.status)).length;
  const interviews = applications.filter((item) => item.status === 'interview').length;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, !filtered.length && styles.emptyList]}
        showsVerticalScrollIndicator={false}
        refreshing={bootstrap.isRefetching}
        onRefresh={() => void bootstrap.refetch()}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.header}><BrandLogo compact /><View style={styles.live}><View style={styles.liveDot} /><AppText variant="caption">Live desk</AppText></View></View>
            <View style={styles.titleBlock}>
              <AppText variant="eyebrow" tone="signal">Application operations</AppText>
              <AppText variant="h1">Every application. One clear record.</AppText>
              <AppText tone="muted">Follow the handoff from preparation to proof and interview.</AppText>
            </View>
            <View style={styles.metrics}>
              <Metric value={active} label="In motion" icon="loader" />
              <Metric value={submitted} label="Submitted" icon="send" />
              <Metric value={interviews} label="Interviews" icon="calendar" />
            </View>
            <FlatList
              horizontal
              data={[
                ['all', 'All'], ['in_progress', 'In motion'], ['needs_input', 'Needs you'], ['submitted', 'Submitted'], ['interview', 'Interviews'],
              ] as [Filter, string][]}
              keyExtractor={(item) => item[0]}
              renderItem={({ item }) => <Chip label={item[1]} selected={filter === item[0]} onPress={() => setFilter(item[0])} />}
              contentContainerStyle={styles.filters}
              showsHorizontalScrollIndicator={false}
            />
            <View style={styles.sectionHeading}><AppText variant="h3">Application record</AppText><AppText variant="caption" tone="muted">{filtered.length} {filtered.length === 1 ? 'item' : 'items'}</AppText></View>
          </View>
        }
        renderItem={({ item }) => <ApplicationCard application={item} onPress={() => openApplication(item)} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={<EmptyState title="Nothing in this view yet" message={filter === 'all' ? 'Approved jobs appear here as soon as Scout starts preparing them.' : 'Try another status to see the rest of your application record.'} />}
      />
    </SafeAreaView>
  );
}

function Metric({ value, label, icon }: { value: number; label: string; icon: 'loader' | 'send' | 'calendar' }) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricIcon}><Icon name={icon} size={16} color={colors.signalDark} /></View>
      <AppText variant="h2">{value}</AppText>
      <AppText variant="caption" tone="muted">{label}</AppText>
    </View>
  );
}

function ApplicationCard({ application, onPress }: { application: Application; onPress: () => void }) {
  const progress = applicationProgress(application);
  const needsInput = application.status === 'needs_input';
  const complete = ['evidence_ready', 'interview'].includes(application.status);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.992 }], opacity: 0.86 }]}>
      <View style={styles.cardTop}>
        <CompanyMark company={application.job.company} logo={application.job.companyLogo || application.job.fit_analysis?.logo_url} size={48} />
        <View style={styles.cardCopy}>
          <AppText variant="h3" numberOfLines={1}>{application.job.title}</AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>{application.job.company} · {application.job.location || 'Location not set'}</AppText>
        </View>
        <View style={[styles.status, needsInput && styles.statusWarning, complete && styles.statusComplete]}>
          <AppText variant="caption" style={{ color: needsInput ? colors.warning : complete ? colors.signalDark : colors.inkSoft }}>{applicationStatus(application.status)}</AppText>
        </View>
      </View>
      <View style={styles.progressRow}>
        {[1, 2, 3, 4].map((step, index) => (
          <View key={step} style={styles.progressPiece}>
            <View style={[styles.progressDot, step <= progress && styles.progressDotActive]}>{step < progress ? <Icon name="check" size={9} color={colors.white} /> : null}</View>
            {index < 3 ? <View style={[styles.progressLine, step < progress && styles.progressLineActive]} /> : null}
          </View>
        ))}
      </View>
      <View style={styles.cardBottom}>
        <View style={styles.assistant}><Icon name={application.assistant_type === 'human' ? 'user-check' : 'cpu'} size={14} color={application.assistant_type === 'human' ? colors.humanDark : colors.signalDark} /><AppText variant="caption" tone={application.assistant_type === 'human' ? 'human' : 'signal'}>{application.assistant_type === 'human' ? 'Human Assistant' : 'Scout AI'}</AppText></View>
        <AppText variant="caption" tone="muted">{application.submitted_at ? `Submitted ${compactDate(application.submitted_at)}` : `Started ${compactDate(application.created_at)}`}</AppText>
        <Icon name="chevron-right" size={18} color={colors.inkMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandSurface },
  list: { width: '100%', boxSizing: 'border-box', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: layout.horizontal, paddingBottom: spacing.xxl },
  emptyList: { flexGrow: 1 },
  headerBlock: { gap: spacing.md },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  live: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.signal },
  titleBlock: { gap: 5 },
  metrics: { flexDirection: 'row', gap: spacing.xs },
  metric: { flex: 1, minHeight: 94, justifyContent: 'center', borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: spacing.sm },
  metricIcon: { position: 'absolute', right: spacing.sm, top: spacing.sm, width: 28, height: 28, borderRadius: 10, backgroundColor: colors.signalSoft, alignItems: 'center', justifyContent: 'center' },
  filters: { gap: spacing.xs, paddingVertical: 2 },
  sectionHeading: { marginTop: spacing.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: { borderRadius: radius.xl, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardCopy: { flex: 1, gap: 3 },
  status: { borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: spacing.xs, paddingVertical: 5 },
  statusWarning: { backgroundColor: colors.warningSoft },
  statusComplete: { backgroundColor: colors.signalSoft },
  progressRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs },
  progressPiece: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  progressDot: { width: 15, height: 15, borderRadius: 8, backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' },
  progressDotActive: { backgroundColor: colors.signal },
  progressLine: { flex: 1, height: 2, backgroundColor: colors.surfaceSunken },
  progressLineActive: { backgroundColor: colors.signal },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  assistant: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
});

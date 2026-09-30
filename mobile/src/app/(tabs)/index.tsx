import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { ApplyReviewSheet } from '@/components/jobs/apply-review-sheet';
import { SwipeDeck, type SwipeDeckHandle, type SwipeDirection } from '@/components/jobs/swipe-deck';
import { AppText } from '@/components/ui/app-text';
import { BrandLogo } from '@/components/ui/brand';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useToast } from '@/contexts/toast';
import { profileFirstName } from '@/lib/format';
import { useApplyJob, useBootstrap, useJobSearch, useSaveJob } from '@/lib/queries';
import type { Job } from '@/lib/types';
import { colors, fonts, layout, spacing } from '@/theme/tokens';

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const bootstrap = useBootstrap();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const activeProfileId = selectedProfileId || bootstrap.data?.jobProfiles[0]?.id || null;
  const search = useJobSearch(activeProfileId);
  const apply = useApplyJob();
  const save = useSaveJob();
  const deckRef = useRef<SwipeDeckHandle>(null);
  const [removedJobIds, setRemovedJobIds] = useState<string[]>([]);
  const [savedOverrides, setSavedOverrides] = useState<Record<string, boolean>>({});
  const [passed, setPassed] = useState<Job[]>([]);
  const [pendingApply, setPendingApply] = useState<Job | null>(null);

  const profile = bootstrap.data?.jobProfiles.find((item) => item.id === activeProfileId) || bootstrap.data?.jobProfiles[0] || null;
  const assistantName = bootstrap.data?.profile.assistant_type === 'human'
    ? bootstrap.data.profile.assistant_name || 'your Human Assistant'
    : 'Scout AI';
  const deckHeight = Math.max(420, Math.min(465, windowHeight - insets.top - 370));

  useEffect(() => {
    if (!bootstrap.data) return;
    if (!bootstrap.data.profile.onboarding_complete) {
      router.replace('/onboarding');
      return;
    }
  }, [bootstrap.data]);

  const deck = useMemo(() => {
    const activeUrls = new Set(bootstrap.data?.applications.map((application) => application.job.external_url).filter(Boolean));
    const removed = new Set(removedJobIds);
    return (search.data?.jobs || [])
      .filter((job) => !activeUrls.has(job.external_url) && !removed.has(job.id))
      .map((job) => job.id in savedOverrides ? { ...job, is_saved: savedOverrides[job.id] } : job);
  }, [bootstrap.data?.applications, removedJobIds, savedOverrides, search.data?.jobs]);

  const freshCount = search.data?.total ?? deck.length;
  const firstName = profileFirstName(bootstrap.data?.profile.full_name);

  function removeJob(job: Job) {
    setRemovedJobIds((current) => current.includes(job.id) ? current : [...current, job.id]);
  }

  function handleSwipe(direction: SwipeDirection, job: Job) {
    removeJob(job);
    if (direction === 'left') {
      setPassed((current) => [job, ...current]);
    } else {
      setPendingApply(job);
    }
  }

  function undo() {
    const [last, ...rest] = passed;
    if (!last) return;
    setRemovedJobIds((current) => current.filter((id) => id !== last.id));
    setPassed(rest);
    void Haptics.selectionAsync();
    showToast('Job returned to your deck', 'info');
  }

  function openJob(job: Job) {
    queryClient.setQueryData(['job', job.id], job);
    router.push({ pathname: '/job/[id]', params: { id: job.id } });
  }

  async function saveJob(job: Job) {
    const next = !job.is_saved;
    setSavedOverrides((current) => ({ ...current, [job.id]: next }));
    try {
      const result = await save.mutateAsync({ job, saved: next });
      setSavedOverrides((current) => ({ ...current, [job.id]: Boolean(result.job.is_saved) }));
      showToast(next ? 'Saved for later' : 'Removed from saved jobs');
    } catch (reason) {
      setSavedOverrides((current) => ({ ...current, [job.id]: job.is_saved }));
      showToast(reason instanceof Error ? reason.message : 'Could not save job', 'error');
    }
  }

  async function confirmApply() {
    if (!pendingApply || !profile || !bootstrap.data) return;
    try {
      await apply.mutateAsync({ job: pendingApply, profileId: profile.id, assistantType: bootstrap.data.profile.assistant_type });
      setPendingApply(null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(`Sent to ${assistantName}`);
    } catch (reason) {
      setRemovedJobIds((current) => current.filter((id) => id !== pendingApply.id));
      setPendingApply(null);
      showToast(reason instanceof Error ? reason.message : 'Scout could not start this application', 'error');
    }
  }

  function closeReview() {
    if (pendingApply) setRemovedJobIds((current) => current.filter((id) => id !== pendingApply.id));
    setPendingApply(null);
  }

  async function refresh() {
    setRemovedJobIds([]);
    setPassed([]);
    await Promise.all([bootstrap.refetch(), search.refetch()]);
  }

  if (bootstrap.isLoading) return <SafeAreaView style={styles.safe}><LoadingState /></SafeAreaView>;
  if (bootstrap.error) return <SafeAreaView style={styles.safe}><ErrorState message={bootstrap.error.message} onRetry={() => void bootstrap.refetch()} /></SafeAreaView>;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={bootstrap.isRefetching || search.isRefetching} onRefresh={() => void refresh()} tintColor={colors.signalDark} />}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <BrandLogo compact />
            <View style={styles.headerRight}>
              <View style={styles.quota}>
                <View style={styles.quotaDot} />
                <AppText variant="caption">{bootstrap.data?.entitlement.applicationsRemaining ?? 0} applies</AppText>
              </View>
              <IconButton icon="sliders" label="Open job search settings" size={38} onPress={() => router.push('/(tabs)/me')} />
              <View style={styles.avatar}><AppText style={styles.avatarText}>{firstName.slice(0, 1).toUpperCase()}</AppText></View>
            </View>
          </View>

          <View style={styles.intro}>
            <AppText variant="eyebrow" tone="signal">{freshCount ? `${freshCount.toLocaleString()} roles in this search` : 'Your live job search'}</AppText>
            <AppText variant="h1">Good {greeting()}, {firstName}.</AppText>
            <AppText tone="muted">Keep what fits. Scout handles the application.</AppText>
          </View>

          {bootstrap.data && bootstrap.data.jobProfiles.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.profileChips}>
              {bootstrap.data.jobProfiles.map((item) => (
                <Chip key={item.id} label={item.name} selected={item.id === activeProfileId} onPress={() => {
                  setSelectedProfileId(item.id);
                  setRemovedJobIds([]);
                  setSavedOverrides({});
                  setPassed([]);
                }} />
              ))}
            </ScrollView>
          ) : profile ? (
            <View style={styles.profileLabel}><Icon name="target" size={14} color={colors.signalDark} /><AppText variant="label" tone="signal">{profile.name}</AppText></View>
          ) : null}

          {search.isLoading ? (
            <View style={{ height: deckHeight }}><LoadingState label="Finding fresh roles…" /></View>
          ) : search.error ? (
            <View style={{ height: deckHeight }}><ErrorState message={search.error.message} onRetry={() => void search.refetch()} /></View>
          ) : deck.length ? (
            <>
              <SwipeDeck
                ref={deckRef}
                jobs={deck}
                height={deckHeight}
                onSwipe={handleSwipe}
                onOpen={openJob}
                onSave={(job) => void saveJob(job)}
                savingJobId={save.isPending ? save.variables?.job.id : null}
              />
              <View style={styles.actions}>
                <View style={styles.actionWithLabel}><IconButton icon="rotate-ccw" label="Undo pass" disabled={!passed.length} size={48} onPress={undo} /><AppText variant="caption" tone="muted">Undo</AppText></View>
                <View style={styles.actionWithLabel}><IconButton icon="x" label="Pass" tone="skip" size={58} onPress={() => deckRef.current?.swipe('left')} /><AppText variant="caption" tone="muted">Pass</AppText></View>
                <View style={styles.actionWithLabel}><IconButton icon="maximize-2" label="Open details" size={48} onPress={() => openJob(deck[0])} /><AppText variant="caption" tone="muted">Details</AppText></View>
                <View style={styles.actionWithLabel}><IconButton icon="arrow-right" label="Review and apply" tone="apply" size={58} onPress={() => deckRef.current?.swipe('right')} /><AppText variant="caption" tone="muted">Apply</AppText></View>
              </View>
              <View style={styles.swipeHint}><Icon name="arrow-left" size={13} color={colors.inkMuted} /><AppText variant="caption" tone="muted">Pass</AppText><View style={styles.hintLine} /><AppText variant="caption" tone="muted">Swipe the card</AppText><View style={styles.hintLine} /><AppText variant="caption" tone="muted">Review</AppText><Icon name="arrow-right" size={13} color={colors.inkMuted} /></View>
            </>
          ) : (
            <View style={{ height: deckHeight }}>
              <EmptyState
                icon="check-circle"
                title="You reviewed this batch"
                message={search.data?.emptyReason || 'Pull down for fresh roles, or update the targets in your job profile.'}
                actionLabel="Refresh matches"
                onAction={() => void refresh()}
              />
            </View>
          )}
        </View>
      </ScrollView>

      <ApplyReviewSheet
        visible={Boolean(pendingApply)}
        job={pendingApply}
        profile={profile}
        entitlement={bootstrap.data?.entitlement || null}
        assistantName={assistantName}
        loading={apply.isPending}
        onClose={closeReview}
        onConfirm={() => void confirmApply()}
      />
    </SafeAreaView>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandSurface },
  scroll: { flexGrow: 1, paddingBottom: spacing.lg },
  container: { width: '100%', boxSizing: 'border-box', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: layout.horizontal },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  quota: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, borderRadius: 999, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  quotaDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.signal },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.bodyExtraBold, color: colors.brandBright, fontSize: 14 },
  intro: { marginTop: spacing.sm, gap: 4 },
  profileChips: { gap: spacing.xs, paddingVertical: spacing.md },
  profileLabel: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.sm },
  actions: { minHeight: 74, marginTop: spacing.xs, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: spacing.lg },
  actionWithLabel: { alignItems: 'center', gap: 5 },
  swipeHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.xs },
  hintLine: { width: 18, height: 1, backgroundColor: colors.lineStrong },
});

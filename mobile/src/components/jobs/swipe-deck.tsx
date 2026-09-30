import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';

import { AppText } from '@/components/ui/app-text';
import type { Job } from '@/lib/types';
import { colors, fonts, radius } from '@/theme/tokens';
import { JobCard } from './job-card';

export type SwipeDirection = 'left' | 'right';
export type SwipeDeckHandle = { swipe: (direction: SwipeDirection) => void };

export const SwipeDeck = forwardRef<SwipeDeckHandle, {
  jobs: Job[];
  height: number;
  onSwipe: (direction: SwipeDirection, job: Job) => void;
  onOpen: (job: Job) => void;
  onSave: (job: Job) => void;
  savingJobId?: string | null;
}>(function SwipeDeck({ jobs, height, onSwipe, onOpen, onSave, savingJobId }, ref) {
  const { width } = useWindowDimensions();
  const position = useRef(new Animated.ValueXY()).current;
  const [reducedMotion, setReducedMotion] = useState(false);
  const current = jobs[0];

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => listener.remove();
  }, []);

  function complete(direction: SwipeDirection) {
    if (!current) return;
    const job = current;
    const target = direction === 'right' ? width * 1.35 : -width * 1.35;
    const finish = () => {
      position.setValue({ x: 0, y: 0 });
      onSwipe(direction, job);
    };
    void Haptics.impactAsync(direction === 'right' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    if (reducedMotion) { finish(); return; }
    Animated.timing(position, {
      toValue: { x: target, y: 8 }, duration: 220, useNativeDriver: true,
    }).start(finish);
  }

  useImperativeHandle(ref, () => ({ swipe: complete }));

  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 7 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_event, gesture) => position.setValue({ x: gesture.dx, y: gesture.dy * 0.12 }),
    onPanResponderRelease: (_event, gesture) => {
      const shouldLeave = Math.abs(gesture.dx) > width * 0.22 || Math.abs(gesture.vx) > 0.75;
      if (shouldLeave) complete(gesture.dx >= 0 ? 'right' : 'left');
      else Animated.spring(position, { toValue: { x: 0, y: 0 }, damping: 17, stiffness: 210, mass: 0.75, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start(),
  // The active job is deliberately part of the responder lifecycle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [current?.id, width, reducedMotion]);

  const rotate = position.x.interpolate({ inputRange: [-width, 0, width], outputRange: ['-10deg', '0deg', '10deg'], extrapolate: 'clamp' });
  const applyOpacity = position.x.interpolate({ inputRange: [20, width * 0.34], outputRange: [0, 1], extrapolate: 'clamp' });
  const passOpacity = position.x.interpolate({ inputRange: [-width * 0.34, -20], outputRange: [1, 0], extrapolate: 'clamp' });

  if (!current) return <View style={{ height }} />;

  return (
    <View style={[styles.deck, { height: height + 20 }]}>
      {jobs.slice(0, 3).map((job, index, visible) => {
        const depth = index;
        const isTop = index === 0;
        if (isTop) {
          return (
            <Animated.View
              key={job.id}
              {...responder.panHandlers}
              style={[styles.layer, { zIndex: 10, transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] }]}
            >
              <JobCard job={job} height={height} onOpen={() => onOpen(job)} onSave={() => onSave(job)} saving={savingJobId === job.id} />
              <Animated.View style={[styles.stamp, styles.noPointer, styles.applyStamp, { opacity: applyOpacity }]}>
                <AppText style={styles.applyText}>REVIEW & APPLY</AppText>
              </Animated.View>
              <Animated.View style={[styles.stamp, styles.noPointer, styles.passStamp, { opacity: passOpacity }]}>
                <AppText style={styles.passText}>PASS</AppText>
              </Animated.View>
            </Animated.View>
          );
        }
        return (
          <View
            key={job.id}
            style={[styles.layer, styles.noPointer, { zIndex: 10 - depth, transform: [{ translateY: depth * 10 }, { scale: 1 - depth * 0.035 }], opacity: 1 - depth * 0.12 }]}
          >
            <JobCard job={job} height={height} interactive={false} />
          </View>
        );
      }).reverse()}
    </View>
  );
});

const styles = StyleSheet.create({
  deck: { width: '100%', position: 'relative' },
  layer: { position: 'absolute', left: 0, right: 0, top: 0 },
  noPointer: { pointerEvents: 'none' },
  stamp: { position: 'absolute', top: 88, borderWidth: 3, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.92)' },
  applyStamp: { left: 24, borderColor: colors.signal, transform: [{ rotate: '-8deg' }] },
  passStamp: { right: 24, borderColor: colors.danger, transform: [{ rotate: '8deg' }] },
  applyText: { color: colors.signalDark, fontFamily: fonts.bodyExtraBold, fontSize: 15, letterSpacing: 0.7 },
  passText: { color: colors.danger, fontFamily: fonts.bodyExtraBold, fontSize: 16, letterSpacing: 1 },
});

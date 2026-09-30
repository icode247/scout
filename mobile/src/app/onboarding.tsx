import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { AppText } from '@/components/ui/app-text';
import { BrandLogo } from '@/components/ui/brand';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useAuth } from '@/contexts/auth';
import { useToast } from '@/contexts/toast';
import { scoutApi } from '@/lib/api';
import type { AssistantType, Resume } from '@/lib/types';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

type Step = 1 | 2 | 3;

export default function OnboardingScreen() {
  const { session } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [assistant, setAssistant] = useState<AssistantType>('ai');
  const [profileName, setProfileName] = useState('My job search');
  const [roles, setRoles] = useState('');
  const [locations, setLocations] = useState('Remote');
  const [salary, setSalary] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [resume, setResume] = useState<Resume | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const roleList = useMemo(() => roles.split(',').map((value) => value.trim()).filter(Boolean), [roles]);
  const locationList = useMemo(() => locations.split(',').map((value) => value.trim()).filter(Boolean), [locations]);

  function next() {
    setError('');
    if (step === 1) setStep(2);
    else if (step === 2) {
      if (!roleList.length) { setError('Add at least one target role.'); return; }
      if (assistant === 'human' && !/^\+?[0-9 ()-]{7,24}$/.test(whatsapp)) {
        setError('Add a WhatsApp number with country code.');
        return;
      }
      setStep(3);
    }
    void Haptics.selectionAsync();
  }

  async function pickResume() {
    setError('');
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
      ],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const file = result.assets[0];
    const form = new FormData();
    form.append('resume', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || 'application/octet-stream',
    } as never);
    setUploading(true);
    try {
      const data = await scoutApi<{ resume: Resume; warning?: string }>(session, '/api/app/resumes', { method: 'POST', body: form });
      setResume(data.resume);
      showToast(data.warning ? 'Resume uploaded. You can review details later.' : 'Resume ready');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Resume upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function finish() {
    if (!resume) { setError('Upload a resume before finishing setup.'); return; }
    setError('');
    setSubmitting(true);
    const form = new FormData();
    form.append('assistant', assistant);
    form.append('profile_name', profileName.trim() || roleList[0] || 'My job search');
    form.append('target_roles', roleList.join(','));
    form.append('locations', locationList.join(','));
    form.append('salary_min', salary);
    form.append('resume_behavior', 'tailor');
    form.append('resume_id', resume.id);
    if (assistant === 'human') form.append('whatsapp_phone', whatsapp);
    try {
      await scoutApi(session, '/api/app/onboarding', { method: 'POST', body: form });
      await queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
      showToast('Your Scout desk is ready');
      router.replace('/(tabs)');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Setup could not be completed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <BrandLogo compact />
          <AppText variant="caption" tone="muted">Step {step} of 3</AppText>
        </View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${(step / 3) * 100}%` }]} /></View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {step === 1 ? (
            <View style={styles.section}>
              <View style={styles.titleBlock}>
                <AppText variant="eyebrow" tone="signal">Choose your lane</AppText>
                <AppText variant="h1">Who should handle the applications?</AppText>
                <AppText tone="muted">You review the roles either way. The difference is who handles the form and edge cases.</AppText>
              </View>
              <ChoiceCard
                selected={assistant === 'ai'}
                onPress={() => setAssistant('ai')}
                icon="zap"
                eyebrow="AI assistant"
                title="Scout AI"
                message="Fast, affordable throughput using your saved profile and approved answers."
                detail="Best for clear, repeatable applications"
              />
              <ChoiceCard
                selected={assistant === 'human'}
                onPress={() => setAssistant('human')}
                icon="user-check"
                eyebrow="Human assistant"
                title="A dedicated reviewer"
                message="A person handles ambiguity, follows your instructions, and keeps detailed proof."
                detail="Best for nuanced or senior searches"
                human
              />
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.section}>
              <View style={styles.titleBlock}>
                <AppText variant="eyebrow" tone="signal">Set the brief</AppText>
                <AppText variant="h1">Tell Scout what good looks like.</AppText>
                <AppText tone="muted">These targets power the job deck. Separate multiple roles or locations with commas.</AppText>
              </View>
              <Field label="Profile name" value={profileName} onChangeText={setProfileName} placeholder="Product leadership" />
              <Field label="Target roles" value={roles} onChangeText={setRoles} placeholder="Senior Product Manager, Product Lead" autoCapitalize="words" />
              <Field label="Locations" value={locations} onChangeText={setLocations} placeholder="Remote, New York, United States" autoCapitalize="words" />
              <Field label="Minimum salary (optional)" value={salary} onChangeText={setSalary} placeholder="140000" keyboardType="number-pad" />
              {assistant === 'human' ? <Field label="WhatsApp number" value={whatsapp} onChangeText={setWhatsapp} placeholder="+1 555 010 2040" keyboardType="phone-pad" /> : null}
            </View>
          ) : null}

          {step === 3 ? (
            <View style={styles.section}>
              <View style={styles.titleBlock}>
                <AppText variant="eyebrow" tone="signal">Attach your base resume</AppText>
                <AppText variant="h1">Give Scout a strong source of truth.</AppText>
                <AppText tone="muted">Scout keeps the original private and makes tailored copies for the jobs you approve.</AppText>
              </View>
              <Pressable accessibilityRole="button" onPress={() => void pickResume()} style={({ pressed }) => [styles.upload, pressed && { opacity: 0.76 }]}>
                <View style={[styles.uploadIcon, resume && styles.uploadIconReady]}>
                  <Icon name={resume ? 'check' : 'upload-cloud'} size={25} color={resume ? colors.signalDark : colors.brandBright} />
                </View>
                <View style={styles.uploadCopy}>
                  <AppText variant="h3">{resume ? resume.name : uploading ? 'Reading your resume…' : 'Choose PDF, DOC, or DOCX'}</AppText>
                  <AppText variant="caption" tone="muted">{resume ? 'Uploaded securely · Tap to replace' : 'Up to 10 MB · Stored privately'}</AppText>
                </View>
                <Icon name="chevron-right" size={20} color={colors.inkMuted} />
              </Pressable>
              <View style={styles.privacyCard}>
                <Icon name="shield" size={20} color={colors.signalDark} />
                <View style={styles.privacyCopy}>
                  <AppText variant="label">Built for careful delegation</AppText>
                  <AppText variant="caption" tone="muted">Your resume stays private. Scout applies only to roles you approve and records what happened.</AppText>
                </View>
              </View>
            </View>
          ) : null}

          {error ? <AppText variant="caption" tone="danger" style={styles.error} accessibilityRole="alert">{error}</AppText> : null}
        </ScrollView>

        <View style={styles.footer}>
          {step > 1 ? <Button label="Back" variant="ghost" icon="arrow-left" onPress={() => setStep((step - 1) as Step)} /> : <View />}
          <Button
            label={step === 3 ? 'Open my Scout desk' : 'Continue'}
            variant="primary"
            loading={submitting}
            disabled={uploading}
            onPress={step === 3 ? () => void finish() : next}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChoiceCard({ selected, onPress, icon, eyebrow, title, message, detail, human = false }: {
  selected: boolean; onPress: () => void; icon: 'zap' | 'user-check'; eyebrow: string; title: string; message: string; detail: string; human?: boolean;
}) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, human && selected && styles.humanSelected, pressed && { transform: [{ scale: 0.99 }] }]}>
      <View style={[styles.choiceIcon, human && styles.humanIcon]}><Icon name={icon} size={23} color={human ? colors.humanDark : colors.signalDark} /></View>
      <View style={styles.choiceCopy}>
        <AppText variant="eyebrow" tone={human ? 'human' : 'signal'}>{eyebrow}</AppText>
        <AppText variant="h2">{title}</AppText>
        <AppText tone="muted">{message}</AppText>
        <View style={styles.detailRow}><Icon name="check-circle" size={15} color={human ? colors.human : colors.signal} /><AppText variant="caption" tone="soft">{detail}</AppText></View>
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
    </Pressable>
  );
}

function Field({ label, ...inputProps }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <AppText variant="label">{label}</AppText>
      <TextInput {...inputProps} placeholderTextColor={colors.inkMuted} style={styles.input} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white }, flex: { flex: 1 },
  header: { width: '100%', boxSizing: 'border-box', minHeight: 64, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressTrack: { height: 3, backgroundColor: colors.surfaceSunken },
  progressFill: { height: 3, backgroundColor: colors.signal, borderRadius: radius.pill },
  scroll: { width: '100%', boxSizing: 'border-box', flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xxl, alignItems: 'center' },
  section: { width: '100%', maxWidth: 620, gap: spacing.md },
  titleBlock: { gap: spacing.sm, marginBottom: spacing.sm },
  choice: { width: '100%', boxSizing: 'border-box', minHeight: 174, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.xl, padding: spacing.lg },
  choiceSelected: { backgroundColor: colors.brandSurface, borderColor: colors.signal },
  humanSelected: { backgroundColor: colors.warningSoft, borderColor: colors.human },
  choiceIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.signalSoft },
  humanIcon: { backgroundColor: colors.humanSoft },
  choiceCopy: { flex: 1, gap: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: colors.signal }, radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.signal },
  field: { gap: 7 },
  input: { minHeight: 54, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, paddingHorizontal: spacing.md, backgroundColor: colors.white, color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 15 },
  upload: { minHeight: 112, borderRadius: radius.xl, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.signal, backgroundColor: colors.brandSurface, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  uploadIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  uploadIconReady: { backgroundColor: colors.signalSoft },
  uploadCopy: { flex: 1, gap: 4 },
  privacyCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  privacyCopy: { flex: 1, gap: 4 },
  error: { width: '100%', maxWidth: 620, textAlign: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  footer: { width: '100%', boxSizing: 'border-box', minHeight: 76, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.white },
});

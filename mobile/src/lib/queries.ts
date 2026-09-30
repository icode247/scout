import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/auth';
import { createDemoBootstrap, demoJobs } from './demo-data';
import { scoutApi } from './api';
import type { Application, BootstrapData, Job, JobSearchResponse } from './types';

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function useBootstrap() {
  const { session, isDemo, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['bootstrap', isDemo ? 'demo' : session?.user.id],
    queryFn: () => isDemo ? Promise.resolve(createDemoBootstrap()) : scoutApi<BootstrapData>(session, '/api/app/mobile'),
    enabled: isAuthenticated,
    staleTime: 45_000,
    refetchOnWindowFocus: true,
  });
}

export function useJobSearch(profileId?: string | null) {
  const { session, isDemo, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['job-search', isDemo ? 'demo' : session?.user.id, profileId],
    queryFn: async () => {
      if (isDemo) {
        return { total: demoJobs.length, jobs: demoJobs, count: demoJobs.length, offset: 0, nextOffset: null } satisfies JobSearchResponse;
      }
      return scoutApi<JobSearchResponse>(session, `/api/app/job-search?profileId=${encodeURIComponent(profileId || '')}&limit=30`);
    },
    enabled: isAuthenticated && Boolean(profileId),
    staleTime: 180_000,
    retry: 1,
  });
}

export function useApplyJob() {
  const { session, isDemo } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ job, profileId, assistantType }: { job: Job; profileId: string; assistantType: 'ai' | 'human' }) => {
      if (isDemo) {
        await pause(650);
        return { ok: true };
      }
      if (assistantType === 'ai') {
        return scoutApi(session, '/api/app/ai-jobs', {
          method: 'POST',
          body: JSON.stringify({ ...job, localId: job.id, profileId, url: job.external_url }),
        });
      }
      return scoutApi(session, '/api/app/jobs', {
        method: 'PATCH',
        body: JSON.stringify({ ...job, job_profile_id: profileId, status: 'delegated' }),
      });
    },
    onSuccess: (_result, variables) => {
      if (isDemo) {
        queryClient.setQueryData<BootstrapData>(['bootstrap', 'demo'], (current) => {
          if (!current) return current;
          const now = new Date().toISOString();
          const application: Application = {
            id: `demo-applied-${variables.job.id}`, job_id: variables.job.id, job_profile_id: variables.profileId,
            resume_id: current.resumes[0]?.id || null, assistant_type: variables.assistantType,
            status: 'preparing', submitted_at: null, created_at: now,
            notes: 'Scout is preparing this application with your saved profile and resume.',
            answer_evidence: [], evidence: [], job: { ...variables.job, status: 'preparing', persisted: true },
            jobProfile: current.jobProfiles.find((profile) => profile.id === variables.profileId) || null,
            resume: current.resumes[0] || null,
          };
          return {
            ...current,
            applications: [application, ...current.applications],
            entitlement: {
              ...current.entitlement,
              applicationsUsed: current.entitlement.applicationsUsed + 1,
              applicationsRemaining: Math.max(0, current.entitlement.applicationsRemaining - 1),
            },
          };
        });
      } else {
        void queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
      }
    },
  });
}

export function useSaveJob() {
  const { session, isDemo } = useAuth();
  return useMutation({
    mutationFn: async ({ job, saved }: { job: Job; saved: boolean }) => {
      if (isDemo) {
        await pause(250);
        return { ok: true, job: { ...job, is_saved: saved } };
      }
      return scoutApi<{ ok: true; job: Job }>(session, '/api/app/jobs', {
        method: 'PATCH', body: JSON.stringify({ ...job, is_saved: saved }),
      });
    },
  });
}

export function useWithdrawApplication() {
  const { session, isDemo } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      if (isDemo) {
        await pause(350);
        return { ok: true };
      }
      return scoutApi(session, '/api/app/applications', {
        method: 'PATCH', body: JSON.stringify({ id: applicationId, action: 'withdraw' }),
      });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['bootstrap'] }),
  });
}

export function useEvidenceUrl() {
  const { session, isDemo } = useAuth();
  return useMutation({
    mutationFn: async (evidenceId: string) => {
      if (isDemo) throw new Error('Evidence links are disabled in preview mode.');
      return scoutApi<{ url: string }>(session, `/api/app/evidence/${encodeURIComponent(evidenceId)}?format=json`);
    },
  });
}


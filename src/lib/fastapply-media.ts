/**
 * Mirrors a job profile's photo and showcase video onto its FastApply applicant, so Scout AI's
 * applications can carry them the way FastApply's own users' applications do (FastApply's
 * applicant media API: `/api/v1/applicants/:id/photo` and `/video`).
 *
 * Scout keeps the canonical files (its Human Assistants use them too); FastApply gets a copy.
 * What was last sent is recorded on `fastapply_applicant_sync`, so a sync that finds nothing
 * changed makes no calls. Never throws: a profile whose media could not be mirrored still applies,
 * just without them, and the reason is kept in `media_error`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { FirstApplyError, firstApply } from "./first-apply";
import { PROFILE_MEDIA_BUCKET, watchUrlFor } from "./profile-media";
import { isStoredPhoto, isStoredVideo, ownsMediaPath } from "./profile-media-rules";

export interface MediaSyncResult {
  changed: boolean;
  error: string | null;
}

interface SyncRow {
  remote_photo_path?: string | null;
  remote_photo_use?: boolean | null;
  remote_video_path?: string | null;
  remote_video_use?: boolean | null;
  remote_video_watch_url?: string | null;
}

const mediaError = (error: unknown) => {
  if (error instanceof FirstApplyError && (error.status === 404 || error.status === 405)) {
    return "The application service does not accept applicant photos and videos yet.";
  }
  return error instanceof Error ? error.message : String(error);
};

async function download(client: SupabaseClient, path: string) {
  const result = await client.storage.from(PROFILE_MEDIA_BUCKET).download(path);
  if (result.error || !result.data) throw new Error("Scout could not read this profile's media file.");
  return result.data;
}

/** The bytes to a FastApply signed upload URL, the way its own web app sends them. */
async function putToSignedUrl(signedUrl: string, file: Blob, mimeType: string) {
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file.type === mimeType ? file : new Blob([file], { type: mimeType }));
  const response = await fetch(signedUrl, { method: "PUT", body, headers: { "x-upsert": "false" } });
  // 409: a retry of an upload that already landed.
  if (!response.ok && response.status !== 409) throw new Error(`The video upload was refused (${response.status}).`);
}

export async function syncApplicantMedia(
  client: SupabaseClient,
  userId: string,
  profile: { id: string; photo?: unknown; video?: unknown },
  externalId: string,
): Promise<MediaSyncResult> {
  const found = await client.from("fastapply_applicant_sync").select("*").eq("user_id", userId).eq("job_profile_id", profile.id).maybeSingle();
  // No applicant upstream yet: ensureFastApplyApplicant creates it and calls this afterwards.
  if (found.error || !found.data) return { changed: false, error: found.error?.message ?? null };
  // Without Scout's media migration there is nowhere to record what was sent, and every sync
  // would upload the files again: do nothing until the columns exist.
  if (!("remote_photo_path" in found.data)) return { changed: false, error: "Scout's profile media migration has not run yet." };
  const sync = found.data as SyncRow;
  const photo = isStoredPhoto(profile.photo) && ownsMediaPath(userId, profile.id, profile.photo.path) ? profile.photo : null;
  const video = isStoredVideo(profile.video) && ownsMediaPath(userId, profile.id, profile.video.path) ? profile.video : null;
  const next: SyncRow = {
    remote_photo_path: sync.remote_photo_path ?? null,
    remote_photo_use: sync.remote_photo_use ?? null,
    remote_video_path: sync.remote_video_path ?? null,
    remote_video_use: sync.remote_video_use ?? null,
    remote_video_watch_url: sync.remote_video_watch_url ?? null,
  };
  let changed = false;
  let error: string | null = null;

  try {
    // ---- photo: the file, then the opt-in (off unless the member turned it on)
    const wantPhotoUse = photo?.useInApplications === true;
    if ((photo?.path ?? null) !== next.remote_photo_path) {
      if (photo) {
        const file = await download(client, photo.path);
        const stored = await firstApply.uploadApplicantPhoto(externalId, file, `photo.${photo.mimeType.split("/")[1] || "jpg"}`);
        next.remote_photo_path = photo.path;
        next.remote_photo_use = stored?.usePhotoInApplications === true;
      } else {
        await firstApply.deleteApplicantPhoto(externalId);
        next.remote_photo_path = null;
        next.remote_photo_use = false;
      }
      changed = true;
    }
    if (photo && next.remote_photo_use !== wantPhotoUse) {
      await firstApply.setApplicantPhotoUsage(externalId, wantPhotoUse);
      next.remote_photo_use = wantPhotoUse;
      changed = true;
    }

    // ---- video: the file through a signed upload, then the opt-in and Scout's watch link
    const wantVideoUse = video ? video.useInApplications !== false : false;
    // FastApply accepts only an https watch link (a local dev server's http://localhost is refused).
    const link = video && wantVideoUse ? watchUrlFor(video.shareToken) : null;
    const wantWatchUrl = link && link.startsWith("https://") ? link : null;
    if ((video?.path ?? null) !== next.remote_video_path) {
      if (video) {
        const file = await download(client, video.path);
        const ticket = await firstApply.requestApplicantVideoUpload(externalId, {
          fileName: video.fileName, mimeType: video.mimeType, fileSize: video.size,
          ...(video.durationSeconds ? { durationSeconds: video.durationSeconds } : {}),
        });
        if (ticket.mode === "direct" && ticket.signedUrl) await putToSignedUrl(ticket.signedUrl, file, video.mimeType);
        else await firstApply.proxyApplicantVideoUpload(externalId, ticket.path, file, video.fileName);
        await firstApply.finalizeApplicantVideo(externalId, {
          path: ticket.path, fileName: video.fileName,
          ...(video.durationSeconds ? { durationSeconds: video.durationSeconds } : {}),
          ...(video.width ? { width: video.width } : {}),
          ...(video.height ? { height: video.height } : {}),
          useInApplications: wantVideoUse, watchUrl: wantWatchUrl,
        });
        next.remote_video_path = video.path;
        next.remote_video_use = wantVideoUse;
        next.remote_video_watch_url = wantWatchUrl;
      } else {
        await firstApply.deleteApplicantVideo(externalId);
        next.remote_video_path = null;
        next.remote_video_use = null;
        next.remote_video_watch_url = null;
      }
      changed = true;
    }
    if (video && (next.remote_video_use !== wantVideoUse || next.remote_video_watch_url !== wantWatchUrl)) {
      await firstApply.updateApplicantVideo(externalId, { useInApplications: wantVideoUse, watchUrl: wantWatchUrl });
      next.remote_video_use = wantVideoUse;
      next.remote_video_watch_url = wantWatchUrl;
      changed = true;
    }
  } catch (caught) {
    error = mediaError(caught);
  }

  if (changed || error !== null || (found.data as any).media_error) {
    await client.from("fastapply_applicant_sync").update({
      ...next, media_error: error, media_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("job_profile_id", profile.id);
  }
  return { changed, error };
}

import type { APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSameOrigin, errorMessage, json, requireUser } from "../../../lib/api";
import { fastApplyExternalId } from "../../../lib/fastapply-applicant";
import { syncApplicantMedia } from "../../../lib/fastapply-media";
import {
  PROFILE_MEDIA_BUCKET,
  newMediaPath,
  newShareToken,
  openStoredObject,
  profileMediaView,
  removeMediaObjects,
  sweepProfileFolder,
} from "../../../lib/profile-media";
import {
  PROFILE_PHOTO_LIMITS,
  PROFILE_VIDEO_LIMITS,
  durationProblem,
  expectedContainer,
  extensionOf,
  isStoredPhoto,
  isStoredVideo,
  ownsMediaPath,
  readMp4DurationSeconds,
  sanitizeFileName,
  sniffContainer,
  sniffImage,
  uploadIntentProblem,
  type MediaKind,
  type StoredPhoto,
  type StoredVideo,
} from "../../../lib/profile-media-rules";
import { rateLimit, tooManyRequests } from "../../../lib/rate-limit";

export const prerender = false;
export const maxDuration = 120;

/**
 * A job profile's photo and showcase video, each its own resource (as in FastApply): saved the
 * moment it changes, separate from the profile form's Save.
 *
 *   POST   { profileId, kind, fileName, mimeType, size, durationSeconds? } → a signed upload URL
 *   PUT    { profileId, kind, path, fileName?, durationSeconds?, width?, height? } → verify + attach
 *   PATCH  { profileId, kind, useInApplications } → the "send it with applications" choice
 *   DELETE ?profileId=&kind= → remove
 *
 * Every change answers with the profile's media as the editor shows it, and, for a Scout AI
 * profile already on FastApply, mirrors it there straight away (best effort).
 */

const DEMO_MESSAGE = "Photo and video uploads are not available in demo mode.";

function kindOf(value: unknown): MediaKind {
  if (value === "photo" || value === "video") return value;
  throw new Response(JSON.stringify({ error: "Choose a photo or a video." }), { status: 400, headers: { "content-type": "application/json" } });
}

async function ownedProfile(db: SupabaseClient, userId: string, profileId: unknown) {
  if (typeof profileId !== "string" || !/^[0-9a-f-]{36}$/i.test(profileId)) {
    throw new Response(JSON.stringify({ error: "Save this profile first, then add a photo or video." }), { status: 400, headers: { "content-type": "application/json" } });
  }
  const found = await db.from("job_profiles").select("id,user_id,assistant_type,photo,video").eq("id", profileId).eq("user_id", userId).maybeSingle();
  if (found.error) throw found.error;
  if (!found.data) throw new Response(JSON.stringify({ error: "Job profile not found." }), { status: 404, headers: { "content-type": "application/json" } });
  return found.data as { id: string; user_id: string; assistant_type: string; photo: unknown; video: unknown };
}

/** Mirror onto FastApply when this profile is already there (Scout AI). Never fails the request. */
async function mirror(db: SupabaseClient, userId: string, profile: { id: string; photo: unknown; video: unknown }) {
  await syncApplicantMedia(db, userId, profile, fastApplyExternalId(userId, profile.id)).catch((error) => {
    console.error("[profile-media] FastApply sync failed", error);
  });
}

async function respond(db: SupabaseClient, profile: { id: string; user_id: string; photo: unknown; video: unknown }) {
  return json({ ok: true, media: await profileMediaView(db, profile) }, { headers: { "cache-control": "private, no-store" } });
}

export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    if (context.locals.demoMode) return json({ error: DEMO_MESSAGE }, { status: 409 });
    const db = context.locals.supabase!;
    const body = await context.request.json().catch(() => ({}));
    const kind = kindOf(body.kind);
    const problem = uploadIntentProblem(kind, body);
    if (problem) return json({ error: problem }, { status: 400 });
    const profile = await ownedProfile(db, user.id, body.profileId);
    if (!(await rateLimit(db, `profile-media:${user.id}`, { max: 20, windowSeconds: 3600 })).allowed) return tooManyRequests(600);

    const extension = kind === "photo" ? String(body.mimeType).split("/")[1].replace("jpeg", "jpg") : extensionOf(sanitizeFileName(body.fileName));
    const path = newMediaPath(user.id, profile.id, kind, extension);
    const ticket = await db.storage.from(PROFILE_MEDIA_BUCKET).createSignedUploadUrl(path);
    if (ticket.error || !ticket.data) throw new Error("Storage could not accept an upload right now. Try again in a minute.");
    return json({ ok: true, path, signedUrl: ticket.data.signedUrl }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};

export const PUT: APIRoute = async (context) => {
  let rejectedPath: string | null = null;
  const db = context.locals.supabase;
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    if (context.locals.demoMode) return json({ error: DEMO_MESSAGE }, { status: 409 });
    const body = await context.request.json().catch(() => ({}));
    const kind = kindOf(body.kind);
    const profile = await ownedProfile(db!, user.id, body.profileId);
    if (!ownsMediaPath(user.id, profile.id, body.path) || !String(body.path).split("/").pop()!.startsWith(`${kind}-`)) {
      return json({ error: "This upload does not belong to this profile." }, { status: 400 });
    }
    const path: string = body.path;
    // Finishing the file already in use is a repeat, not an upload: answer with what is stored. Going
    // on would run the checks again, and a failed check deletes the upload, here the live file.
    const current = kind === "photo" ? (isStoredPhoto(profile.photo) ? profile.photo.path : null) : (isStoredVideo(profile.video) ? profile.video.path : null);
    if (current === path) return respond(db!, profile);
    const stored = await openStoredObject(db!, path);
    if (!stored) return json({ error: "The upload did not arrive. Please try again." }, { status: 400 });
    rejectedPath = path;
    const now = new Date().toISOString();

    if (kind === "photo") {
      if (stored.size > PROFILE_PHOTO_LIMITS.maxBytes) return json({ error: "Photo must be 5 MB or smaller." }, { status: 400 });
      const mimeType = sniffImage(stored.head);
      if (!mimeType) return json({ error: "Photo must be a JPEG, PNG or WebP image." }, { status: 400 });
      const previous = isStoredPhoto(profile.photo) ? profile.photo : null;
      // Replacing keeps the member's choice, as FastApply does; a first photo (or one added after a
      // removal) starts unsent, because having a photo is not consent to send it.
      const photo: StoredPhoto = { path, mimeType, size: stored.size, useInApplications: previous?.useInApplications === true, updatedAt: now };
      const updated = await db!.from("job_profiles").update({ photo }).eq("id", profile.id).eq("user_id", user.id);
      if (updated.error) throw updated.error;
      rejectedPath = null;
      if (previous && previous.path !== path) await removeMediaObjects(db!, [previous.path]);
      profile.photo = photo;
    } else {
      if (stored.size > PROFILE_VIDEO_LIMITS.maxBytes) return json({ error: "Video must be 50 MB or smaller." }, { status: 400 });
      const fileName = sanitizeFileName(body.fileName);
      // The type is the one the upload was ticketed for (the path's extension), not what is claimed now.
      const extension = extensionOf(path);
      const mimeType = extension === "webm" ? "video/webm" : extension === "mov" ? "video/quicktime" : "video/mp4";
      if (stored.size < 12 || sniffContainer(stored.head) !== expectedContainer(mimeType)) {
        return json({ error: "That file is not a valid video." }, { status: 400 });
      }
      let durationSeconds: number | null = null;
      if (expectedContainer(mimeType) === "isobmff") durationSeconds = await readMp4DurationSeconds(stored.read, stored.size);
      // WebM (and an MP4 whose header could not be read): what the browser measured. The size cap
      // is the hard bound either way, as in FastApply.
      const measured = Number(body.durationSeconds);
      durationSeconds = durationSeconds ?? (Number.isFinite(measured) && measured > 0 ? measured : null);
      const tooLong = durationProblem(durationSeconds);
      if (tooLong) return json({ error: tooLong }, { status: 400 });
      const previous = isStoredVideo(profile.video) ? profile.video : null;
      // FastApply's own bounds for a video's width and height (1–16384).
      const dimension = (value: unknown) => (Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= 16_384 ? Number(value) : null);
      // Replacing keeps the share token, so a link already sent with applications shows the new clip.
      const video: StoredVideo = {
        path, fileName, mimeType, size: stored.size, durationSeconds,
        width: dimension(body.width), height: dimension(body.height),
        useInApplications: previous ? previous.useInApplications !== false : true,
        shareToken: previous?.shareToken ?? newShareToken(), updatedAt: now,
      };
      const updated = await db!.from("job_profiles").update({ video }).eq("id", profile.id).eq("user_id", user.id);
      if (updated.error) throw updated.error;
      rejectedPath = null;
      if (previous && previous.path !== path) await removeMediaObjects(db!, [previous.path]);
      profile.video = video;
    }

    await sweepProfileFolder(db!, user.id, profile.id, kind,
      kind === "photo" ? (isStoredPhoto(profile.photo) ? profile.photo.path : null) : (isStoredVideo(profile.video) ? profile.video.path : null));
    await mirror(db!, user.id, profile);
    return respond(db!, profile);
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  } finally {
    // Content that was refused never stays in the bucket.
    if (rejectedPath && db) await removeMediaObjects(db, [rejectedPath]);
  }
};

export const PATCH: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    if (context.locals.demoMode) return json({ error: DEMO_MESSAGE }, { status: 409 });
    const db = context.locals.supabase!;
    const body = await context.request.json().catch(() => ({}));
    const kind = kindOf(body.kind);
    if (typeof body.useInApplications !== "boolean") return json({ error: "Say whether to use it in applications." }, { status: 400 });
    const profile = await ownedProfile(db, user.id, body.profileId);
    const current = kind === "photo" ? (isStoredPhoto(profile.photo) ? profile.photo : null) : (isStoredVideo(profile.video) ? profile.video : null);
    if (!current) return json({ error: kind === "photo" ? "Add a photo first." : "Add a video first." }, { status: 400 });
    const next = { ...current, useInApplications: body.useInApplications, updatedAt: new Date().toISOString() };
    const updated = await db.from("job_profiles").update({ [kind]: next }).eq("id", profile.id).eq("user_id", user.id);
    if (updated.error) throw updated.error;
    if (kind === "photo") profile.photo = next; else profile.video = next;
    await mirror(db, user.id, profile);
    return respond(db, profile);
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    if (context.locals.demoMode) return json({ error: DEMO_MESSAGE }, { status: 409 });
    const db = context.locals.supabase!;
    const kind = kindOf(context.url.searchParams.get("kind"));
    const profile = await ownedProfile(db, user.id, context.url.searchParams.get("profileId"));
    const current = kind === "photo" ? profile.photo : profile.video;
    const updated = await db.from("job_profiles").update({ [kind]: null }).eq("id", profile.id).eq("user_id", user.id);
    if (updated.error) throw updated.error;
    if ((kind === "photo" ? isStoredPhoto(current) : isStoredVideo(current)) && ownsMediaPath(user.id, profile.id, (current as any).path)) {
      await removeMediaObjects(db, [(current as any).path]);
    }
    if (kind === "photo") profile.photo = null; else profile.video = null;
    await mirror(db, user.id, profile);
    return respond(db, profile);
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};

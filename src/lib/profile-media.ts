/**
 * Server side of a job profile's photo and showcase video.
 *
 * The files live in the private `profile-media` bucket under `<userId>/<profileId>/`, uploaded
 * by the browser straight to storage through a signed upload URL (Vercel caps a function request
 * at 4.5 MB, below the 50 MB video limit). Each profile row keeps one `photo` and one `video`
 * record (profile-media-rules.ts). Nothing the browser says about a file is trusted: finalize
 * reads the stored bytes back before the record changes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE } from "../config/site";
import { serverEnv } from "./server-env";
import {
  isStoredPhoto,
  isStoredVideo,
  ownsMediaPath,
  type MediaKind,
  type ProfileMediaView,
  type StoredPhoto,
  type StoredVideo,
} from "./profile-media-rules";

export const PROFILE_MEDIA_BUCKET = "profile-media";
/** Preview and playback links handed to the editor, the watch page and assistants. */
export const MEDIA_URL_TTL_SECONDS = 60 * 60;

export function newMediaPath(userId: string, profileId: string, kind: MediaKind, extension: string) {
  return `${userId}/${profileId}/${kind}-${crypto.randomUUID()}.${extension}`;
}

/** 16 random bytes, base64url: the watch page's token. */
export function newShareToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function siteOrigin() {
  return (serverEnv("PUBLIC_SITE_URL") || SITE.url).replace(/\/+$/, "");
}

/** Scout's own watch page for a shared video: the link FastApply puts in "video link" questions. */
export function watchUrlFor(shareToken: string) {
  return `${siteOrigin()}/v/${shareToken}`;
}

export async function signedMediaUrl(client: SupabaseClient, path: string, seconds = MEDIA_URL_TTL_SECONDS) {
  const signed = await client.storage.from(PROFILE_MEDIA_BUCKET).createSignedUrl(path, seconds);
  return signed.error ? null : signed.data?.signedUrl ?? null;
}

/**
 * Bytes [start, end] of a stored object through a signed URL. A server that ignores Range answers
 * 200 with the whole object, so only the bytes asked for are read and the rest of the body is
 * dropped (FastApply's readRange does the same): a 50 MB video is never pulled in to sniff it.
 */
async function readRangeFrom(url: string, start: number, end: number): Promise<Uint8Array> {
  const response = await fetch(url, { headers: { range: `bytes=${start}-${end}` } });
  if (response.status === 416) return new Uint8Array();
  if (!response.ok || !response.body) throw new Error(`Storage answered ${response.status}`);
  const skip = response.status === 206 ? 0 : start;
  const wanted = end - start + 1;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (received < skip + wanted) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const all = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return all.slice(skip, skip + wanted);
}

/**
 * A stored object's size (from storage metadata) and first bytes, plus a ranged reader for the
 * MP4 duration check; null when the object is not there.
 */
export async function openStoredObject(client: SupabaseClient, path: string) {
  const info = await client.storage.from(PROFILE_MEDIA_BUCKET).info(path);
  const size = Number(info.data?.size);
  if (info.error || !Number.isFinite(size) || size <= 0) return null;
  const url = await signedMediaUrl(client, path, 120);
  if (!url) return null;
  const read = (start: number, end: number) => readRangeFrom(url, start, Math.min(end, size - 1));
  return { size, head: await read(0, 31), read };
}

export async function removeMediaObjects(client: SupabaseClient, paths: (string | null | undefined)[]) {
  const list = paths.filter((path): path is string => !!path);
  if (!list.length) return;
  const removed = await client.storage.from(PROFILE_MEDIA_BUCKET).remove(list);
  if (removed.error) console.error("[profile-media] could not remove objects", removed.error.message);
}

/**
 * Deletes the profile's files of one kind that are not its current photo (or video): an upload the
 * browser started and never finished, or a file a failed finalize left behind. Limited to one
 * kind so finishing a photo never removes a video another tab is still uploading.
 */
export async function sweepProfileFolder(client: SupabaseClient, userId: string, profileId: string, kind: MediaKind, keep: string | null | undefined) {
  const folder = `${userId}/${profileId}`;
  const listed = await client.storage.from(PROFILE_MEDIA_BUCKET).list(folder, { limit: 100, search: `${kind}-` });
  if (listed.error) return;
  const stale = (listed.data || []).filter((item) => item.name.startsWith(`${kind}-`))
    .map((item) => `${folder}/${item.name}`).filter((path) => path !== keep);
  await removeMediaObjects(client, stale);
}

/** What the editor (or an assistant) is shown for a profile's media: records plus signed links. */
export async function profileMediaView(
  client: SupabaseClient,
  row: { id: string; user_id: string; photo?: unknown; video?: unknown },
): Promise<ProfileMediaView> {
  const photo = isStoredPhoto(row.photo) && ownsMediaPath(row.user_id, row.id, row.photo.path) ? row.photo : null;
  const video = isStoredVideo(row.video) && ownsMediaPath(row.user_id, row.id, row.video.path) ? row.video : null;
  const [photoUrl, videoUrl] = await Promise.all([
    photo ? signedMediaUrl(client, photo.path) : null,
    video ? signedMediaUrl(client, video.path) : null,
  ]);
  return {
    photo: photo ? { mimeType: photo.mimeType, size: photo.size, useInApplications: photo.useInApplications === true, updatedAt: photo.updatedAt, url: photoUrl } : null,
    video: video ? {
      fileName: video.fileName, mimeType: video.mimeType, size: video.size, durationSeconds: video.durationSeconds,
      width: video.width, height: video.height, useInApplications: video.useInApplications !== false,
      updatedAt: video.updatedAt, url: videoUrl, watchUrl: video.useInApplications !== false ? watchUrlFor(video.shareToken) : null,
    } : null,
  };
}

export type { StoredPhoto, StoredVideo };

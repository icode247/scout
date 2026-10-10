/**
 * Limits and checks for a job profile's photo and showcase video, shared by the browser editor
 * (so a file is refused before it is uploaded) and the server (so nothing the browser claims is
 * trusted). The limits are FastApply's own (its `profile-photo.constants.ts` and
 * `profile-video.constants.ts`): Scout hands both files to FastApply for AI applications, and a
 * file FastApply would refuse must be refused here first. Pure: no I/O, no Node APIs.
 */

export type MediaKind = "photo" | "video";

export const PROFILE_PHOTO_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  /** The editor crops to a square and scales to this many pixels a side before uploading. */
  outputPixels: 800,
} as const;

export const PROFILE_VIDEO_LIMITS = {
  maxBytes: 50 * 1024 * 1024,
  maxDurationSeconds: 60,
  extensions: ["mp4", "mov", "webm"],
  mimeTypes: ["video/mp4", "video/quicktime", "video/webm"],
} as const;

/** Slack on the duration cap so a 60.0 s clip that reports 60.04 s is not refused (FastApply's too). */
export const DURATION_TOLERANCE_SECONDS = 0.5;

export const VIDEO_EXTENSION_TO_MIME: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

/** The photo as the job profile stores it (`job_profiles.photo`). */
export interface StoredPhoto {
  path: string;
  mimeType: string;
  size: number;
  /** Off by default: having a photo is not consent to send it. */
  useInApplications: boolean;
  updatedAt: string;
}

/** The video as the job profile stores it (`job_profiles.video`). */
export interface StoredVideo {
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  /** "Use in my applications": the watch link and the file FastApply uploads into forms. */
  useInApplications: boolean;
  /** Identifies the video on Scout's public watch page, /v/<token>. Kept across replacements. */
  shareToken: string;
  updatedAt: string;
}

/** What the editor is shown: the stored record plus short-lived URLs, never anything else. */
export interface PhotoView extends Omit<StoredPhoto, "path"> { url: string | null }
export interface VideoView extends Omit<StoredVideo, "path" | "shareToken"> { url: string | null; watchUrl: string | null }
export interface ProfileMediaView { photo: PhotoView | null; video: VideoView | null }

export const extensionOf = (fileName: string) => {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
};

/** No path parts, no control characters, bounded; "video" when nothing usable is left. */
export function sanitizeFileName(raw: unknown): string {
  const base = String(raw ?? "").split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned || "video").slice(0, 255);
}

export interface UploadIntent {
  fileName?: unknown;
  mimeType?: unknown;
  size?: unknown;
  durationSeconds?: unknown;
}

/** Why an upload may not start, or null when it may. Same rules and wording as FastApply. */
export function uploadIntentProblem(kind: MediaKind, intent: UploadIntent): string | null {
  const size = Number(intent.size);
  const mimeType = String(intent.mimeType ?? "");
  if (kind === "photo") {
    if (!(PROFILE_PHOTO_LIMITS.mimeTypes as readonly string[]).includes(mimeType)) return "Photo must be a JPEG, PNG or WebP image.";
    if (!Number.isFinite(size) || size <= 0) return "That photo is empty.";
    if (size > PROFILE_PHOTO_LIMITS.maxBytes) return "Photo must be 5 MB or smaller.";
    return null;
  }
  const extension = extensionOf(sanitizeFileName(intent.fileName));
  if (!(PROFILE_VIDEO_LIMITS.extensions as readonly string[]).includes(extension)) return "Upload an MP4, MOV or WebM video.";
  if (!(PROFILE_VIDEO_LIMITS.mimeTypes as readonly string[]).includes(mimeType) || VIDEO_EXTENSION_TO_MIME[extension] !== mimeType) {
    return "That file type does not match a supported video format.";
  }
  if (!Number.isFinite(size) || size <= 0) return "That video is empty.";
  if (size > PROFILE_VIDEO_LIMITS.maxBytes) return "Video must be 50 MB or smaller.";
  return durationProblem(intent.durationSeconds);
}

export function durationProblem(durationSeconds: unknown): string | null {
  if (durationSeconds === null || durationSeconds === undefined || durationSeconds === "") return null;
  const seconds = Number(durationSeconds);
  if (!Number.isFinite(seconds)) return null;
  if (seconds > PROFILE_VIDEO_LIMITS.maxDurationSeconds + DURATION_TOLERANCE_SECONDS) {
    return `Video must be ${PROFILE_VIDEO_LIMITS.maxDurationSeconds} seconds or shorter.`;
  }
  return null;
}

/** The image type the first bytes say, or null. The declared type proves nothing. */
export function sniffImage(head: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
    && head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a) return "image/png";
  if (head.length >= 12 && ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") return "image/webp";
  return null;
}

export type ContainerKind = "isobmff" | "webm";

/** MP4 and MOV start with an `ftyp` box after a 4-byte size; WebM with the EBML header 1A 45 DF A3. */
export function sniffContainer(head: Uint8Array): ContainerKind | null {
  if (head.length >= 12 && ascii(head, 4, 8) === "ftyp") return "isobmff";
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "webm";
  return null;
}

export const expectedContainer = (mimeType: string): ContainerKind => (mimeType === "video/webm" ? "webm" : "isobmff");

function ascii(bytes: Uint8Array, start: number, end: number) {
  let out = "";
  for (let i = start; i < end && i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

/** Reads bytes [start, end] (inclusive); may return fewer if the file ends first. */
export type RangeReader = (start: number, end: number) => Promise<Uint8Array>;

const MAX_TOP_LEVEL_BOXES = 24;
const MAX_MOOV_CHILDREN = 8;
const MVHD_READ_BYTES = 40;

/**
 * Duration of an MP4/MOV from its `moov/mvhd` box using a few small ranged reads, hopping over a
 * large `mdat` (FastApply's `mp4-duration.ts`, ported to Uint8Array). Null whenever it cannot be
 * established; callers treat null as "not verified", never as "valid".
 */
export async function readMp4DurationSeconds(read: RangeReader, fileSize: number): Promise<number | null> {
  let offset = 0;
  for (let i = 0; i < MAX_TOP_LEVEL_BOXES && offset + 8 <= fileSize; i++) {
    const header = await read(offset, offset + 15);
    if (header.length < 8) return null;
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    let size = view.getUint32(0);
    const type = ascii(header, 4, 8);
    let headerSize = 8;
    if (size === 1) {
      if (header.length < 16) return null;
      size = Number(view.getBigUint64(8));
      headerSize = 16;
    } else if (size === 0) {
      size = fileSize - offset;
    }
    if (!Number.isFinite(size) || size < headerSize) return null;
    if (type === "moov") return readMvhdDuration(read, offset + headerSize, offset + size);
    offset += size;
  }
  return null;
}

async function readMvhdDuration(read: RangeReader, start: number, end: number): Promise<number | null> {
  let offset = start;
  for (let i = 0; i < MAX_MOOV_CHILDREN && offset + 8 <= end; i++) {
    const header = await read(offset, offset + MVHD_READ_BYTES - 1);
    if (header.length < 8) return null;
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const size = view.getUint32(0);
    if (ascii(header, 4, 8) === "mvhd") {
      const version = header[8];
      let timescale: number;
      let duration: number;
      if (version === 1) {
        if (header.length < 40) return null;
        timescale = view.getUint32(28);
        const raw = view.getBigUint64(32);
        if (raw === 0xffffffffffffffffn) return null;
        duration = Number(raw);
      } else {
        if (header.length < 28) return null;
        timescale = view.getUint32(20);
        const raw = view.getUint32(24);
        if (raw === 0xffffffff) return null;
        duration = raw;
      }
      if (timescale === 0) return null;
      return duration / timescale;
    }
    if (size < 8) return null;
    offset += size;
  }
  return null;
}

export const isShareToken = (token: unknown): token is string => typeof token === "string" && /^[A-Za-z0-9_-]{16,32}$/.test(token);

/**
 * True when `path` is an object this user stored for this profile. The storage policies only let
 * a member write their own folder, but a profile row is editable by its owner through the API, so
 * every reader that signs a URL with the service role checks the prefix too.
 */
export function ownsMediaPath(userId: string, profileId: string, path: unknown): path is string {
  if (typeof path !== "string" || !userId || !profileId) return false;
  if (path.includes("..") || path.includes("//")) return false;
  return path.startsWith(`${userId}/${profileId}/`) && path.length < 300;
}

export const isStoredPhoto = (value: unknown): value is StoredPhoto =>
  !!value && typeof value === "object" && typeof (value as any).path === "string";
export const isStoredVideo = (value: unknown): value is StoredVideo =>
  !!value && typeof value === "object" && typeof (value as any).path === "string" && isShareToken((value as any).shareToken);

/**
 * The type a <video>'s <source> declares. None for QuickTime: Chrome, Edge and Firefox answer
 * "cannot play video/quicktime" and skip the source, though most .mov clips are H.264 they play.
 */
export function videoSourceType(mimeType: string): string | undefined {
  return mimeType === "video/quicktime" ? undefined : mimeType;
}

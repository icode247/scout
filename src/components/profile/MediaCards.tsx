/**
 * The profile photo and the showcase video. Each is its own resource, saved the moment it
 * changes (no Save button), as in FastApply: having one and sending it are separate choices.
 * Files go from the browser straight to storage through a signed URL (/api/app/profile-media
 * issues it and checks the stored file before attaching it).
 */
import { useRef, useState } from "react";
import {
  PROFILE_PHOTO_LIMITS,
  PROFILE_VIDEO_LIMITS,
  VIDEO_EXTENSION_TO_MIME,
  durationProblem,
  extensionOf,
  uploadIntentProblem,
  type MediaKind,
  type ProfileMediaView,
  videoSourceType,
} from "../../lib/profile-media-rules";
import { Toggle, smallButton } from "./ui";

interface CardProps {
  profileId: string | null;
  media: ProfileMediaView;
  /** What was saved, and for which profile: an upload can finish after another profile is opened. */
  onMedia: (media: ProfileMediaView, profileId: string) => void;
  /** Demo mode has no storage: the cards explain instead of failing. */
  demo?: boolean;
}

async function api(method: "POST" | "PUT" | "PATCH" | "DELETE", body?: Record<string, unknown>, query?: string) {
  const response = await fetch(`/api/app/profile-media${query ? `?${query}` : ""}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "That did not work. Try again.");
  return data;
}

/** PUT a file to a storage signed upload URL, reporting progress (XHR: fetch cannot). */
function putToSignedUrl(signedUrl: string, file: Blob, mimeType: string, onProgress: (share: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file.type === mimeType ? file : new Blob([file], { type: mimeType }));
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => { if (event.lengthComputable && event.total) onProgress(event.loaded / event.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) || xhr.status === 409 ? resolve() : reject(new Error("The upload was interrupted. Try again."));
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check your connection and try again."));
    xhr.send(body);
  });
}

async function upload(kind: MediaKind, profileId: string, file: Blob, meta: { fileName: string; mimeType: string; durationSeconds?: number | null; width?: number; height?: number }, onProgress: (share: number) => void) {
  const ticket = await api("POST", { profileId, kind, fileName: meta.fileName, mimeType: meta.mimeType, size: file.size, durationSeconds: meta.durationSeconds ?? undefined });
  await putToSignedUrl(ticket.signedUrl, file, meta.mimeType, onProgress);
  const done = await api("PUT", { profileId, kind, path: ticket.path, fileName: meta.fileName, durationSeconds: meta.durationSeconds ?? undefined, width: meta.width, height: meta.height });
  return done.media as ProfileMediaView;
}

/** Centre-crop to a square, scale down and re-encode as JPEG: small, upright, no location data. */
async function preparePhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That image could not be read. Use a JPEG, PNG or WebP photo."));
      img.src = url;
    });
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (side < 64) throw new Error("That photo is too small. Use one at least 64 pixels wide.");
    const out = Math.min(side, PROFILE_PHOTO_LIMITS.outputPixels);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare photos. Try another browser.");
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, out, out);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error("That photo could not be prepared. Try another one.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Duration and size of a video file as the browser reads them, before anything is uploaded. */
function probeVideo(file: File) {
  return new Promise<{ durationSeconds: number | null; width: number; height: number }>((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const done = (result: { durationSeconds: number | null; width: number; height: number }) => { URL.revokeObjectURL(url); resolve(result); };
    video.onloadedmetadata = () => done({ durationSeconds: Number.isFinite(video.duration) ? video.duration : null, width: video.videoWidth, height: video.videoHeight });
    video.onerror = () => done({ durationSeconds: null, width: 0, height: 0 });
    video.src = url;
  });
}

function Progress({ share }: { share: number }) {
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
      <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.max(4, Math.round(share * 100))}%` }} />
    </div>
  );
}

const unavailable = (profileId: string | null, demo?: boolean) =>
  demo ? "Photo and video uploads are not available in demo mode." : !profileId ? "Create this profile first, then open it again to add one." : null;

export function PhotoCard({ profileId, media, onMedia, demo }: CardProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"" | "upload" | "remove" | "toggle">("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const photo = media.photo;
  const blocked = unavailable(profileId, demo);

  const choose = async (file: File | undefined) => {
    if (!file || !profileId) return;
    setError("");
    setBusy("upload");
    setProgress(0);
    try {
      const prepared = await preparePhoto(file);
      const problem = uploadIntentProblem("photo", { mimeType: "image/jpeg", size: prepared.size });
      if (problem) throw new Error(problem);
      onMedia(await upload("photo", profileId, prepared, { fileName: "photo.jpg", mimeType: "image/jpeg" }, setProgress), profileId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The photo could not be saved.");
    } finally {
      setBusy("");
      if (input.current) input.current.value = "";
    }
  };
  const run = async (kind: "remove" | "toggle", work: () => Promise<{ media: ProfileMediaView }>) => {
    if (!profileId) return;
    const forProfile = profileId;
    setError("");
    setBusy(kind);
    try { onMedia((await work()).media, forProfile); } catch (caught) { setError(caught instanceof Error ? caught.message : "That did not work."); } finally { setBusy(""); }
  };

  return (
    <div className="rounded-xl border border-ink/10 bg-surface/50 p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border border-ink/10 bg-white text-2xl text-ink-muted">
          {photo?.url ? <img src={photo.url} alt="Your profile photo" width={80} height={80} className="h-full w-full object-cover" /> : <span aria-hidden="true">👤</span>}
        </div>
        <div className="min-w-[14rem] flex-1">
          <p className="text-sm font-extrabold">Profile photo <span className="font-normal text-ink-muted">(optional)</span></p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">Some employers ask for one, often in Germany, Austria, Switzerland and parts of Asia and the Middle East. Add it here, then choose whether it goes out with your applications.</p>
          {blocked ? <p className="mt-2 text-xs font-bold text-ink-soft">{blocked}</p> : (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={smallButton("primary")} disabled={!!busy} onClick={() => input.current?.click()}>{busy === "upload" ? "Saving…" : photo ? "Replace photo" : "Add photo"}</button>
              {photo && !confirmRemove && <button type="button" className={smallButton("danger")} disabled={!!busy} onClick={() => setConfirmRemove(true)}>Remove</button>}
              {photo && confirmRemove && (
                <span className="inline-flex items-center gap-2 text-xs">Remove this photo?
                  <button type="button" className={smallButton("danger")} onClick={() => { setConfirmRemove(false); void run("remove", () => api("DELETE", undefined, `profileId=${encodeURIComponent(profileId!)}&kind=photo`)); }}>Remove</button>
                  <button type="button" className={smallButton()} onClick={() => setConfirmRemove(false)}>Keep</button>
                </span>
              )}
              <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void choose(e.target.files?.[0])} />
            </div>
          )}
          {busy === "upload" && <Progress share={progress} />}
        </div>
      </div>
      {photo && !blocked && (
        <div className="mt-4 border-t border-ink/10 pt-3">
          <Toggle checked={photo.useInApplications} disabled={!!busy} onChange={(checked) => void run("toggle", () => api("PATCH", { profileId, kind: "photo", useInApplications: checked }))}
            label="Send my photo with applications"
            description={photo.useInApplications ? "On: added when a form has a photo field." : "Off: your photo is never sent. A photo can invite bias, so this starts off."} />
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs font-bold text-red-700">{error}</p>}
    </div>
  );
}

export function VideoCard({ profileId, media, onMedia, demo }: CardProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"" | "upload" | "remove" | "toggle">("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const video = media.video;
  const blocked = unavailable(profileId, demo);
  const limitText = `Up to ${PROFILE_VIDEO_LIMITS.maxDurationSeconds} seconds and ${PROFILE_VIDEO_LIMITS.maxBytes / 1024 / 1024} MB · MP4, MOV or WebM`;

  const choose = async (file: File | undefined) => {
    if (!file || !profileId) return;
    setError("");
    const extension = extensionOf(file.name);
    const mimeType = VIDEO_EXTENSION_TO_MIME[extension] ?? file.type;
    const probe = await probeVideo(file);
    const problem = uploadIntentProblem("video", { fileName: file.name, mimeType, size: file.size, durationSeconds: probe.durationSeconds }) ?? durationProblem(probe.durationSeconds);
    if (problem) { setError(problem); if (input.current) input.current.value = ""; return; }
    setBusy("upload");
    setProgress(0);
    try {
      onMedia(await upload("video", profileId, file, { fileName: file.name, mimeType, durationSeconds: probe.durationSeconds, width: probe.width || undefined, height: probe.height || undefined }, setProgress), profileId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The video could not be saved.");
    } finally {
      setBusy("");
      if (input.current) input.current.value = "";
    }
  };
  const run = async (kind: "remove" | "toggle", work: () => Promise<{ media: ProfileMediaView }>) => {
    if (!profileId) return;
    const forProfile = profileId;
    setError("");
    setBusy(kind);
    try { onMedia((await work()).media, forProfile); } catch (caught) { setError(caught instanceof Error ? caught.message : "That did not work."); } finally { setBusy(""); }
  };

  return (
    <div className="rounded-xl border border-ink/10 bg-surface/50 p-4">
      <p className="text-sm font-extrabold">Video introduction <span className="font-normal text-ink-muted">(optional)</span></p>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">A short clip of you introducing yourself. Applications that ask for a video or a video link get it. {limitText}.</p>
      {video?.url && (
        <video controls preload="metadata" playsInline className="mt-3 max-h-64 w-full rounded-xl bg-ink" aria-label="Your video introduction">
          <source src={video.url} type={videoSourceType(video.mimeType)} />
        </video>
      )}
      {video && <p className="mt-1 text-xs text-ink-muted">{video.fileName}{video.durationSeconds ? ` · ${Math.round(video.durationSeconds)} s` : ""} · {(video.size / 1024 / 1024).toFixed(1)} MB</p>}
      {blocked ? <p className="mt-2 text-xs font-bold text-ink-soft">{blocked}</p> : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={smallButton("primary")} disabled={!!busy} onClick={() => input.current?.click()}>{busy === "upload" ? "Uploading…" : video ? "Replace video" : "Add video"}</button>
          {video && !confirmRemove && <button type="button" className={smallButton("danger")} disabled={!!busy} onClick={() => setConfirmRemove(true)}>Remove</button>}
          {video && confirmRemove && (
            <span className="inline-flex items-center gap-2 text-xs">Remove this video? Links already sent stop working.
              <button type="button" className={smallButton("danger")} onClick={() => { setConfirmRemove(false); void run("remove", () => api("DELETE", undefined, `profileId=${encodeURIComponent(profileId!)}&kind=video`)); }}>Remove</button>
              <button type="button" className={smallButton()} onClick={() => setConfirmRemove(false)}>Keep</button>
            </span>
          )}
          <input ref={input} type="file" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void choose(e.target.files?.[0])} />
        </div>
      )}
      {busy === "upload" && <Progress share={progress} />}
      {video && !blocked && (
        <div className="mt-4 border-t border-ink/10 pt-3">
          <Toggle checked={video.useInApplications} disabled={!!busy} onChange={(checked) => void run("toggle", () => api("PATCH", { profileId, kind: "video", useInApplications: checked }))}
            label="Use my video in applications"
            description={video.useInApplications ? "On: forms that ask for a video or a video link get it. Anyone with the link can watch it." : "Off: the link stops working and the video is never sent."} />
          {video.useInApplications && video.watchUrl && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input readOnly value={video.watchUrl} aria-label="Your video link" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-white px-2.5 py-1.5 text-xs" />
              <button type="button" className={smallButton()} onClick={() => { void navigator.clipboard?.writeText(video.watchUrl!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}>{copied ? "Copied" : "Copy link"}</button>
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs font-bold text-red-700">{error}</p>}
    </div>
  );
}

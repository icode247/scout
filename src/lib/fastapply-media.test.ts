import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./first-apply", async () => {
  const actual = await vi.importActual<typeof import("./first-apply")>("./first-apply");
  const stub = () => vi.fn();
  return {
    ...actual,
    firstApply: {
      ...actual.firstApply,
      uploadApplicantPhoto: stub(), setApplicantPhotoUsage: stub(), deleteApplicantPhoto: stub(),
      requestApplicantVideoUpload: stub(), proxyApplicantVideoUpload: stub(), finalizeApplicantVideo: stub(),
      updateApplicantVideo: stub(), deleteApplicantVideo: stub(),
    },
  };
});

import { FirstApplyError, firstApply } from "./first-apply";
import { syncApplicantMedia } from "./fastapply-media";

const fa = firstApply as unknown as Record<string, ReturnType<typeof vi.fn>>;
const USER = "u1", PROFILE = "p1", EXTERNAL = "u1:p1";
const photo = (overrides: Record<string, any> = {}) => ({ path: `${USER}/${PROFILE}/photo-a.jpg`, mimeType: "image/jpeg", size: 1000, useInApplications: false, updatedAt: "2026-10-10", ...overrides });
const video = (overrides: Record<string, any> = {}) => ({
  path: `${USER}/${PROFILE}/video-a.mp4`, fileName: "intro.mp4", mimeType: "video/mp4", size: 2000, durationSeconds: 30, width: 1280, height: 720,
  useInApplications: true, shareToken: "AbCdEfGhIjKlMnOpQrStUv", updatedAt: "2026-10-10", ...overrides,
});

const MIGRATED = { remote_photo_path: null, remote_photo_use: null, remote_video_path: null, remote_video_use: null, remote_video_watch_url: null, media_error: null };

/** The sync row the database holds (with the media columns unless `raw`), the updates written back, and storage downloads. */
function fakeDb(input: Record<string, any> | null, raw = false) {
  const row = input === null ? null : raw ? input : { ...MIGRATED, ...input };
  const updates: Record<string, any>[] = [];
  const downloads: string[] = [];
  const db: any = {
    from: () => {
      const chain: any = {
        select: () => chain, eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: row, error: null }),
        update: (values: Record<string, any>) => { updates.push(values); return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }; },
      };
      return chain;
    },
    storage: { from: () => ({ download: (path: string) => { downloads.push(path); return Promise.resolve({ data: new Blob(["bytes"], { type: "application/octet-stream" }), error: null }); } }) },
  };
  return { db, updates, downloads };
}

const fetchMock = vi.fn();
beforeEach(() => {
  for (const fn of Object.values(fa)) if (typeof fn?.mockReset === "function") fn.mockReset();
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  process.env.PUBLIC_SITE_URL = "https://applyscout.app";
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.PUBLIC_SITE_URL; });

describe("syncApplicantMedia", () => {
  it("does nothing before the applicant exists upstream", async () => {
    const { db, updates } = fakeDb(null);
    expect(await syncApplicantMedia(db, USER, { id: PROFILE, photo: photo() }, EXTERNAL)).toEqual({ changed: false, error: null });
    expect(fa.uploadApplicantPhoto).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("does nothing until Scout's media columns exist, rather than re-uploading every time", async () => {
    const { db, updates } = fakeDb({ user_id: USER }, true);
    const result = await syncApplicantMedia(db, USER, { id: PROFILE, photo: photo() }, EXTERNAL);
    expect(result).toEqual({ changed: false, error: "Scout's profile media migration has not run yet." });
    expect(fa.uploadApplicantPhoto).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("makes no calls when nothing changed since the last sync", async () => {
    const { db, updates } = fakeDb({ remote_photo_path: photo().path, remote_photo_use: false });
    expect(await syncApplicantMedia(db, USER, { id: PROFILE, photo: photo() }, EXTERNAL)).toEqual({ changed: false, error: null });
    expect(Object.values(fa).some((fn) => typeof fn?.mock === "object" && fn.mock.calls.length > 0)).toBe(false);
    expect(updates).toEqual([]);
  });

  it("uploads a new photo, then turns sending it on only when the member did", async () => {
    fa.uploadApplicantPhoto.mockResolvedValue({ photoUrl: "https://x/p.jpg", usePhotoInApplications: false });
    const { db, updates, downloads } = fakeDb({});
    await syncApplicantMedia(db, USER, { id: PROFILE, photo: photo({ useInApplications: true }) }, EXTERNAL);
    expect(downloads).toEqual([photo().path]);
    expect(fa.uploadApplicantPhoto).toHaveBeenCalledWith(EXTERNAL, expect.any(Blob), "photo.jpeg");
    expect(fa.setApplicantPhotoUsage).toHaveBeenCalledWith(EXTERNAL, true);
    expect(updates[0]).toMatchObject({ remote_photo_path: photo().path, remote_photo_use: true, media_error: null });
  });

  it("removes a photo the member removed", async () => {
    const { db, updates } = fakeDb({ remote_photo_path: "u1/p1/photo-old.jpg", remote_photo_use: true });
    await syncApplicantMedia(db, USER, { id: PROFILE, photo: null }, EXTERNAL);
    expect(fa.deleteApplicantPhoto).toHaveBeenCalledWith(EXTERNAL);
    expect(updates[0]).toMatchObject({ remote_photo_path: null, remote_photo_use: false });
  });

  it("sends a new video through a signed upload and attaches it with Scout's watch link", async () => {
    fa.requestApplicantVideoUpload.mockResolvedValue({ mode: "direct", signedUrl: "https://storage.example/upload?token=t", path: "applicant/a1/v.mp4" });
    const { db, updates } = fakeDb({});
    await syncApplicantMedia(db, USER, { id: PROFILE, video: video() }, EXTERNAL);
    expect(fa.requestApplicantVideoUpload).toHaveBeenCalledWith(EXTERNAL, { fileName: "intro.mp4", mimeType: "video/mp4", fileSize: 2000, durationSeconds: 30 });
    expect(fetchMock).toHaveBeenCalledWith("https://storage.example/upload?token=t", expect.objectContaining({ method: "PUT", headers: { "x-upsert": "false" } }));
    expect(fa.finalizeApplicantVideo).toHaveBeenCalledWith(EXTERNAL, expect.objectContaining({
      path: "applicant/a1/v.mp4", fileName: "intro.mp4", useInApplications: true, watchUrl: "https://applyscout.app/v/AbCdEfGhIjKlMnOpQrStUv",
    }));
    expect(updates[0]).toMatchObject({ remote_video_path: video().path, remote_video_use: true, remote_video_watch_url: "https://applyscout.app/v/AbCdEfGhIjKlMnOpQrStUv" });
  });

  it("never sends a non-https watch link (FastApply refuses one)", async () => {
    process.env.PUBLIC_SITE_URL = "http://localhost:4321";
    fa.requestApplicantVideoUpload.mockResolvedValue({ mode: "direct", signedUrl: "https://storage.example/u", path: "applicant/a1/v.mp4" });
    const { db } = fakeDb({});
    await syncApplicantMedia(db, USER, { id: PROFILE, video: video() }, EXTERNAL);
    expect(fa.finalizeApplicantVideo).toHaveBeenCalledWith(EXTERNAL, expect.objectContaining({ watchUrl: null }));
  });

  it("only updates the switch when the same video's choice changed", async () => {
    const { db } = fakeDb({ remote_video_path: video().path, remote_video_use: true, remote_video_watch_url: "https://applyscout.app/v/AbCdEfGhIjKlMnOpQrStUv" });
    await syncApplicantMedia(db, USER, { id: PROFILE, video: video({ useInApplications: false }) }, EXTERNAL);
    expect(fa.requestApplicantVideoUpload).not.toHaveBeenCalled();
    expect(fa.updateApplicantVideo).toHaveBeenCalledWith(EXTERNAL, { useInApplications: false, watchUrl: null });
  });

  it("records, and does not throw, when FastApply does not take media yet", async () => {
    fa.uploadApplicantPhoto.mockRejectedValue(new FirstApplyError("Cannot POST", 404));
    const { db, updates } = fakeDb({});
    const result = await syncApplicantMedia(db, USER, { id: PROFILE, photo: photo() }, EXTERNAL);
    expect(result.error).toMatch(/does not accept applicant photos and videos yet/);
    expect(updates[0].media_error).toBe(result.error);
  });

  it("ignores a media record pointing outside the member's own folder", async () => {
    const { db } = fakeDb({});
    await syncApplicantMedia(db, USER, { id: PROFILE, photo: photo({ path: "u2/p9/photo-x.jpg" }) }, EXTERNAL);
    expect(fa.uploadApplicantPhoto).not.toHaveBeenCalled();
  });
});

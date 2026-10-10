import { describe, expect, it } from "vitest";
import {
  durationProblem,
  isShareToken,
  ownsMediaPath,
  readMp4DurationSeconds,
  sanitizeFileName,
  sniffContainer,
  sniffImage,
  uploadIntentProblem,
} from "./profile-media-rules";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const box = (type: string, body: number[]) => [...u32(8 + body.length), ...ascii(type), ...body];

/** ftyp, a big mdat, then moov/mvhd at the end (a file that was not "fast-started"). */
function mp4(seconds: number, version: 0 | 1 = 0) {
  const timescale = 1000;
  const mvhd = version === 0
    ? box("mvhd", [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(timescale), ...u32(seconds * timescale), ...new Array(12).fill(0)])
    : box("mvhd", [1, 0, 0, 0, ...u32(0), ...u32(0), ...u32(0), ...u32(0), ...u32(timescale), ...u32(0), ...u32(seconds * timescale), ...new Array(8).fill(0)]);
  return bytes(...box("ftyp", ascii("isom0000")), ...box("mdat", new Array(4000).fill(7)), ...box("moov", mvhd));
}
const reader = (file: Uint8Array) => async (start: number, end: number) => file.slice(start, end + 1);

describe("uploadIntentProblem", () => {
  it("applies FastApply's photo limits", () => {
    expect(uploadIntentProblem("photo", { mimeType: "image/jpeg", size: 1000 })).toBeNull();
    expect(uploadIntentProblem("photo", { mimeType: "image/gif", size: 1000 })).toMatch(/JPEG, PNG or WebP/);
    expect(uploadIntentProblem("photo", { mimeType: "image/png", size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
  });

  it("applies FastApply's video limits: type, size and length", () => {
    expect(uploadIntentProblem("video", { fileName: "me.mp4", mimeType: "video/mp4", size: 1_000_000, durationSeconds: 45 })).toBeNull();
    expect(uploadIntentProblem("video", { fileName: "me.avi", mimeType: "video/x-msvideo", size: 1 })).toMatch(/MP4, MOV or WebM/);
    expect(uploadIntentProblem("video", { fileName: "me.mp4", mimeType: "video/webm", size: 1 })).toMatch(/does not match/);
    expect(uploadIntentProblem("video", { fileName: "me.mov", mimeType: "video/quicktime", size: 51 * 1024 * 1024 })).toMatch(/50 MB/);
    expect(uploadIntentProblem("video", { fileName: "me.webm", mimeType: "video/webm", size: 10, durationSeconds: 61 })).toMatch(/60 seconds/);
    expect(durationProblem(60.4)).toBeNull();
  });
});

describe("sniffing", () => {
  it("knows an image by its bytes, not its name", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImage(bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")))).toBe("image/webp");
    expect(sniffImage(bytes(...ascii("<html>")))).toBeNull();
  });

  it("knows a video container by its bytes", () => {
    expect(sniffContainer(mp4(10).slice(0, 32))).toBe("isobmff");
    expect(sniffContainer(bytes(0x1a, 0x45, 0xdf, 0xa3, 0, 0))).toBe("webm");
    expect(sniffContainer(bytes(...ascii("not a video at all")))).toBeNull();
  });
});

describe("readMp4DurationSeconds", () => {
  it("reads the duration from moov/mvhd at the end of the file, in both header versions", async () => {
    const v0 = mp4(42);
    expect(await readMp4DurationSeconds(reader(v0), v0.length)).toBe(42);
    const v1 = mp4(75, 1);
    expect(await readMp4DurationSeconds(reader(v1), v1.length)).toBe(75);
  });

  it("returns null rather than guessing when there is no moov", async () => {
    const file = bytes(...box("ftyp", ascii("isom0000")), ...box("mdat", [1, 2, 3]));
    expect(await readMp4DurationSeconds(reader(file), file.length)).toBeNull();
  });
});

describe("paths, tokens and names", () => {
  it("accepts only an object in this member's folder for this profile", () => {
    expect(ownsMediaPath("u1", "p1", "u1/p1/photo-abc.jpg")).toBe(true);
    expect(ownsMediaPath("u1", "p1", "u2/p1/photo-abc.jpg")).toBe(false);
    expect(ownsMediaPath("u1", "p1", "u1/p2/photo-abc.jpg")).toBe(false);
    expect(ownsMediaPath("u1", "p1", "u1/p1/../../u2/p1/x.jpg")).toBe(false);
    expect(ownsMediaPath("u1", "p1", 7)).toBe(false);
  });

  it("recognises a share token and cleans a file name", () => {
    expect(isShareToken("AbCdEfGhIjKlMnOpQrStUv")).toBe(true);
    expect(isShareToken("short")).toBe(false);
    expect(isShareToken("../../etc/passwd-xxxxxxxx")).toBe(false);
    expect(sanitizeFileName("C:\\Users\\me\\intro\u0007.mp4")).toBe("intro.mp4");
    expect(sanitizeFileName("")).toBe("video");
  });
});

describe("videoSourceType", () => {
  it("declares no type for QuickTime, which browsers would refuse before trying", async () => {
    const { videoSourceType } = await import("./profile-media-rules");
    expect(videoSourceType("video/quicktime")).toBeUndefined();
    expect(videoSourceType("video/mp4")).toBe("video/mp4");
  });
});

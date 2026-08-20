/**
 * Social cover rendering for Scout's marketing channels.
 *
 * Renders on-brand cover images from a JSON spec and stores them in a public
 * Supabase Storage bucket, returning a stable public URL. The URL is what makes
 * these useful: Buffer's API accepts images by URL only, and Instagram posts
 * cannot be scheduled at all without an attached asset.
 *
 * Design tokens are lifted from src/styles/global.css and DESIGN.md. Keep them
 * in sync there rather than editing values here.
 */
import { ImageResponse } from "@vercel/og";
import { createAdminClient } from "./admin";

export const COVERS_BUCKET = "social";

/* Brand tokens. LIME_400 is the mark's leaf and the accent on dark surfaces. */
const FOREST = "#10210d";
const SURFACE = "#f4ffeb";
const LIME_400 = "#9dde47";
const BODY_ON_LIGHT = "#3d4a35";
/**
 * Small accent text on the light surface must use this, NOT the primary lime
 * #7fc92b. Lime on #f4ffeb fails contrast badly and effectively disappears.
 */
const ACCENT_ON_LIGHT = "#49791c";

/* The official open-path mark. Never substitute a letterform. */
const MARK_LEAF =
  "M4.5 9.2c0-1.2 1.2-2 2.3-1.6l6.7 2.7v12.8l-6.7 2.7a1.7 1.7 0 0 1-2.3-1.6v-15Z";
const MARK_BODY =
  "m15.9 8.8 9.2-3.7c1.1-.5 2.4.4 2.4 1.6v18.6c0 1.2-1.3 2.1-2.4 1.6l-8.6-3.4V13.3l-1.2-.5c-1.8-.7-1.7-3.2.1-3.8l.5-.2Z";

export const PLATFORM_SIZES = {
  linkedin: { width: 1200, height: 1200 },
  instagram: { width: 1080, height: 1350 },
  x: { width: 1600, height: 900 },
} as const;

export type Platform = keyof typeof PLATFORM_SIZES;

export interface QuoteSpec {
  layout: "quote";
  /** Each string renders as its own line. Keep to 6-12 words total. */
  lines: string[];
  /** Lines from this index render in the accent colour. Omit for none. */
  accentFrom?: number;
}

export interface StatSpec {
  layout: "stat";
  value: string;
  unit?: string;
  /** Plain text. Satori wraps it; it does not parse HTML, so no <br>. */
  label: string;
  /** Required when the value is a statistic. Never ship an uncited number. */
  source: string;
}

export type CoverSpec = (QuoteSpec | StatSpec) & {
  /** Filename stem, e.g. "li-2026-09-08-salary-floor". Lowercase, no extension. */
  slug: string;
  platform: Platform;
  dark?: boolean;
};

/* ------------------------------------------------------------------ fonts */

const FONT_VERSION = "5.3.0";
const FONT_FILES = {
  display: `https://cdn.jsdelivr.net/npm/@fontsource/space-grotesk@${FONT_VERSION}/files/space-grotesk-latin-700-normal.woff`,
  body: `https://cdn.jsdelivr.net/npm/@fontsource/inter@${FONT_VERSION}/files/inter-latin-700-normal.woff`,
};

/**
 * Cached in module scope so a warm lambda fetches fonts once per cold start.
 * These must be woff, ttf or otf. Satori cannot read woff2.
 */
let fontCache: Promise<{ display: ArrayBuffer; body: ArrayBuffer }> | null = null;

function loadFonts() {
  if (!fontCache) {
    fontCache = (async () => {
      const [display, body] = await Promise.all(
        [FONT_FILES.display, FONT_FILES.body].map(async (url) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`font fetch failed (${res.status}): ${url}`);
          return res.arrayBuffer();
        }),
      );
      return { display, body };
    })().catch((err) => {
      fontCache = null; // let the next invocation retry rather than caching a failure
      throw err;
    });
  }
  return fontCache;
}

/* --------------------------------------------------------------- elements */

/** Satori needs an explicit display:flex on any node with more than one child. */
const row = (style: Record<string, unknown>, children: unknown[]) => ({
  type: "div",
  props: { style: { display: "flex", ...style }, children },
});

function markEl(size: number, bodyColor: string) {
  return {
    type: "svg",
    props: {
      width: size,
      height: size,
      viewBox: "0 0 32 32",
      children: [
        { type: "path", props: { fill: LIME_400, d: MARK_LEAF } },
        { type: "path", props: { fill: bodyColor, d: MARK_BODY } },
      ],
    },
  };
}

function build(spec: CoverSpec) {
  const { width, height } = PLATFORM_SIZES[spec.platform];
  const dark = spec.dark ?? false;
  const ink = dark ? SURFACE : FOREST;
  const accent = dark ? LIME_400 : ACCENT_ON_LIGHT;
  const body = dark ? SURFACE : BODY_ON_LIGHT;
  const scale = width / 1200;
  const pad = Math.round(96 * scale);

  const lockup = row({ alignItems: "center", gap: Math.round(14 * scale) }, [
    markEl(Math.round(46 * scale), ink),
    {
      type: "div",
      props: {
        style: {
          fontFamily: "Space Grotesk",
          fontSize: Math.round(36 * scale),
          letterSpacing: "-0.03em",
          color: ink,
        },
        children: "Scout",
      },
    },
  ]);

  let center: unknown;
  let footer: string;

  if (spec.layout === "stat") {
    footer = spec.source;
    center = row({ flexDirection: "column" }, [
      row({ alignItems: "baseline" }, [
        {
          type: "div",
          props: {
            style: {
              fontFamily: "Space Grotesk",
              // -0.04em is the floor the design system sets for display type.
              fontSize: Math.round(190 * scale),
              letterSpacing: "-0.04em",
              lineHeight: 0.95,
              color: accent,
            },
            children: spec.value,
          },
        },
        spec.unit && {
          type: "div",
          props: {
            style: {
              fontFamily: "Space Grotesk",
              fontSize: Math.round(80 * scale),
              letterSpacing: "-0.01em",
              marginLeft: Math.round(30 * scale),
              color: accent,
            },
            children: spec.unit,
          },
        },
      ].filter(Boolean)),
      {
        type: "div",
        props: {
          style: {
            fontFamily: "Inter",
            fontSize: Math.round(46 * scale),
            lineHeight: 1.3,
            marginTop: Math.round(28 * scale),
            color: body,
          },
          children: spec.label,
        },
      },
    ]);
  } else {
    footer = "applyscout.app";
    const from = spec.accentFrom ?? spec.lines.length;
    // Longer pull quotes need smaller type to stay on one line each.
    const longest = Math.max(...spec.lines.map((l) => l.length), 1);
    const size = Math.round(Math.min(104, Math.max(64, 1900 / longest)) * scale);
    center = row({ flexDirection: "column" }, [
      {
        type: "div",
        props: {
          style: {
            width: Math.round(96 * scale),
            height: Math.round(8 * scale),
            borderRadius: Math.round(4 * scale),
            backgroundColor: accent,
            marginBottom: Math.round(40 * scale),
          },
        },
      },
      ...spec.lines.map((line, i) => ({
        type: "div",
        props: {
          style: {
            fontFamily: "Space Grotesk",
            fontSize: size,
            letterSpacing: "-0.03em",
            lineHeight: 1.12,
            color: i >= from ? accent : ink,
          },
          children: line,
        },
      })),
    ]);
  }

  return row(
    {
      width,
      height,
      flexDirection: "column",
      justifyContent: "space-between",
      padding: pad,
      backgroundColor: dark ? FOREST : SURFACE,
    },
    [
      lockup,
      center,
      {
        type: "div",
        props: {
          style: { fontFamily: "Inter", fontSize: Math.round(24 * scale), color: accent },
          children: footer,
        },
      },
    ],
  );
}

/* ---------------------------------------------------------------- render */

export async function renderCover(spec: CoverSpec): Promise<Buffer> {
  const { width, height } = PLATFORM_SIZES[spec.platform];
  const fonts = await loadFonts();
  const res = new ImageResponse(build(spec) as never, {
    width,
    height,
    fonts: [
      { name: "Space Grotesk", data: fonts.display, weight: 700, style: "normal" },
      { name: "Inter", data: fonts.body, weight: 700, style: "normal" },
    ],
  });
  return Buffer.from(await res.arrayBuffer());
}

/* --------------------------------------------------------------- storage */

const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,79}$/;

export function assertSlug(slug: string) {
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `invalid slug "${slug}": use lowercase letters, digits and hyphens, 3-80 chars, no extension`,
    );
  }
}

export async function storeCover(slug: string, png: Buffer): Promise<string> {
  const supabase = createAdminClient();
  const path = `covers/${slug}.png`;
  const { error } = await supabase.storage
    .from(COVERS_BUCKET)
    .upload(path, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  const { data } = supabase.storage.from(COVERS_BUCKET).getPublicUrl(path);
  // Cache-bust so a re-render of the same slug is not served stale by the CDN.
  return `${data.publicUrl}?v=${Date.now().toString(36)}`;
}

export async function listCovers() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(COVERS_BUCKET)
    .list("covers", { limit: 200, sortBy: { column: "created_at", order: "desc" } });
  if (error) throw new Error(`storage list failed: ${error.message}`);
  return (data ?? []).map((f) => ({
    slug: f.name.replace(/\.png$/, ""),
    updatedAt: f.updated_at,
    url: supabase.storage.from(COVERS_BUCKET).getPublicUrl(`covers/${f.name}`).data.publicUrl,
  }));
}

export async function deleteCover(slug: string) {
  assertSlug(slug);
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(COVERS_BUCKET).remove([`covers/${slug}.png`]);
  if (error) throw new Error(`storage delete failed: ${error.message}`);
}

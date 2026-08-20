/**
 * Scout Social MCP server.
 *
 * Speaks MCP over streamable HTTP so Claude can render on-brand cover images
 * and get back public URLs. Buffer's API accepts images by URL only, and
 * Instagram cannot be scheduled without an attached asset, so this endpoint is
 * what makes both of those automatable.
 *
 * Auth: the secret lives in the URL path rather than a header, because
 * claude.ai custom connectors cannot attach arbitrary headers to a remote
 * server. Treat the full URL as a credential: anyone holding it can write to
 * the covers bucket. Rotate by changing SOCIAL_MCP_TOKEN and re-adding the
 * connector. The token is compared in constant time, same as api/cron/*.
 *
 * Deliberately stateless: no sessions, no SSE. Every POST is a complete
 * JSON-RPC exchange, which is all the tools/* methods need and the only thing
 * that behaves well on serverless.
 */
import type { APIRoute } from "astro";
import {
  assertSlug,
  deleteCover,
  listCovers,
  PLATFORM_SIZES,
  renderCover,
  storeCover,
  type CoverSpec,
} from "../../../lib/social-covers";

export const prerender = false;
// Cold start pulls two font files before the first render.
export const maxDuration = 60;

const SERVER_INFO = { name: "scout-social", version: "1.0.0" };
const PROTOCOL_VERSION = "2025-06-18";

function authorized(token: string | undefined): boolean {
  const secret = import.meta.env.SOCIAL_MCP_TOKEN?.trim();
  if (!secret || !token) return false;
  if (token.length !== secret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < secret.length; i++) mismatch |= secret.charCodeAt(i) ^ token.charCodeAt(i);
  return mismatch === 0;
}

const TOOLS = [
  {
    name: "render_cover",
    description:
      "Render an on-brand Scout cover image and return its public URL, ready to pass straight to Buffer's create_post assets field. Overwrites any existing cover with the same slug. Use layout 'quote' for a pull quote from the post (6 to 12 words, one line per array entry) and 'stat' for a single figure. Never put an uncited statistic on a cover.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description:
            "Filename stem identifying the post, e.g. 'li-2026-09-08-salary-floor'. Lowercase letters, digits and hyphens only, no extension.",
        },
        platform: {
          type: "string",
          enum: Object.keys(PLATFORM_SIZES),
          description:
            "linkedin renders 1200x1200 (square occupies more feed height on mobile), instagram 1080x1350, x 1600x900.",
        },
        layout: { type: "string", enum: ["quote", "stat"] },
        dark: {
          type: "boolean",
          description:
            "true for the deep forest background, false for the light surface. Alternate down the queue so the feed does not look monotonous.",
        },
        lines: {
          type: "array",
          items: { type: "string" },
          description: "layout 'quote': each entry renders as its own line.",
        },
        accentFrom: {
          type: "number",
          description:
            "layout 'quote': zero-based index from which lines render in the accent colour. Omit for no accent.",
        },
        value: { type: "string", description: "layout 'stat': the figure, e.g. '31'." },
        unit: { type: "string", description: "layout 'stat': e.g. 'min'." },
        label: { type: "string", description: "layout 'stat': the sentence under the figure." },
        source: {
          type: "string",
          description: "layout 'stat': citation printed on the image. Required.",
        },
      },
      required: ["slug", "platform", "layout"],
    },
  },
  {
    name: "list_covers",
    description: "List cover images already rendered, newest first, with their public URLs.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "delete_cover",
    description: "Permanently delete one cover image by slug.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
  },
] as const;

async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "render_cover": {
      const spec = args as unknown as CoverSpec;
      assertSlug(spec.slug);
      if (!(spec.platform in PLATFORM_SIZES)) {
        throw new Error(`unknown platform "${spec.platform}"`);
      }
      if (spec.layout === "quote") {
        if (!Array.isArray(spec.lines) || spec.lines.length === 0) {
          throw new Error("layout 'quote' requires a non-empty lines array");
        }
      } else if (spec.layout === "stat") {
        if (!spec.value || !spec.label) throw new Error("layout 'stat' requires value and label");
        if (!spec.source) {
          throw new Error("layout 'stat' requires a source: never ship an uncited figure");
        }
      } else {
        throw new Error(`unknown layout "${(spec as { layout: string }).layout}"`);
      }
      const url = await storeCover(spec.slug, await renderCover(spec));
      const { width, height } = PLATFORM_SIZES[spec.platform];
      return { slug: spec.slug, url, width, height };
    }
    case "list_covers":
      return { covers: await listCovers() };
    case "delete_cover": {
      const slug = String(args.slug ?? "");
      await deleteCover(slug);
      return { deleted: slug };
    }
    default:
      throw new Error(`unknown tool "${name}"`);
  }
}

const rpc = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: unknown, code: number, message: string) => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

async function handle(msg: { id?: unknown; method?: string; params?: Record<string, unknown> }) {
  const { id, method, params } = msg;
  switch (method) {
    case "initialize":
      return rpc(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });
    case "ping":
      return rpc(id, {});
    case "tools/list":
      return rpc(id, { tools: TOOLS });
    case "tools/call": {
      const name = String(params?.name ?? "");
      const args = (params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const result = await callTool(name, args);
        return rpc(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        });
      } catch (err) {
        // Tool failures are a result with isError, not a protocol error, so the
        // model sees the message and can correct itself.
        return rpc(id, {
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
          isError: true,
        });
      }
    }
    default:
      return rpcError(id, -32601, `method not found: ${method}`);
  }
}

export const POST: APIRoute = async ({ params, request }) => {
  if (!authorized(params.token)) {
    return new Response("Not found", { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(rpcError(null, -32700, "parse error"), { status: 400 });
  }

  const batch = Array.isArray(payload) ? payload : [payload];
  const responses = [];
  for (const msg of batch) {
    // A JSON-RPC message with no id is a notification and takes no response.
    if (msg && typeof msg === "object" && "method" in msg && msg.id !== undefined) {
      responses.push(await handle(msg));
    }
  }

  if (responses.length === 0) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(payload) ? responses : responses[0]);
};

/** No server-initiated stream: this server is stateless by design. */
export const GET: APIRoute = ({ params }) =>
  authorized(params.token)
    ? new Response("Method not allowed", { status: 405 })
    : new Response("Not found", { status: 404 });

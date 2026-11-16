
// Minimal Meta Graph API client. Auth is a System User token from Business
// Settings; Facebook Page calls exchange it for that Page's token.

const VERSION = process.env.META_GRAPH_VERSION ?? "v24.0";
const BASE = `https://graph.facebook.com/${VERSION}`;

export class MetaError extends Error {
  constructor(message: string, public detail: unknown) { super(message); }
}

type Params = Record<string, string | number | boolean | object | undefined>;

export async function graph<T = Record<string, unknown>>(
  path: string,
  params: Params = {},
  method: "GET" | "POST" = "POST",
  token = process.env.META_SYSTEM_USER_TOKEN!,
): Promise<T> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    body.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  body.set("access_token", token);
  const url = method === "GET" ? `${BASE}/${path}?${body}` : `${BASE}/${path}`;
  const res = await fetch(url, method === "GET" ? {} : { method, body });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new MetaError(json.error?.error_user_msg ?? json.error?.message ?? `Meta ${res.status}`, json.error ?? json);
  }
  return json as T;
}

const pageTokens = new Map<string, string>();
export async function pageToken(pageId: string) {
  if (!pageTokens.has(pageId)) {
    const r = await graph<{ access_token: string }>(pageId, { fields: "access_token" }, "GET");
    pageTokens.set(pageId, r.access_token);
  }
  return pageTokens.get(pageId)!;
}

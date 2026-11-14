import "server-only";
import { NextResponse } from "next/server";
import { requireApiUser } from "./auth";

type Ctx<P> = { params: Promise<P> };

/** Route wrapper: auth check + JSON errors. */
export function route<P = Record<string, string>>(
  fn: (req: Request, params: P, user: string) => Promise<unknown>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const user = await requireApiUser();
      const out = await fn(req, await ctx.params, user);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof Response) return e;
      const message = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
      console.error(e);
      return NextResponse.json({ error: message }, { status: 400 });
    }
  };
}

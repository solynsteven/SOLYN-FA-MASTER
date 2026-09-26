export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

export async function run<T>(fn: () => Promise<T | void>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = (await fn()) ?? undefined;
    return { ok: true, data: data as T | undefined, message };
  } catch (e) {
    // redirect()/notFound() 抛出的特殊错误需继续向上抛
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_")) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[action]", msg);
    return { ok: false, error: msg.includes("duplicate key") ? "记录已存在（唯一值冲突）" : msg };
  }
}

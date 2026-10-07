export async function fetchPublicJson(url: string, signal?: AbortSignal, headers: Record<string, string> = {}, body?: unknown): Promise<unknown> {
  // Callers construct URLs from the fixed registry, never from a posting or user input.
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), Accept: "application/json", "User-Agent": "AiadApply/2.0 (personal job discovery)", ...headers },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000),
    redirect: "error", cache: "no-store",
  });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
  const limit = 16 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > limit) throw new Error("Source response exceeds the collection limit.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Source returned no content.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Source response exceeds the collection limit.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

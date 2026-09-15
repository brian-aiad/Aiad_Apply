import { z } from "zod";

export const webUrl = z.string().max(2000).url().refine((value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Use an http:// or https:// job URL without embedded credentials.");

export function crossOriginMutation(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  const target = new URL(request.url);
  // Next.js can normalize the internal URL to localhost even when the browser
  // connected to 127.0.0.1. Host retains the authority the browser requested.
  const host = request.headers.get("host");
  if (host) target.host = host;
  return origin !== null && origin !== target.origin;
}

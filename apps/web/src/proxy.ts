import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { crossOriginMutation } from "@/lib/web-url";

function unauthorized(message = "Authentication required.", status = 401) {
  return new NextResponse(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      ...(status === 401
        ? { "WWW-Authenticate": 'Basic realm="AiadApply", charset="UTF-8"' }
        : {}),
    },
  });
}

function credentialsMatch(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/worker/")) {
    return NextResponse.next();
  }
  if (crossOriginMutation(request)) return unauthorized("Cross-origin changes are not allowed.", 403);
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const expectedPassword = process.env.AIADAPPLY_PASSWORD;
  if (!expectedPassword) {
    return unauthorized("AiadApply access is not configured.", 503);
  }
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return unauthorized();

  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return unauthorized();
    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    const expectedUsername = process.env.AIADAPPLY_USERNAME || "brian";
    if (
      !credentialsMatch(username, expectedUsername) ||
      !credentialsMatch(password, expectedPassword)
    ) {
      return unauthorized();
    }
  } catch {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

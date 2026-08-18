import { timingSafeEqual } from "node:crypto";
import path from "node:path";

const DEFAULT_WORKER_LEASE_SECONDS = 30 * 60;
const MINIMUM_WORKER_LEASE_SECONDS = 10 * 60;
const MAXIMUM_WORKER_LEASE_SECONDS = 24 * 60 * 60;
export const WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,99}$/;

function secretsMatch(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

export function workerAuthorized(
  request: Request,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const expected = environment.WORKER_SECRET || environment.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  return Boolean(expected && secretsMatch(authorization, `Bearer ${expected}`));
}

export function workerLeaseMilliseconds(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const configured = Number(environment.WORKER_LEASE_SECONDS);
  const seconds = Number.isFinite(configured)
    ? Math.min(
        MAXIMUM_WORKER_LEASE_SECONDS,
        Math.max(MINIMUM_WORKER_LEASE_SECONDS, Math.round(configured)),
      )
    : DEFAULT_WORKER_LEASE_SECONDS;
  return seconds * 1000;
}

export function staleWorkerCutoff(
  now = new Date(),
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return new Date(now.getTime() - workerLeaseMilliseconds(environment));
}

export function safeArtifactName(fileName: string) {
  const baseName = path.basename(fileName).replace(/[\r\n"\\/]+/g, "_").trim();
  return baseName || "artifact";
}

export function pathIsInside(root: string, candidate: string) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

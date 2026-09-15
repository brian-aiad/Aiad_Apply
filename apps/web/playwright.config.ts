import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { assertIsolatedDatabase } from "./src/lib/test-database";

const e2eDatabaseUrl = process.env.AIADAPPLY_E2E_DATABASE_URL;
if (!e2eDatabaseUrl) {
  throw new Error(
    "AIADAPPLY_E2E_DATABASE_URL is required. E2E cleanup must never target the normal dashboard database.",
  );
}
// Playwright reloads this config in workers after inheriting the test URLs.
// Retain the original workspace URLs so every process checks the same boundary.
process.env.AIADAPPLY_E2E_NORMAL_DATABASE_URL ??= process.env.DATABASE_URL || "postgresql://localhost/unknown";
process.env.AIADAPPLY_E2E_NORMAL_DIRECT_URL ??= process.env.DIRECT_URL || process.env.AIADAPPLY_E2E_NORMAL_DATABASE_URL;
assertIsolatedDatabase(e2eDatabaseUrl, process.env.AIADAPPLY_E2E_NORMAL_DATABASE_URL);
if (process.env.AIADAPPLY_E2E_DIRECT_URL) assertIsolatedDatabase(process.env.AIADAPPLY_E2E_DIRECT_URL, process.env.AIADAPPLY_E2E_NORMAL_DIRECT_URL);
process.env.DATABASE_URL = e2eDatabaseUrl;
process.env.DIRECT_URL = process.env.AIADAPPLY_E2E_DIRECT_URL || e2eDatabaseUrl;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  // Suites inspect workspace-wide counts and share fixture cleanup.
  workers: 1,
  retries: 1,
  reporter: "list",
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:3100",
    httpCredentials: { username: "brian", password: "playwright-local-e2e" },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    // Exercise the same compiled route manifest used by a release. The dev
    // router can transiently return its HTML 404 while first compiling a
    // nested dynamic API route, which makes worker API checks nondeterministic.
    command: "npm run build && npm run start -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: e2eDatabaseUrl,
      DIRECT_URL: process.env.DIRECT_URL,
      NEXT_PUBLIC_DISABLE_DISCOVERY_AUTO_REFRESH: "1",
      AIADAPPLY_USERNAME: "brian",
      AIADAPPLY_PASSWORD: "playwright-local-e2e",
      SUPABASE_SERVICE_ROLE_KEY: "",
      AIADAPPLY_BUILD_DIR: ".next-e2e",
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});

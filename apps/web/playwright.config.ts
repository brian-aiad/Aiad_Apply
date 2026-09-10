import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const e2eDatabaseUrl = process.env.AIADAPPLY_E2E_DATABASE_URL;
if (!e2eDatabaseUrl) {
  throw new Error(
    "AIADAPPLY_E2E_DATABASE_URL is required. E2E cleanup must never target the normal dashboard database.",
  );
}
process.env.DATABASE_URL = e2eDatabaseUrl;
process.env.DIRECT_URL = process.env.AIADAPPLY_E2E_DIRECT_URL || e2eDatabaseUrl;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 1,
  reporter: "list",
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: e2eDatabaseUrl,
      DIRECT_URL: process.env.DIRECT_URL,
      NEXT_PUBLIC_DISABLE_DISCOVERY_AUTO_REFRESH: "1",
      AIADAPPLY_BUILD_DIR: ".next-e2e",
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});

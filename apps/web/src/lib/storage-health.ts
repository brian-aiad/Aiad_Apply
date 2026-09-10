export function storageHealth(databaseUrl = process.env.DATABASE_URL) {
  let databaseLocation: "local" | "hosted" | "unknown" = "unknown";
  try {
    const host = new URL(databaseUrl || "").hostname;
    databaseLocation = /^(localhost|127\.|\[?::1\]?|host\.docker\.internal)/.test(host) ? "local" : "hosted";
  } catch { /* An invalid connection is reported by the database health check. */ }
  return { databaseLocation, objectStorageConfigured: Boolean((process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY) };
}

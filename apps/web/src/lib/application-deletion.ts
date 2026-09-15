import { createClient } from "@supabase/supabase-js";
import type { PrismaClient } from "@prisma/client";

export class DeletionError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export async function removeStoredArtifacts(paths: string[]) {
  if (!paths.length) return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new DeletionError("This job has cloud files. Configure Supabase storage credentials on this device before deleting it.", 409);
  const client = createClient(url, key, { auth: { persistSession: false } });
  for (let offset = 0; offset < paths.length; offset += 1000) {
    const { error } = await client.storage.from("resume-artifacts").remove(paths.slice(offset, offset + 1000));
    if (error) throw new DeletionError("Cloud file deletion failed. The job remains in AiadApply; retry when storage is available.", 502);
  }
}

// No deleted flags, tombstones, or deletion-history events are retained.
export async function deleteApplicationPermanently(
  db: PrismaClient,
  id: string,
  removeCloudFiles: (paths: string[]) => Promise<void> = removeStoredArtifacts,
) {
  return db.$transaction(async (tx) => {
    // Lock the parent and its runs so a queued worker cannot claim during deletion.
    await tx.$queryRaw`SELECT id FROM applications WHERE id = ${id}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM tailoring_runs WHERE application_id = ${id}::uuid FOR UPDATE`;
    const application = await tx.application.findUnique({
      where: { id }, include: { job: true, tailoringRuns: { include: { artifacts: true } } },
    });
    if (!application) throw new DeletionError("Application not found.", 404);
    if (application.tailoringRuns.some((run) => run.status === "RUNNING")) {
      throw new DeletionError("Wait for active tailoring to finish before permanently deleting this job.", 409);
    }
    const artifacts = application.tailoringRuns.flatMap((run) => run.artifacts);
    const paths = [...new Set(artifacts.flatMap((item) => item.storagePath ? [item.storagePath] : []))];
    // Never delete an object referenced by a different application.
    if (paths.length && await tx.artifact.count({ where: { storagePath: { in: paths }, run: { applicationId: { not: id } } } })) {
      throw new DeletionError("A cloud file is shared with another job. Resolve the shared reference before deleting.", 409);
    }
    await removeCloudFiles(paths);
    await tx.discoveryPosting.deleteMany({ where: { OR: [
      { approvedApplicationId: id },
      ...(application.job.sourceUrl ? [{ sourceUrl: application.job.sourceUrl }] : []),
    ] } });
    // PostgreSQL cascades remove application, runs, decisions, changes, artifacts,
    // artifact byte backups, and events together. Product settings/base resume stay.
    await tx.job.delete({ where: { id: application.jobId } });
    return application.tailoringRuns;
  }, { timeout: 60_000, maxWait: 10_000 });
}

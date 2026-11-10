import { db } from "@/lib/db";
import {
  workerHeartbeatKey,
  workerHeartbeatWriteCutoff,
} from "@/lib/worker-security";

export async function recordWorkerHeartbeat(workerId: string, platform?: string) {
  const key = workerHeartbeatKey(workerId);
  const previous = platform ? null : await db.setting.findUnique({ where: { key } });
  const prior = previous?.value && typeof previous.value === "object" && !Array.isArray(previous.value) ? previous.value : {};
  const value = { ...prior, workerId, state: "online", ...(platform ? { platform } : {}) };
  const refreshed = await db.setting.updateMany({
    where: { key, updatedAt: { lt: workerHeartbeatWriteCutoff() } },
    data: { value },
  });
  if (refreshed.count === 0) {
    await db.setting.upsert({
      where: { key },
      create: { key, value },
      update: {},
    });
  }
}

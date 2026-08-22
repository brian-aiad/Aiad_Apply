import { db } from "@/lib/db";
import {
  workerHeartbeatKey,
  workerHeartbeatWriteCutoff,
} from "@/lib/worker-security";

export async function recordWorkerHeartbeat(workerId: string) {
  const key = workerHeartbeatKey(workerId);
  const value = { workerId, state: "online" };
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

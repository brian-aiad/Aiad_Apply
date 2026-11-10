import { db } from "./db";
import { AUTOMATION_POLICY_KEY } from "./workspace-material";
import { automationPlatformAllowed, type AutomationPurpose } from "./automation-device-policy";
export async function automationDeviceAllowed(platform: unknown, purpose: AutomationPurpose = "discovery") {
  const row = await db.setting.findUnique({ where: { key: AUTOMATION_POLICY_KEY } });
  return automationPlatformAllowed(row?.value, platform, purpose);
}

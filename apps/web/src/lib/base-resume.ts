import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function isDirectory(candidate: string) {
  return stat(candidate).then((entry) => entry.isDirectory()).catch(() => false);
}

/** Keep selection in sync with resume-engine/config.py, including user edits in OneDrive. */
export async function baseResumePath({
  environment = process.env,
  home = os.homedir(),
  platform = process.platform,
  repository = path.resolve(process.cwd(), "..", ".."),
}: {
  environment?: Record<string, string | undefined>;
  home?: string;
  platform?: string;
  repository?: string;
} = {}) {
  const expandHome = (value: string) => value.startsWith("~/")
    ? path.join(home, value.slice(2)) : value;
  const configured = environment.AIADAPPLY_BASE_RESUME?.trim();
  // An explicit missing path is an error, not permission to serve an older base.
  if (configured) return expandHome(configured);

  let outputRoot = environment.AIADAPPLY_OUTPUT_ROOT?.trim();
  if (outputRoot) {
    outputRoot = expandHome(outputRoot);
  } else {
    let downloads = path.join(home, "Downloads");
    const macCloud = path.join(home, "Library", "CloudStorage", "OneDrive-Personal");
    const windowsDownloads = path.join(home, "OneDrive", "Downloads");
    if (platform === "darwin" && await isDirectory(macCloud)) {
      downloads = path.join(macCloud, "Downloads");
    } else if (platform === "win32" && await isDirectory(windowsDownloads)) {
      downloads = windowsDownloads;
    }
    outputRoot = path.join(downloads, "Resume_Builder", "OUTPUT_RESUMES");
  }
  const synced = path.join(path.dirname(outputRoot), "Brian_Aiad_BASE.docx");
  if (await stat(synced).then((entry) => entry.isFile()).catch(() => false)) return synced;
  return path.join(repository, "data", "resumes", "Brian_Aiad_BASE.docx");
}

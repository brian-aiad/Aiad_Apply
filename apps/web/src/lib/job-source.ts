export function captureSource(sourceUrl: string | null | undefined): string {
  try {
    const host = new URL(sourceUrl || "").hostname.toLowerCase();
    const belongs = (domain: string) => host === domain || host.endsWith(`.${domain}`);
    if (belongs("linkedin.com")) return "linkedin";
    if (belongs("greenhouse.io")) return "greenhouse";
    if (belongs("lever.co")) return "lever";
    if (belongs("myworkdayjobs.com") || belongs("myworkdaysite.com")) return "workday";
    if (belongs("ashbyhq.com")) return "ashby";
    if (belongs("simplify.jobs")) return "simplify";
    return "employer";
  } catch { return "paste"; }
}

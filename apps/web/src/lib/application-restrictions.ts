export function referralOnlyEmployer(company: string, urls: (string | null | undefined)[], policy: unknown): boolean {
  if (!policy || typeof policy !== "object" || !("referralOnlyEmployers" in policy) || !Array.isArray(policy.referralOnlyEmployers)) return false;
  const requested = policy.referralOnlyEmployers.map(value => String(value).toLowerCase());
  const name = company.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (requested.some(value => name === value || name.startsWith(`${value} `))) return true;
  if (!requested.includes("rtx")) return false;
  if (/^(?:raytheon|collins aerospace|pratt (?:and )?whitney)(?: |$)/.test(name)) return true;
  return urls.some(value => {
    try {
      const url = new URL(value || "");
      return (url.hostname === "careers.rtx.com" || url.hostname === "jobs.rtx.com") ||
        (url.hostname === "globalhr.wd5.myworkdayjobs.com" && /\/REC_RTX_Ext_Gateway(?:\/|$)/i.test(url.pathname));
    } catch { return false; }
  });
}

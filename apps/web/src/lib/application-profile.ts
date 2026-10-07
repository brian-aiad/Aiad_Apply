import { z } from "zod";
import { webUrl } from "./web-url";

const text = z.string().trim().max(500);
const optionalUrl = webUrl.or(z.literal(""));
export const applicationProfileSchema = z.object({
  firstName: text, lastName: text, email: z.string().trim().email().or(z.literal("")),
  phone: text, city: text, region: text, postalCode: text,
  linkedin: optionalUrl, portfolio: optionalUrl,
  desiredSalary: text, workAuthorization: text, sponsorship: text,
  startDate: text, relocation: text, clearance: text,
  github: optionalUrl.default(""), preferredName: text.default(""), country: text.default(""),
  address: text.default(""), confirmedAnswers: z.string().trim().max(12000).default(""),
}).strict();
export type ApplicationProfile = z.infer<typeof applicationProfileSchema>;
export const emptyApplicationProfile: ApplicationProfile = {
  firstName: "", lastName: "", email: "", phone: "", city: "", region: "", postalCode: "",
  linkedin: "", portfolio: "https://loavenly.com", desiredSalary: "", workAuthorization: "",
  sponsorship: "", startDate: "", relocation: "", clearance: "",
  github: "", preferredName: "", country: "", address: "", confirmedAnswers: "",
};
export const profileFields: { key: keyof ApplicationProfile; label: string; type?: string; copyOnly?: boolean }[] = [
  { key: "firstName", label: "First name" }, { key: "lastName", label: "Last name" },
  { key: "email", label: "Email", type: "email" }, { key: "phone", label: "Phone", type: "tel" },
  { key: "city", label: "City" }, { key: "region", label: "State / region" }, { key: "postalCode", label: "ZIP / postal code" },
  { key: "linkedin", label: "LinkedIn", type: "url" }, { key: "portfolio", label: "Portfolio", type: "url" },
  { key: "desiredSalary", label: "Desired salary", copyOnly: true }, { key: "workAuthorization", label: "Work authorization", copyOnly: true },
  { key: "sponsorship", label: "Sponsorship", copyOnly: true }, { key: "startDate", label: "Start date", copyOnly: true },
  { key: "relocation", label: "Location / relocation", copyOnly: true }, { key: "clearance", label: "Security clearance", copyOnly: true },
  { key: "github", label: "GitHub", type: "url" }, { key: "preferredName", label: "Preferred name" },
  { key: "country", label: "Country" }, { key: "address", label: "Street address" },
  { key: "confirmedAnswers", label: "Additional confirmed answers (question and answer)", type: "textarea", copyOnly: true },
];
export function readApplicationProfile(value: unknown): ApplicationProfile {
  const result = applicationProfileSchema.safeParse(value);
  return result.success ? result.data : { ...emptyApplicationProfile };
}
export function missingContactFields(profile: ApplicationProfile) {
  return profileFields.filter(({ key }) => ["firstName", "lastName", "email", "phone"].includes(key) && !profile[key]).map(({ label }) => label);
}
// Eligibility and freeform answers remain copy-only: question wording changes the answer.
export function autofillContact(profile: ApplicationProfile) {
  return Object.fromEntries(profileFields.filter(f => !f.copyOnly).map(f => [f.key, profile[f.key]]));
}

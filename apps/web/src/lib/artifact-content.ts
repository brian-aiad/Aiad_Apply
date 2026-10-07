import { createHash } from "node:crypto";

export function artifactBytesMatch(content: Buffer, artifact: { sha256: string | null; byteSize: number | null }): boolean {
  return Boolean(artifact.sha256)
    && (artifact.byteSize === null || artifact.byteSize === content.byteLength)
    && createHash("sha256").update(content).digest("hex") === artifact.sha256;
}

export function validatedArtifactBytes(artifact: Record<string, unknown>): Buffer | null {
  const encoded = artifact.contentBase64;
  if (encoded === undefined || encoded === "") return null;
  if (typeof encoded !== "string" || encoded.length > 10_000_000) throw new Error("Invalid artifact content.");
  const content = Buffer.from(encoded, "base64");
  if (content.toString("base64") !== encoded) throw new Error("Invalid artifact encoding.");
  if (typeof artifact.byteSize === "number" && artifact.byteSize !== content.byteLength) throw new Error("Artifact size does not match its contents.");
  if (artifact.sha256 !== undefined && artifact.sha256 !== createHash("sha256").update(content).digest("hex")) throw new Error("Artifact fingerprint does not match its contents.");
  return content;
}

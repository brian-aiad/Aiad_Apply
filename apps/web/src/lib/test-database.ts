export function assertIsolatedDatabase(testUrl: string, normalUrl: string) {
  const identity = (value: string) => {
    const url = new URL(value);
    const host = ["127.0.0.1", "::1", "[::1]"].includes(url.hostname) ? "localhost" : url.hostname;
    return `${host}:${url.port || "5432"}${url.pathname}?schema=${url.searchParams.get("schema") || "public"}`;
  };
  if (identity(testUrl) === identity(normalUrl)) throw new Error("Tests require a separate database or schema. Refusing to use the normal workspace.");
}

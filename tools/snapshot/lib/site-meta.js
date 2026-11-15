export function resolveSiteUrl(event) {
  const configured =
    process.env.SITE_URL?.trim() ||
    process.env.URL?.trim() ||
    process.env.DEPLOY_PRIME_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const host = event?.headers?.host || event?.headers?.Host;
  if (host) return `https://${host}`;
  throw new Error("SITE_URL is not configured");
}

export function resolveDisplayName() {
  return process.env.AVAILABILITY_DISPLAY_NAME?.trim() || "Joey Farren";
}

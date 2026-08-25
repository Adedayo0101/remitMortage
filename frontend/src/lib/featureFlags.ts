const DEFAULT_FEATURE_FLAG_API = "/api/feature-flags";

function defaultFlagValue(flag: string): boolean {
  const raw = process.env.NEXT_PUBLIC_FEATURE_FLAG_DEFAULTS || process.env.NEXT_PUBLIC_FEATURE_FLAGS_DEFAULTS;
  if (!raw) {
    return false;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const value = (parsed as Record<string, unknown>)[flag];
      return value === true || value === "true";
    }
  } catch {
    return false;
  }

  return false;
}

export async function getFeatureFlag(flag: string): Promise<boolean> {
  const response = await fetch(`${DEFAULT_FEATURE_FLAG_API}/${encodeURIComponent(flag)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return defaultFlagValue(flag);
  }

  const data = (await response.json()) as { enabled?: unknown };
  return data.enabled === true;
}

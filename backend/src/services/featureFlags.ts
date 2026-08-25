import { getRedisClient } from "./redis.js";

const FEATURE_FLAG_PREFIX = "feature-flag:";

function parseDefaults(): Record<string, boolean> {
  const raw = process.env.FEATURE_FLAG_DEFAULTS || process.env.FEATURE_FLAGS_DEFAULTS;
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).map(([flag, value]) => [flag, value === true || value === "true"])
      );
    }
  } catch {
    // fall through to the empty default map below
  }

  return {};
}

const featureFlagDefaults = parseDefaults();

export interface FeatureFlagState {
  flag: string;
  enabled: boolean;
  source: "redis" | "env" | "default";
}

function flagKey(flag: string): string {
  return `${FEATURE_FLAG_PREFIX}${flag}`;
}

export async function resolveFeatureFlag(flag: string): Promise<FeatureFlagState> {
  const client = getRedisClient();
  if (client) {
    const override = await client.get(flagKey(flag));
    if (override !== null) {
      return {
        flag,
        enabled: override === "true" || override === "1",
        source: "redis",
      };
    }
  }

  if (Object.prototype.hasOwnProperty.call(featureFlagDefaults, flag)) {
    return {
      flag,
      enabled: featureFlagDefaults[flag],
      source: "env",
    };
  }

  return {
    flag,
    enabled: false,
    source: "default",
  };
}

export async function setFeatureFlag(flag: string, enabled: boolean): Promise<FeatureFlagState> {
  const client = getRedisClient();
  if (client) {
    await client.set(flagKey(flag), enabled ? "true" : "false");
  }

  return {
    flag,
    enabled,
    source: client ? "redis" : "default",
  };
}

export function listFeatureFlagDefaults(): Record<string, boolean> {
  return { ...featureFlagDefaults };
}

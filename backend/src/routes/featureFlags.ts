import { Router, Request, Response } from "express";
import { resolveFeatureFlag, setFeatureFlag } from "../services/featureFlags.js";

export const featureFlagsRouter = Router();

featureFlagsRouter.get("/:flag", async (req: Request, res: Response) => {
  const { flag } = req.params;
  const state = await resolveFeatureFlag(flag);
  res.json(state);
});

featureFlagsRouter.put("/:flag", async (req: Request, res: Response) => {
  const { flag } = req.params;
  const enabled = req.body?.enabled;

  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }

  const state = await setFeatureFlag(flag, enabled);
  res.json(state);
});

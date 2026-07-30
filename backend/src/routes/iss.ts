import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../lib/httpError.js";
import { issIntegrationService } from "../services/IssIntegrationService.js";

const testShowCamSchema = z.object({
  mediaClientId: z.string().min(1),
  cameraIds: z.array(z.string().min(1)).min(1),
  mode: z.enum(["replace", "append"]).default("replace")
});

export const issRouter = Router();

issRouter.get("/ping", async (_req, res, next) => {
  try {
    res.json(await issIntegrationService.ping());
  } catch (error) {
    next(error);
  }
});

issRouter.post("/show-cam/layout", async (req, res, next) => {
  try {
    const parsed = testShowCamSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);

    const result = await issIntegrationService.showCameraLayout(
      parsed.data.mediaClientId,
      parsed.data.cameraIds,
      parsed.data.mode
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

issRouter.post("/show-cam", async (req, res, next) => {
  try {
    const parsed = testShowCamSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    const result = await issIntegrationService.showCameraOnClient(
      parsed.data.mediaClientId,
      parsed.data.cameraIds
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

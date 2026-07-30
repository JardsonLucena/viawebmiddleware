import { Router } from "express";
import { z } from "zod";
import { dataStore } from "../lib/dataStore.js";
import { HttpError } from "../lib/httpError.js";

const cameraSchema = z.object({
  iss_camera_id: z.string().min(1),
  camera_name: z.string().min(1),
  description: z.string().optional()
});

export const camerasRouter = Router();

camerasRouter.get("/", async (_req, res, next) => {
  try {
    const cameras = await dataStore.listCameras();
    res.json(cameras);
  } catch (error) {
    next(error);
  }
});

camerasRouter.post("/", async (req, res, next) => {
  try {
    const parsed = cameraSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);

    const camera = await dataStore.upsertCamera(parsed.data);

    res.status(201).json(camera);
  } catch (error) {
    next(error);
  }
});

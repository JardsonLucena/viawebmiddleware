import { Router } from "express";
import { z } from "zod";
import { dataStore } from "../lib/dataStore.js";
import { HttpError } from "../lib/httpError.js";

const cameraIdsSchema = z.array(z.string().min(1)).default([]);

const partitionCameraSchema = z.object({
  isep: z.string().min(1),
  partition: z.string().min(1),
  camera_ids: cameraIdsSchema
});

const zoneCameraSchema = z.object({
  isep: z.string().min(1),
  partition: z.string().min(1),
  zone: z.string().min(1),
  camera_ids: cameraIdsSchema
});

export const centralCameraMappingsRouter = Router();

centralCameraMappingsRouter.get("/partition", async (_req, res, next) => {
  try {
    res.json(await dataStore.listCentralPartitionCameras());
  } catch (error) {
    next(error);
  }
});

centralCameraMappingsRouter.post("/partition", async (req, res, next) => {
  try {
    const parsed = partitionCameraSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    res.status(201).json(await dataStore.replaceCentralPartitionCameras(parsed.data));
  } catch (error) {
    next(error);
  }
});

centralCameraMappingsRouter.get("/zone", async (_req, res, next) => {
  try {
    res.json(await dataStore.listCentralZoneCameras());
  } catch (error) {
    next(error);
  }
});

centralCameraMappingsRouter.post("/zone", async (req, res, next) => {
  try {
    const parsed = zoneCameraSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    res.status(201).json(await dataStore.replaceCentralZoneCameras(parsed.data));
  } catch (error) {
    next(error);
  }
});

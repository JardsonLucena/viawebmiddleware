import { Router } from "express";
import { z } from "zod";
import { dataStore } from "../lib/dataStore.js";
import { HttpError } from "../lib/httpError.js";

const mappingSchema = z.object({
  sensor_id: z.number().int().positive(),
  camera_ids: z.array(z.number().int().positive()).min(1)
});

export const mappingRouter = Router();

mappingRouter.post("/", async (req, res, next) => {
  try {
    const parsed = mappingSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);

    const mappings = await dataStore.replaceSensorMappings(parsed.data.sensor_id, parsed.data.camera_ids);

    res.status(201).json(mappings);
  } catch (error) {
    next(error);
  }
});

import { Router } from "express";
import { z } from "zod";
import { dataStore } from "../lib/dataStore.js";
import { HttpError } from "../lib/httpError.js";

const sensorSchema = z.object({
  account: z.string().min(1),
  partition: z.string().min(1),
  zone: z.string().min(1),
  sensor_name: z.string().min(1),
  description: z.string().optional()
});

export const sensorsRouter = Router();

sensorsRouter.get("/", async (_req, res, next) => {
  try {
    const sensors = await dataStore.listSensors();
    res.json(sensors);
  } catch (error) {
    next(error);
  }
});

sensorsRouter.post("/", async (req, res, next) => {
  try {
    const parsed = sensorSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);

    const sensor = await dataStore.upsertSensor(parsed.data);

    res.status(201).json(sensor);
  } catch (error) {
    next(error);
  }
});

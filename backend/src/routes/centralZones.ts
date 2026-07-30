import { Router } from "express";
import { z } from "zod";
import { dataStore } from "../lib/dataStore.js";
import { HttpError } from "../lib/httpError.js";

const centralZoneSchema = z.object({
  isep: z.string().min(1),
  partition: z.string().min(1),
  zone: z.string().min(1),
  zone_name: z.string().min(1),
  description: z.string().optional()
});

export const centralZonesRouter = Router();

centralZonesRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await dataStore.listCentralZones());
  } catch (error) {
    next(error);
  }
});

centralZonesRouter.post("/", async (req, res, next) => {
  try {
    const parsed = centralZoneSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    res.status(201).json(await dataStore.upsertCentralZone(parsed.data));
  } catch (error) {
    next(error);
  }
});

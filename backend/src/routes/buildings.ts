import { Router } from "express";
import { z } from "zod";
import { dataStore } from "../lib/dataStore.js";
import { HttpError } from "../lib/httpError.js";

const buildingSchema = z.object({
  isep: z.string().min(1),
  building_number: z.string().optional(),
  building_name: z.string().min(1),
  description: z.string().optional()
});

export const buildingsRouter = Router();

buildingsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await dataStore.listBuildings());
  } catch (error) {
    next(error);
  }
});

buildingsRouter.post("/", async (req, res, next) => {
  try {
    const parsed = buildingSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    res.status(201).json(await dataStore.upsertBuilding(parsed.data));
  } catch (error) {
    next(error);
  }
});

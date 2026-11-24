import { Router } from "express";
import { z } from "zod";
import { dataStore } from "../lib/dataStore.js";
import { HttpError } from "../lib/httpError.js";
import { encryptCentralPassword } from "../lib/centralCredentials.js";
import type { BuildingRecord } from "../lib/dataStore.js";

function publicBuilding(building: BuildingRecord) {
  const { command_password_encrypted, ...record } = building;
  return { ...record, has_command_password: Boolean(command_password_encrypted) };
}

const buildingSchema = z.object({
  isep: z.string().min(1),
  building_number: z.string().optional(),
  building_name: z.string().min(1),
  description: z.string().optional()
});

export const buildingsRouter = Router();

buildingsRouter.put("/:isep/password", async (req, res, next) => {
  try {
    const parsed = z.object({ password: z.string().trim().min(1).max(128) }).safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Informe uma senha válida.");
    const encrypted = encryptCentralPassword(parsed.data.password);
    if (!(await dataStore.setCentralPassword(req.params.isep, encrypted))) throw new HttpError(404, "central_not_found");
    res.status(204).end();
  } catch (error) { next(error); }
});

buildingsRouter.delete("/:isep/password", async (req, res, next) => {
  try {
    if (!(await dataStore.setCentralPassword(req.params.isep, null))) throw new HttpError(404, "central_not_found");
    res.status(204).end();
  } catch (error) { next(error); }
});

buildingsRouter.delete("/:isep", async (req, res, next) => {
  try {
    if (!(await dataStore.deleteBuilding(req.params.isep))) throw new HttpError(404, "central_not_found");
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

buildingsRouter.get("/", async (_req, res, next) => {
  try {
    res.json((await dataStore.listBuildings()).map(publicBuilding));
  } catch (error) {
    next(error);
  }
});

buildingsRouter.post("/", async (req, res, next) => {
  try {
    const parsed = buildingSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    res.status(201).json(publicBuilding(await dataStore.upsertBuilding(parsed.data)));
  } catch (error) {
    next(error);
  }
});

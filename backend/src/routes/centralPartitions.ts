import { Router } from "express";
import { z } from "zod";
import { dataStore } from "../lib/dataStore.js";
import { HttpError } from "../lib/httpError.js";

const centralPartitionSchema = z.object({
  isep: z.string().min(1),
  partition: z.string().min(1),
  partition_name: z.string().min(1),
  description: z.string().optional()
});

export const centralPartitionsRouter = Router();

centralPartitionsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await dataStore.listCentralPartitions());
  } catch (error) {
    next(error);
  }
});

centralPartitionsRouter.post("/", async (req, res, next) => {
  try {
    const parsed = centralPartitionSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    res.status(201).json(await dataStore.upsertCentralPartition(parsed.data));
  } catch (error) {
    next(error);
  }
});

centralPartitionsRouter.delete("/:isep/:partition", async (req, res, next) => {
  try {
    const deleted = await dataStore.deleteCentralPartition(req.params.isep, req.params.partition);
    if (!deleted) throw new HttpError(404, "Particao nao encontrada");
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

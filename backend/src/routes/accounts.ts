import { Router } from "express";
import { z } from "zod";
import { dataStore } from "../lib/dataStore.js";
import { HttpError } from "../lib/httpError.js";

const accountSchema = z.object({
  account_number: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean().default(true)
});

export const accountsRouter = Router();

accountsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await dataStore.listAccounts());
  } catch (error) {
    next(error);
  }
});

accountsRouter.post("/", async (req, res, next) => {
  try {
    const parsed = accountSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    res.status(201).json(await dataStore.saveAccount(parsed.data));
  } catch (error) {
    next(error);
  }
});

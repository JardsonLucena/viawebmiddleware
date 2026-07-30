import { Router } from "express";
import { z } from "zod";
import { dataStore } from "../lib/dataStore.js";
import { HttpError } from "../lib/httpError.js";

const userSchema = z.object({
  isep: z.string().optional(),
  account: z.string().min(1),
  partition: z.string().min(1),
  user_number: z.string().min(1),
  user_name: z.string().min(1),
  description: z.string().optional()
});

export const usersRouter = Router();

usersRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await dataStore.listUsers());
  } catch (error) {
    next(error);
  }
});

usersRouter.post("/", async (req, res, next) => {
  try {
    const parsed = userSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    res.status(201).json(await dataStore.upsertUser(parsed.data));
  } catch (error) {
    next(error);
  }
});

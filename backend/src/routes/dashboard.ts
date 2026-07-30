import { Router } from "express";
import { dataStore } from "../lib/dataStore.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await dataStore.dashboard());
  } catch (error) {
    next(error);
  }
});

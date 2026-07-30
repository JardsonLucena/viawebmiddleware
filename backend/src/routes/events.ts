import { Router } from "express";
import { z } from "zod";
import { dataStore } from "../lib/dataStore.js";
import { HttpError } from "../lib/httpError.js";
import { EventProcessor } from "../services/EventProcessor.js";
import { Server } from "socket.io";
import { getEventCameras, showEventCameras } from "../services/ShowCamResolver.js";

const eventSchema = z.object({
  account: z.string().min(1),
  partition: z.string().min(1),
  zone: z.string().min(1),
  event_code: z.string().min(1),
  mediaClientId: z.string().optional(),
  payload: z.any().optional()
});

const handlingSchema = z.object({
  action: z.string().optional(),
  operator_id: z.string().optional(),
  handled_by: z.string().optional(),
  note: z.string().optional()
});

const treatmentSchema = z.object({
  action: z.string().min(1),
  operator_id: z.string().optional(),
  operator_name: z.string().optional(),
  note: z.string().optional()
});

export function eventsRouter(io: Server) {
  const router = Router();
  const processor = new EventProcessor(io);

  router.post("/", async (req, res, next) => {
    try {
      const parsed = eventSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.message);
      const event = await processor.process(parsed.data);
      res.status(201).json(event);
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (_req, res, next) => {
    try {
      const events = await dataStore.listEvents(100);
      res.json(events);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/show-cam", async (req, res, next) => {
    try {
      const eventId = Number(req.params.id);
      if (!Number.isInteger(eventId)) throw new HttpError(400, "Invalid event id");
      const result = await showEventCameras(eventId);
      res.status(result.ok ? 200 : 404).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/cameras", async (req, res, next) => {
    try {
      const eventId = Number(req.params.id);
      if (!Number.isInteger(eventId)) throw new HttpError(400, "Invalid event id");
      const result = await getEventCameras(eventId);
      res.status(result.ok ? 200 : 404).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id/handling", async (req, res, next) => {
    try {
      const eventId = Number(req.params.id);
      if (!Number.isInteger(eventId)) throw new HttpError(400, "Invalid event id");
      const parsed = handlingSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.message);
      const event = await dataStore.handleEvent(eventId, parsed.data);
      if (!event) throw new HttpError(404, "event_not_found");
      io.emit("event:updated", event);
      res.json(event);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/treatments", async (req, res, next) => {
    try {
      const eventId = Number(req.params.id);
      if (!Number.isInteger(eventId)) throw new HttpError(400, "Invalid event id");
      res.json(await dataStore.listEventTreatments(eventId));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/treatments", async (req, res, next) => {
    try {
      const eventId = Number(req.params.id);
      if (!Number.isInteger(eventId)) throw new HttpError(400, "Invalid event id");
      const parsed = treatmentSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.message);
      const event = await dataStore.createEventTreatment(eventId, parsed.data);
      if (!event) throw new HttpError(404, "event_not_found");
      io.emit("event:updated", event);
      res.status(201).json(event);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

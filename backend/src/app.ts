import cors from "cors";
import express, { ErrorRequestHandler } from "express";
import { Server } from "socket.io";
import { config } from "./config.js";
import { HttpError } from "./lib/httpError.js";
import { accountsRouter } from "./routes/accounts.js";
import { buildingsRouter } from "./routes/buildings.js";
import { camerasRouter } from "./routes/cameras.js";
import { centralPartitionsRouter } from "./routes/centralPartitions.js";
import { centralZonesRouter } from "./routes/centralZones.js";
import { centralCameraMappingsRouter } from "./routes/centralCameraMappings.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { eventsRouter } from "./routes/events.js";
import { issRouter } from "./routes/iss.js";
import { receiverRouter } from "./routes/receiver.js";
import { usersRouter } from "./routes/users.js";
import { viawebRouter } from "./routes/viaweb.js";
import { ViawebReceiverClient } from "./services/ViawebReceiverClient.js";

export function createApp(io: Server, viawebReceiverClient: ViawebReceiverClient) {
  const app = express();

  app.use(cors({ origin: config.CORS_ORIGIN }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/events", eventsRouter(io));
  app.use("/accounts", accountsRouter);
  app.use("/buildings", buildingsRouter);
  app.use("/central-partitions", centralPartitionsRouter);
  app.use("/central-zones", centralZonesRouter);
  app.use("/central-camera-mappings", centralCameraMappingsRouter);
  app.use("/users", usersRouter);
  app.use("/cameras", camerasRouter);
  app.use("/dashboard", dashboardRouter);
  app.use("/iss", issRouter);
  app.use("/viaweb", viawebRouter(viawebReceiverClient));
  app.use("/receiver", receiverRouter(viawebReceiverClient));

  app.use(((error, _req, res, _next) => {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : "Unexpected error"
    });
  }) as ErrorRequestHandler);

  return app;
}

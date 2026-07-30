import cors from "cors";
import express, { ErrorRequestHandler } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");

export function createApp(io: Server, viawebReceiverClient: ViawebReceiverClient) {
  const app = express();

  app.use(cors({ origin: config.CORS_ORIGIN }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  mountApiRoutes(app, io, viawebReceiverClient, "");
  mountApiRoutes(app, io, viawebReceiverClient, "/api");

  app.use(express.static(frontendDistPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });

  app.use(((error, _req, res, _next) => {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : "Unexpected error"
    });
  }) as ErrorRequestHandler);

  return app;
}

function mountApiRoutes(app: express.Express, io: Server, viawebReceiverClient: ViawebReceiverClient, prefix: string) {
  app.use(`${prefix}/events`, eventsRouter(io));
  app.use(`${prefix}/accounts`, accountsRouter);
  app.use(`${prefix}/buildings`, buildingsRouter);
  app.use(`${prefix}/central-partitions`, centralPartitionsRouter);
  app.use(`${prefix}/central-zones`, centralZonesRouter);
  app.use(`${prefix}/central-camera-mappings`, centralCameraMappingsRouter);
  app.use(`${prefix}/users`, usersRouter);
  app.use(`${prefix}/cameras`, camerasRouter);
  app.use(`${prefix}/dashboard`, dashboardRouter);
  app.use(`${prefix}/iss`, issRouter);
  app.use(`${prefix}/viaweb`, viawebRouter(viawebReceiverClient));
  app.use(`${prefix}/receiver`, receiverRouter(viawebReceiverClient));
}

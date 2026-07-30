import { Router } from "express";
import { ViawebReceiverClient } from "../services/ViawebReceiverClient.js";

export function viawebRouter(client: ViawebReceiverClient) {
  const router = Router();

  router.get("/status", (_req, res) => {
    res.json(client.status());
  });

  return router;
}

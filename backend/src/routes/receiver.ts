import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../lib/httpError.js";
import { ViawebReceiverClient } from "../services/ViawebReceiverClient.js";

const receiverCommandSchema = z.object({
  isepId: z.string().min(1),
  timeoutSeconds: z.coerce.number().min(1).max(120).optional(),
  command: z.record(z.string(), z.unknown()).and(
    z.object({
      cmd: z.string().min(1)
    })
  )
});

export function receiverRouter(client: ViawebReceiverClient) {
  const router = Router();

  router.post("/command", async (req, res, next) => {
    try {
      const parsed = receiverCommandSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.message);

      const response = await client.executeCommand(
        parsed.data.isepId,
        parsed.data.command,
        parsed.data.timeoutSeconds
      );

      res.json({ ok: true, response });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

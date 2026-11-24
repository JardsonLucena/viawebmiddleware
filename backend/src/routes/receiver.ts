import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../lib/httpError.js";
import { dataStore } from "../lib/dataStore.js";
import { decryptCentralPassword } from "../lib/centralCredentials.js";
import { ViawebReceiverClient } from "../services/ViawebReceiverClient.js";

const receiverCommandSchema = z.object({
  isepId: z.string().min(1),
  registeredOnly: z.boolean().optional(),
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
      if (parsed.data.registeredOnly && !(await dataStore.findBuildingByIsep(parsed.data.isepId))) {
        throw new HttpError(404, "central_not_found");
      }

      const command = { ...parsed.data.command };
      if (["armar", "desarmar"].includes(command.cmd.toLowerCase())) {
        const building = await dataStore.findBuildingByIsep(parsed.data.isepId);
        if (!building) throw new HttpError(404, "Central não cadastrada.");
        if (!building.command_password_encrypted) {
          throw new HttpError(409, "Cadastre a senha de controle remoto da central na aba Clientes.");
        }
        command.password = decryptCentralPassword(building.command_password_encrypted);
      }
      const response = await client.executeCommand(
        parsed.data.isepId,
        command,
        parsed.data.timeoutSeconds
      );

      res.json({ ok: true, response });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

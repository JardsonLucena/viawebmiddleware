import { Server } from "socket.io";
import { performance } from "node:perf_hooks";
import { dataStore, JsonValue } from "../lib/dataStore.js";
import { interpretContactId } from "../lib/eventInterpreter.js";
import { issIntegrationService } from "./IssIntegrationService.js";
import { config } from "../config.js";
import { resolveCameraIdsForEvent } from "./ShowCamResolver.js";

export type IncomingViawebEvent = {
  account: string;
  partition: string;
  zone: string;
  event_code: string;
  isep?: string;
  mediaClientId?: string;
  payload?: JsonValue;
};

export class EventProcessor {
  constructor(private readonly io: Server) {}

  async process(input: IncomingViawebEvent) {
    const startedAt = performance.now();
    const interpretation = await this.interpret(input);
    const payload = {
      raw: input.payload ?? input,
      interpretation
    };

    const account = await dataStore.findAccount(input.account);

    if (!account || !account.enabled) {
      return this.saveEvent(input, payload, [], "PENDENTE", startedAt, "ignored_account_disabled");
    }

    const provisionalEvent = {
      id: 0,
      received_at: new Date(),
      account: input.account,
      partition: input.partition,
      zone: input.zone,
      event_code: input.event_code,
      event_type: this.eventTypeFromPayload(payload),
      payload,
      cameras_sent: [],
      status: "pending"
    };
    const cameraIds = await resolveCameraIdsForEvent(provisionalEvent);

    if (cameraIds.length === 0) {
      return this.saveEvent(input, payload, [], "PENDENTE", startedAt, "ignored_no_cameras");
    }

    const selectedCameraIds = cameraIds.slice(0, config.MAX_CAMERAS_PER_EVENT);

    try {
      await issIntegrationService.showCameraOnClient(
        input.mediaClientId ?? config.DEFAULT_MEDIA_CLIENT_ID,
        selectedCameraIds
      );

      const event = await this.saveEvent(input, payload, selectedCameraIds, "PENDENTE", startedAt);
      await dataStore.createEventTreatment(event.id, {
        action: "CAMERA_ABERTA",
        operator_name: "Sistema",
        note: `Show Cam automatico: ${selectedCameraIds.join(", ")}`
      });
      const updatedEvent = await dataStore.findEventById(event.id);
      return updatedEvent ?? event;
    } catch (error) {
      return this.saveEvent(
        input,
        payload,
        selectedCameraIds,
        "PENDENTE",
        startedAt,
        error instanceof Error ? error.message : "Unknown Show Cam error"
      );
    }
  }

  private async saveEvent(
    input: IncomingViawebEvent,
    payload: JsonValue,
    camerasSent: string[],
    status: string,
    startedAt: number,
    errorMessage?: string
  ) {
    const event = await dataStore.createEvent({
      account: input.account,
      partition: input.partition,
      zone: input.zone,
      event_code: input.event_code,
      event_type: this.eventTypeFromPayload(payload),
      payload,
      cameras_sent: camerasSent,
      status,
      execution_ms: Math.round(performance.now() - startedAt),
      error_message: errorMessage
    });

    this.io.emit("event:created", event);
    return event;
  }

  private eventTypeFromPayload(payload: JsonValue) {
    const interpretation = (payload as { interpretation?: { eventType?: unknown } })?.interpretation;
    return typeof interpretation?.eventType === "string" ? interpretation.eventType : "OUTRO";
  }

  private async interpret(input: IncomingViawebEvent) {
    const account = await dataStore.findAccount(input.account);
    const building = input.isep ? await dataStore.findBuildingByIsep(input.isep) : null;
    const centralPartition = input.isep ? await dataStore.findCentralPartition(input.isep, input.partition) : null;
    const centralZone = input.isep ? await dataStore.findCentralZone(input.isep, input.partition, input.zone) : null;
    const interpreted = interpretContactId(input.event_code, input.partition, input.zone);
    const user =
      interpreted.subject === "user"
        ? input.isep
          ? (await dataStore.findUserByIsep(input.isep, input.partition, input.zone)) ??
            (await dataStore.findUser(input.account, input.partition, input.zone))
          : await dataStore.findUser(input.account, input.partition, input.zone)
        : null;

    return {
      ...interpreted,
      accountName: account?.description ?? null,
      isep: input.isep ?? null,
      buildingNumber: building?.building_number ?? null,
      buildingName: building?.building_name ?? null,
      centralName: building?.building_name ?? null,
      partitionName: centralPartition?.partition_name ?? null,
      zoneName: centralZone?.zone_name ?? null,
      userName: user?.user_name ?? null,
      origin: building?.building_name ?? null,
      display: this.buildDisplay(input, interpreted.action, interpreted.subject, centralPartition?.partition_name, centralZone?.zone_name, user?.user_name)
    };
  }

  private buildDisplay(
    input: IncomingViawebEvent,
    action: string,
    subject: string,
    partitionName?: string | null,
    zoneName?: string | null,
    userName?: string | null
  ) {
    const partition = partitionName ? `${partitionName} (P${input.partition})` : `Particao ${input.partition}`;

    if (subject === "zone") {
      const zone = zoneName ? `${zoneName} (Z${input.zone})` : `Zona ${input.zone}`;
      return `${action} - ${partition} - ${zone}`;
    }

    if (subject === "user") {
      const user = userName ? `${userName} (usuario ${input.zone})` : `Usuario ${input.zone}`;
      return `${action} - ${partition} - ${user}`;
    }

    return `${action} - ${partition}`;
  }
}

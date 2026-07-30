import { config } from "../config.js";
import { dataStore, EventRecord } from "../lib/dataStore.js";
import { issIntegrationService } from "./IssIntegrationService.js";

type EventInterpretation = {
  isep?: string | null;
};

type EventPayload = {
  interpretation?: EventInterpretation;
};

export async function resolveCameraIdsForEvent(event: EventRecord) {
  const payload = event.payload as EventPayload | undefined;
  const isep = payload?.interpretation?.isep ?? undefined;

  if (isep) {
    const zoneCameraIds = await dataStore.findCentralZoneCameraIds(isep, event.partition, event.zone);
    if (zoneCameraIds.length > 0) return zoneCameraIds.slice(0, config.MAX_CAMERAS_PER_EVENT);

    const partitionCameraIds = await dataStore.findCentralPartitionCameraIds(isep, event.partition);
    if (partitionCameraIds.length > 0) return partitionCameraIds.slice(0, config.MAX_CAMERAS_PER_EVENT);
  }

  if (event.cameras_sent.length > 0) return event.cameras_sent.slice(0, config.MAX_CAMERAS_PER_EVENT);

  return [];
}

export async function showEventCameras(eventId: number) {
  const event = await dataStore.findEventById(eventId);
  if (!event) return { ok: false, error: "event_not_found", cameras: [] };

  const cameras = await resolveCameraIdsForEvent(event);
  if (cameras.length === 0) return { ok: false, error: "no_cameras_for_event", cameras: [] };

  await issIntegrationService.showCameraOnClient(config.DEFAULT_MEDIA_CLIENT_ID, cameras);
  return { ok: true, mediaClientId: config.DEFAULT_MEDIA_CLIENT_ID, cameras };
}

export async function getEventCameras(eventId: number) {
  const event = await dataStore.findEventById(eventId);
  if (!event) return { ok: false, error: "event_not_found", cameras: [] };

  const cameras = await resolveCameraIdsForEvent(event);
  if (cameras.length === 0) return { ok: false, error: "no_cameras_for_event", cameras: [] };

  return { ok: true, mediaClientId: config.DEFAULT_MEDIA_CLIENT_ID, cameras };
}

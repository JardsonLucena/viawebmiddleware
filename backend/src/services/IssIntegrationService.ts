import axios, { AxiosInstance } from "axios";
import { config } from "../config.js";

export type BridgeLayoutMode = "replace" | "append";

export class IssIntegrationService {
  private readonly issApi: AxiosInstance;
  private readonly bridgeApi: AxiosInstance;

  constructor() {
    this.issApi = axios.create({
      baseURL: config.ISS_BASE_URL,
      timeout: config.ISS_TIMEOUT_MS,
      auth: {
        username: config.ISS_USERNAME,
        password: config.ISS_PASSWORD
      }
    });

    this.bridgeApi = axios.create({
      baseURL: config.SHOWCAM_BRIDGE_URL,
      timeout: config.ISS_TIMEOUT_MS,
      headers: {
        "X-Bridge-Secret": config.SHOWCAM_BRIDGE_SECRET
      }
    });
  }

  async connect() {
    return this.ping();
  }

  async disconnect() {
    return { connected: false };
  }

  async ping() {
    const [bridge, iss] = await Promise.allSettled([
      this.bridgeApi.post("/ping", {}),
      this.issApi.get("/")
    ]);

    return {
      bridge: bridge.status === "fulfilled",
      issRest: iss.status === "fulfilled"
    };
  }

  async showCamera(cameraId: string) {
    return this.showCameraGroup([cameraId]);
  }

  async showCameraGroup(cameraIds: string[]) {
    return this.showCameraOnClient(config.DEFAULT_MEDIA_CLIENT_ID, cameraIds);
  }

  async showCameraOnClient(mediaClientId: string, cameraIds: string[]) {
    const cameras = this.limitCameras(cameraIds);
    const response = await this.bridgeApi.post("/show-cam", {
      mediaClientId,
      cameras
    });

    return response.data;
  }

  async showCameraLayout(
    mediaClientId: string,
    cameraIds: string[],
    mode: BridgeLayoutMode = "replace"
  ) {
    const cameras = this.limitCameras(cameraIds);
    const response = await this.bridgeApi.post("/show-cam/layout", {
      mediaClientId,
      cameras,
      mode
    });

    return response.data;
  }

  async listIssCameras() {
    const response = await this.issApi.get("/cameras");
    return response.data;
  }

  private limitCameras(cameraIds: string[]) {
    return cameraIds
      .map((cameraId) => cameraId.trim())
      .filter(Boolean)
      .slice(0, config.MAX_CAMERAS_PER_EVENT);
  }
}

export const issIntegrationService = new IssIntegrationService();

import axios from "axios";

export const api = axios.create({
  baseURL: "/api"
});

export type Sensor = {
  id: number;
  account: string;
  partition: string;
  zone: string;
  sensor_name: string;
  description?: string;
  mappings?: Array<{ id: number; camera: Camera; order: number }>;
};

export type Account = {
  id: number;
  account_number: string;
  description?: string;
  enabled: boolean;
};

export type AccountUser = {
  id: number;
  isep?: string | null;
  account: string;
  partition: string;
  user_number: string;
  user_name: string;
  description?: string;
};

export type Building = {
  id: number;
  isep: string;
  building_number?: string;
  building_name: string;
  description?: string;
};

export type CentralPartition = {
  id: number;
  isep: string;
  partition: string;
  partition_name: string;
  description?: string;
};

export type CentralZone = {
  id: number;
  isep: string;
  partition: string;
  zone: string;
  zone_name: string;
  description?: string;
};

export type CentralPartitionCamera = {
  id: number;
  isep: string;
  partition: string;
  iss_camera_id: string;
  order: number;
};

export type CentralZoneCamera = {
  id: number;
  isep: string;
  partition: string;
  zone: string;
  iss_camera_id: string;
  order: number;
};

export type Camera = {
  id: number;
  iss_camera_id: string;
  camera_name: string;
  description?: string;
};

export type EventRecord = {
  id: number;
  received_at: string;
  account: string;
  partition: string;
  zone: string;
  event_code: string;
  payload?: {
    interpretation?: {
      accountName?: string | null;
      userName?: string | null;
      category?: string;
      eventType?: string;
      action?: string;
      description?: string;
      display?: string;
      isep?: string | null;
      buildingNumber?: string | null;
      buildingName?: string | null;
      centralName?: string | null;
      partitionName?: string | null;
      zoneName?: string | null;
      origin?: string | null;
    };
    handling?: {
      handledAt?: string;
      handledBy?: string;
      note?: string | null;
    };
  };
  cameras_sent: string[];
  status: string;
  execution_ms?: number;
  error_message?: string;
  treatments?: EventTreatment[];
};

export type EventTreatment = {
  id: number;
  event_id: number;
  operator_id?: string | null;
  operator_name?: string | null;
  action: string;
  note?: string | null;
  created_at: string;
};

export type Dashboard = {
  totalEvents: number;
  failedEvents: number;
  successfulEvents: number;
  averageExecutionMs: number;
  recentEvents: EventRecord[];
};

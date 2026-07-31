import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { config } from "../config.js";

export type JsonValue = unknown;

export type SensorInput = {
  account: string;
  partition: string;
  zone: string;
  sensor_name: string;
  description?: string | null;
};

export type CameraInput = {
  iss_camera_id: string;
  camera_name: string;
  description?: string | null;
};

export type AccountInput = {
  account_number: string;
  description?: string | null;
  enabled?: boolean;
};

export type AccountUserInput = {
  isep?: string | null;
  account: string;
  partition: string;
  user_number: string;
  user_name: string;
  description?: string | null;
};

export type BuildingInput = {
  isep: string;
  building_number?: string | null;
  building_name: string;
  description?: string | null;
};

export type CentralPartitionInput = {
  isep: string;
  partition: string;
  partition_name: string;
  description?: string | null;
};

export type CentralZoneInput = {
  isep: string;
  partition: string;
  zone: string;
  zone_name: string;
  description?: string | null;
};

export type CentralPartitionCameraInput = {
  isep: string;
  partition: string;
  camera_ids: string[];
};

export type CentralZoneCameraInput = {
  isep: string;
  partition: string;
  zone: string;
  camera_ids: string[];
};

const validTreatmentActions = new Set([
  "RECONHECIDO",
  "CAMERA_ABERTA",
  "NOTA",
  "FALSO_ALARME",
  "ALARME_REAL",
  "ACIONOU_RONDA",
  "ACIONOU_POLICIA",
  "ENCERRADO"
]);

function normalizeTreatmentAction(action: string) {
  const normalized = action.trim().toUpperCase();
  return validTreatmentActions.has(normalized) ? normalized : "NOTA";
}

function statusAfterTreatment(currentStatus: string, action: string) {
  if (["ENCERRADO", "FALSO_ALARME", "ALARME_REAL"].includes(action)) return "ENCERRADO";
  if (currentStatus === "ENCERRADO") return "ENCERRADO";
  if (action === "RECONHECIDO" || action === "NOTA" || action.startsWith("ACIONOU_")) return "EM_TRATATIVA";
  return currentStatus || "PENDENTE";
}

function eventStatusOrder(status: string) {
  if (status === "PENDENTE") return 0;
  if (status === "EM_TRATATIVA") return 1;
  if (status === "ENCERRADO") return 2;
  return 3;
}

export type EventInput = {
  account: string;
  partition: string;
  zone: string;
  event_code: string;
  event_type?: string | null;
  payload: JsonValue;
  cameras_sent: string[];
  status: string;
  execution_ms?: number | null;
  error_message?: string | null;
};

export type EventHandlingInput = {
  action?: string | null;
  operator_id?: string | null;
  handled_by?: string | null;
  note?: string | null;
};

export type EventTreatmentInput = {
  operator_id?: string | null;
  operator_name?: string | null;
  action: string;
  note?: string | null;
};

export type EventTreatmentRecord = EventTreatmentInput & {
  id: number;
  event_id: number;
  created_at: Date;
};

export type CameraRecord = CameraInput & {
  id: number;
  created_at: Date;
  updated_at: Date;
};

export type MappingRecord = {
  id: number;
  sensor_id: number;
  camera_id: number;
  order: number;
  camera: CameraRecord;
};

export type SensorRecord = SensorInput & {
  id: number;
  created_at: Date;
  updated_at: Date;
  mappings?: MappingRecord[];
};

export type AlarmAccountRecord = {
  id: number;
  account_number: string;
  description?: string | null;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
};

export type AccountUserRecord = AccountUserInput & {
  id: number;
  created_at: Date;
  updated_at: Date;
};

export type BuildingRecord = BuildingInput & {
  id: number;
  created_at: Date;
  updated_at: Date;
};

export type CentralPartitionRecord = CentralPartitionInput & {
  id: number;
  created_at: Date;
  updated_at: Date;
};

export type CentralZoneRecord = CentralZoneInput & {
  id: number;
  created_at: Date;
  updated_at: Date;
};

export type CentralPartitionCameraRecord = {
  id: number;
  isep: string;
  partition: string;
  iss_camera_id: string;
  order: number;
};

export type CentralZoneCameraRecord = {
  id: number;
  isep: string;
  partition: string;
  zone: string;
  iss_camera_id: string;
  order: number;
};

export type EventRecord = EventInput & {
  id: number;
  received_at: Date;
  treatments?: EventTreatmentRecord[];
};

export type DashboardRecord = {
  totalEvents: number;
  failedEvents: number;
  successfulEvents: number;
  averageExecutionMs: number;
  recentEvents: EventRecord[];
};

interface DataStore {
  findAccount(accountNumber: string): Promise<AlarmAccountRecord | null>;
  upsertAccount(accountNumber: string): Promise<AlarmAccountRecord>;
  listAccounts(): Promise<AlarmAccountRecord[]>;
  saveAccount(input: AccountInput): Promise<AlarmAccountRecord>;
  listUsers(): Promise<AccountUserRecord[]>;
  upsertUser(input: AccountUserInput): Promise<AccountUserRecord>;
  findUser(account: string, partition: string, userNumber: string): Promise<AccountUserRecord | null>;
  findUserByIsep(isep: string, partition: string, userNumber: string): Promise<AccountUserRecord | null>;
  listBuildings(): Promise<BuildingRecord[]>;
  upsertBuilding(input: BuildingInput): Promise<BuildingRecord>;
  findBuildingByIsep(isep: string): Promise<BuildingRecord | null>;
  listCentralPartitions(): Promise<CentralPartitionRecord[]>;
  upsertCentralPartition(input: CentralPartitionInput): Promise<CentralPartitionRecord>;
  findCentralPartition(isep: string, partition: string): Promise<CentralPartitionRecord | null>;
  deleteCentralPartition(isep: string, partition: string): Promise<boolean>;
  listCentralZones(): Promise<CentralZoneRecord[]>;
  upsertCentralZone(input: CentralZoneInput): Promise<CentralZoneRecord>;
  findCentralZone(isep: string, partition: string, zone: string): Promise<CentralZoneRecord | null>;
  listCentralPartitionCameras(): Promise<CentralPartitionCameraRecord[]>;
  replaceCentralPartitionCameras(input: CentralPartitionCameraInput): Promise<CentralPartitionCameraRecord[]>;
  findCentralPartitionCameraIds(isep: string, partition: string): Promise<string[]>;
  listCentralZoneCameras(): Promise<CentralZoneCameraRecord[]>;
  replaceCentralZoneCameras(input: CentralZoneCameraInput): Promise<CentralZoneCameraRecord[]>;
  findCentralZoneCameraIds(isep: string, partition: string, zone: string): Promise<string[]>;
  findEventById(id: number): Promise<EventRecord | null>;
  listSensors(): Promise<SensorRecord[]>;
  upsertSensor(input: SensorInput): Promise<SensorRecord>;
  findSensorWithCameras(account: string, partition: string, zone: string): Promise<SensorRecord | null>;
  listCameras(): Promise<CameraRecord[]>;
  upsertCamera(input: CameraInput): Promise<CameraRecord>;
  replaceSensorMappings(sensorId: number, cameraIds: number[]): Promise<MappingRecord[]>;
  createEvent(input: EventInput): Promise<EventRecord>;
  listEvents(limit: number): Promise<EventRecord[]>;
  handleEvent(id: number, input: EventHandlingInput): Promise<EventRecord | null>;
  createEventTreatment(id: number, input: EventTreatmentInput): Promise<EventRecord | null>;
  listEventTreatments(id: number): Promise<EventTreatmentRecord[]>;
  dashboard(): Promise<DashboardRecord>;
  disconnect(): Promise<void>;
}

class PrismaDataStore implements DataStore {
  async findAccount(accountNumber: string) {
    return prisma.alarmAccount.findUnique({ where: { account_number: accountNumber } });
  }

  async upsertAccount(accountNumber: string) {
    return prisma.alarmAccount.upsert({
      where: { account_number: accountNumber },
      create: { account_number: accountNumber, description: `Conta ${accountNumber}` },
      update: {}
    });
  }

  async listAccounts() {
    return prisma.alarmAccount.findMany({ orderBy: { account_number: "asc" } });
  }

  async saveAccount(input: AccountInput) {
    return prisma.alarmAccount.upsert({
      where: { account_number: input.account_number },
      create: {
        account_number: input.account_number,
        description: input.description,
        enabled: input.enabled ?? true
      },
      update: {
        description: input.description,
        enabled: input.enabled ?? true
      }
    });
  }

  async listUsers() {
    return (prisma as any).accountUser.findMany({
      orderBy: [{ account: "asc" }, { partition: "asc" }, { user_number: "asc" }]
    });
  }

  async upsertUser(input: AccountUserInput) {
    if (input.isep) {
      return (prisma as any).accountUser.upsert({
        where: {
          isep_partition_user_number: {
            isep: input.isep,
            partition: input.partition,
            user_number: input.user_number
          }
        },
        create: input,
        update: {
          account: input.account,
          user_name: input.user_name,
          description: input.description
        }
      });
    }

    return (prisma as any).accountUser.upsert({
      where: {
        account_partition_user_number: {
          account: input.account,
          partition: input.partition,
          user_number: input.user_number
        }
      },
      create: input,
      update: {
        user_name: input.user_name,
        description: input.description
      }
    });
  }

  async findUser(account: string, partition: string, userNumber: string) {
    return (prisma as any).accountUser.findUnique({
      where: {
        account_partition_user_number: {
          account,
          partition,
          user_number: userNumber
        }
      }
    });
  }

  async findUserByIsep(isep: string, partition: string, userNumber: string) {
    return (prisma as any).accountUser.findUnique({
      where: {
        isep_partition_user_number: {
          isep,
          partition,
          user_number: userNumber
        }
      }
    });
  }

  async listBuildings() {
    return (prisma as any).building.findMany({ orderBy: { isep: "asc" } });
  }

  async upsertBuilding(input: BuildingInput) {
    return (prisma as any).building.upsert({
      where: { isep: input.isep },
      create: input,
      update: {
        building_number: input.building_number,
        building_name: input.building_name,
        description: input.description
      }
    });
  }

  async findBuildingByIsep(isep: string) {
    return (prisma as any).building.findUnique({ where: { isep } });
  }

  async listCentralPartitions() {
    return (prisma as any).centralPartition.findMany({ orderBy: [{ isep: "asc" }, { partition: "asc" }] });
  }

  async upsertCentralPartition(input: CentralPartitionInput) {
    return (prisma as any).centralPartition.upsert({
      where: { isep_partition: { isep: input.isep, partition: input.partition } },
      create: input,
      update: { partition_name: input.partition_name, description: input.description }
    });
  }

  async findCentralPartition(isep: string, partition: string) {
    return (prisma as any).centralPartition.findUnique({ where: { isep_partition: { isep, partition } } });
  }

  async deleteCentralPartition(isep: string, partition: string) {
    const result = await prisma.$transaction(async (tx) => {
      await (tx as any).centralZoneCamera.deleteMany({ where: { isep, partition } });
      await (tx as any).centralPartitionCamera.deleteMany({ where: { isep, partition } });
      await (tx as any).centralZone.deleteMany({ where: { isep, partition } });
      return (tx as any).centralPartition.deleteMany({ where: { isep, partition } });
    });
    return result.count > 0;
  }

  async listCentralZones() {
    return (prisma as any).centralZone.findMany({ orderBy: [{ isep: "asc" }, { partition: "asc" }, { zone: "asc" }] });
  }

  async upsertCentralZone(input: CentralZoneInput) {
    return (prisma as any).centralZone.upsert({
      where: { isep_partition_zone: { isep: input.isep, partition: input.partition, zone: input.zone } },
      create: input,
      update: { zone_name: input.zone_name, description: input.description }
    });
  }

  async findCentralZone(isep: string, partition: string, zone: string) {
    return (prisma as any).centralZone.findUnique({ where: { isep_partition_zone: { isep, partition, zone } } });
  }

  async listCentralPartitionCameras() {
    return (prisma as any).centralPartitionCamera.findMany({ orderBy: [{ isep: "asc" }, { partition: "asc" }, { order: "asc" }] });
  }

  async replaceCentralPartitionCameras(input: CentralPartitionCameraInput) {
    return prisma.$transaction(async (tx) => {
      await (tx as any).centralPartitionCamera.deleteMany({ where: { isep: input.isep, partition: input.partition } });
      return Promise.all(
        input.camera_ids.map((cameraId, index) =>
          (tx as any).centralPartitionCamera.create({
            data: { isep: input.isep, partition: input.partition, iss_camera_id: cameraId, order: index }
          })
        )
      );
    });
  }

  async findCentralPartitionCameraIds(isep: string, partition: string) {
    const records = await (prisma as any).centralPartitionCamera.findMany({
      where: { isep, partition },
      orderBy: { order: "asc" }
    });
    return records.map((record: CentralPartitionCameraRecord) => record.iss_camera_id);
  }

  async listCentralZoneCameras() {
    return (prisma as any).centralZoneCamera.findMany({ orderBy: [{ isep: "asc" }, { partition: "asc" }, { zone: "asc" }, { order: "asc" }] });
  }

  async replaceCentralZoneCameras(input: CentralZoneCameraInput) {
    return prisma.$transaction(async (tx) => {
      await (tx as any).centralZoneCamera.deleteMany({ where: { isep: input.isep, partition: input.partition, zone: input.zone } });
      return Promise.all(
        input.camera_ids.map((cameraId, index) =>
          (tx as any).centralZoneCamera.create({
            data: { isep: input.isep, partition: input.partition, zone: input.zone, iss_camera_id: cameraId, order: index }
          })
        )
      );
    });
  }

  async findCentralZoneCameraIds(isep: string, partition: string, zone: string) {
    const records = await (prisma as any).centralZoneCamera.findMany({
      where: { isep, partition, zone },
      orderBy: { order: "asc" }
    });
    return records.map((record: CentralZoneCameraRecord) => record.iss_camera_id);
  }

  async listSensors() {
    return prisma.sensor.findMany({
      orderBy: [{ account: "asc" }, { partition: "asc" }, { zone: "asc" }],
      include: { mappings: { include: { camera: true }, orderBy: { order: "asc" } } }
    });
  }

  async upsertSensor(input: SensorInput) {
    return prisma.sensor.upsert({
      where: {
        account_partition_zone: {
          account: input.account,
          partition: input.partition,
          zone: input.zone
        }
      },
      create: input,
      update: {
        sensor_name: input.sensor_name,
        description: input.description
      }
    });
  }

  async findSensorWithCameras(account: string, partition: string, zone: string) {
    return prisma.sensor.findUnique({
      where: {
        account_partition_zone: { account, partition, zone }
      },
      include: {
        mappings: {
          orderBy: { order: "asc" },
          include: { camera: true }
        }
      }
    });
  }

  async listCameras() {
    return prisma.camera.findMany({ orderBy: { camera_name: "asc" } });
  }

  async upsertCamera(input: CameraInput) {
    return prisma.camera.upsert({
      where: { iss_camera_id: input.iss_camera_id },
      create: input,
      update: {
        camera_name: input.camera_name,
        description: input.description
      }
    });
  }

  async replaceSensorMappings(sensorId: number, cameraIds: number[]) {
    return prisma.$transaction(async (tx) => {
      await tx.sensorCameraMap.deleteMany({ where: { sensor_id: sensorId } });
      return Promise.all(
        cameraIds.map((cameraId, index) =>
          tx.sensorCameraMap.create({
            data: { sensor_id: sensorId, camera_id: cameraId, order: index },
            include: { camera: true }
          })
        )
      );
    });
  }

  async createEvent(input: EventInput) {
    const event = await (prisma as any).event.create({
      data: {
        ...input,
        event_type: input.event_type ?? "OUTRO",
        payload: input.payload as Prisma.InputJsonValue,
        cameras_sent: input.cameras_sent
      },
      include: { treatments: { orderBy: { created_at: "asc" } } }
    });

    return this.normalizeEvent(event);
  }

  async listEvents(limit: number) {
    const [pendingEvents, handledEvents] = await Promise.all([
      (prisma as any).event.findMany({
        where: { status: { not: "ENCERRADO" } },
        orderBy: { received_at: "desc" },
        take: limit,
        include: { treatments: { orderBy: { created_at: "asc" } } }
      }),
      (prisma as any).event.findMany({
        where: { status: "ENCERRADO" },
        orderBy: { received_at: "desc" },
        take: limit,
        include: { treatments: { orderBy: { created_at: "asc" } } }
      })
    ]);
    return [...pendingEvents, ...handledEvents].map((event: any) => this.normalizeEvent(event));
  }

  async findEventById(id: number) {
    const event = await (prisma as any).event.findUnique({
      where: { id },
      include: { treatments: { orderBy: { created_at: "asc" } } }
    });
    return event ? this.normalizeEvent(event) : null;
  }

  async handleEvent(id: number, input: EventHandlingInput) {
    return this.createEventTreatment(id, {
      action: input.action?.trim() || "ENCERRADO",
      operator_id: input.operator_id?.trim() || null,
      operator_name: input.handled_by?.trim() || "Operador",
      note: input.note?.trim() || null
    });
  }

  async createEventTreatment(id: number, input: EventTreatmentInput) {
    const event = await this.findEventById(id);
    if (!event) return null;

    const action = normalizeTreatmentAction(input.action);
    await (prisma as any).eventTreatment.create({
      data: {
        event_id: id,
        operator_id: input.operator_id?.trim() || null,
        operator_name: input.operator_name?.trim() || "Operador",
        action,
        note: input.note?.trim() || null
      }
    });

    const updated = await (prisma as any).event.update({
      where: { id },
      data: { status: statusAfterTreatment(event.status, action) },
      include: { treatments: { orderBy: { created_at: "asc" } } }
    });

    return this.normalizeEvent(updated);
  }

  async listEventTreatments(id: number) {
    return (prisma as any).eventTreatment.findMany({
      where: { event_id: id },
      orderBy: { created_at: "asc" }
    });
  }

  async dashboard() {
    const [events, totalEvents, failedEvents, successfulEvents, avg] = await Promise.all([
      this.listEvents(10),
      prisma.event.count(),
      prisma.event.count({ where: { error_message: { not: null } } }),
      prisma.event.count({ where: { error_message: null } }),
      prisma.event.aggregate({ _avg: { execution_ms: true } })
    ]);

    return {
      totalEvents,
      failedEvents,
      successfulEvents,
      averageExecutionMs: Math.round(avg._avg.execution_ms ?? 0),
      recentEvents: events
    };
  }

  async disconnect() {
    await prisma.$disconnect();
  }

  private normalizeEvent(event: any): EventRecord {
    return {
      ...event,
      event_type: event.event_type ?? "OUTRO",
      cameras_sent: Array.isArray(event.cameras_sent) ? event.cameras_sent.map(String) : [],
      treatments: Array.isArray(event.treatments) ? event.treatments : []
    };
  }
}

class MemoryDataStore implements DataStore {
  private accountId = 1;
  private sensorId = 1;
  private cameraId = 1;
  private mappingId = 1;
  private eventId = 1;
  private userId = 1;
  private buildingId = 1;
  private centralPartitionId = 1;
  private centralZoneId = 1;
  private centralPartitionCameraId = 1;
  private centralZoneCameraId = 1;
  private eventTreatmentId = 1;
  private readonly accounts: AlarmAccountRecord[] = [];
  private readonly users: AccountUserRecord[] = [];
  private readonly buildings: BuildingRecord[] = [];
  private readonly centralPartitions: CentralPartitionRecord[] = [];
  private readonly centralZones: CentralZoneRecord[] = [];
  private readonly centralPartitionCameras: CentralPartitionCameraRecord[] = [];
  private readonly centralZoneCameras: CentralZoneCameraRecord[] = [];
  private readonly sensors: SensorRecord[] = [];
  private readonly cameras: CameraRecord[] = [];
  private readonly mappings: Array<Omit<MappingRecord, "camera">> = [];
  private readonly events: EventRecord[] = [];
  private readonly eventTreatments: EventTreatmentRecord[] = [];

  async findAccount(accountNumber: string) {
    return this.accounts.find((account) => account.account_number === accountNumber) ?? null;
  }

  async upsertAccount(accountNumber: string) {
    const existing = await this.findAccount(accountNumber);
    if (existing) return existing;

    const now = new Date();
    const account: AlarmAccountRecord = {
      id: this.accountId++,
      account_number: accountNumber,
      description: `Conta ${accountNumber}`,
      enabled: true,
      created_at: now,
      updated_at: now
    };
    this.accounts.push(account);
    return account;
  }

  async listAccounts() {
    return [...this.accounts].sort((a, b) => a.account_number.localeCompare(b.account_number));
  }

  async saveAccount(input: AccountInput) {
    const existing = await this.findAccount(input.account_number);

    if (existing) {
      existing.description = input.description;
      existing.enabled = input.enabled ?? true;
      existing.updated_at = new Date();
      return existing;
    }

    const account = await this.upsertAccount(input.account_number);
    account.description = input.description;
    account.enabled = input.enabled ?? true;
    return account;
  }

  async listUsers() {
    return [...this.users].sort((a, b) =>
      `${a.account}:${a.partition}:${a.user_number}`.localeCompare(`${b.account}:${b.partition}:${b.user_number}`)
    );
  }

  async upsertUser(input: AccountUserInput) {
    await this.upsertAccount(input.account);
    const existing = input.isep
      ? await this.findUserByIsep(input.isep, input.partition, input.user_number)
      : await this.findUser(input.account, input.partition, input.user_number);

    if (existing) {
      existing.user_name = input.user_name;
      existing.description = input.description;
      existing.updated_at = new Date();
      return existing;
    }

    const now = new Date();
    const user: AccountUserRecord = {
      id: this.userId++,
      ...input,
      created_at: now,
      updated_at: now
    };
    this.users.push(user);
    return user;
  }

  async findUser(account: string, partition: string, userNumber: string) {
    return (
      this.users.find((user) => user.account === account && user.partition === partition && user.user_number === userNumber) ??
      null
    );
  }

  async findUserByIsep(isep: string, partition: string, userNumber: string) {
    return (
      this.users.find((user) => user.isep === isep && user.partition === partition && user.user_number === userNumber) ??
      null
    );
  }

  async listBuildings() {
    return [...this.buildings].sort((a, b) => a.isep.localeCompare(b.isep));
  }

  async upsertBuilding(input: BuildingInput) {
    const existing = await this.findBuildingByIsep(input.isep);

    if (existing) {
      existing.building_number = input.building_number;
      existing.building_name = input.building_name;
      existing.description = input.description;
      existing.updated_at = new Date();
      return existing;
    }

    const now = new Date();
    const building: BuildingRecord = {
      id: this.buildingId++,
      ...input,
      created_at: now,
      updated_at: now
    };
    this.buildings.push(building);
    return building;
  }

  async findBuildingByIsep(isep: string) {
    return this.buildings.find((building) => building.isep === isep) ?? null;
  }

  async listCentralPartitions() {
    return [...this.centralPartitions].sort((a, b) => `${a.isep}:${a.partition}`.localeCompare(`${b.isep}:${b.partition}`));
  }

  async upsertCentralPartition(input: CentralPartitionInput) {
    const existing = await this.findCentralPartition(input.isep, input.partition);

    if (existing) {
      existing.partition_name = input.partition_name;
      existing.description = input.description;
      existing.updated_at = new Date();
      return existing;
    }

    const now = new Date();
    const partition: CentralPartitionRecord = {
      id: this.centralPartitionId++,
      ...input,
      created_at: now,
      updated_at: now
    };
    this.centralPartitions.push(partition);
    return partition;
  }

  async findCentralPartition(isep: string, partition: string) {
    return this.centralPartitions.find((item) => item.isep === isep && item.partition === partition) ?? null;
  }

  async deleteCentralPartition(isep: string, partition: string) {
    const before = this.centralPartitions.length;
    for (let index = this.centralPartitions.length - 1; index >= 0; index -= 1) {
      const item = this.centralPartitions[index];
      if (item.isep === isep && item.partition === partition) this.centralPartitions.splice(index, 1);
    }
    for (let index = this.centralZones.length - 1; index >= 0; index -= 1) {
      const item = this.centralZones[index];
      if (item.isep === isep && item.partition === partition) this.centralZones.splice(index, 1);
    }
    for (let index = this.centralPartitionCameras.length - 1; index >= 0; index -= 1) {
      const item = this.centralPartitionCameras[index];
      if (item.isep === isep && item.partition === partition) this.centralPartitionCameras.splice(index, 1);
    }
    for (let index = this.centralZoneCameras.length - 1; index >= 0; index -= 1) {
      const item = this.centralZoneCameras[index];
      if (item.isep === isep && item.partition === partition) this.centralZoneCameras.splice(index, 1);
    }
    return this.centralPartitions.length < before;
  }

  async listCentralZones() {
    return [...this.centralZones].sort((a, b) =>
      `${a.isep}:${a.partition}:${a.zone}`.localeCompare(`${b.isep}:${b.partition}:${b.zone}`)
    );
  }

  async upsertCentralZone(input: CentralZoneInput) {
    const existing = await this.findCentralZone(input.isep, input.partition, input.zone);

    if (existing) {
      existing.zone_name = input.zone_name;
      existing.description = input.description;
      existing.updated_at = new Date();
      return existing;
    }

    const now = new Date();
    const zone: CentralZoneRecord = {
      id: this.centralZoneId++,
      ...input,
      created_at: now,
      updated_at: now
    };
    this.centralZones.push(zone);
    return zone;
  }

  async findCentralZone(isep: string, partition: string, zone: string) {
    return this.centralZones.find((item) => item.isep === isep && item.partition === partition && item.zone === zone) ?? null;
  }

  async listCentralPartitionCameras() {
    return [...this.centralPartitionCameras].sort((a, b) =>
      `${a.isep}:${a.partition}:${a.order}`.localeCompare(`${b.isep}:${b.partition}:${b.order}`)
    );
  }

  async replaceCentralPartitionCameras(input: CentralPartitionCameraInput) {
    for (let index = this.centralPartitionCameras.length - 1; index >= 0; index -= 1) {
      const record = this.centralPartitionCameras[index];
      if (record.isep === input.isep && record.partition === input.partition) this.centralPartitionCameras.splice(index, 1);
    }

    for (const [index, cameraId] of input.camera_ids.entries()) {
      this.centralPartitionCameras.push({
        id: this.centralPartitionCameraId++,
        isep: input.isep,
        partition: input.partition,
        iss_camera_id: cameraId,
        order: index
      });
    }

    return this.findCentralPartitionCameraRecords(input.isep, input.partition);
  }

  async findCentralPartitionCameraIds(isep: string, partition: string) {
    return this.findCentralPartitionCameraRecords(isep, partition).map((record) => record.iss_camera_id);
  }

  async listCentralZoneCameras() {
    return [...this.centralZoneCameras].sort((a, b) =>
      `${a.isep}:${a.partition}:${a.zone}:${a.order}`.localeCompare(`${b.isep}:${b.partition}:${b.zone}:${b.order}`)
    );
  }

  async replaceCentralZoneCameras(input: CentralZoneCameraInput) {
    for (let index = this.centralZoneCameras.length - 1; index >= 0; index -= 1) {
      const record = this.centralZoneCameras[index];
      if (record.isep === input.isep && record.partition === input.partition && record.zone === input.zone) {
        this.centralZoneCameras.splice(index, 1);
      }
    }

    for (const [index, cameraId] of input.camera_ids.entries()) {
      this.centralZoneCameras.push({
        id: this.centralZoneCameraId++,
        isep: input.isep,
        partition: input.partition,
        zone: input.zone,
        iss_camera_id: cameraId,
        order: index
      });
    }

    return this.findCentralZoneCameraRecords(input.isep, input.partition, input.zone);
  }

  async findCentralZoneCameraIds(isep: string, partition: string, zone: string) {
    return this.findCentralZoneCameraRecords(isep, partition, zone).map((record) => record.iss_camera_id);
  }

  async listSensors() {
    return [...this.sensors]
      .sort((a, b) => `${a.account}:${a.partition}:${a.zone}`.localeCompare(`${b.account}:${b.partition}:${b.zone}`))
      .map((sensor) => this.withMappings(sensor));
  }

  async upsertSensor(input: SensorInput) {
    await this.upsertAccount(input.account);
    const existing = this.sensors.find(
      (sensor) => sensor.account === input.account && sensor.partition === input.partition && sensor.zone === input.zone
    );

    if (existing) {
      existing.sensor_name = input.sensor_name;
      existing.description = input.description;
      existing.updated_at = new Date();
      return existing;
    }

    const now = new Date();
    const sensor: SensorRecord = {
      id: this.sensorId++,
      ...input,
      created_at: now,
      updated_at: now
    };
    this.sensors.push(sensor);
    return sensor;
  }

  async findSensorWithCameras(account: string, partition: string, zone: string) {
    const sensor = this.sensors.find((item) => item.account === account && item.partition === partition && item.zone === zone);
    return sensor ? this.withMappings(sensor) : null;
  }

  async listCameras() {
    return [...this.cameras].sort((a, b) => a.camera_name.localeCompare(b.camera_name));
  }

  async upsertCamera(input: CameraInput) {
    const existing = this.cameras.find((camera) => camera.iss_camera_id === input.iss_camera_id);

    if (existing) {
      existing.camera_name = input.camera_name;
      existing.description = input.description;
      existing.updated_at = new Date();
      return existing;
    }

    const now = new Date();
    const camera: CameraRecord = {
      id: this.cameraId++,
      ...input,
      created_at: now,
      updated_at: now
    };
    this.cameras.push(camera);
    return camera;
  }

  async replaceSensorMappings(sensorId: number, cameraIds: number[]) {
    for (let index = this.mappings.length - 1; index >= 0; index -= 1) {
      if (this.mappings[index].sensor_id === sensorId) this.mappings.splice(index, 1);
    }

    for (const [index, cameraId] of cameraIds.entries()) {
      this.mappings.push({
        id: this.mappingId++,
        sensor_id: sensorId,
        camera_id: cameraId,
        order: index
      });
    }

    return this.withMappings({ id: sensorId } as SensorRecord).mappings ?? [];
  }

  async createEvent(input: EventInput) {
    const event: EventRecord = {
      id: this.eventId++,
      received_at: new Date(),
      ...input,
      event_type: input.event_type ?? "OUTRO",
      treatments: []
    };
    this.events.unshift(event);
    return event;
  }

  async listEvents(limit: number) {
    const events = this.events
      .map((event) => this.withTreatments(event))
      .sort((a, b) => eventStatusOrder(a.status) - eventStatusOrder(b.status) || b.received_at.getTime() - a.received_at.getTime());
    const pendingEvents = events.filter((event) => event.status !== "ENCERRADO").slice(0, limit);
    const handledEvents = events.filter((event) => event.status === "ENCERRADO").slice(0, limit);
    return [...pendingEvents, ...handledEvents];
  }

  async findEventById(id: number) {
    const event = this.events.find((item) => item.id === id);
    return event ? this.withTreatments(event) : null;
  }

  async handleEvent(id: number, input: EventHandlingInput) {
    return this.createEventTreatment(id, {
      action: input.action?.trim() || "ENCERRADO",
      operator_id: input.operator_id?.trim() || null,
      operator_name: input.handled_by?.trim() || "Operador",
      note: input.note?.trim() || null
    });
  }

  async createEventTreatment(id: number, input: EventTreatmentInput) {
    const event = this.events.find((item) => item.id === id);
    if (!event) return null;

    const action = normalizeTreatmentAction(input.action);
    this.eventTreatments.push({
      id: this.eventTreatmentId++,
      event_id: id,
      operator_id: input.operator_id?.trim() || null,
      operator_name: input.operator_name?.trim() || "Operador",
      action,
      note: input.note?.trim() || null,
      created_at: new Date()
    });
    event.status = statusAfterTreatment(event.status, action);

    return this.withTreatments(event);
  }

  async listEventTreatments(id: number) {
    return this.eventTreatments
      .filter((treatment) => treatment.event_id === id)
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  }

  async dashboard() {
    const totalExecution = this.events.reduce((sum, event) => sum + (event.execution_ms ?? 0), 0);
    return {
      totalEvents: this.events.length,
      failedEvents: this.events.filter((event) => Boolean(event.error_message)).length,
      successfulEvents: this.events.filter((event) => event.cameras_sent.length > 0 && !event.error_message).length,
      averageExecutionMs: this.events.length ? Math.round(totalExecution / this.events.length) : 0,
      recentEvents: (await this.listEvents(10))
    };
  }

  async disconnect() {}

  private withMappings(sensor: SensorRecord) {
    const mappings = this.mappings
      .filter((mapping) => mapping.sensor_id === sensor.id)
      .sort((a, b) => a.order - b.order)
      .map((mapping) => {
        const camera = this.cameras.find((item) => item.id === mapping.camera_id);
        return camera ? { ...mapping, camera } : null;
      })
      .filter((mapping): mapping is MappingRecord => Boolean(mapping));

    return { ...sensor, mappings };
  }

  private withTreatments(event: EventRecord) {
    return {
      ...event,
      treatments: this.eventTreatments
        .filter((treatment) => treatment.event_id === event.id)
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
    };
  }

  private findCentralPartitionCameraRecords(isep: string, partition: string) {
    return this.centralPartitionCameras
      .filter((record) => record.isep === isep && record.partition === partition)
      .sort((a, b) => a.order - b.order);
  }

  private findCentralZoneCameraRecords(isep: string, partition: string, zone: string) {
    return this.centralZoneCameras
      .filter((record) => record.isep === isep && record.partition === partition && record.zone === zone)
      .sort((a, b) => a.order - b.order);
  }
}

export const dataStore: DataStore = config.STORAGE_MODE === "memory" ? new MemoryDataStore() : new PrismaDataStore();

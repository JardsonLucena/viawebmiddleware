CREATE TABLE "alarm_accounts" (
  "id" SERIAL PRIMARY KEY,
  "account_number" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "sensors" (
  "id" SERIAL PRIMARY KEY,
  "account" TEXT NOT NULL,
  "partition" TEXT NOT NULL,
  "zone" TEXT NOT NULL,
  "sensor_name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sensors_account_fkey" FOREIGN KEY ("account") REFERENCES "alarm_accounts"("account_number") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "sensors_account_partition_zone_key" ON "sensors"("account", "partition", "zone");

CREATE TABLE "account_users" (
  "id" SERIAL PRIMARY KEY,
  "isep" TEXT,
  "account" TEXT NOT NULL,
  "partition" TEXT NOT NULL,
  "user_number" TEXT NOT NULL,
  "user_name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "account_users_account_partition_user_number_key" ON "account_users"("account", "partition", "user_number");
CREATE UNIQUE INDEX "account_users_isep_partition_user_number_key" ON "account_users"("isep", "partition", "user_number");

CREATE TABLE "buildings" (
  "id" SERIAL PRIMARY KEY,
  "isep" TEXT NOT NULL UNIQUE,
  "building_number" TEXT,
  "building_name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "central_partitions" (
  "id" SERIAL PRIMARY KEY,
  "isep" TEXT NOT NULL,
  "partition" TEXT NOT NULL,
  "partition_name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "central_partitions_isep_partition_key" ON "central_partitions"("isep", "partition");

CREATE TABLE "central_zones" (
  "id" SERIAL PRIMARY KEY,
  "isep" TEXT NOT NULL,
  "partition" TEXT NOT NULL,
  "zone" TEXT NOT NULL,
  "zone_name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "central_zones_isep_partition_zone_key" ON "central_zones"("isep", "partition", "zone");

CREATE TABLE "central_partition_cameras" (
  "id" SERIAL PRIMARY KEY,
  "isep" TEXT NOT NULL,
  "partition" TEXT NOT NULL,
  "iss_camera_id" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX "central_partition_cameras_isep_partition_iss_camera_id_key" ON "central_partition_cameras"("isep", "partition", "iss_camera_id");

CREATE TABLE "central_zone_cameras" (
  "id" SERIAL PRIMARY KEY,
  "isep" TEXT NOT NULL,
  "partition" TEXT NOT NULL,
  "zone" TEXT NOT NULL,
  "iss_camera_id" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX "central_zone_cameras_isep_partition_zone_iss_camera_id_key" ON "central_zone_cameras"("isep", "partition", "zone", "iss_camera_id");

CREATE TABLE "cameras" (
  "id" SERIAL PRIMARY KEY,
  "iss_camera_id" TEXT NOT NULL UNIQUE,
  "camera_name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "sensor_camera_map" (
  "id" SERIAL PRIMARY KEY,
  "sensor_id" INTEGER NOT NULL,
  "camera_id" INTEGER NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "sensor_camera_map_sensor_id_fkey" FOREIGN KEY ("sensor_id") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sensor_camera_map_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "sensor_camera_map_sensor_id_camera_id_key" ON "sensor_camera_map"("sensor_id", "camera_id");

CREATE TABLE "events" (
  "id" SERIAL PRIMARY KEY,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "account" TEXT NOT NULL,
  "partition" TEXT NOT NULL,
  "zone" TEXT NOT NULL,
  "event_code" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "cameras_sent" JSONB NOT NULL,
  "status" TEXT NOT NULL,
  "execution_ms" INTEGER,
  "error_message" TEXT
);

CREATE INDEX "events_received_at_idx" ON "events"("received_at");
CREATE INDEX "events_account_partition_zone_idx" ON "events"("account", "partition", "zone");

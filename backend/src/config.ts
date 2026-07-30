import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envBoolean = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (["true", "1", "yes", "sim"].includes(value.toLowerCase())) return true;
  if (["false", "0", "no", "nao", "não"].includes(value.toLowerCase())) return false;
  return value;
}, z.boolean());

const envSchema = z.object({
  STORAGE_MODE: z.enum(["postgres", "memory"]).default("postgres"),
  DATABASE_URL: z.string().optional(),
  PORT: z.coerce.number().default(3333),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  ISS_BASE_URL: z.string().url().default("http://127.0.0.1:8888"),
  ISS_USERNAME: z.string().default("operator"),
  ISS_PASSWORD: z.string().default("change-me"),
  SHOWCAM_BRIDGE_URL: z.string().url().default("http://127.0.0.1:8090"),
  SHOWCAM_BRIDGE_SECRET: z.string().default("change-me"),
  DEFAULT_MEDIA_CLIENT_ID: z.string().default("MEDIA_CLIENT_1"),
  ISS_TIMEOUT_MS: z.coerce.number().default(5000),
  MAX_CAMERAS_PER_EVENT: z.coerce.number().default(8),
  VIAWEB_RECEIVER_ENABLED: envBoolean.default(false),
  VIAWEB_RECEIVER_HOST: z.string().default("127.0.0.1"),
  VIAWEB_RECEIVER_PORT: z.coerce.number().default(2700),
  VIAWEB_MONITOR_NAME: z.string().default("Viaweb Show Cam Middleware"),
  VIAWEB_RECEIVER_ENCRYPTION: envBoolean.default(false),
  VIAWEB_AES_KEY_HEX: z.string().optional(),
  VIAWEB_IV_HEX: z.string().optional(),
  VIAWEB_RECONNECT_MS: z.coerce.number().default(5000)
});

export const config = envSchema.parse(process.env);

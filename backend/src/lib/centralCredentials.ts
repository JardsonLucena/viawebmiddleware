import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { HttpError } from "./httpError.js";

function encryptionKey() {
  if (!config.CENTRAL_CREDENTIAL_KEY_HEX) {
    throw new HttpError(503, "Configure CENTRAL_CREDENTIAL_KEY_HEX no backend para usar senhas centralizadas.");
  }
  return Buffer.from(config.CENTRAL_CREDENTIAL_KEY_HEX, "hex");
}

export function encryptCentralPassword(password: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64")).join(".");
}

export function decryptCentralPassword(encrypted: string) {
  const key = encryptionKey();
  try {
    const [iv, tag, ciphertext] = encrypted.split(".").map((part) => Buffer.from(part, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new HttpError(503, "Não foi possível abrir a senha da central. Confira a chave do servidor.");
  }
}

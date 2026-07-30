import net from "node:net";
import crypto from "node:crypto";
import { Server } from "socket.io";
import { config } from "../config.js";
import { EventProcessor } from "./EventProcessor.js";

type ViawebMessage = {
  oper?: ViawebOperation[];
  resp?: unknown[];
  eventosPendentes?: number;
  testesPendentes?: number;
};

type ViawebOperation = {
  id?: string | number;
  acao?: string;
  codigoEvento?: string;
  contaCliente?: string;
  particao?: number;
  zonaUsuario?: number;
  isep?: string;
  [key: string]: unknown;
};

type PendingCommand = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class ViawebReceiverClient {
  private socket?: net.Socket;
  private reconnectTimer?: NodeJS.Timeout;
  private plaintextBuffer = "";
  private encryptedBuffer = Buffer.alloc(0);
  private encryptIv?: Buffer;
  private decryptIv?: Buffer;
  private readonly processor: EventProcessor;
  private connected = false;
  private connectedAt?: Date;
  private lastMessageAt?: Date;
  private lastEventAt?: Date;
  private lastError?: string;
  private lastCommandResponse?: unknown;
  private messagesReceived = 0;
  private eventsReceived = 0;
  private commandId = 1;
  private readonly pendingCommands = new Map<string, PendingCommand>();

  constructor(io: Server) {
    this.processor = new EventProcessor(io);
  }

  start() {
    if (!config.VIAWEB_RECEIVER_ENABLED) return;
    this.connect();
  }

  stop() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.destroy();
    for (const [id, pending] of this.pendingCommands) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Command ${id} cancelled because Receiver connection stopped`));
    }
    this.pendingCommands.clear();
  }

  status() {
    return {
      enabled: config.VIAWEB_RECEIVER_ENABLED,
      connected: this.connected,
      host: config.VIAWEB_RECEIVER_HOST,
      port: config.VIAWEB_RECEIVER_PORT,
      encryption: config.VIAWEB_RECEIVER_ENCRYPTION,
      monitorName: config.VIAWEB_MONITOR_NAME,
      connectedAt: this.connectedAt,
      lastMessageAt: this.lastMessageAt,
      lastEventAt: this.lastEventAt,
      messagesReceived: this.messagesReceived,
      eventsReceived: this.eventsReceived,
      lastError: this.lastError,
      lastCommandResponse: this.lastCommandResponse
    };
  }

  executeCommand(isepId: string, command: Record<string, unknown>, timeoutSeconds = 120) {
    if (!this.connected || !this.socket || this.socket.destroyed) {
      throw new Error("VIAWEB Receiver is not connected");
    }

    const id = `cmd-${Date.now()}-${this.commandId++}`;
    const normalizedIsep = isepId.trim().toUpperCase().padStart(4, "0");
    const timeoutMs = Math.max(1, Math.min(timeoutSeconds, 120)) * 1000;

    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error(`VIAWEB command timeout after ${timeoutSeconds}s`));
      }, timeoutMs + 5000);

      this.pendingCommands.set(id, { resolve, reject, timer });
    });

    this.send({
      oper: [
        {
          id,
          acao: "executar",
          idISEP: normalizedIsep,
          timeout: timeoutSeconds,
          comando: [command]
        }
      ]
    });

    return response;
  }

  private connect() {
    if (!config.VIAWEB_RECEIVER_ENCRYPTION && !this.isLoopbackHost(config.VIAWEB_RECEIVER_HOST)) {
      console.warn(
        "VIAWEB Receiver encryption is disabled for a non-local host. The Receiver usually requires AES-256-CBC outside localhost."
      );
    }

    this.resetCryptoState();
    this.socket = net.createConnection(
      {
        host: config.VIAWEB_RECEIVER_HOST,
        port: config.VIAWEB_RECEIVER_PORT
      },
      () => {
        this.connected = true;
        this.connectedAt = new Date();
        this.lastError = undefined;
        console.log(
          `Connected to VIAWEB Receiver at ${config.VIAWEB_RECEIVER_HOST}:${config.VIAWEB_RECEIVER_PORT}`
        );
        this.send({
          a: Date.now(),
          oper: [
            {
              id: "ident-1",
              acao: "ident",
              nome: config.VIAWEB_MONITOR_NAME,
              serializado: 1,
              retransmite: 60,
              versaoProto: 1
            }
          ]
        });
      }
    );

    this.socket.on("data", (chunk) => this.handleData(chunk));
    this.socket.on("error", (error) => {
      this.lastError = error.message;
      console.error(`VIAWEB Receiver socket error: ${error.message}`);
    });
    this.socket.on("close", () => {
      this.connected = false;
      for (const [id, pending] of this.pendingCommands) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`Command ${id} cancelled because Receiver connection closed`));
      }
      this.pendingCommands.clear();
      console.warn("VIAWEB Receiver socket closed; reconnecting soon.");
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect() {
    if (!config.VIAWEB_RECEIVER_ENABLED) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), config.VIAWEB_RECONNECT_MS);
  }

  private handleData(chunk: Buffer) {
    const plaintext = config.VIAWEB_RECEIVER_ENCRYPTION ? this.decrypt(chunk) : chunk.toString("utf8");
    this.plaintextBuffer += plaintext.replace(/\0+$/g, "");

    for (const rawMessage of this.extractJsonMessages()) {
      this.handleMessage(rawMessage).catch((error) =>
        console.error(`VIAWEB Receiver message error: ${error instanceof Error ? error.message : String(error)}`)
      );
    }
  }

  private async handleMessage(rawMessage: string) {
    let message: ViawebMessage;

    try {
      message = JSON.parse(rawMessage) as ViawebMessage;
    } catch (error) {
      const preview = rawMessage
        .slice(0, 80)
        .replace(/[^\x20-\x7E]/g, ".");
      throw new Error(
        `Invalid JSON from VIAWEB Receiver. Check VIAWEB_RECEIVER_ENCRYPTION, VIAWEB_AES_KEY_HEX and VIAWEB_IV_HEX. Preview: ${preview}`
      );
    }

    this.messagesReceived += 1;
    this.lastMessageAt = new Date();
    console.log(`VIAWEB Receiver message received: oper=${message.oper?.length ?? 0}, resp=${message.resp?.length ?? 0}`);

    for (const response of message.resp ?? []) {
      console.log(`VIAWEB Receiver response: ${JSON.stringify(response)}`);
      this.lastCommandResponse = response;
      this.resolvePendingCommand(response);
    }

    const operations = message.oper ?? [];

    for (const operation of operations) {
      if (operation.acao !== "evento") continue;

      this.eventsReceived += 1;
      this.lastEventAt = new Date();
      console.log(
        `VIAWEB Receiver event received: id=${operation.id ?? ""}, conta=${operation.contaCliente ?? operation.isep ?? ""}, particao=${operation.particao ?? 0}, zona=${operation.zonaUsuario ?? 0}, codigo=${operation.codigoEvento ?? ""}`
      );

      await this.processor.process({
        account: String(operation.contaCliente ?? operation.isep ?? ""),
        partition: String(operation.particao ?? 0),
        zone: String(operation.zonaUsuario ?? 0),
        event_code: String(operation.codigoEvento ?? ""),
        isep: operation.isep ? String(operation.isep) : undefined,
        payload: operation
      });

      if (operation.id !== undefined) {
        this.send({ resp: [{ id: operation.id }] });
      }
    }
  }

  private send(message: object) {
    const payload = JSON.stringify(message);
    const data = config.VIAWEB_RECEIVER_ENCRYPTION ? this.encrypt(payload) : Buffer.from(payload, "utf8");
    this.socket?.write(data);
  }

  private resolvePendingCommand(response: unknown) {
    if (!response || typeof response !== "object" || !("id" in response)) return;

    const id = String((response as { id?: unknown }).id);
    const pending = this.pendingCommands.get(id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingCommands.delete(id);
    pending.resolve(response);
  }

  private extractJsonMessages() {
    const messages: string[] = [];
    let depth = 0;
    let inString = false;
    let escaped = false;
    let start = -1;

    for (let index = 0; index < this.plaintextBuffer.length; index += 1) {
      const char = this.plaintextBuffer[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") inString = true;
      if (char === "{") {
        if (depth === 0) start = index;
        depth += 1;
      }
      if (char === "}") {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          messages.push(this.plaintextBuffer.slice(start, index + 1));
          this.plaintextBuffer = this.plaintextBuffer.slice(index + 1);
          index = -1;
          start = -1;
        }
      }
    }

    return messages;
  }

  private resetCryptoState() {
    this.plaintextBuffer = "";
    this.encryptedBuffer = Buffer.alloc(0);

    if (!config.VIAWEB_RECEIVER_ENCRYPTION) return;

    const iv = this.requiredHexBuffer(config.VIAWEB_IV_HEX, 16, "VIAWEB_IV_HEX");
    this.encryptIv = Buffer.from(iv);
    this.decryptIv = Buffer.from(iv);
  }

  private encrypt(payload: string) {
    if (!this.encryptIv) throw new Error("VIAWEB encryption IV is not initialized");
    const key = this.requiredHexBuffer(config.VIAWEB_AES_KEY_HEX, 32, "VIAWEB_AES_KEY_HEX");
    const plain = this.zeroPad(Buffer.from(payload, "utf8"));
    const cipher = crypto.createCipheriv("aes-256-cbc", key, this.encryptIv);
    cipher.setAutoPadding(false);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    this.encryptIv = encrypted.subarray(encrypted.length - 16);
    return encrypted;
  }

  private decrypt(chunk: Buffer) {
    if (!this.decryptIv) throw new Error("VIAWEB encryption IV is not initialized");
    const key = this.requiredHexBuffer(config.VIAWEB_AES_KEY_HEX, 32, "VIAWEB_AES_KEY_HEX");
    this.encryptedBuffer = Buffer.concat([this.encryptedBuffer, chunk]);

    const alignedLength = this.encryptedBuffer.length - (this.encryptedBuffer.length % 16);
    if (alignedLength === 0) return "";

    const encrypted = this.encryptedBuffer.subarray(0, alignedLength);
    this.encryptedBuffer = this.encryptedBuffer.subarray(alignedLength);

    const decipher = crypto.createDecipheriv("aes-256-cbc", key, this.decryptIv);
    decipher.setAutoPadding(false);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    this.decryptIv = encrypted.subarray(encrypted.length - 16);
    return decrypted.toString("utf8").replace(/\0+$/g, "");
  }

  private zeroPad(buffer: Buffer) {
    const padding = (16 - (buffer.length % 16)) % 16;
    return padding === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(padding)]);
  }

  private requiredHexBuffer(value: string | undefined, expectedBytes: number, name: string) {
    if (!value) throw new Error(`${name} is required when VIAWEB_RECEIVER_ENCRYPTION=true`);
    const buffer = Buffer.from(value, "hex");
    if (buffer.length !== expectedBytes) {
      throw new Error(`${name} must have ${expectedBytes} bytes encoded as hex`);
    }
    return buffer;
  }

  private isLoopbackHost(host: string) {
    return ["localhost", "127.0.0.1", "::1"].includes(host.toLowerCase());
  }
}

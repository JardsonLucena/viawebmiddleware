import http from "node:http";
import { Server } from "socket.io";
import { config } from "./config.js";
import { createApp } from "./app.js";
import { dataStore } from "./lib/dataStore.js";
import { ViawebReceiverClient } from "./services/ViawebReceiverClient.js";

const io = new Server({
  cors: {
    origin: config.CORS_ORIGIN
  }
});
const viawebReceiverClient = new ViawebReceiverClient(io);
const app = createApp(io, viawebReceiverClient);
const server = http.createServer(app);

io.attach(server);
viawebReceiverClient.start();

server.listen(config.PORT, () => {
  console.log(`Viaweb Show Cam API listening on http://localhost:${config.PORT}`);
});

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`Stopping VIAWEB middleware (${signal}).`);
  const deadline = setTimeout(() => {
    console.error("Shutdown exceeded 10 seconds; forcing process exit.");
    process.exit(1);
  }, 10000);
  try {
    viawebReceiverClient.stop();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await dataStore.disconnect();
    clearTimeout(deadline);
    console.log("VIAWEB middleware stopped.");
    process.exit(0);
  } catch (error) {
    console.error("Shutdown failed.", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => { void shutdown("SIGINT"); });
process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
process.on("SIGBREAK", () => { void shutdown("SIGBREAK"); });

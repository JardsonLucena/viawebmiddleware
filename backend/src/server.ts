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

process.on("SIGINT", async () => {
  viawebReceiverClient.stop();
  await dataStore.disconnect();
  server.close(() => process.exit(0));
});

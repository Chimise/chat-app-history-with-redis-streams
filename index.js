import { createServer } from "node:http";
import staticHandler from "serve-handler";
import ws, { WebSocketServer } from "ws";
import Redis from "ioredis";

const redisClient = new Redis();
const redisClientXRead = new Redis();

const STREAM = "chat_stream";

const server = createServer((req, res) => {
  return staticHandler(req, res, { public: "www" });
});

const wss = new WebSocketServer({ server });

function broadcast(message) {
  for (const wsClient of wss.clients) {
    if (wsClient.readyState === ws.OPEN) {
      wsClient.send(message);
    }
  }
}

wss.on("connection", async (client) => {
  console.log("Client connected");
  client.on("message", (message) => {
    console.log("Message: ", message);
    redisClient.xadd(STREAM, "*", "message", message.toString());
  });

  const logs = await redisClient.xrange(STREAM, "-", "+");
  console.table(logs);
  if (logs && logs?.length > 0) {
    for (const [, [, message]] of logs) {
      client.send(message);
    }
  }

});

let lastRecord = "$";

async function processStreamMessage() {
  while (true) {
    const data = await redisClientXRead.xread(
      "BLOCK",
      "0",
      "STREAMS",
      STREAM,
      lastRecord
    );

    const [[, records]] = data;

    for (const [id, [, message]] of records) {
      console.log("Message from stream: %s", message);
      broadcast(message);
      lastRecord = id;
    }
  }
}

processStreamMessage().catch((err) => console.log(err));

server.listen(process.argv[2] ?? 8000, () => {
  const address = server.address();
  console.log("Server running on port %d", address.port);
});

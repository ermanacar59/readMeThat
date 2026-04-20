import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildServer } from "./server.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: path.resolve(currentDir, "../../../.env")
});

const port = Number(process.env.API_PORT || 4123);
const host = process.env.API_HOST || "127.0.0.1";

const server = await buildServer();

server.listen({ port, host }).then(() => {
  server.log.info(`API listening on http://${host}:${port}`);
});

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: path.resolve(currentDir, "../.env")
});

const baseUrl = process.env.LIBRETRANSLATE_URL;

if (!baseUrl) {
  console.error("LIBRETRANSLATE_URL is not configured.");
  process.exit(1);
}

try {
  const response = await fetch(new URL("/languages", baseUrl));
  if (!response.ok) {
    console.error(`LibreTranslate responded with ${response.status}.`);
    process.exit(1);
  }

  const payload = await response.json();
  const count = Array.isArray(payload) ? payload.length : 0;
  console.log(`LibreTranslate reachable at ${baseUrl} with ${count} language entries.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "LibreTranslate check failed.");
  process.exit(1);
}

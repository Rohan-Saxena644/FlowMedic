import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env")) {
  writeFileSync(
    ".env",
    readFileSync(".env.example", "utf8").replace(
      "replace-with-at-least-32-random-characters",
      randomBytes(32).toString("hex"),
    ),
  );
  console.log("Created .env with a random server-only operator token.");
} else console.log(".env already exists; retained.");

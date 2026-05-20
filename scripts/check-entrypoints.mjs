import { existsSync, readFileSync } from "fs";

const errors = [];

if (!existsSync("src/cli.ts")) {
  errors.push("Missing required CLI entrypoint: src/cli.ts");
}

if (existsSync("src/index.ts")) {
  errors.push(
    "Unexpected legacy entrypoint detected: src/index.ts. Use src/cli.ts as the only CLI entrypoint.",
  );
}

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const scripts = pkg.scripts ?? {};

if (pkg.bin?.grove !== "./dist/cli.js") {
  errors.push(
    `package.json bin.grove must be ./dist/cli.js (found ${String(pkg.bin?.grove)})`,
  );
}

if (scripts.dev !== "ts-node src/cli.ts") {
  errors.push(
    `package.json scripts.dev must be ts-node src/cli.ts (found ${String(scripts.dev)})`,
  );
}

if (scripts.start !== "node dist/cli.js") {
  errors.push(
    `package.json scripts.start must be node dist/cli.js (found ${String(scripts.start)})`,
  );
}

if (errors.length > 0) {
  console.error("Entrypoint consistency check failed:\n");
  for (const err of errors) {
    console.error(`- ${err}`);
  }
  process.exit(1);
}

console.log("Entrypoint consistency check passed.");

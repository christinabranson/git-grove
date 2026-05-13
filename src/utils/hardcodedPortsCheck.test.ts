import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "fs/promises";
import { join } from "path";
import os from "os";
import { findHardcodedComposePortFindings } from "./hardcodedPortsCheck.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(os.tmpdir(), "grove-hardcoded-ports-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("findHardcodedComposePortFindings", () => {
  test("detects short syntax hardcoded host:container ports", async () => {
    await writeFile(
      join(tmpDir, "compose.yaml"),
      [
        "services:",
        "  db:",
        "    image: postgres:16",
        "    ports:",
        '      - "5432:5432"',
      ].join("\n"),
      "utf-8",
    );

    const findings = await findHardcodedComposePortFindings(tmpDir);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      file: "compose.yaml",
      line: 5,
    });
  });

  test("does not flag env-based port mappings", async () => {
    await writeFile(
      join(tmpDir, "docker-compose.yml"),
      [
        "services:",
        "  db:",
        "    ports:",
        '      - "${DB_PORT:-5432}:5432"',
      ].join("\n"),
      "utf-8",
    );

    const findings = await findHardcodedComposePortFindings(tmpDir);
    expect(findings).toHaveLength(0);
  });

  test("detects long syntax published host ports", async () => {
    await writeFile(
      join(tmpDir, "compose.yml"),
      [
        "services:",
        "  redis:",
        "    ports:",
        "      - target: 6379",
        "        published: 6379",
      ].join("\n"),
      "utf-8",
    );

    const findings = await findHardcodedComposePortFindings(tmpDir);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      file: "compose.yml",
      line: 5,
    });
  });

  test("detects quoted long syntax published host ports", async () => {
    await writeFile(
      join(tmpDir, "compose.yaml"),
      [
        "services:",
        "  redis:",
        "    ports:",
        "      - target: 6379",
        '        published: "6379"',
      ].join("\n"),
      "utf-8",
    );

    const findings = await findHardcodedComposePortFindings(tmpDir);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      file: "compose.yaml",
      line: 5,
    });
  });

  test("includes configured extra compose files", async () => {
    await mkdir(join(tmpDir, "docker"), { recursive: true });
    await writeFile(
      join(tmpDir, "docker", "compose.shared.yaml"),
      ["services:", "  localstack:", "    ports:", '      - "4566:4566"'].join(
        "\n",
      ),
      "utf-8",
    );

    const findings = await findHardcodedComposePortFindings(tmpDir, [
      "docker/compose.shared.yaml",
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      file: "docker/compose.shared.yaml",
      line: 4,
    });
  });
});

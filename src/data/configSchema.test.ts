import { describe, test, expect } from "vitest";
import {
  validateConfigKey,
  validateConfigValue,
  formatConfigHelp,
} from "./configSchema.js";

describe("validateConfigKey", () => {
  test("accepts known top-level keys", () => {
    expect(validateConfigKey("project")).toBeNull();
    expect(validateConfigKey("editor")).toBeNull();
    expect(validateConfigKey("enabled")).toBeNull();
  });

  test("accepts known nested keys", () => {
    expect(validateConfigKey("naming.webPort")).toBeNull();
    expect(validateConfigKey("worktrees.defaultBaseBranch")).toBeNull();
    expect(validateConfigKey("envContract.strict")).toBeNull();
  });

  test("accepts dynamic provider keys", () => {
    expect(validateConfigKey("providers.web.type")).toBeNull();
    expect(validateConfigKey("providers.api.service")).toBeNull();
    expect(validateConfigKey("providers.backend.script")).toBeNull();
  });

  test("rejects unknown keys", () => {
    expect(validateConfigKey("test")).not.toBeNull();
    expect(validateConfigKey("foo.bar")).not.toBeNull();
    expect(validateConfigKey("naming.unknownField")).not.toBeNull();
  });

  test("error message references --help", () => {
    const err = validateConfigKey("bogus");
    expect(err).toContain("grove config set --help");
  });
});

describe("validateConfigValue", () => {
  test("accepts valid boolean", () => {
    expect(validateConfigValue("enabled", true)).toBeNull();
    expect(validateConfigValue("enabled", false)).toBeNull();
    expect(validateConfigValue("envContract.strict", true)).toBeNull();
  });

  test("rejects non-boolean for boolean key", () => {
    expect(validateConfigValue("enabled", "yes")).not.toBeNull();
    expect(validateConfigValue("enabled", 1)).not.toBeNull();
  });

  test("accepts valid enum value", () => {
    expect(
      validateConfigValue("providers.web.type", "docker-compose"),
    ).toBeNull();
    expect(
      validateConfigValue("providers.web.type", "node-scripts"),
    ).toBeNull();
    expect(
      validateConfigValue("providers.web.type", "custom-shell"),
    ).toBeNull();
  });

  test("rejects invalid enum value", () => {
    const err = validateConfigValue("providers.web.type", "unknown-type");
    expect(err).not.toBeNull();
    expect(err).toContain("docker-compose");
  });

  test("accepts number or auto for number-or-auto key", () => {
    expect(validateConfigValue("naming.webPort", 3000)).toBeNull();
    expect(validateConfigValue("naming.webPort", "auto")).toBeNull();
  });

  test("rejects invalid value for number-or-auto key", () => {
    expect(validateConfigValue("naming.webPort", "3000px")).not.toBeNull();
    expect(validateConfigValue("naming.webPort", true)).not.toBeNull();
  });

  test("accepts array for json-array key", () => {
    expect(
      validateConfigValue("envContract.required", ["FOO", "BAR"]),
    ).toBeNull();
    expect(validateConfigValue("envContract.sourceEnvFiles", [])).toBeNull();
  });

  test("rejects non-array for json-array key", () => {
    expect(validateConfigValue("envContract.required", "FOO")).not.toBeNull();
    expect(
      validateConfigValue("envContract.required", { foo: "bar" }),
    ).not.toBeNull();
  });

  test("accepts any string for string key", () => {
    expect(validateConfigValue("project", "my-app")).toBeNull();
    expect(validateConfigValue("worktrees.root", "/some/path")).toBeNull();
  });

  test("returns null for unknown key (key validation handles it)", () => {
    expect(validateConfigValue("bogus.key", "value")).toBeNull();
  });
});

describe("formatConfigHelp", () => {
  test("includes all section labels", () => {
    const help = formatConfigHelp();
    expect(help).toContain("Core");
    expect(help).toContain("naming");
    expect(help).toContain("worktrees");
    expect(help).toContain("envContract");
    expect(help).toContain("providers.<name>");
  });

  test("includes key names and types", () => {
    const help = formatConfigHelp();
    expect(help).toContain("project");
    expect(help).toContain("naming.webPort");
    expect(help).toContain("number-or-auto");
    expect(help).toContain("docker-compose | node-scripts | custom-shell");
  });
});

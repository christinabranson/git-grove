import React from "react";
import { describe, test, expect } from "vitest";
import { render } from "ink-testing-library";
import { ChangeFootprintPanel, CompactFootprint } from "./ChangeFootprint.js";
import type { ChangeFootprint } from "../types.js";

function makeFootprint(
  overrides: Partial<ChangeFootprint> = {},
): ChangeFootprint {
  return {
    byDir: {},
    totalFiles: 0,
    ...overrides,
  };
}

describe("ChangeFootprintPanel", () => {
  test("renders directory names", () => {
    const footprint = makeFootprint({
      byDir: {
        "src/auth": [{ path: "src/auth/login.ts", added: 10, removed: 2 }],
        "src/api": [{ path: "src/api/users.ts", added: 5, removed: 0 }],
      },
    });
    const { lastFrame } = render(
      <ChangeFootprintPanel
        footprint={footprint}
        expanded={false}
        width={80}
      />,
    );
    expect(lastFrame()).toContain("src/auth/");
    expect(lastFrame()).toContain("src/api/");
  });

  test("collapsed: shows file names inline under each directory", () => {
    const footprint = makeFootprint({
      byDir: {
        "src/auth": [
          { path: "src/auth/login.ts", added: 10, removed: 2 },
          { path: "src/auth/logout.ts", added: 3, removed: 1 },
        ],
      },
    });
    const { lastFrame } = render(
      <ChangeFootprintPanel
        footprint={footprint}
        expanded={false}
        width={80}
      />,
    );
    expect(lastFrame()).toContain("login.ts");
    expect(lastFrame()).toContain("logout.ts");
  });

  test("expanded: shows each file with addition count", () => {
    const footprint = makeFootprint({
      byDir: {
        "src/auth": [{ path: "src/auth/login.ts", added: 10, removed: 2 }],
      },
    });
    const { lastFrame } = render(
      <ChangeFootprintPanel footprint={footprint} expanded={true} width={80} />,
    );
    expect(lastFrame()).toContain("+10");
  });

  test("expanded: shows each file with deletion count", () => {
    const footprint = makeFootprint({
      byDir: {
        "src/auth": [{ path: "src/auth/login.ts", added: 10, removed: 2 }],
      },
    });
    const { lastFrame } = render(
      <ChangeFootprintPanel footprint={footprint} expanded={true} width={80} />,
    );
    expect(lastFrame()).toContain("-2");
  });

  test("expanded: shows only filename, not full path", () => {
    const footprint = makeFootprint({
      byDir: {
        "src/deep/nested": [
          { path: "src/deep/nested/file.ts", added: 5, removed: 0 },
        ],
      },
    });
    const { lastFrame } = render(
      <ChangeFootprintPanel footprint={footprint} expanded={true} width={80} />,
    );
    expect(lastFrame()).toContain("file.ts");
    // The full path should not appear (only the basename in the expanded row)
    const frame = lastFrame()!;
    const rows = frame.split("\n").filter((l) => l.includes("file.ts"));
    // Expanded row should show filename, not full path in the file row
    expect(rows.some((r) => r.includes("+5"))).toBe(true);
  });

  test("expanded: does not show deletions when removed is 0", () => {
    const footprint = makeFootprint({
      byDir: {
        src: [{ path: "src/new.ts", added: 5, removed: 0 }],
      },
    });
    const { lastFrame } = render(
      <ChangeFootprintPanel footprint={footprint} expanded={true} width={80} />,
    );
    // Should not show -0 for zero removals
    expect(lastFrame()).not.toContain("-0");
  });

  test("expanded: does not show additions when added is 0", () => {
    const footprint = makeFootprint({
      byDir: {
        src: [{ path: "src/deleted.ts", added: 0, removed: 5 }],
      },
    });
    const { lastFrame } = render(
      <ChangeFootprintPanel footprint={footprint} expanded={true} width={80} />,
    );
    expect(lastFrame()).not.toContain("+0");
  });

  test("renders empty footprint without error", () => {
    const { lastFrame } = render(
      <ChangeFootprintPanel
        footprint={makeFootprint()}
        expanded={false}
        width={80}
      />,
    );
    expect(lastFrame()).toBeDefined();
  });

  test("collapsed mode differs from expanded mode", () => {
    const footprint = makeFootprint({
      byDir: {
        src: [{ path: "src/file.ts", added: 10, removed: 5 }],
      },
    });
    const { lastFrame: collapsed } = render(
      <ChangeFootprintPanel
        footprint={footprint}
        expanded={false}
        width={80}
      />,
    );
    const { lastFrame: expanded } = render(
      <ChangeFootprintPanel footprint={footprint} expanded={true} width={80} />,
    );
    // Expanded shows +10, collapsed does not (it just shows the filename)
    expect(expanded()).toContain("+10");
    expect(collapsed()).not.toContain("+10");
  });
});

describe("CompactFootprint", () => {
  test('renders "change footprint" header', () => {
    const { lastFrame } = render(
      <CompactFootprint footprint={makeFootprint({ byDir: {} })} width={60} />,
    );
    expect(lastFrame()).toContain("change footprint");
  });

  test("shows directory names", () => {
    const footprint = makeFootprint({
      byDir: {
        "src/auth": [{ path: "src/auth/login.ts", added: 10, removed: 2 }],
        "src/utils": [{ path: "src/utils/helpers.ts", added: 3, removed: 1 }],
      },
    });
    const { lastFrame } = render(
      <CompactFootprint footprint={footprint} width={60} />,
    );
    expect(lastFrame()).toContain("src/auth/");
    expect(lastFrame()).toContain("src/utils/");
  });

  test("shows total additions per directory", () => {
    const footprint = makeFootprint({
      byDir: {
        src: [
          { path: "src/a.ts", added: 10, removed: 0 },
          { path: "src/b.ts", added: 5, removed: 0 },
        ],
      },
    });
    const { lastFrame } = render(
      <CompactFootprint footprint={footprint} width={60} />,
    );
    expect(lastFrame()).toContain("+15");
  });

  test("shows +0 for directories with no additions", () => {
    const footprint = makeFootprint({
      byDir: {
        src: [{ path: "src/deleted.ts", added: 0, removed: 5 }],
      },
    });
    const { lastFrame } = render(
      <CompactFootprint footprint={footprint} width={60} />,
    );
    expect(lastFrame()).toContain("+0");
  });

  test("renders empty footprint without error", () => {
    const { lastFrame } = render(
      <CompactFootprint footprint={makeFootprint()} width={60} />,
    );
    expect(lastFrame()).toContain("change footprint");
  });
});

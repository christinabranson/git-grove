import React from "react";
import { vi, describe, test, expect } from "vitest";
import { render } from "./render-for-test.js";
import { FilterBar } from "./FilterBar.js";

describe("FilterBar", () => {
  test('renders the "/" prefix', () => {
    const { lastFrame } = render(
      <FilterBar
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onEscape={vi.fn()}
      />,
    );
    expect(lastFrame()).toContain("/");
  });

  test("shows current filter value", () => {
    const { lastFrame } = render(
      <FilterBar
        value="feature"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onEscape={vi.fn()}
      />,
    );
    expect(lastFrame()).toContain("feature");
  });

  test("shows Esc hint text", () => {
    const { lastFrame } = render(
      <FilterBar
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onEscape={vi.fn()}
      />,
    );
    expect(lastFrame()).toContain("Esc");
  });

  test("shows placeholder text when value is empty", () => {
    const { lastFrame } = render(
      <FilterBar
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onEscape={vi.fn()}
      />,
    );
    expect(lastFrame()).toContain("filter by branch, status");
  });

  test("renders without error when value has special characters", () => {
    const { lastFrame } = render(
      <FilterBar
        value="feat/auth-v2"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onEscape={vi.fn()}
      />,
    );
    expect(lastFrame()).toContain("feat/auth-v2");
  });
});

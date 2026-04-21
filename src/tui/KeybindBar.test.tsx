import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { KeybindBar } from './KeybindBar.js';
import type { Worktree } from '../types.js';

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: '/tmp/worktree',
    branch: 'main',
    baseBranch: null,
    isMain: false,
    isCurrent: false,
    head: 'abc1234',
    docker: null,
    changeFootprint: null,
    pr: null,
    ...overrides,
  };
}

describe('KeybindBar', () => {
  test('shows base keys when no worktree is selected', () => {
    const { lastFrame } = render(<KeybindBar worktree={null} />);
    const frame = lastFrame()!;
    expect(frame).toContain('s');
    expect(frame).toContain('sync');
    expect(frame).toContain('?');
    expect(frame).toContain('help');
    expect(frame).toContain('q');
    expect(frame).toContain('quit');
  });

  test('does not show worktree-specific keys when no worktree is selected', () => {
    const { lastFrame } = render(<KeybindBar worktree={null} />);
    expect(lastFrame()).not.toContain('launch agent');
    expect(lastFrame()).not.toContain('open');
  });

  test('shows open key when a worktree is selected', () => {
    const { lastFrame } = render(<KeybindBar worktree={makeWorktree()} />);
    const frame = lastFrame()!;
    expect(frame).toContain('o');
    expect(frame).toContain('open');
  });

  test('shows delete key for non-main worktrees', () => {
    const { lastFrame } = render(<KeybindBar worktree={makeWorktree({ isMain: false })} />);
    expect(lastFrame()).toContain('D');
    expect(lastFrame()).toContain('delete');
  });

  test('hides delete key for the main worktree', () => {
    const { lastFrame } = render(<KeybindBar worktree={makeWorktree({ isMain: true })} />);
    expect(lastFrame()).not.toContain('delete');
  });

  test('shows docker down key when docker is running', () => {
    const worktree = makeWorktree({
      docker: { state: 'running', projectName: 'myapp-main' },
    });
    const { lastFrame } = render(<KeybindBar worktree={worktree} />);
    expect(lastFrame()).toContain('d');
    expect(lastFrame()).toContain('docker down');
  });

  test('shows docker up key when docker is stopped', () => {
    const worktree = makeWorktree({
      docker: { state: 'stopped', projectName: 'myapp-main' },
    });
    const { lastFrame } = render(<KeybindBar worktree={worktree} />);
    expect(lastFrame()).toContain('u');
    expect(lastFrame()).toContain('docker up');
  });

  test('shows expand changes key when changeFootprint is present', () => {
    const worktree = makeWorktree({
      changeFootprint: { byDir: {}, totalFiles: 3 },
    });
    const { lastFrame } = render(<KeybindBar worktree={worktree} />);
    expect(lastFrame()).toContain('x');
    expect(lastFrame()).toContain('expand changes');
  });

  test('hides expand changes key when changeFootprint is absent', () => {
    const { lastFrame } = render(<KeybindBar worktree={makeWorktree({ changeFootprint: null })} />);
    expect(lastFrame()).not.toContain('expand changes');
  });
});

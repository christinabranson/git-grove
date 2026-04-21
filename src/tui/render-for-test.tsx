/**
 * A render helper compatible with ink v4.
 *
 * ink-testing-library v3's Stdin is an EventEmitter with a write() that emits
 * 'data', but ink v4's App.handleSetRawMode() needs stdin.ref()/unref() and
 * handleReadable() needs stdin.read(). This module provides a properly-patched
 * render that passes a compatible stdin to ink directly.
 *
 * Timing: React passive effects (including useInput's handleSetRawMode) run
 * asynchronously after render(). Writes that arrive before the 'readable'
 * listener is registered are queued in _pending. When ink calls stdin.ref()
 * it does so immediately before addListener('readable', ...), so we flush
 * pending writes via a resolved Promise (microtask) — by which time the
 * listener is in place.
 */
import { render as inkRender } from 'ink';
import { EventEmitter } from 'node:events';
import type { ReactElement } from 'react';

class PatchedStdout extends EventEmitter {
  frames: string[] = [];
  private _lastFrame: string | undefined;

  get columns() {
    return 100;
  }

  write = (frame: string) => {
    this.frames.push(frame);
    this._lastFrame = frame;
  };

  lastFrame = (): string | undefined => this._lastFrame;
}

class PatchedStdin extends EventEmitter {
  isTTY = true;
  private _buffer: string[] = [];
  private _pending: string[] = [];
  private _rawModeEnabled = false;

  ref() {
    this._rawModeEnabled = true;
    // ink calls ref() → setRawMode() → addListener('readable') synchronously.
    // Flush pending writes in a microtask so the listener is registered first.
    Promise.resolve().then(() => this._flush());
  }

  unref() {
    this._rawModeEnabled = false;
  }

  setEncoding() {}
  setRawMode() {}
  resume() {}
  pause() {}

  write = (data: string) => {
    if (this._rawModeEnabled) {
      this._buffer.push(data);
      this.emit('readable');
    } else {
      // Effects haven't run yet — queue for delivery after ref() is called.
      this._pending.push(data);
    }
  };

  read(): string | null {
    return this._buffer.length > 0 ? this._buffer.shift()! : null;
  }

  private _flush() {
    for (const data of this._pending) {
      this._buffer.push(data);
      this.emit('readable');
    }
    this._pending = [];
  }
}

export function render(element: ReactElement) {
  const stdout = new PatchedStdout();
  const stderr = new PatchedStdout();
  const stdin = new PatchedStdin();
  // process.stdout may accumulate resize listeners across tests; suppress the warning.
  process.stdout.setMaxListeners(20);

  const instance = inkRender(element, {
    stdout: stdout as any,
    stderr: stderr as any,
    stdin: stdin as any,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });

  return {
    rerender: instance.rerender,
    unmount: instance.unmount,
    cleanup: instance.cleanup,
    stdout,
    stderr,
    stdin,
    frames: stdout.frames,
    lastFrame: stdout.lastFrame,
  };
}

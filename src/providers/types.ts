import type { GroveEnvironment } from '../types.js';

export interface GroveProvider {
  readonly name: string;
  start(): Promise<GroveEnvironment>;
  stop(): Promise<void>;
  status(): Promise<GroveEnvironment>;
}

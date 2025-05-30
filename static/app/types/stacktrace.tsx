import type {Frame} from './event';

export enum StackView {
  RAW = 'raw',
  FULL = 'full',
  APP = 'app',
}

export enum StackType {
  ORIGINAL = 'original',
  MINIFIED = 'minified',
}

export interface StacktraceType {
  /**
   * Omitted segment of frames (start, end)
   */
  framesOmitted: [start: number, end: number] | null;
  hasSystemFrames: boolean;
  registers: Record<string, string | null> | null;
  frames?: Frame[];
}

interface MechanismMeta {
  errno?: {
    number: number;
    name?: string;
  };
  mach_exception?: {
    code: number;
    exception: number;
    subcode: number;
    name?: string;
  };
  signal?: {
    number: number;
    code?: number;
    code_name?: string;
    name?: string;
  };
}

export interface StackTraceMechanism {
  handled: boolean;
  type: string;
  data?: Record<PropertyKey, string | unknown[] | Record<PropertyKey, unknown> | Date>;
  description?: string;
  exception_id?: number;
  help_link?: string;
  is_exception_group?: boolean;
  meta?: MechanismMeta;
  parent_id?: number;
  source?: string;
  synthetic?: boolean;
}

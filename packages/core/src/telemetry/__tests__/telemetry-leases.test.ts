/**
 * Telemetry lease-identity tests (T12045 · E6-L12e).
 *
 * Proves that the telemetry flush path passes explicit canonical dbPath identity
 * to `withWriterLease` so the lease row lands in the global cleo.db arbitration
 * file, not in an ambient cwd-resolved one.
 *
 * @task T12045
 * @epic T11625
 */

import { describe, expect, it, vi } from 'vitest';
import { resolveDualScopeDbPath } from '../../store/dual-scope-db.js';
import type { LeaseAcquireOptions, LeaseLane, LeaseScope } from '../../store/writer-lease.js';

const leaseCalls: Array<{ scope: LeaseScope; lane: LeaseLane; opts?: LeaseAcquireOptions }> = [];
vi.mock('../../store/writer-lease.js', () => ({
  withWriterLease: vi.fn(
    async <T>(
      scope: LeaseScope,
      lane: LeaseLane,
      fn: () => Promise<T>,
      opts?: LeaseAcquireOptions,
    ): Promise<T> => {
      leaseCalls.push({ scope, lane, opts });
      return fn();
    },
  ),
}));

// Mock telemetry DB so flush doesn't try to open a real SQLite file.
vi.mock('../sqlite.js', () => ({
  getTelemetryDb: vi.fn(async () => ({
    insert: vi.fn(() => ({ values: vi.fn(() => ({ run: vi.fn() })) })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ all: vi.fn(() => []) })) })),
    })),
    delete: vi.fn(() => ({ where: vi.fn(() => ({ run: vi.fn() })) })),
  })),
  getTelemetryDbPath: vi.fn(() => '/mock/cleo-home/telemetry.db'),
  resetTelemetryDbState: vi.fn(),
}));

// Mock telemetry config: enabled with a valid anonymousId so recordTelemetryEvent
// proceeds past the config gate and enqueues a row into the buffer.
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() =>
      JSON.stringify({ enabled: true, anonymousId: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee' }),
    ),
    writeFileSync: vi.fn(),
  };
});

import { flushTelemetryBuffer, recordTelemetryEvent, resetTelemetryBufferState } from '../index.js';

describe('telemetry lease identity (T12045 · E6-L12e)', () => {
  it('_flushTelemetryBuffer passes explicit global dbPath in opts', async () => {
    leaseCalls.length = 0;
    resetTelemetryBufferState();

    await recordTelemetryEvent({
      domain: 'test',
      gateway: 'query',
      operation: 'test-op',
      durationMs: 1,
      exitCode: 0,
    });

    await flushTelemetryBuffer();

    expect(leaseCalls.length).toBeGreaterThanOrEqual(1);
    expect(leaseCalls[0]?.scope).toBe('global');
    expect(leaseCalls[0]?.lane).toBe('bulk');
    expect(leaseCalls[0]?.opts?.dbPath).toBe(resolveDualScopeDbPath('global'));
  });
});

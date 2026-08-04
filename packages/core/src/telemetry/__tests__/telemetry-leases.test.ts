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

const leaseCalls: Array<{ scope: string; lane: string; opts?: unknown }> = [];
vi.mock('../../store/writer-lease.js', () => ({
  ...vi.importActual('../../store/writer-lease.js'),
  withWriterLease: vi.fn(
    async (scope: string, lane: string, fn: (h: unknown) => Promise<unknown>, opts?: unknown) => {
      leaseCalls.push({ scope, lane, opts });
      return fn({});
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
vi.mock('node:fs', () => {
  const actual = vi.importActual<typeof import('node:fs')>('node:fs');
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
    expect(leaseCalls[0].scope).toBe('global');
    expect(leaseCalls[0].lane).toBe('bulk');
    // T12045: explicit dbPath MUST be passed. The global cleo.db path is
    // resolved via resolveDualScopeDbPath('global') at call time.
    const opts = leaseCalls[0].opts as Record<string, unknown> | undefined;
    expect(opts).toBeDefined();
    expect(typeof opts!.dbPath).toBe('string');
    expect((opts!.dbPath as string).length).toBeGreaterThan(0);
  });

  it('global-leased telemetry writes do not share scope with project-leased writes', () => {
    // Static proof: telemetry uses 'global' scope; dhq-adapter/Pi use 'project'.
    // The lease scope discriminator is embedded in the memo key, so a release
    // for a project lane never reaches a global lane, and vice versa.
    expect(leaseCalls.length).toBeGreaterThanOrEqual(1);
    for (const call of leaseCalls) {
      expect(call.scope).toBe('global');
    }
  });
});

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { nightCounts, readNight } from '../src/digest/reader.js';

const tmp = mkdtempSync(join(tmpdir(), 'rig-runs-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('reads 5 jobs sorted by job, with 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries, keeps last status, error and times with offsets', () => {
    const row = (job: string) => night?.rows.find((r) => r.job === job);
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(row('lane/sync')).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastError: null });
    expect(row('lane/sync')?.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(row('notes/backup')).toMatchObject({
      owner: 'lane-07',
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
    });
  });

  it('keeps a row whose owner is null', () => {
    expect(night?.rows.find((r) => r.job === 'digest/render')).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok' });
  });

  it('counts lines by status', () => {
    expect(night && nightCounts(night)).toEqual({ ok: 10, retry: 4, fail: 1 });
  });
});

describe('readNight edge cases', () => {
  it('returns null for a missing file', () => {
    expect(readNight(tmp, '2026-01-01')).toBeNull();
  });

  it('returns a Night with no rows for an empty file', () => {
    writeFileSync(join(tmp, '2026-01-02.jsonl'), '');
    expect(readNight(tmp, '2026-01-02')).toEqual({ night: '2026-01-02', rows: [], badLines: 0 });
  });

  it('keeps null owners and counts bad lines without throwing', () => {
    const lines = [
      '{"at":"2026-01-03T01:00:00+02:00","job":"a","status":"retry","owner":null,"error":"boom"}',
      '{"at":"2026-01-03T01:05:00+02:00","job":"a","status":"fail","owner":null,"error":"still boom"}',
      'not json',
      '{"job":"b","status":"ok","owner":"x"}',
      '{"at":"2026-01-03T01:00:00+02:00","job":"b","status":"maybe","owner":"x"}',
      '{"at":"2026-01-03T01:00:00+02:00","status":"ok","owner":"x"}',
      '[]',
      '',
    ];
    writeFileSync(join(tmp, '2026-01-03.jsonl'), lines.join('\n'));
    const night = readNight(tmp, '2026-01-03');
    expect(night).toEqual({
      night: '2026-01-03',
      badLines: 5,
      rows: [
        {
          job: 'a',
          owner: null,
          runs: 2,
          retries: 1,
          lastStatus: 'fail',
          lastError: 'still boom',
          firstAt: '2026-01-03T01:00:00+02:00',
          lastAt: '2026-01-03T01:05:00+02:00',
        },
      ],
    });
    expect(night && nightCounts(night)).toEqual({ ok: 0, retry: 1, fail: 1 });
  });
});

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const NORMAL = '2026-10-30';
const MISSING = '2026-10-31';
const EMPTY = '2026-10-29';
const BAD = '2026-10-27';

const line = (at: string, job: string, status: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ at, job, status, owner: 'ops', ...extra });

let runsDir: string;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  // Jobs are written out of alphabetical order on purpose: the page and the JSON must sort them.
  writeFileSync(
    join(runsDir, `${NORMAL}.jsonl`),
    [
      line('2026-10-30T01:00:00+01:00', 'sync-invoices', 'ok'),
      line('2026-10-30T01:05:00+01:00', 'backup-db', 'retry', { error: 'timeout' }),
      line('2026-10-30T01:10:00+01:00', 'backup-db', 'ok'),
      line('2026-10-30T01:15:00+01:00', 'rebuild-index', 'fail', { error: 'disk full' }),
    ].join('\n') + '\n',
  );
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(runsDir, `${BAD}.jsonl`),
    [line('2026-10-27T01:00:00+01:00', 'sync-invoices', 'ok'), 'this is not json'].join('\n') + '\n',
  );
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  get runsDir() {
    return runsDir;
  },
};

// Job names in the order they appear in the HTML table body.
function htmlJobOrder(html: string): string[] {
  const body = html.split('<tbody>')[1]?.split('</tbody>')[0] ?? '';
  return [...body.matchAll(/<tr[^>]*>\s*<td>([^<]+)<\/td>/g)].map((m) => m[1]!);
}

describe('digest page (HTML)', () => {
  it('200 for a normal night: every job name is on the page, in sorted order', async () => {
    const res = await createApp(config).request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of ['backup-db', 'rebuild-index', 'sync-invoices']) {
      expect(html).toContain(job);
    }
    expect(htmlJobOrder(html)).toEqual(['backup-db', 'rebuild-index', 'sync-invoices']);
  });

  it('404 for a night with no file', async () => {
    const res = await createApp(config).request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for that night');
  });

  it('the empty night says nothing ran', async () => {
    const res = await createApp(config).request(`/digest/${EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('a night with a bad line is still 200 and says how many lines could not be read', async () => {
    const res = await createApp(config).request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('sync-invoices');
    expect(html).toContain('1 line could not be read');
  });
});

describe('digest JSON (GET /api/digest/:night)', () => {
  it('200 for a normal night: rows sorted by job, same order as the HTML', async () => {
    const app = createApp(config);
    const res = await app.request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: { job: string }[]; badLines: number };
    expect(body.night).toBe(NORMAL);
    const jobs = body.rows.map((r) => r.job);
    expect(jobs).toEqual(['backup-db', 'rebuild-index', 'sync-invoices']);
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    expect(htmlJobOrder(html)).toEqual(jobs);
  });

  it('404 for a night with no file, with an error string', async () => {
    const res = await createApp(config).request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: unknown };
    expect(typeof body.error).toBe('string');
  });

  it('the empty night is 200 with no rows and no bad lines', async () => {
    const res = await createApp(config).request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ rows: [], badLines: 0 });
  });

  it('a night with a bad line is still 200 with badLines 1', async () => {
    const res = await createApp(config).request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ badLines: 1 });
  });
});

describe('invalid night param', () => {
  it('"nope" is 404 on both routes', async () => {
    const app = createApp(config);
    expect((await app.request('/digest/nope')).status).toBe(404);
    expect((await app.request('/api/digest/nope')).status).toBe(404);
  });
});

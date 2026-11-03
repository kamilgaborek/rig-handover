import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestPage, NoDigest } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const id = c.req.param('night');
    const night = NIGHT.test(id) ? readNight(config.runsDir, id) : null;
    if (night === null) {
      return c.html(
        <Layout title={`digest ${id}`} lane={lane()}>
          <NoDigest night={id} />
        </Layout>,
        404,
      );
    }
    return c.html(
      <Layout title={`digest ${id}`} lane={lane()}>
        <DigestPage night={night} />
      </Layout>,
    );
  });

  // Same rows as the page, same order (ADR 0001: the page and the JSON never disagree).
  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    const data = NIGHT.test(night) ? readNight(config.runsDir, night) : null;
    if (data === null) return c.json({ error: `no run log for ${night}` }, 404);
    return c.json(data);
  });

  return app;
}

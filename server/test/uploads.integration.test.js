import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, signUp } from './helpers/test-app.js';

const MB = 1024 * 1024;

// A zip begins with PK\x03\x04, which is enough for signature detection.
function fakeZip(size) {
  const body = randomBytes(size);
  Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 0, 0]).copy(body);
  return body;
}

function binary(res, callback) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('resumable uploads', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp({ MAX_UPLOAD_BYTES: '200000', MAX_RESUMABLE_BYTES: String(20 * MB) });
  });
  afterAll(() => ctx.cleanup());

  const patch = (user, id, offset, chunk) =>
    user.client.patchRaw(`/api/uploads/${id}`, chunk, { 'Upload-Offset': String(offset) });

  it('reports limits', async () => {
    const a = await signUp(ctx.app, 'a');
    const res = await a.client.get('/api/uploads/limits');
    expect(res.body).toEqual({ maxBytes: 20 * MB, chunkBytes: 4 * MB });
  });

  it('uploads in chunks, resumes at the right offset and delivers a normal attachment', async () => {
    const [a, b] = await Promise.all([signUp(ctx.app, 'a'), signUp(ctx.app, 'b')]);
    const conv = (await a.client.post('/api/conversations/direct', { userId: b.id })).body
      .conversation.id;
    const data = fakeZip(9 * MB);
    const created = await a.client.post('/api/uploads', { name: 'big.zip', size: data.length });
    expect(created.status).toBe(201);
    const id = created.body.upload.id;

    expect((await patch(a, id, 0, data.subarray(0, 4 * MB))).body.upload.offset).toBe(4 * MB);

    // A client that lost its connection asks where to continue.
    expect((await a.client.get(`/api/uploads/${id}`)).body.upload.offset).toBe(4 * MB);

    // Resending the same chunk is refused and tells the client the real position.
    const stale = await patch(a, id, 0, data.subarray(0, 4 * MB));
    expect(stale.status).toBe(409);
    expect(stale.body.error.details.offset).toBe(4 * MB);

    await patch(a, id, 4 * MB, data.subarray(4 * MB, 8 * MB));
    const early = await a.client.post(`/api/uploads/${id}/complete`);
    expect(early.status).toBe(409);
    await patch(a, id, 8 * MB, data.subarray(8 * MB));

    const done = await a.client.post(`/api/uploads/${id}/complete`);
    expect(done.status).toBe(201);
    expect(done.body.attachment).toMatchObject({
      name: 'big.zip',
      sizeBytes: data.length,
      kind: 'file',
    });

    const sent = await a.client.post(`/api/conversations/${conv}/messages`, {
      clientId: `big-${Date.now()}`,
      body: '',
      attachmentId: done.body.attachment.id,
    });
    expect(sent.status).toBe(201);
    const file = await b.client.get(done.body.attachment.url).buffer(true).parse(binary);
    expect(file.status).toBe(200);
    expect(Buffer.compare(file.body, data)).toBe(0);

    // The session and its temporary file are gone.
    expect((await a.client.get(`/api/uploads/${id}`)).status).toBe(404);
    expect(existsSync(path.join(ctx.env.UPLOAD_DIR, '.partial', `${id}.part`))).toBe(false);
  });

  it("rejects files over the limit, bad content, images and other people's sessions", async () => {
    const [a, b] = await Promise.all([signUp(ctx.app, 'a'), signUp(ctx.app, 'b')]);
    expect((await a.client.post('/api/uploads', { name: 'x.zip', size: 21 * MB })).status).toBe(
      413,
    );

    const text = Buffer.from('MZ not allowed executable bytes '.repeat(50));
    const bad = await a.client.post('/api/uploads', { name: 'tool.exe', size: text.length });
    await patch(a, bad.body.upload.id, 0, text);
    expect((await a.client.post(`/api/uploads/${bad.body.upload.id}/complete`)).status).toBe(415);

    const mine = await a.client.post('/api/uploads', { name: 'mine.zip', size: 1000 });
    expect((await b.client.get(`/api/uploads/${mine.body.upload.id}`)).status).toBe(404);
    expect((await patch(b, mine.body.upload.id, 0, Buffer.alloc(10))).status).toBe(404);
  });

  it('does not accept a chunk larger than the remaining size and keeps the offset', async () => {
    const a = await signUp(ctx.app, 'a');
    const created = await a.client.post('/api/uploads', { name: 'small.zip', size: 100 });
    const id = created.body.upload.id;
    const res = await patch(a, id, 0, Buffer.alloc(150));
    expect(res.status).toBe(413);
    expect((await a.client.get(`/api/uploads/${id}`)).body.upload.offset).toBe(0);
  });

  it('limits concurrent sessions and cancels cleanly', async () => {
    const a = await signUp(ctx.app, 'a');
    const ids = [];
    for (let i = 0; i < 3; i += 1) {
      ids.push(
        (await a.client.post('/api/uploads', { name: `f${i}.zip`, size: 10 })).body.upload.id,
      );
    }
    expect((await a.client.post('/api/uploads', { name: 'f4.zip', size: 10 })).status).toBe(429);
    expect((await a.client.delete(`/api/uploads/${ids[0]}`)).status).toBe(204);
    expect((await a.client.post('/api/uploads', { name: 'f5.zip', size: 10 })).status).toBe(201);
  });

  it('removes stale sessions', async () => {
    const a = await signUp(ctx.app, 'a');
    const created = await a.client.post('/api/uploads', { name: 'old.zip', size: 10 });
    const { uploadSessions } = await import('../src/db/schema.js');
    const { eq } = await import('drizzle-orm');
    await ctx.database.db
      .update(uploadSessions)
      .set({ updatedAt: new Date(Date.now() - 48 * 3600 * 1000) })
      .where(eq(uploadSessions.id, created.body.upload.id));
    expect(await ctx.container.uploadsService.cleanupStale()).toBeGreaterThanOrEqual(1);
    expect((await a.client.get(`/api/uploads/${created.body.upload.id}`)).status).toBe(404);
  });
});

import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, createTestApp, signUp } from './helpers/test-app.js';

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
);

async function png(width = 40, height = 20) {
  return sharp({ create: { width, height, channels: 3, background: '#4A2F22' } })
    .png()
    .toBuffer();
}

describe('attachments', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp({ MAX_UPLOAD_BYTES: '200000' });
  });
  afterAll(() => ctx.cleanup());

  let seq = 0;
  const cid = () => `att-client-${Date.now()}-${(seq += 1)}`;

  async function pair() {
    const [a, b] = await Promise.all([signUp(ctx.app, 'a'), signUp(ctx.app, 'b')]);
    const res = await a.client.post('/api/conversations/direct', { userId: b.id });
    return { a, b, id: res.body.conversation.id };
  }

  const upload = (user, buffer, name) => user.client.upload('/api/attachments', buffer, name);

  const storageFile = (key) => path.join(ctx.env.UPLOAD_DIR, key);

  describe('upload validation', () => {
    it('accepts an image, records its size, and builds a thumbnail', async () => {
      const { a } = await pair();
      const res = await upload(a, await png(800, 400), 'photo.png');
      expect(res.status).toBe(201);
      expect(res.body.attachment).toMatchObject({
        name: 'photo.png',
        mimeType: 'image/png',
        kind: 'image',
        width: 800,
        height: 400,
      });
      expect(res.body.attachment.thumbnailUrl).toMatch(/thumbnail$/);
      const row = await ctx.container.attachmentsRepository.findById(res.body.attachment.id);
      expect(existsSync(storageFile(row.storageKey))).toBe(true);
      expect(existsSync(storageFile(row.thumbnailKey))).toBe(true);
      expect(row.storageKey).toMatch(/^[a-f0-9]{2}\/[a-f0-9]{32}$/);
    });

    it('accepts a PDF and plain text, as non-image files without thumbnails', async () => {
      const { a } = await pair();
      const pdf = await upload(a, PDF, 'report.pdf');
      expect(pdf.status).toBe(201);
      expect(pdf.body.attachment).toMatchObject({ mimeType: 'application/pdf', kind: 'file' });
      expect(pdf.body.attachment.thumbnailUrl).toBeNull();
      const text = await upload(a, Buffer.from('plain notes\nsecond line\n'), 'notes.txt');
      expect(text.status).toBe(201);
      expect(text.body.attachment.mimeType).toBe('text/plain');
    });

    it('trusts content over the file name: an executable renamed to .png is rejected', async () => {
      const { a } = await pair();
      const fakeExe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]);
      const res = await upload(a, fakeExe, 'cute.png');
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    });

    it('rejects SVG and HTML, which can carry script', async () => {
      const { a } = await pair();
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      );
      expect((await upload(a, svg, 'x.svg')).status).toBe(415);
      const html = Buffer.from('<html><script>alert(1)</script></html>');
      expect((await upload(a, html, 'page.html')).status).toBe(415);
    });

    it('rejects empty files, binary data posing as text, and corrupt images', async () => {
      const { a } = await pair();
      expect((await upload(a, Buffer.alloc(0), 'empty.txt')).status).toBe(415);
      expect((await upload(a, Buffer.from([0, 1, 2, 3, 255, 254]), 'data.txt')).status).toBe(415);
      const corrupt = Buffer.concat([(await png()).subarray(0, 40), Buffer.alloc(20, 7)]);
      expect((await upload(a, corrupt, 'broken.png')).status).toBe(415);
    });

    it('enforces the size limit with a 413', async () => {
      const { a } = await pair();
      const big = Buffer.concat([PDF, Buffer.alloc(250_000, 65)]);
      const res = await upload(a, big, 'big.pdf');
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    });

    it('requires authentication and a file', async () => {
      const anon = createClient(ctx.app);
      expect((await anon.upload('/api/attachments', PDF, 'x.pdf')).status).toBe(401);
      const { a } = await pair();
      const none = await a.client.post('/api/attachments', {});
      expect(none.status).toBe(415);
    });

    it('sanitises path segments and control characters in the file name', async () => {
      const { a } = await pair();
      const res = await upload(a, PDF, '../../etc/pass"wd.pdf');
      expect(res.status).toBe(201);
      expect(res.body.attachment.name).toBe('passwd.pdf');
    });
  });

  describe('sending and downloading', () => {
    it('sends a message with an attachment and serves it to members only', async () => {
      const { a, b, id } = await pair();
      const outsider = await signUp(ctx.app, 'out');
      const source = await png(300, 200);
      const uploaded = await upload(a, source, 'pic.png');
      const attachmentId = uploaded.body.attachment.id;

      const sent = await a.client.post(`/api/conversations/${id}/messages`, {
        clientId: cid(),
        body: 'look',
        attachmentId,
      });
      expect(sent.status).toBe(201);
      expect(sent.body.message.attachment.id).toBe(attachmentId);

      for (const member of [a, b]) {
        const res = await member.client.get(`/api/attachments/${attachmentId}`).buffer(true);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/image\/png/);
        expect(res.headers['content-disposition']).toBe('inline');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['content-security-policy']).toContain('sandbox');
        expect(res.headers['cache-control']).toContain('private');
        expect(Buffer.compare(res.body, source)).toBe(0);
      }
      const thumb = await b.client.get(`/api/attachments/${attachmentId}/thumbnail`).buffer(true);
      expect(thumb.status).toBe(200);
      expect(thumb.headers['content-type']).toMatch(/image\/webp/);

      expect((await outsider.client.get(`/api/attachments/${attachmentId}`)).status).toBe(404);
      expect((await outsider.client.get(`/api/attachments/${attachmentId}/thumbnail`)).status).toBe(
        404,
      );
      expect((await createClient(ctx.app).get(`/api/attachments/${attachmentId}`)).status).toBe(
        401,
      );
    });

    it('forces download for non-image files', async () => {
      const { a, id } = await pair();
      const uploaded = await upload(a, PDF, 'invoice.pdf');
      await a.client.post(`/api/conversations/${id}/messages`, {
        clientId: cid(),
        attachmentId: uploaded.body.attachment.id,
      });
      const res = await a.client
        .get(`/api/attachments/${uploaded.body.attachment.id}`)
        .buffer(true);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="?invoice\.pdf"?/);
      expect(res.headers['content-type']).toMatch(/application\/pdf/);
    });

    it('does not serve an upload that no message references yet', async () => {
      const { a } = await pair();
      const uploaded = await upload(a, PDF, 'pending.pdf');
      const res = await a.client.get(`/api/attachments/${uploaded.body.attachment.id}`);
      expect(res.status).toBe(404);
    });

    it('lets only the uploader attach a file, and only once', async () => {
      const { a, b, id } = await pair();
      const uploaded = await upload(a, PDF, 'mine.pdf');
      const attachmentId = uploaded.body.attachment.id;

      const stolen = await b.client.post(`/api/conversations/${id}/messages`, {
        clientId: cid(),
        attachmentId,
      });
      expect(stolen.status).toBe(400);

      const first = await a.client.post(`/api/conversations/${id}/messages`, {
        clientId: cid(),
        attachmentId,
      });
      expect(first.status).toBe(201);
      const second = await a.client.post(`/api/conversations/${id}/messages`, {
        clientId: cid(),
        attachmentId,
      });
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('ATTACHMENT_IN_USE');
    });

    it('an attachment-only message needs no body; an unknown attachment id is rejected', async () => {
      const { a, id } = await pair();
      const uploaded = await upload(a, PDF, 'only.pdf');
      const ok = await a.client.post(`/api/conversations/${id}/messages`, {
        clientId: cid(),
        attachmentId: uploaded.body.attachment.id,
      });
      expect(ok.status).toBe(201);
      expect(ok.body.message.body).toBe('');
      const unknown = await a.client.post(`/api/conversations/${id}/messages`, {
        clientId: cid(),
        attachmentId: '00000000-0000-4000-8000-000000000000',
      });
      expect(unknown.status).toBe(400);
    });

    it('shows the attachment name in the conversation preview', async () => {
      const { a, b, id } = await pair();
      const uploaded = await upload(a, PDF, 'preview.pdf');
      await a.client.post(`/api/conversations/${id}/messages`, {
        clientId: cid(),
        attachmentId: uploaded.body.attachment.id,
      });
      const list = await b.client.get('/api/conversations');
      expect(list.body.conversations[0].lastMessage).toMatchObject({
        attachmentName: 'preview.pdf',
        attachmentKind: 'file',
      });
    });

    it('deleting a message removes the attachment record and its files', async () => {
      const { a, id } = await pair();
      const uploaded = await upload(a, await png(), 'gone.png');
      const attachmentId = uploaded.body.attachment.id;
      const row = await ctx.container.attachmentsRepository.findById(attachmentId);
      const sent = await a.client.post(`/api/conversations/${id}/messages`, {
        clientId: cid(),
        attachmentId,
      });
      expect(existsSync(storageFile(row.storageKey))).toBe(true);

      await a.client.delete(`/api/messages/${sent.body.message.id}`);
      expect(await ctx.container.attachmentsRepository.findById(attachmentId)).toBeNull();
      expect(existsSync(storageFile(row.storageKey))).toBe(false);
      expect(existsSync(storageFile(row.thumbnailKey))).toBe(false);
      expect((await a.client.get(`/api/attachments/${attachmentId}`)).status).toBe(404);
    });
  });

  describe('orphan cleanup', () => {
    it('removes old unsent uploads and keeps recent and attached ones', async () => {
      const { a, id } = await pair();
      const orphan = await upload(a, PDF, 'orphan.pdf');
      const recent = await upload(a, PDF, 'recent.pdf');
      const attached = await upload(a, PDF, 'attached.pdf');
      await a.client.post(`/api/conversations/${id}/messages`, {
        clientId: cid(),
        attachmentId: attached.body.attachment.id,
      });

      const { attachmentsRepository } = ctx.container;
      const orphanRow = await attachmentsRepository.findById(orphan.body.attachment.id);
      const attachedRow = await attachmentsRepository.findById(attached.body.attachment.id);
      const longAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
      await ctx.database.client.execute({
        sql: 'UPDATE attachments SET created_at = ? WHERE id IN (?, ?)',
        args: [longAgo.getTime(), orphanRow.id, attachedRow.id],
      });

      const removed = await ctx.container.attachmentsService.cleanupOrphans();
      expect(removed).toBe(1);
      expect(await attachmentsRepository.findById(orphanRow.id)).toBeNull();
      expect(existsSync(storageFile(orphanRow.storageKey))).toBe(false);
      expect(await attachmentsRepository.findById(recent.body.attachment.id)).not.toBeNull();
      expect(await attachmentsRepository.findById(attachedRow.id)).not.toBeNull();
    });
  });

  describe('avatars', () => {
    it('sets a square WebP avatar, serves it to signed-in users, and clears it', async () => {
      const me = await signUp(ctx.app);
      const viewer = await signUp(ctx.app);
      const res = await me.client.upload('/api/users/me/avatar', await png(500, 300), 'me.png', {
        method: 'put',
      });
      expect(res.status).toBe(200);
      expect(res.body.user.avatarUrl).toContain(`/api/users/${me.id}/avatar`);

      const served = await viewer.client.get(res.body.user.avatarUrl).buffer(true);
      expect(served.status).toBe(200);
      expect(served.headers['content-type']).toMatch(/image\/webp/);
      const meta = await sharp(served.body).metadata();
      expect([meta.width, meta.height]).toEqual([256, 256]);

      expect((await createClient(ctx.app).get(res.body.user.avatarUrl)).status).toBe(401);

      const cleared = await me.client.delete('/api/users/me/avatar');
      expect(cleared.body.user.avatarUrl).toBeNull();
      expect((await viewer.client.get(`/api/users/${me.id}/avatar`)).status).toBe(404);
    });

    it('rejects non-image avatars', async () => {
      const me = await signUp(ctx.app);
      const res = await me.client.upload('/api/users/me/avatar', PDF, 'me.pdf', { method: 'put' });
      expect(res.status).toBe(415);
    });

    it('lets only group admins change the group avatar; members can still view it', async () => {
      const [owner, member] = await Promise.all([signUp(ctx.app), signUp(ctx.app)]);
      const outsider = await signUp(ctx.app);
      const created = await owner.client.post('/api/conversations/group', {
        name: 'Pic',
        memberIds: [member.id],
      });
      const id = created.body.conversation.id;
      const denied = await member.client.upload(
        `/api/conversations/${id}/avatar`,
        await png(),
        'g.png',
        {
          method: 'put',
        },
      );
      expect(denied.status).toBe(403);
      const ok = await owner.client.upload(
        `/api/conversations/${id}/avatar`,
        await png(),
        'g.png',
        {
          method: 'put',
        },
      );
      expect(ok.status).toBe(204);
      expect((await member.client.get(`/api/conversations/${id}/avatar`)).status).toBe(200);
      expect((await outsider.client.get(`/api/conversations/${id}/avatar`)).status).toBe(404);
      const detail = await member.client.get(`/api/conversations/${id}`);
      expect(detail.body.conversation.avatarUrl).toContain(`/api/conversations/${id}/avatar`);
    });
  });
});

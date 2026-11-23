import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { createClient, createTestApp, signUp } from './helpers/test-app.js';

const ORIGIN = 'https://acct.r2.cloudflarestorage.com';

/** In-memory stand-in for a cloud driver: records objects and returns signed-looking URLs. */
function fakeCloudStorage() {
  const objects = new Map();
  return {
    objects,
    redirectCacheSeconds: 140,
    async put(key, buffer, options) {
      objects.set(key, { size: buffer.length, ...options });
    },
    async get() {
      throw new Error('the server must not stream bytes when a signed URL is available');
    },
    async delete(key) {
      objects.delete(key);
    },
    async signedUrl(key, { filename, contentType, inline }) {
      const url = new URL(`${ORIGIN}/bucket/${key}`);
      url.searchParams.set('X-Amz-Signature', 'test');
      url.searchParams.set('type', contentType ?? '');
      url.searchParams.set('inline', String(Boolean(inline)));
      url.searchParams.set('name', filename ?? '');
      return url.toString();
    },
  };
}

describe('attachments with cloud storage (signed URLs)', () => {
  let ctx;
  let storage;
  beforeAll(async () => {
    storage = fakeCloudStorage();
    ctx = await createTestApp(
      {
        STORAGE_DRIVER: 'r2',
        R2_ACCOUNT_ID: 'acct',
        R2_ACCESS_KEY_ID: 'a',
        R2_SECRET_ACCESS_KEY: 'b',
        R2_BUCKET: 'bucket',
      },
      { storage },
    );
  });
  afterAll(() => ctx.cleanup());

  async function conversationWithImage() {
    const [a, b, outsider] = await Promise.all([
      signUp(ctx.app, 'a'),
      signUp(ctx.app, 'b'),
      signUp(ctx.app, 'o'),
    ]);
    const direct = await a.client.post('/api/conversations/direct', { userId: b.id });
    const id = direct.body.conversation.id;
    const image = await sharp({
      create: { width: 60, height: 40, channels: 3, background: '#808080' },
    })
      .png()
      .toBuffer();
    const uploaded = await a.client.upload('/api/attachments', image, 'photo.png');
    const attachmentId = uploaded.body.attachment.id;
    await a.client.post(`/api/conversations/${id}/messages`, {
      clientId: `cloud-${Date.now()}`,
      body: '',
      attachmentId,
    });
    return { a, b, outsider, attachmentId };
  }

  it('stores the file and its thumbnail with their content types', async () => {
    await conversationWithImage();
    const types = [...storage.objects.values()].map((object) => object.contentType);
    expect(types).toContain('image/png');
    expect(types).toContain('image/webp');
  });

  it('redirects members to a signed URL with a short cache lifetime and no bytes from the server', async () => {
    const { a, b, attachmentId } = await conversationWithImage();
    for (const member of [a, b]) {
      const res = await member.client.get(`/api/attachments/${attachmentId}`).redirects(0);
      expect(res.status).toBe(302);
      const location = new URL(res.headers.location);
      expect(location.origin).toBe(ORIGIN);
      expect(location.searchParams.get('type')).toBe('image/png');
      expect(location.searchParams.get('inline')).toBe('true');
      expect(res.headers['cache-control']).toBe('private, max-age=140');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
    }
    const thumb = await a.client.get(`/api/attachments/${attachmentId}/thumbnail`).redirects(0);
    expect(thumb.status).toBe(302);
    expect(new URL(thumb.headers.location).searchParams.get('type')).toBe('image/webp');
  });

  it('never reveals a signed URL to non-members or signed-out visitors', async () => {
    const { outsider, attachmentId } = await conversationWithImage();
    const denied = await outsider.client.get(`/api/attachments/${attachmentId}`).redirects(0);
    expect(denied.status).toBe(404);
    expect(denied.headers.location).toBeUndefined();
    const anonymous = await createClient(ctx.app).get(`/api/attachments/${attachmentId}`);
    expect(anonymous.status).toBe(401);
  });

  it('redirects avatar requests to a signed URL as well', async () => {
    const user = await signUp(ctx.app, 'av');
    const image = await sharp({
      create: { width: 300, height: 300, channels: 3, background: '#404040' },
    })
      .png()
      .toBuffer();
    const set = await user.client.upload('/api/users/me/avatar', image, 'me.png', {
      method: 'put',
    });
    expect(set.status).toBe(200);
    const viewer = await signUp(ctx.app, 'vw');
    const res = await viewer.client.get(`/api/users/${user.id}/avatar`).redirects(0);
    expect(res.status).toBe(302);
    expect(new URL(res.headers.location).searchParams.get('type')).toBe('image/webp');
  });

  it('lets the browser load images and media from the storage origin, and nothing else', async () => {
    const res = await createClient(ctx.app).get('/api/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toMatch(new RegExp(`img-src[^;]*${ORIGIN.replace(/\./g, '\\.')}`));
    expect(csp).toMatch(new RegExp(`media-src[^;]*${ORIGIN.replace(/\./g, '\\.')}`));
    expect(csp).not.toMatch(new RegExp(`script-src[^;]*${ORIGIN.replace(/\./g, '\\.')}`));
  });
});

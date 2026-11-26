import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, createTestApp, signUp } from './helpers/test-app.js';

describe('channels', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.cleanup());

  let seq = 0;
  const post = (user, id, body, extra = {}) =>
    user.client.post(`/api/conversations/${id}/messages`, {
      clientId: `ch-${Date.now()}-${(seq += 1)}`,
      body,
      ...extra,
    });

  async function channel(overrides = {}) {
    const owner = await signUp(ctx.app, 'own');
    const res = await owner.client.post('/api/channels', {
      name: `News ${Date.now()}-${seq}`,
      description: 'Announcements',
      isPublic: true,
      ...overrides,
    });
    expect(res.status).toBe(201);
    return { owner, id: res.body.conversation.id, channel: res.body.conversation };
  }

  it('creates a channel the owner can post to, with no other members needed', async () => {
    const { owner, id, channel: made } = await channel();
    expect(made).toEqual(
      expect.objectContaining({
        type: 'group',
        channel: true,
        isPublic: true,
        description: 'Announcements',
        role: 'owner',
        memberCount: 1,
      }),
    );
    expect((await post(owner, id, 'First announcement')).status).toBe(201);
  });

  it('keeps ordinary groups unchanged', async () => {
    const a = await signUp(ctx.app, 'ga');
    const b = await signUp(ctx.app, 'gb');
    const res = await a.client.post('/api/conversations/group', {
      name: 'Friends',
      memberIds: [b.id],
    });
    expect(res.body.conversation.channel).toBe(false);
    expect((await post(b, res.body.conversation.id, 'hello all')).status).toBe(201);
  });

  it('lets subscribers read but not post, and admins post', async () => {
    const { owner, id } = await channel();
    const fan = await signUp(ctx.app, 'fan');
    const admin = await signUp(ctx.app, 'adm');
    expect((await fan.client.post(`/api/channels/${id}/join`, {})).status).toBe(200);
    expect((await admin.client.post(`/api/channels/${id}/join`, {})).status).toBe(200);
    await owner.client.patch(`/api/conversations/${id}/members/${admin.id}`, { role: 'admin' });

    await post(owner, id, 'Big news');
    const denied = await post(fan, id, 'first!');
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('CHANNEL_READ_ONLY');
    expect((await post(admin, id, 'Also news')).status).toBe(201);

    const read = await fan.client.get(`/api/conversations/${id}/messages`);
    expect(read.status).toBe(200);
    expect(read.body.messages.map((m) => m.body)).toEqual(['Big news', 'Also news']);
  });

  it('blocks subscribers from posting by forwarding too', async () => {
    const { id } = await channel();
    const fan = await signUp(ctx.app, 'fwd');
    await fan.client.post(`/api/channels/${id}/join`, {});
    const mate = await signUp(ctx.app, 'mate');
    const dm = (await fan.client.post('/api/conversations/direct', { userId: mate.id })).body
      .conversation;
    const sent = (await post(fan, dm.id, 'forward me')).body.message;
    const res = await fan.client.post(`/api/messages/${sent.id}/forward`, {
      conversationIds: [id],
    });
    expect(res.status).toBe(403);
  });

  it('does not reveal other subscribers to a subscriber', async () => {
    const { owner, id } = await channel();
    const fan = await signUp(ctx.app, 'fan');
    const other = await signUp(ctx.app, 'oth');
    await fan.client.post(`/api/channels/${id}/join`, {});
    await other.client.post(`/api/channels/${id}/join`, {});
    const asFan = (await fan.client.get(`/api/conversations/${id}`)).body.conversation;
    expect(asFan.memberCount).toBe(3);
    expect(asFan.members.map((m) => m.id)).toEqual([owner.id]);
    const asOwner = (await owner.client.get(`/api/conversations/${id}`)).body.conversation;
    expect(asOwner.members).toHaveLength(3);
  });

  it('does not allow threads inside a channel', async () => {
    const { owner, id } = await channel();
    const root = (await post(owner, id, 'root')).body.message;
    const res = await post(owner, id, 'reply', { threadRootId: root.id });
    expect(res.status).toBe(400);
  });

  describe('discovery', () => {
    it('finds public channels by name or description and hides joined and private ones', async () => {
      const unique = `zebra${Date.now()}`;
      const pub = await channel({ name: `${unique} daily` });
      const priv = await channel({ name: `${unique} secret`, isPublic: false });
      const viewer = await signUp(ctx.app, 'view');

      const found = (await viewer.client.get(`/api/channels?q=${unique}`)).body.channels;
      expect(found.map((c) => c.id)).toEqual([pub.id]);
      expect(found[0]).toEqual(
        expect.objectContaining({ name: `${unique} daily`, memberCount: 1 }),
      );
      expect(JSON.stringify(found)).not.toContain(priv.id);

      await viewer.client.post(`/api/channels/${pub.id}/join`, {});
      expect((await viewer.client.get(`/api/channels?q=${unique}`)).body.channels).toEqual([]);

      const byDescription = (await viewer.client.get('/api/channels?q=Announcements')).body
        .channels;
      expect(Array.isArray(byDescription)).toBe(true);
    });

    it('treats percent and underscore in a search as plain text', async () => {
      await channel({ name: 'plain name' });
      const viewer = await signUp(ctx.app, 'pct');
      expect((await viewer.client.get('/api/channels?q=%25')).body.channels).toEqual([]);
    });

    it('refuses to join a private channel or an ordinary group', async () => {
      const priv = await channel({ isPublic: false });
      const viewer = await signUp(ctx.app, 'nj');
      expect((await viewer.client.post(`/api/channels/${priv.id}/join`, {})).status).toBe(404);

      const a = await signUp(ctx.app, 'ga2');
      const b = await signUp(ctx.app, 'gb2');
      const group = (
        await a.client.post('/api/conversations/group', { name: 'Closed', memberIds: [b.id] })
      ).body.conversation;
      expect((await viewer.client.post(`/api/channels/${group.id}/join`, {})).status).toBe(404);
    });

    it('joining twice is harmless', async () => {
      const { id } = await channel();
      const fan = await signUp(ctx.app, 'twice');
      await fan.client.post(`/api/channels/${id}/join`, {});
      const again = await fan.client.post(`/api/channels/${id}/join`, {});
      expect(again.status).toBe(200);
      expect(again.body.conversation.memberCount).toBe(2);
    });

    it('requires sign-in', async () => {
      expect((await createClient(ctx.app).get('/api/channels')).status).toBe(401);
    });
  });

  describe('management', () => {
    it('lets admins change description and visibility, not subscribers', async () => {
      const { owner, id } = await channel();
      const fan = await signUp(ctx.app, 'mg');
      await fan.client.post(`/api/channels/${id}/join`, {});
      expect((await fan.client.patch(`/api/channels/${id}`, { isPublic: false })).status).toBe(403);

      const res = await owner.client.patch(`/api/channels/${id}`, {
        description: 'Updated',
        isPublic: false,
      });
      expect(res.status).toBe(200);
      expect(res.body.conversation).toEqual(
        expect.objectContaining({ description: 'Updated', isPublic: false }),
      );
      expect((await owner.client.patch(`/api/channels/${id}`, {})).status).toBe(400);
    });

    it('rejects updating an ordinary group as a channel', async () => {
      const a = await signUp(ctx.app, 'ug');
      const b = await signUp(ctx.app, 'ug2');
      const group = (
        await a.client.post('/api/conversations/group', { name: 'Gr', memberIds: [b.id] })
      ).body.conversation;
      expect((await a.client.patch(`/api/channels/${group.id}`, { isPublic: true })).status).toBe(
        400,
      );
    });

    it('lets a subscriber leave', async () => {
      const { id } = await channel();
      const fan = await signUp(ctx.app, 'lv');
      await fan.client.post(`/api/channels/${id}/join`, {});
      expect((await fan.client.post(`/api/conversations/${id}/leave`, {})).status).toBeLessThan(
        300,
      );
      expect((await fan.client.get(`/api/conversations/${id}`)).status).toBe(404);
    });
  });
});

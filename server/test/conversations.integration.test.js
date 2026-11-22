import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, createTestApp, signUp } from './helpers/test-app.js';

describe('user search', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.cleanup());

  it('requires authentication and a minimum query length', async () => {
    const anon = await createClient(ctx.app).get('/api/users?q=ab');
    expect(anon.status).toBe(401);
    const me = await signUp(ctx.app);
    const short = await me.client.get('/api/users?q=a');
    expect(short.status).toBe(400);
  });

  it('finds other users, excludes the caller, and never leaks private fields', async () => {
    const me = await signUp(ctx.app, 'searcher');
    const other = await signUp(ctx.app, 'findable');
    const res = await me.client.get('/api/users?q=findable');
    expect(res.status).toBe(200);
    expect(res.body.users.map((u) => u.id)).toEqual([other.id]);
    expect(res.body.users[0]).not.toHaveProperty('email');
    expect(res.body.users[0]).not.toHaveProperty('passwordHash');
    const self = await me.client.get('/api/users?q=searcher');
    expect(self.body.users).toEqual([]);
  });

  it('treats LIKE wildcards in the query as literal text', async () => {
    const me = await signUp(ctx.app, 'wild');
    await signUp(ctx.app, 'plain');
    const res = await me.client.get('/api/users?q=%25%25');
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
  });
});

describe('direct conversations', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.cleanup());

  it('creates once and returns the same conversation from either side', async () => {
    const a = await signUp(ctx.app, 'a');
    const b = await signUp(ctx.app, 'b');
    const first = await a.client.post('/api/conversations/direct', { userId: b.id });
    expect(first.status).toBe(201);
    expect(first.body.conversation.type).toBe('direct');
    expect(first.body.conversation.counterpart.id).toBe(b.id);

    const again = await a.client.post('/api/conversations/direct', { userId: b.id });
    expect(again.status).toBe(200);
    expect(again.body.conversation.id).toBe(first.body.conversation.id);

    const reverse = await b.client.post('/api/conversations/direct', { userId: a.id });
    expect(reverse.status).toBe(200);
    expect(reverse.body.conversation.id).toBe(first.body.conversation.id);
    expect(reverse.body.conversation.counterpart.id).toBe(a.id);
  });

  it('is race-safe: concurrent creation yields a single conversation', async () => {
    const a = await signUp(ctx.app, 'ra');
    const b = await signUp(ctx.app, 'rb');
    const results = await Promise.all([
      a.client.post('/api/conversations/direct', { userId: b.id }),
      b.client.post('/api/conversations/direct', { userId: a.id }),
      a.client.post('/api/conversations/direct', { userId: b.id }),
    ]);
    results.forEach((res) => expect([200, 201]).toContain(res.status));
    expect(new Set(results.map((res) => res.body.conversation.id)).size).toBe(1);
    const list = await a.client.get('/api/conversations');
    expect(list.body.conversations).toHaveLength(1);
  });

  it('rejects messaging yourself and unknown users', async () => {
    const a = await signUp(ctx.app);
    const self = await a.client.post('/api/conversations/direct', { userId: a.id });
    expect(self.status).toBe(400);
    const unknown = await a.client.post('/api/conversations/direct', {
      userId: '00000000-0000-4000-8000-000000000000',
    });
    expect(unknown.status).toBe(404);
  });

  it('cannot be left, but can be archived and muted per user', async () => {
    const a = await signUp(ctx.app);
    const b = await signUp(ctx.app);
    const { body } = await a.client.post('/api/conversations/direct', { userId: b.id });
    const id = body.conversation.id;

    const leave = await a.client.post(`/api/conversations/${id}/leave`, {});
    expect(leave.status).toBe(400);

    const archived = await a.client.put(`/api/conversations/${id}/preferences`, {
      archived: true,
      muted: true,
    });
    expect(archived.status).toBe(200);
    expect(archived.body.conversation.archived).toBe(true);
    expect(archived.body.conversation.muted).toBe(true);

    const theirs = await b.client.get(`/api/conversations/${id}`);
    expect(theirs.body.conversation.archived).toBe(false);
    expect(theirs.body.conversation.muted).toBe(false);

    const empty = await a.client.put(`/api/conversations/${id}/preferences`, {});
    expect(empty.status).toBe(400);
  });
});

describe('group conversations', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.cleanup());

  async function makeGroup(owner, members, name = 'Team') {
    const res = await owner.client.post('/api/conversations/group', {
      name,
      memberIds: members.map((m) => m.id),
    });
    expect(res.status).toBe(201);
    return res.body.conversation.id;
  }

  it('creates a group with the creator as owner', async () => {
    const [owner, m1, m2] = await Promise.all([signUp(ctx.app), signUp(ctx.app), signUp(ctx.app)]);
    const id = await makeGroup(owner, [m1, m2], '  Project  ');
    const detail = await owner.client.get(`/api/conversations/${id}`);
    expect(detail.body.conversation.name).toBe('Project');
    expect(detail.body.conversation.memberCount).toBe(3);
    expect(detail.body.conversation.role).toBe('owner');
    const roles = Object.fromEntries(detail.body.conversation.members.map((m) => [m.id, m.role]));
    expect(roles[owner.id]).toBe('owner');
    expect(roles[m1.id]).toBe('member');
    const memberView = await m1.client.get(`/api/conversations/${id}`);
    expect(memberView.body.conversation.role).toBe('member');
  });

  it('validates name and members', async () => {
    const owner = await signUp(ctx.app);
    const other = await signUp(ctx.app);
    const noName = await owner.client.post('/api/conversations/group', {
      name: '  ',
      memberIds: [other.id],
    });
    expect(noName.status).toBe(400);
    const onlySelf = await owner.client.post('/api/conversations/group', {
      name: 'Solo',
      memberIds: [owner.id],
    });
    expect(onlySelf.status).toBe(400);
    const ghost = await owner.client.post('/api/conversations/group', {
      name: 'Ghost',
      memberIds: ['00000000-0000-4000-8000-000000000000'],
    });
    expect(ghost.status).toBe(400);
  });

  it('hides conversations from non-members with 404 on every endpoint', async () => {
    const [owner, member, outsider] = await Promise.all([
      signUp(ctx.app),
      signUp(ctx.app),
      signUp(ctx.app),
    ]);
    const id = await makeGroup(owner, [member]);
    const base = `/api/conversations/${id}`;

    expect((await outsider.client.get(base)).status).toBe(404);
    expect((await outsider.client.get(`${base}/messages`)).status).toBe(404);
    expect(
      (await outsider.client.post(`${base}/messages`, { clientId: 'client-aaaa-1', body: 'hi' }))
        .status,
    ).toBe(404);
    expect((await outsider.client.post(`${base}/read`, {})).status).toBe(404);
    expect((await outsider.client.patch(base, { name: 'Hacked' })).status).toBe(404);
    expect((await outsider.client.post(`${base}/members`, { userIds: [outsider.id] })).status).toBe(
      404,
    );
    expect((await outsider.client.post(`${base}/leave`, {})).status).toBe(404);
    expect((await outsider.client.put(`${base}/preferences`, { muted: true })).status).toBe(404);

    const list = await outsider.client.get('/api/conversations');
    expect(list.body.conversations).toEqual([]);
  });

  it('lets admins and the owner manage members, and members do nothing', async () => {
    const [owner, admin, member, newcomer] = await Promise.all([
      signUp(ctx.app),
      signUp(ctx.app),
      signUp(ctx.app),
      signUp(ctx.app),
    ]);
    const id = await makeGroup(owner, [admin, member]);
    const base = `/api/conversations/${id}`;

    const promote = await owner.client.patch(`${base}/members/${admin.id}`, { role: 'admin' });
    expect(promote.status).toBe(200);

    const memberAdds = await member.client.post(`${base}/members`, { userIds: [newcomer.id] });
    expect(memberAdds.status).toBe(403);
    const memberRenames = await member.client.patch(base, { name: 'Nope' });
    expect(memberRenames.status).toBe(403);

    const adminAdds = await admin.client.post(`${base}/members`, { userIds: [newcomer.id] });
    expect(adminAdds.status).toBe(200);
    expect(adminAdds.body.conversation.memberCount).toBe(4);

    const adminRenames = await admin.client.patch(base, { name: 'Renamed' });
    expect(adminRenames.body.conversation.name).toBe('Renamed');

    const adminPromotes = await admin.client.patch(`${base}/members/${member.id}`, {
      role: 'admin',
    });
    expect(adminPromotes.status).toBe(403);

    const removeOwner = await admin.client.delete(`${base}/members/${owner.id}`);
    expect(removeOwner.status).toBe(403);
    const removeMember = await admin.client.delete(`${base}/members/${member.id}`);
    expect(removeMember.status).toBe(200);
    expect(removeMember.body.conversation.memberCount).toBe(3);
    expect((await member.client.get(base)).status).toBe(404);
  });

  it('prevents an admin from removing another admin, but not the owner from doing so', async () => {
    const [owner, a1, a2] = await Promise.all([signUp(ctx.app), signUp(ctx.app), signUp(ctx.app)]);
    const id = await makeGroup(owner, [a1, a2]);
    const base = `/api/conversations/${id}`;
    await owner.client.patch(`${base}/members/${a1.id}`, { role: 'admin' });
    await owner.client.patch(`${base}/members/${a2.id}`, { role: 'admin' });
    expect((await a1.client.delete(`${base}/members/${a2.id}`)).status).toBe(403);
    expect((await owner.client.delete(`${base}/members/${a2.id}`)).status).toBe(200);
  });

  it('transfers ownership to an admin when the owner leaves', async () => {
    const [owner, admin, member] = await Promise.all([
      signUp(ctx.app),
      signUp(ctx.app),
      signUp(ctx.app),
    ]);
    const id = await makeGroup(owner, [member, admin]);
    const base = `/api/conversations/${id}`;
    await owner.client.patch(`${base}/members/${admin.id}`, { role: 'admin' });

    expect((await owner.client.post(`${base}/leave`, {})).status).toBe(204);
    expect((await owner.client.get(base)).status).toBe(404);
    const detail = await admin.client.get(base);
    expect(detail.body.conversation.role).toBe('owner');
    expect(detail.body.conversation.memberCount).toBe(2);
  });

  it('deletes a group when its last member leaves', async () => {
    const [owner, member] = await Promise.all([signUp(ctx.app), signUp(ctx.app)]);
    const id = await makeGroup(owner, [member]);
    await member.client.post(`/api/conversations/${id}/leave`, {});
    await owner.client.post(`/api/conversations/${id}/leave`, {});
    const row = await ctx.container.conversationsRepository.findById(id);
    expect(row).toBeNull();
  });

  it('validates ids in paths', async () => {
    const a = await signUp(ctx.app);
    const res = await a.client.get('/api/conversations/not-a-uuid');
    expect(res.status).toBe(400);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const socket = new EventEmitter();
socket.connected = true;
const sent = [];
const { getIceConfig } = vi.hoisted(() => ({ getIceConfig: vi.fn() }));
const defaultTimeout = () => ({
  emitWithAck: async (event, payload) => {
    sent.push({ event, payload });
    if (event === 'call:invite') {
      return {
        ok: true,
        call: { id: 'c1', callerId: 'me', calleeId: 'you', video: payload.video },
      };
    }
    return { ok: true };
  },
});

vi.mock('../src/lib/socket.js', () => ({ getSocket: () => socket }));
vi.mock('../src/lib/ringtone.js', () => ({ startRinging: vi.fn(), stopRinging: vi.fn() }));
vi.mock('../src/lib/api.js', () => ({
  api: { get: getIceConfig },
}));

class FakeTrack {
  constructor(kind) {
    this.kind = kind;
    this.enabled = true;
    this.stopped = false;
  }
  stop() {
    this.stopped = true;
  }
}
class FakeStream {
  constructor(tracks = []) {
    this.tracks = tracks;
  }
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }
}
let connection;
class FakePC {
  constructor(config) {
    this.config = config;
    this.added = [];
    this.candidates = [];
    this.closed = false;
    connection = this;
  }
  addTrack(track) {
    this.added.push(track);
  }
  async createOffer() {
    return { type: 'offer', sdp: 'offer-sdp' };
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'answer-sdp' };
  }
  async setLocalDescription(description) {
    this.localDescription = { ...description, toJSON: () => description };
  }
  async setRemoteDescription(description) {
    this.remoteDescription = description;
  }
  async addIceCandidate(candidate) {
    this.candidates.push(candidate);
  }
  close() {
    this.closed = true;
  }
}

socket.timeout = defaultTimeout;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
let calls;
let streams;

beforeEach(async () => {
  vi.resetModules();
  sent.length = 0;
  getIceConfig.mockReset();
  getIceConfig.mockResolvedValue({ iceServers: [{ urls: ['stun:example'] }] });
  socket.timeout = defaultTimeout;
  socket.removeAllListeners();
  streams = [];
  globalThis.RTCPeerConnection = FakePC;
  globalThis.MediaStream = FakeStream;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: vi.fn(async (constraints) => {
          const stream = new FakeStream([
            new FakeTrack('audio'),
            ...(constraints.video ? [new FakeTrack('video')] : []),
          ]);
          streams.push(stream);
          return stream;
        }),
      },
    },
  });
  calls = await import('../src/lib/calls.js');
  calls.bindCalls(socket, 'me');
});
afterEach(() => calls.resetCalls());

describe('calls (caller)', () => {
  it('rings, then offers when answered, and connects', async () => {
    await calls.startCall('conv', true);
    expect(calls.useCall.getState().phase).toBe('ringing-out');
    expect(sent[0]).toEqual({
      event: 'call:invite',
      payload: { conversationId: 'conv', video: true },
    });

    socket.emit('call:accepted', { call: { id: 'c1', callerId: 'me', calleeId: 'you' } });
    await tick();
    await tick();
    expect(calls.useCall.getState().phase).toBe('connecting');
    expect(connection.added).toHaveLength(2);
    const offer = sent.find((s) => s.event === 'call:signal');
    expect(offer.payload.data.description.type).toBe('offer');

    socket.emit('call:signal', {
      callId: 'c1',
      data: { description: { type: 'answer', sdp: 'x' } },
    });
    await tick();
    expect(connection.remoteDescription.type).toBe('answer');
  });

  it('queues candidates that arrive before the description', async () => {
    await calls.startCall('conv', false);
    socket.emit('call:accepted', { call: { id: 'c1', callerId: 'me', calleeId: 'you' } });
    await tick();
    await tick();
    socket.emit('call:signal', { callId: 'c1', data: { candidate: { candidate: 'a' } } });
    await tick();
    expect(connection.candidates).toHaveLength(0);
    socket.emit('call:signal', {
      callId: 'c1',
      data: { description: { type: 'answer', sdp: 'x' } },
    });
    await tick();
    await tick();
    expect(connection.candidates).toEqual([{ candidate: 'a' }]);
  });

  it('cleans up and explains when the other side declines', async () => {
    await calls.startCall('conv', false);
    const local = streams[0];
    socket.emit('call:ended', {
      call: { id: 'c1' },
      reason: 'declined',
      endedBy: 'you',
    });
    const state = calls.useCall.getState();
    expect(state.phase).toBe('idle');
    expect(state.notice).toBe('Call declined');
    expect(local.getTracks().every((t) => t.stopped)).toBe(true);
  });

  it('releases the microphone and reports it when the invite is refused', async () => {
    socket.timeout = () => ({
      emitWithAck: async () => ({ ok: false, error: { message: 'They are on another call' } }),
    });
    await expect(calls.startCall('conv', false)).rejects.toThrow('They are on another call');
    expect(calls.useCall.getState().phase).toBe('idle');
    expect(streams[0].getTracks().every((t) => t.stopped)).toBe(true);
  });

  it('explains a denied microphone', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn(async () => {
      throw Object.assign(new Error('x'), { name: 'NotAllowedError' });
    });
    await expect(calls.startCall('conv', false)).rejects.toThrow('Allow microphone access');
    expect(calls.useCall.getState().phase).toBe('idle');
  });

  it('shows ICE configuration errors instead of failing silently', async () => {
    await calls.startCall('conv', false);
    getIceConfig.mockRejectedValueOnce(new Error('ICE settings are unavailable'));
    socket.emit('call:accepted', { call: { id: 'c1', callerId: 'me', calleeId: 'you' } });
    await tick();

    expect(calls.useCall.getState().phase).toBe('idle');
    expect(calls.useCall.getState().notice).toContain('ICE settings are unavailable');
    expect(streams[0].getTracks().every((track) => track.stopped)).toBe(true);
  });
});

describe('calls (callee)', () => {
  const incoming = { id: 'c2', callerId: 'you', calleeId: 'me', video: false };

  it('shows the ring and answers an offer', async () => {
    socket.emit('call:incoming', { call: incoming });
    expect(calls.useCall.getState().phase).toBe('ringing-in');

    await calls.acceptCall();
    expect(sent.some((s) => s.event === 'call:accept')).toBe(true);
    expect(calls.useCall.getState().phase).toBe('connecting');

    socket.emit('call:signal', {
      callId: 'c2',
      data: { description: { type: 'offer', sdp: 'o' } },
    });
    await tick();
    await tick();
    expect(connection.remoteDescription.type).toBe('offer');
    const answer = sent.filter((s) => s.event === 'call:signal').at(-1);
    expect(answer.payload.data.description.type).toBe('answer');
  });

  it('ends a call cleanly when ICE settings fail while answering', async () => {
    socket.emit('call:incoming', { call: incoming });
    getIceConfig.mockRejectedValueOnce(new Error('ICE settings are unavailable'));

    await calls.acceptCall();

    expect(calls.useCall.getState().phase).toBe('idle');
    expect(calls.useCall.getState().notice).toContain('ICE settings are unavailable');
    expect(sent.some((item) => item.event === 'call:end')).toBe(true);
    expect(streams[0].getTracks().every((track) => track.stopped)).toBe(true);
  });

  it('declining tells the server and returns to idle', async () => {
    socket.emit('call:incoming', { call: incoming });
    calls.hangUp();
    expect(sent).toContainEqual({ event: 'call:end', payload: { callId: 'c2' } });
    expect(calls.useCall.getState().phase).toBe('idle');
  });

  it('stops ringing when answered on another device', async () => {
    socket.emit('call:incoming', { call: incoming });
    socket.emit('call:accepted', { call: incoming });
    expect(calls.useCall.getState().phase).toBe('idle');
  });

  it('ignores a second incoming call while busy', async () => {
    socket.emit('call:incoming', { call: incoming });
    socket.emit('call:incoming', { call: { ...incoming, id: 'c3' } });
    expect(calls.useCall.getState().call.id).toBe('c2');
  });

  it('mute and camera toggles change the tracks', async () => {
    socket.emit('call:incoming', { call: { ...incoming, video: true } });
    await calls.acceptCall();
    calls.toggleMute();
    calls.toggleCamera();
    const [stream] = streams;
    expect(stream.getAudioTracks()[0].enabled).toBe(false);
    expect(stream.getVideoTracks()[0].enabled).toBe(false);
    calls.toggleMute();
    expect(stream.getAudioTracks()[0].enabled).toBe(true);
  });
});

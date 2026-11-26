import { create } from 'zustand';
import { api } from './api.js';
import { getSocket } from './socket.js';
import { startRinging, stopRinging } from './ringtone.js';

/**
 * One-to-one voice and video calls. The browsers talk to each other with WebRTC; the server only
 * rings, relays session descriptions and candidates, and reports when a call ends.
 *
 * phase: idle | ringing-out | ringing-in | connecting | active
 */
export const useCall = create((set) => ({
  phase: 'idle',
  call: null,
  video: false,
  muted: false,
  cameraOff: false,
  localStream: null,
  remoteStream: null,
  notice: null,
  set: (values) => set(values),
}));

const store = () => useCall.getState();

let pc = null;
let me = null;
let pendingCandidates = [];
let remoteReady = false;

const ENDED_TEXT = {
  missed: 'No answer',
  declined: 'Call declined',
  cancelled: 'Call cancelled',
  dropped: 'The call was disconnected',
  timeout: 'The call reached its time limit',
};

function emit(event, payload) {
  const socket = getSocket();
  if (!socket?.connected) {
    return Promise.resolve({ ok: false, error: { message: 'You are offline' } });
  }
  return socket.timeout(8000).emitWithAck(event, payload);
}

function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

/** Release the connection and devices and return to idle. A notice explains why, if given. */
function cleanup(notice = null) {
  stopRinging();
  if (pc) {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
    pc = null;
  }
  stopStream(store().localStream);
  pendingCandidates = [];
  remoteReady = false;
  store().set({
    phase: 'idle',
    call: null,
    video: false,
    muted: false,
    cameraOff: false,
    localStream: null,
    remoteStream: null,
    notice,
  });
}

async function openMedia(video) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Calls are not supported in this browser.');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: video ? { facingMode: 'user' } : false,
    });
  } catch (err) {
    if (err?.name === 'NotAllowedError') {
      throw new Error('Allow microphone access to make calls.', { cause: err });
    }
    if (err?.name === 'NotFoundError') {
      throw new Error('No microphone was found.', { cause: err });
    }
    throw new Error('Could not start your microphone or camera.', { cause: err });
  }
}

async function createConnection(callId) {
  let iceServers = [];
  try {
    iceServers = (await api.get('/calls/ice')).iceServers;
  } catch {
    // Without a config the browser still tries direct paths on the local network.
  }
  const connection = new RTCPeerConnection({ iceServers });
  pc = connection;
  for (const track of store().localStream.getTracks()) {
    connection.addTrack(track, store().localStream);
  }
  connection.onicecandidate = (event) => {
    emit('call:signal', {
      callId,
      data: { candidate: event.candidate ? event.candidate.toJSON() : null },
    });
  };
  connection.ontrack = (event) => {
    store().set({ remoteStream: event.streams[0] ?? new MediaStream([event.track]) });
  };
  connection.onconnectionstatechange = () => {
    if (connection !== pc) {
      return;
    }
    if (connection.connectionState === 'connected') {
      store().set({ phase: 'active' });
    } else if (connection.connectionState === 'failed') {
      hangUp('The connection failed. Check your network and try again.');
    }
  };
  return connection;
}

async function flushCandidates() {
  const queued = pendingCandidates;
  pendingCandidates = [];
  for (const candidate of queued) {
    await pc.addIceCandidate(candidate).catch(() => {});
  }
}

async function onSignal({ callId, data }) {
  const { call } = store();
  if (!call || call.id !== callId || !pc) {
    return;
  }
  if (data.description) {
    await pc.setRemoteDescription(data.description);
    remoteReady = true;
    if (data.description.type === 'offer') {
      await pc.setLocalDescription(await pc.createAnswer());
      emit('call:signal', { callId, data: { description: pc.localDescription.toJSON() } });
    }
    await flushCandidates();
  } else if (data.candidate) {
    if (remoteReady) {
      await pc.addIceCandidate(data.candidate).catch(() => {});
    } else {
      pendingCandidates.push(data.candidate);
    }
  }
}

/** Ring the other person. Rejects with a readable message when the call cannot start. */
export async function startCall(conversationId, video) {
  if (store().phase !== 'idle') {
    throw new Error('You are already in a call.');
  }
  store().set({ notice: null, phase: 'ringing-out', video });
  let stream;
  try {
    stream = await openMedia(video);
    store().set({ localStream: stream });
    const res = await emit('call:invite', { conversationId, video });
    if (!res.ok) {
      throw new Error(res.error?.message ?? 'Could not start the call.');
    }
    store().set({ call: res.call });
    startRinging('out');
  } catch (err) {
    stopStream(stream);
    cleanup();
    throw err;
  }
}

export async function acceptCall() {
  const { call, phase, video } = store();
  if (phase !== 'ringing-in' || !call) {
    return;
  }
  stopRinging();
  try {
    store().set({ localStream: await openMedia(video), phase: 'connecting' });
  } catch (err) {
    await emit('call:end', { callId: call.id });
    cleanup(err.message);
    return;
  }
  const res = await emit('call:accept', { callId: call.id });
  if (!res.ok) {
    cleanup(res.error?.message ?? 'Could not answer the call.');
    return;
  }
  await createConnection(call.id);
}

/** Decline, cancel, or hang up. */
export function hangUp(notice = null) {
  const { call } = store();
  if (call) {
    emit('call:end', { callId: call.id });
  }
  cleanup(notice);
}

export function toggleMute() {
  const { localStream, muted } = store();
  localStream?.getAudioTracks().forEach((track) => {
    track.enabled = muted;
  });
  store().set({ muted: !muted });
}

export function toggleCamera() {
  const { localStream, cameraOff } = store();
  localStream?.getVideoTracks().forEach((track) => {
    track.enabled = cameraOff;
  });
  store().set({ cameraOff: !cameraOff });
}

export function dismissCallNotice() {
  store().set({ notice: null });
}

/** Wire call events from the shared socket. Called once per socket by the realtime hook. */
export function bindCalls(socket, meId) {
  me = meId;

  socket.on('call:incoming', ({ call }) => {
    if (store().phase !== 'idle' || call.calleeId !== me) {
      return;
    }
    store().set({ phase: 'ringing-in', call, video: call.video, notice: null });
    startRinging('in');
  });

  socket.on('call:accepted', async ({ call }) => {
    const current = store();
    if (!current.call || current.call.id !== call.id) {
      return;
    }
    if (call.callerId === me && current.phase === 'ringing-out') {
      stopRinging();
      store().set({ call, phase: 'connecting' });
      try {
        const connection = await createConnection(call.id);
        await connection.setLocalDescription(await connection.createOffer());
        emit('call:signal', {
          callId: call.id,
          data: { description: connection.localDescription.toJSON() },
        });
      } catch {
        hangUp('Could not set up the call.');
      }
    } else if (call.calleeId === me && current.phase === 'ringing-in') {
      // Answered on another device or tab.
      cleanup();
    }
  });

  socket.on('call:signal', (payload) => {
    onSignal(payload).catch(() => hangUp('The call could not be connected.'));
  });

  socket.on('call:ended', ({ call, reason, endedBy }) => {
    if (store().call?.id !== call.id) {
      return;
    }
    const mine = endedBy === me;
    cleanup(mine ? null : (ENDED_TEXT[reason] ?? 'The call ended'));
  });
}

export function resetCalls() {
  me = null;
  cleanup();
}

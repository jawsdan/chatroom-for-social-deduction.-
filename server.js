const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const MAX_MSG = 500;
const MAX_HISTORY = 300;

// ---- State ----
const users = new Map(); // socketId -> { id, name }
let moderatorId = null;
let lobby = [];
const groups = new Map(); // groupId -> { id, name, members:Set<socketId>, messages:[] }
let modThreads = new Map(); // lowercase name -> [messages]  (private member <-> moderator)
let mutedNames = new Set(); // lowercase names muted until main chat reset
let phase = 'day';
let trial = null; // { accusedName, votes: Map(name -> 'guilty'|'innocent'), open, result }
const wipeVotes = { main: new Set(), mod: new Set() }; // socket ids
let nextGroupId = 1;
let nextMsgId = 1;

const key = (name) => name.toLowerCase();
const now = () => Date.now();

function msg(from, text, extra = {}) {
  return { id: nextMsgId++, from, text, ts: now(), ...extra };
}
function push(list, m) {
  list.push(m);
  if (list.length > MAX_HISTORY) list.splice(0, list.length - MAX_HISTORY);
}
function systemLobby(text) {
  const m = msg(null, text, { system: true });
  push(lobby, m);
  io.emit('lobby:message', m);
}
function isMod(socket) {
  return socket.id === moderatorId;
}
function userByName(name) {
  for (const u of users.values()) if (key(u.name) === key(name)) return u;
  return null;
}
function cleanText(t) {
  return typeof t === 'string' ? t.trim().slice(0, MAX_MSG) : '';
}

function publicState() {
  return {
    users: [...users.values()].map((u) => ({
      name: u.name,
      moderator: u.id === moderatorId,
      muted: mutedNames.has(key(u.name)),
    })),
    moderator: moderatorId && users.get(moderatorId) ? users.get(moderatorId).name : null,
    phase,
    trial: trial
      ? {
          accused: trial.accusedName,
          open: trial.open,
          result: trial.result,
          votes: [...trial.votes.entries()].map(([name, vote]) => ({ name, vote })),
          // While voting is open, only reveal who has voted, not what.
        }
      : null,
    groups: [...groups.values()].map((g) => ({
      id: g.id,
      name: g.name,
      members: [...g.members].map((id) => users.get(id)?.name).filter(Boolean),
    })),
    wipe: {
      main: wipeVotes.main.size,
      mod: wipeVotes.mod.size,
      needed: users.size,
    },
  };
}

function sanitizedTrialFor() {
  const s = publicState();
  if (s.trial && s.trial.open) {
    s.trial.votes = s.trial.votes.map((v) => ({ name: v.name, vote: 'hidden' }));
  }
  return s;
}

function broadcastState() {
  // Each user also gets their own wipe-vote flags.
  for (const [id, sock] of io.sockets.sockets) {
    if (!users.has(id)) continue;
    const s = sanitizedTrialFor();
    s.me = {
      name: users.get(id).name,
      moderator: id === moderatorId,
      muted: mutedNames.has(key(users.get(id).name)),
      wipedMain: wipeVotes.main.has(id),
      wipedMod: wipeVotes.mod.has(id),
    };
    sock.emit('state', s);
  }
}

function sendModThreads() {
  if (!moderatorId) return;
  const sock = io.sockets.sockets.get(moderatorId);
  if (!sock) return;
  const threads = {};
  for (const [k, list] of modThreads) threads[k] = list;
  sock.emit('mod:threads', threads);
}

function sendOwnThread(socket) {
  const u = users.get(socket.id);
  if (!u) return;
  socket.emit('mod:thread', modThreads.get(key(u.name)) || []);
}

function pushModThread(memberName, m) {
  const k = key(memberName);
  if (!modThreads.has(k)) modThreads.set(k, []);
  push(modThreads.get(k), m);
  const member = userByName(memberName);
  if (member) io.to(member.id).emit('mod:message', { thread: k, message: m });
  if (moderatorId && moderatorId !== member?.id) {
    io.to(moderatorId).emit('mod:message', { thread: k, message: m });
  }
}

function checkWipe(kind) {
  // Remove votes from people who left, then check for unanimity.
  for (const id of wipeVotes[kind]) if (!users.has(id)) wipeVotes[kind].delete(id);
  if (users.size === 0 || wipeVotes[kind].size < users.size) return false;
  wipeVotes[kind].clear();
  if (kind === 'main') {
    lobby = [];
    mutedNames = new Set();
    trial = null;
    phase = 'day';
    io.emit('lobby:history', []);
    systemLobby('Everyone voted. The main chat was wiped and a fresh game begins. All mutes are lifted.');
    io.emit('phase:changed', { phase, silent: true });
  } else {
    modThreads = new Map();
    for (const [id, sock] of io.sockets.sockets) {
      if (!users.has(id)) continue;
      sock.emit('mod:thread', []);
    }
    sendModThreads();
    io.emit('roles:cleared');
    systemLobby('Everyone voted. The moderator chat was wiped.');
  }
  return true;
}

function finishTrial() {
  if (!trial || !trial.open) return;
  let guilty = 0;
  let innocent = 0;
  for (const v of trial.votes.values()) v === 'guilty' ? guilty++ : innocent++;
  trial.open = false;
  trial.result = guilty > innocent ? 'guilty' : 'innocent';
  if (trial.result === 'guilty') mutedNames.add(key(trial.accusedName));
  const breakdown = [...trial.votes.entries()].map(([n, v]) => `${n}: ${v}`).join(', ') || 'no votes';
  systemLobby(
    `Trial of ${trial.accusedName} is over: ${trial.result.toUpperCase()} (${guilty} guilty / ${innocent} innocent). Votes — ${breakdown}.` +
      (trial.result === 'guilty' ? ` ${trial.accusedName} is muted and can only talk to the moderator.` : '')
  );
  io.emit('trial:result', {
    accused: trial.accusedName,
    result: trial.result,
    guilty,
    innocent,
    votes: [...trial.votes.entries()].map(([name, vote]) => ({ name, vote })),
  });
}

function eligibleVoters() {
  if (!trial) return [];
  return [...users.values()].filter(
    (u) => u.id !== moderatorId && key(u.name) !== key(trial.accusedName) && !mutedNames.has(key(u.name))
  );
}

function maybeAutoFinishTrial() {
  if (!trial || !trial.open) return;
  const voters = eligibleVoters();
  if (voters.length > 0 && voters.every((u) => trial.votes.has(u.name))) finishTrial();
}

// ---- Sockets ----
io.on('connection', (socket) => {
  socket.on('join', (rawName, ack) => {
    const name = cleanText(rawName).replace(/\s+/g, ' ').slice(0, 20);
    if (!name) return ack?.({ ok: false, error: 'Please enter a name.' });
    if (userByName(name)) return ack?.({ ok: false, error: 'That name is already taken.' });
    if (users.has(socket.id)) return ack?.({ ok: false, error: 'Already joined.' });
    users.set(socket.id, { id: socket.id, name });
    ack?.({ ok: true, name });
    socket.emit('lobby:history', lobby);
    sendOwnThread(socket);
    socket.emit('phase:changed', { phase, silent: true });
    systemLobby(`${name} joined the lobby.`);
    broadcastState();
  });

  const requireUser = () => users.get(socket.id);

  socket.on('lobby:send', (text) => {
    const u = requireUser();
    const t = cleanText(text);
    if (!u || !t) return;
    if (mutedNames.has(key(u.name))) {
      return socket.emit('notice', 'You are muted. You can only talk to the moderator until the main chat is wiped.');
    }
    const m = msg(u.name, t, { moderator: u.id === moderatorId });
    push(lobby, m);
    io.emit('lobby:message', m);
  });

  // ---- Moderator role ----
  socket.on('mod:claim', () => {
    const u = requireUser();
    if (!u) return;
    if (moderatorId && users.has(moderatorId)) {
      return socket.emit('notice', 'There is already a moderator.');
    }
    if (mutedNames.has(key(u.name))) return socket.emit('notice', 'Muted players cannot become moderator.');
    moderatorId = socket.id;
    systemLobby(`${u.name} is now the moderator.`);
    sendModThreads();
    broadcastState();
  });

  socket.on('mod:stepDown', () => {
    if (!isMod(socket)) return;
    const u = requireUser();
    moderatorId = null;
    systemLobby(`${u.name} stepped down as moderator.`);
    sendOwnThread(socket);
    broadcastState();
  });

  socket.on('mod:transfer', (targetName) => {
    if (!isMod(socket)) return;
    const target = userByName(String(targetName || ''));
    if (!target || target.id === socket.id) return;
    moderatorId = target.id;
    systemLobby(`${users.get(socket.id).name} handed the moderator role to ${target.name}.`);
    sendOwnThread(socket);
    sendModThreads();
    broadcastState();
  });

  // ---- Moderator private chat ----
  // Members send to their own thread. Moderator sends to a named member's thread.
  socket.on('mod:send', ({ to, text } = {}) => {
    const u = requireUser();
    const t = cleanText(text);
    if (!u || !t) return;
    if (isMod(socket)) {
      const target = userByName(String(to || '')) || (modThreads.has(key(String(to || ''))) ? { name: to } : null);
      if (!target) return socket.emit('notice', 'Pick a member to message.');
      pushModThread(target.name, msg(u.name, t, { moderator: true }));
    } else {
      pushModThread(u.name, msg(u.name, t));
      if (!moderatorId) socket.emit('notice', 'There is no moderator yet. Your message is saved for when one is chosen.');
    }
  });

  socket.on('mod:role', ({ to, role } = {}) => {
    if (!isMod(socket)) return;
    if (role !== 'civilian' && role !== 'werewolf') return;
    const target = userByName(String(to || ''));
    if (!target) return socket.emit('notice', 'That member is not online.');
    pushModThread(target.name, msg(users.get(socket.id).name, `assigned role: ${role}`, { moderator: true, role }));
    io.to(target.id).emit('role:assigned', { role });
  });

  // ---- Phase ----
  socket.on('phase:set', (p) => {
    if (!isMod(socket)) return;
    if (p !== 'day' && p !== 'night') return;
    phase = p;
    io.emit('phase:changed', { phase });
    systemLobby(p === 'night' ? 'Night falls over the village.' : 'The sun rises. It is day.');
    broadcastState();
  });

  // ---- Trial ----
  socket.on('trial:start', (name) => {
    if (!isMod(socket)) return;
    const target = userByName(String(name || ''));
    if (!target) return socket.emit('notice', 'That member is not online.');
    if (target.id === moderatorId) return socket.emit('notice', 'The moderator cannot be put on trial.');
    if (trial && trial.open) return socket.emit('notice', 'A trial is already running.');
    trial = { accusedName: target.name, votes: new Map(), open: true, result: null };
    io.emit('trial:started', { accused: target.name });
    systemLobby(`${target.name} is on trial! Vote guilty or innocent.`);
    broadcastState();
  });

  socket.on('trial:vote', (vote) => {
    const u = requireUser();
    if (!u || !trial || !trial.open) return;
    if (vote !== 'guilty' && vote !== 'innocent') return;
    if (!eligibleVoters().some((v) => v.id === u.id)) {
      return socket.emit('notice', 'You cannot vote in this trial.');
    }
    trial.votes.set(u.name, vote);
    maybeAutoFinishTrial();
    broadcastState();
  });

  socket.on('trial:end', () => {
    if (!isMod(socket)) return;
    finishTrial();
    broadcastState();
  });

  socket.on('trial:cancel', () => {
    if (!isMod(socket) || !trial) return;
    const wasOpen = trial.open;
    const name = trial.accusedName;
    trial = null;
    io.emit('trial:cleared');
    if (wasOpen) systemLobby(`The trial of ${name} was cancelled.`);
    broadcastState();
  });

  // ---- Wipe votes ----
  socket.on('wipe:vote', (kind) => {
    const u = requireUser();
    if (!u || (kind !== 'main' && kind !== 'mod')) return;
    const set = wipeVotes[kind];
    if (set.has(socket.id)) set.delete(socket.id);
    else set.add(socket.id);
    checkWipe(kind);
    broadcastState();
  });

  // ---- Groups ----
  socket.on('group:create', (rawName) => {
    const u = requireUser();
    const name = cleanText(rawName).slice(0, 30);
    if (!u || !name) return;
    if (groups.size >= 30) return socket.emit('notice', 'Too many groups.');
    const g = { id: String(nextGroupId++), name, members: new Set([socket.id]), messages: [] };
    groups.set(g.id, g);
    socket.join('group:' + g.id);
    socket.emit('group:history', { id: g.id, messages: [] });
    socket.emit('group:opened', g.id);
    broadcastState();
  });

  socket.on('group:join', (id) => {
    const u = requireUser();
    const g = groups.get(String(id));
    if (!u || !g) return;
    if (!g.members.has(socket.id)) {
      g.members.add(socket.id);
      socket.join('group:' + g.id);
      const m = msg(null, `${u.name} joined the group.`, { system: true });
      push(g.messages, m);
      socket.emit('group:history', { id: g.id, messages: g.messages });
      socket.to('group:' + g.id).emit('group:message', { id: g.id, message: m });
    }
    broadcastState();
  });

  socket.on('group:leave', (id) => {
    const u = requireUser();
    const g = groups.get(String(id));
    if (!u || !g) return;
    g.members.delete(socket.id);
    socket.leave('group:' + g.id);
    if (g.members.size === 0) {
      groups.delete(g.id);
    } else {
      const m = msg(null, `${u.name} left the group.`, { system: true });
      push(g.messages, m);
      io.to('group:' + g.id).emit('group:message', { id: g.id, message: m });
    }
    broadcastState();
  });

  socket.on('group:send', ({ id, text } = {}) => {
    const u = requireUser();
    const g = groups.get(String(id));
    const t = cleanText(text);
    if (!u || !g || !t) return;
    if (!g.members.has(socket.id)) return socket.emit('notice', 'Join the group first.');
    if (mutedNames.has(key(u.name))) {
      return socket.emit('notice', 'You are muted. You can only talk to the moderator until the main chat is wiped.');
    }
    const m = msg(u.name, t, { moderator: u.id === moderatorId });
    push(g.messages, m);
    io.to('group:' + g.id).emit('group:message', { id: g.id, message: m });
  });

  socket.on('disconnect', () => {
    const u = users.get(socket.id);
    if (!u) return;
    users.delete(socket.id);
    wipeVotes.main.delete(socket.id);
    wipeVotes.mod.delete(socket.id);
    for (const g of groups.values()) {
      g.members.delete(socket.id);
      if (g.members.size === 0) groups.delete(g.id);
    }
    if (moderatorId === socket.id) {
      moderatorId = null;
      systemLobby(`${u.name} (moderator) left. Someone can take over as moderator.`);
    } else {
      systemLobby(`${u.name} left.`);
    }
    // Someone leaving can complete a vote.
    checkWipe('main');
    checkWipe('mod');
    maybeAutoFinishTrial();
    broadcastState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Chatroom running at http://localhost:${PORT}`));

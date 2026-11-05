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
const ROLES = ['civilian', 'werewolf', 'doctor', 'officer'];

// ---- State ----
const users = new Map(); // socketId -> { id, name }
let moderatorId = null;
let lobby = [];
let modThreads = new Map(); // lowercase name -> [messages]  (private player <-> moderator)
let wolfChat = []; // night-only chat for werewolves
let roles = new Map(); // lowercase name -> role (one of ROLES)
let protectedNames = new Set(); // lowercase names the moderator marked as protected
let mutedNames = new Set(); // lowercase names muted until the chat is wiped
let phase = 'day';
let phaseStartedAt = Date.now(); // when the current day/night began, for the timer
let trial = null; // { accusedName, votes: Map(name -> 'guilty'|'innocent'), open, result }
let wipeVotes = new Set(); // socket ids of players who voted to wipe everything
const roleConfig = { werewolf: 2, doctor: 1, officer: 1 }; // the rest are civilians
let nextMsgId = 1;
let nextBotId = 1;
const BOT_NAMES = ['Astrid', 'Bjorn', 'Cora', 'Dag', 'Edda', 'Finn', 'Greta', 'Hugo', 'Ingrid', 'Jonas', 'Kari', 'Leif', 'Mia', 'Nils', 'Oda', 'Per', 'Runa', 'Sven', 'Tora', 'Ulf'];
const humans = () => [...users.values()].filter((u) => !u.bot);
const bots = () => [...users.values()].filter((u) => u.bot);

const key = (name) => String(name).toLowerCase();
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
const isMod = (socket) => socket.id === moderatorId;
function userByName(name) {
  for (const u of users.values()) if (key(u.name) === key(name)) return u;
  return null;
}
function cleanText(t) {
  return typeof t === 'string' ? t.trim().slice(0, MAX_MSG) : '';
}

// ---- Roles ----
function wolfCount() {
  let n = 0;
  for (const r of roles.values()) if (r === 'werewolf') n++;
  return n;
}
// A lone werewolf is shown as a Serial Killer.
function displayRole(name) {
  const r = roles.get(key(name));
  if (!r) return null;
  if (r === 'werewolf' && wolfCount() === 1) return 'serialkiller';
  return r;
}
function displayRoleMap() {
  const out = new Map();
  for (const k of roles.keys()) out.set(k, displayRole(k));
  return out;
}
// The wolf den is for werewolves when there are at least two of them. The moderator always has access.
function hasWolfAccess(socketId) {
  if (socketId === moderatorId) return true;
  const u = users.get(socketId);
  return !!u && roles.get(key(u.name)) === 'werewolf' && wolfCount() >= 2;
}
function wolfNames() {
  return [...roles.entries()].filter(([, r]) => r === 'werewolf').map(([k]) => userByName(k)?.name || k);
}

// Tell players whose shown role changed, with a pop-up and a note in their moderator chat.
function announceRoleChanges(before, force = false) {
  const after = displayRoleMap();
  const modName = users.get(moderatorId)?.name || 'Moderator';
  const keys = new Set([...before.keys(), ...after.keys()]);
  for (const k of keys) {
    const role = after.get(k) || null;
    if (!force && before.get(k) === role) continue;
    if (role) pushModThread(k, msg(modName, `role: ${role}`, { moderator: true, role }));
    const u = userByName(k);
    if (u) io.to(u.id).emit('role:assigned', { role });
  }
  sendWolfHistoryToAll();
}

// ---- State broadcast ----
function broadcastState() {
  const trialPublic = trial
    ? {
        accused: trial.accusedName,
        open: trial.open,
        result: trial.result,
        // While voting is open, only show who has voted, not what.
        votes: [...trial.votes.entries()].map(([name, vote]) => ({ name, vote: trial.open ? 'hidden' : vote })),
      }
    : null;
  const base = {
    users: [...users.values()].map((u) => ({
      name: u.name,
      moderator: u.id === moderatorId,
      muted: mutedNames.has(key(u.name)),
      bot: !!u.bot,
    })),
    moderator: moderatorId && users.get(moderatorId) ? users.get(moderatorId).name : null,
    phase,
    phaseStartedAt,
    serverNow: Date.now(),
    trial: trialPublic,
    wipe: { votes: wipeVotes.size, needed: wipeVoters().length },
  };
  for (const [id, sock] of io.sockets.sockets) {
    const u = users.get(id);
    if (!u) continue;
    const s = { ...base };
    const myRole = displayRole(u.name);
    s.me = {
      name: u.name,
      moderator: id === moderatorId,
      muted: mutedNames.has(key(u.name)),
      wiped: wipeVotes.has(id),
      role: id === moderatorId ? null : myRole,
      wolfAccess: hasWolfAccess(id),
      wolfmates: myRole === 'werewolf' ? wolfNames() : [],
    };
    if (id === moderatorId) {
      s.modView = {
        roles: Object.fromEntries(displayRoleMap()),
        protected: [...protectedNames],
        roleConfig,
        wolfCount: wolfCount(),
      };
    }
    sock.emit('state', s);
  }
}

// ---- Private moderator threads ----
function sendModThreads() {
  const sock = moderatorId && io.sockets.sockets.get(moderatorId);
  if (sock) sock.emit('mod:threads', Object.fromEntries(modThreads));
}
function sendOwnThread(socket) {
  const u = users.get(socket.id);
  if (u) socket.emit('mod:thread', modThreads.get(key(u.name)) || []);
}
function pushModThread(memberName, m) {
  const k = key(memberName);
  if (!modThreads.has(k)) modThreads.set(k, []);
  push(modThreads.get(k), m);
  const member = userByName(k);
  if (member) io.to(member.id).emit('mod:message', { thread: k, message: m });
  if (moderatorId && moderatorId !== member?.id) io.to(moderatorId).emit('mod:message', { thread: k, message: m });
}

// ---- Wolf den ----
function sendWolfHistoryToAll() {
  for (const [id, sock] of io.sockets.sockets) {
    if (!users.has(id)) continue;
    sock.emit('wolf:history', hasWolfAccess(id) ? wolfChat : null);
  }
}
function pushWolf(m) {
  push(wolfChat, m);
  for (const id of users.keys()) if (hasWolfAccess(id)) io.to(id).emit('wolf:message', m);
}

// ---- Votes ----
// Real players vote. Bots and the moderator don't need to.
function wipeVoters() {
  return humans().filter((u) => u.id !== moderatorId);
}
function checkWipe() {
  const voters = new Set(wipeVoters().map((u) => u.id));
  for (const id of wipeVotes) if (!voters.has(id)) wipeVotes.delete(id);
  if (voters.size === 0 || wipeVotes.size < voters.size) return false;
  wipeEverything('Everyone voted.');
  return true;
}
// A fresh game: every chat, role, protection and mute is cleared.
function wipeEverything(reason) {
  wipeVotes = new Set();
  lobby = [];
  modThreads = new Map();
  wolfChat = [];
  roles = new Map();
  protectedNames = new Set();
  mutedNames = new Set();
  trial = null;
  phase = 'day';
  phaseStartedAt = Date.now();
  io.emit('lobby:history', []);
  for (const [id, sock] of io.sockets.sockets) if (users.has(id)) sock.emit('mod:thread', []);
  sendModThreads();
  sendWolfHistoryToAll();
  io.emit('role:cleared');
  io.emit('trial:cleared');
  systemLobby(`${reason} All chats were wiped and a fresh game begins.`);
  io.emit('phase:changed', { phase, silent: true });
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

function becomeModerator(socket) {
  const u = users.get(socket.id);
  const before = displayRoleMap();
  moderatorId = socket.id;
  // The moderator does not play a role.
  if (roles.delete(key(u.name))) announceRoleChanges(before);
  protectedNames.delete(key(u.name));
  wipeVotes.delete(socket.id);
  sendModThreads();
  sendWolfHistoryToAll();
  checkWipe();
}

// ---- Test bots ----
function addBots(n) {
  const added = [];
  for (let i = 0; i < n; i++) {
    let name = BOT_NAMES.find((b) => !userByName(b));
    if (!name) name = `Bot ${nextBotId}`;
    while (userByName(name)) name = `Bot ${++nextBotId}`;
    const id = `bot:${nextBotId++}`;
    users.set(id, { id, name, bot: true });
    added.push(name);
  }
  if (added.length) systemLobby(`🤖 Added ${added.length} test bot${added.length === 1 ? '' : 's'}: ${added.join(', ')}.`);
}
function removeBots() {
  const list = bots();
  if (!list.length) return;
  const before = displayRoleMap();
  for (const b of list) {
    users.delete(b.id);
    roles.delete(key(b.name));
    protectedNames.delete(key(b.name));
  }
  announceRoleChanges(before);
  systemLobby(`🤖 Removed ${list.length} test bot${list.length === 1 ? '' : 's'}.`);
  maybeAutoFinishTrial();
}
// Bots vote at random a few seconds after a trial starts.
function scheduleBotVotes() {
  const t = trial;
  for (const b of bots()) {
    setTimeout(() => {
      if (trial !== t || !t.open || !users.has(b.id)) return;
      if (!eligibleVoters().some((v) => v.id === b.id)) return;
      t.votes.set(b.name, Math.random() < 0.5 ? 'guilty' : 'innocent');
      maybeAutoFinishTrial();
      broadcastState();
    }, 1500 + Math.random() * 3500);
  }
}

// ---- Sockets ----
io.on('connection', (socket) => {
  const me = () => users.get(socket.id);

  socket.on('join', (rawName, ack) => {
    const name = cleanText(rawName).replace(/\s+/g, ' ').slice(0, 20);
    if (!name) return ack?.({ ok: false, error: 'Please enter a name.' });
    if (userByName(name)) return ack?.({ ok: false, error: 'That name is already taken.' });
    if (users.has(socket.id)) return ack?.({ ok: false, error: 'Already joined.' });
    users.set(socket.id, { id: socket.id, name });
    ack?.({ ok: true, name });
    socket.emit('lobby:history', lobby);
    sendOwnThread(socket);
    socket.emit('wolf:history', hasWolfAccess(socket.id) ? wolfChat : null);
    socket.emit('phase:changed', { phase, silent: true });
    systemLobby(`${name} joined the lobby.`);
    broadcastState();
  });

  socket.on('lobby:send', (text) => {
    const u = me();
    const t = cleanText(text);
    if (!u || !t) return;
    if (mutedNames.has(key(u.name))) {
      return socket.emit('notice', 'You are muted. You can only talk to the moderator until the chat is wiped.');
    }
    const m = msg(u.name, t, { moderator: isMod(socket) });
    push(lobby, m);
    io.emit('lobby:message', m);
  });

  // ---- Moderator seat ----
  socket.on('mod:claim', () => {
    const u = me();
    if (!u) return;
    if (moderatorId && users.has(moderatorId)) return socket.emit('notice', 'There is already a moderator.');
    if (mutedNames.has(key(u.name))) return socket.emit('notice', 'Muted players cannot become moderator.');
    becomeModerator(socket);
    systemLobby(`${u.name} is now the moderator.`);
    broadcastState();
  });

  socket.on('mod:stepDown', () => {
    if (!isMod(socket)) return;
    moderatorId = null;
    systemLobby(`${me().name} stepped down as moderator.`);
    sendOwnThread(socket);
    sendWolfHistoryToAll();
    broadcastState();
  });

  socket.on('mod:transfer', (targetName) => {
    if (!isMod(socket)) return;
    const target = userByName(String(targetName || ''));
    if (!target || target.id === socket.id) return;
    const targetSock = io.sockets.sockets.get(target.id);
    if (!targetSock) return;
    becomeModerator(targetSock);
    systemLobby(`${me().name} handed the moderator role to ${target.name}.`);
    sendOwnThread(socket);
    sendWolfHistoryToAll();
    broadcastState();
  });

  // ---- Private moderator chat ----
  socket.on('mod:send', ({ to, text } = {}) => {
    const u = me();
    const t = cleanText(text);
    if (!u || !t) return;
    if (isMod(socket)) {
      const k = key(String(to || ''));
      if (!userByName(k) && !modThreads.has(k)) return socket.emit('notice', 'Pick a player to message.');
      pushModThread(k, msg(u.name, t, { moderator: true }));
    } else {
      pushModThread(u.name, msg(u.name, t));
      if (!moderatorId) socket.emit('notice', 'There is no moderator yet. Your message is saved for when one is chosen.');
    }
  });

  // ---- Roles ----
  socket.on('mod:role', ({ to, role } = {}) => {
    if (!isMod(socket)) return;
    if (role !== null && !ROLES.includes(role)) return;
    const target = userByName(String(to || ''));
    if (!target) return socket.emit('notice', 'That player is not online.');
    if (target.id === moderatorId) return;
    const before = displayRoleMap();
    if (role) roles.set(key(target.name), role);
    else roles.delete(key(target.name));
    announceRoleChanges(before);
    broadcastState();
  });

  // Officer check: the moderator answers "wolf" or "civilian" about a player. It stays in the asker's chat.
  socket.on('mod:check', ({ to, target, result } = {}) => {
    if (!isMod(socket)) return;
    if (result !== 'wolf' && result !== 'civilian') return;
    const asker = key(String(to || ''));
    if (!userByName(asker) && !modThreads.has(asker)) return socket.emit('notice', 'Pick a player to answer.');
    const t = userByName(String(target || ''));
    const targetName = t ? t.name : String(target || '').slice(0, 20);
    if (!targetName) return socket.emit('notice', 'Pick who they asked about.');
    pushModThread(asker, msg(me().name, `${targetName} is ${result === 'wolf' ? 'a wolf' : 'a civilian'}`, {
      moderator: true,
      check: { target: targetName, result },
    }));
  });

  socket.on('bots:add', (n) => {
    if (!isMod(socket)) return;
    n = Math.max(1, Math.min(10, Number(n) || 1));
    if (bots().length + n > 30) return socket.emit('notice', 'That is a lot of bots. Remove some first.');
    addBots(n);
    broadcastState();
  });
  socket.on('bots:remove', () => {
    if (!isMod(socket)) return;
    removeBots();
    broadcastState();
  });

  socket.on('roles:config', (cfg = {}) => {
    if (!isMod(socket)) return;
    for (const r of ['werewolf', 'doctor', 'officer']) {
      const n = Number(cfg[r]);
      if (Number.isInteger(n) && n >= 0 && n <= 20) roleConfig[r] = n;
    }
    broadcastState();
  });

  socket.on('roles:randomize', () => {
    if (!isMod(socket)) return;
    const players = [...users.values()].filter((u) => u.id !== moderatorId);
    const special = roleConfig.werewolf + roleConfig.doctor + roleConfig.officer;
    if (players.length === 0) return socket.emit('notice', 'There are no players to give roles to.');
    if (special > players.length) {
      return socket.emit('notice', `Not enough players: you picked ${special} special roles but there are only ${players.length} players.`);
    }
    const deck = [
      ...Array(roleConfig.werewolf).fill('werewolf'),
      ...Array(roleConfig.doctor).fill('doctor'),
      ...Array(roleConfig.officer).fill('officer'),
    ];
    while (deck.length < players.length) deck.push('civilian');
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const before = displayRoleMap();
    roles = new Map(players.map((p, i) => [key(p.name), deck[i]]));
    protectedNames = new Set();
    announceRoleChanges(before, true);
    systemLobby('The moderator handed out secret roles. Check your pop-up!');
    broadcastState();
  });

  // The moderator removes a player from the game. Their role and protection are cleared.
  socket.on('mod:kick', (name) => {
    if (!isMod(socket)) return;
    const target = userByName(String(name || ''));
    if (!target || target.id === socket.id) return;
    const before = displayRoleMap();
    roles.delete(key(target.name));
    protectedNames.delete(key(target.name));
    wipeVotes.delete(target.id);
    if (trial && trial.open) trial.votes.delete(target.name);
    if (target.bot) {
      users.delete(target.id);
    } else {
      target.kicked = true;
      const sock = io.sockets.sockets.get(target.id);
      sock?.emit('kicked');
      users.delete(target.id);
      sock?.disconnect(true);
    }
    announceRoleChanges(before);
    systemLobby(`${target.name} was kicked by the moderator.`);
    checkWipe();
    maybeAutoFinishTrial();
    broadcastState();
  });

  socket.on('protect:toggle', (name) => {
    if (!isMod(socket)) return;
    const k = key(String(name || ''));
    if (!userByName(k) && !roles.has(k)) return;
    if (protectedNames.has(k)) protectedNames.delete(k);
    else protectedNames.add(k);
    broadcastState();
  });

  // ---- Wolf den ----
  socket.on('wolf:send', (text) => {
    const u = me();
    const t = cleanText(text);
    if (!u || !t || !hasWolfAccess(socket.id)) return;
    if (!isMod(socket)) {
      if (phase !== 'night') return socket.emit('notice', 'The wolf den only opens at night.');
      if (mutedNames.has(key(u.name))) return socket.emit('notice', 'You are muted. You can only talk to the moderator.');
    }
    pushWolf(msg(u.name, t, { moderator: isMod(socket) }));
  });

  // ---- Phase ----
  socket.on('phase:set', (p) => {
    if (!isMod(socket) || (p !== 'day' && p !== 'night')) return;
    phase = p;
    phaseStartedAt = Date.now();
    io.emit('phase:changed', { phase });
    systemLobby(p === 'night' ? 'Night falls over the village.' : 'The sun rises. It is day.');
    broadcastState();
  });

  // ---- Trial ----
  socket.on('trial:start', (name) => {
    if (!isMod(socket)) return;
    const target = userByName(String(name || ''));
    if (!target) return socket.emit('notice', 'That player is not online.');
    if (target.id === moderatorId) return socket.emit('notice', 'The moderator cannot be put on trial.');
    if (trial && trial.open) return socket.emit('notice', 'A trial is already running.');
    trial = { accusedName: target.name, votes: new Map(), open: true, result: null };
    io.emit('trial:started', { accused: target.name });
    scheduleBotVotes();
    systemLobby(`${target.name} is on trial! Vote guilty or innocent.`);
    broadcastState();
  });

  socket.on('trial:vote', (vote) => {
    const u = me();
    if (!u || !trial || !trial.open || (vote !== 'guilty' && vote !== 'innocent')) return;
    if (!eligibleVoters().some((v) => v.id === u.id)) return socket.emit('notice', 'You cannot vote in this trial.');
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
  socket.on('wipe:vote', () => {
    if (!me()) return;
    if (isMod(socket)) {
      // The moderator doesn't vote, but can wipe straight away when there are no players to ask.
      if (wipeVoters().length === 0) wipeEverything('The moderator started over.');
      else socket.emit('notice', 'The players vote to wipe. You don\'t need to.');
    } else if (wipeVotes.has(socket.id)) wipeVotes.delete(socket.id);
    else wipeVotes.add(socket.id);
    checkWipe();
    broadcastState();
  });

  socket.on('disconnect', () => {
    const u = me();
    if (!u) return;
    users.delete(socket.id);
    wipeVotes.delete(socket.id);
    if (moderatorId === socket.id) {
      moderatorId = null;
      systemLobby(`${u.name} (moderator) left. Someone can take over as moderator.`);
    } else {
      systemLobby(`${u.name} left.`);
    }
    // When the last real person leaves, clear out the test bots too.
    if (humans().length === 0) removeBots();
    // Someone leaving can complete a vote.
    checkWipe();
    maybeAutoFinishTrial();
    broadcastState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Chatroom running at http://localhost:${PORT}`));

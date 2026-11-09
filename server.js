const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const DEATH_LINES = require('./deaths');
// Characters players can pick on the character select screen (see public/characters.js).
const CHARACTERS = ['firekeeper', 'snout'];

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const MAX_MSG = 500;
const MAX_HISTORY = 300;
const ROLES = ['civilian', 'werewolf', 'doctor', 'detective', 'officer', 'mother', 'father', 'son', 'joker', 'vigilante', 'batman'];
// Roles on the killers' side. The Joker joins the wolves when the Son dies.
const WOLF_ROLES = ['werewolf', 'joker'];
const isWolfRole = (r) => WOLF_ROLES.includes(r);
const FAMILY = ['mother', 'father', 'son'];

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
// 'waiting' = start menu before a game; 'running' = a game is on. People can join either way.
let gameState = 'waiting';
let trial = null; // { accusedName, votes: Map(name -> 'guilty'|'innocent'), open, result }
let wipeVotes = new Set(); // socket ids of players who voted to wipe everything
// family: 'auto' = the Mother/Father/Son trio is dealt when 20+ players joined; 'on' / 'off' to force it.
// difficulty: 'normal' announces family changes and shows the werewolf death animation; 'hard' reveals nothing on death.
// interrogate: Batman's Interrogate ability (only in games that started with 4+ wolves).
const roleConfig = { werewolf: 2, doctor: 1, detective: 1, officer: 0, family: 'auto', difficulty: 'normal', interrogate: true }; // the rest are civilians
let nextMsgId = 1;
let nextBotId = 1;
// The Officer's arrest: made by day; the arrested player can't vote that day
// and can't use their ability the following night.
let dayArrest = null; // { by: officer key, target: name } for today
let arrestedTonight = null; // lowercase name, blocked during the current night
// Night actions: lowercase actor name -> { kind: 'kill'|'heal'|'investigate', target: name }.
// Cleared when a new night starts.
let nightActions = new Map();
const autoProtected = new Map(); // doctor key -> target key they protected
// Notes revealed on death: the Serial Killer's calling card and every other player's manifesto.
const CARD_MAX = 100;
const MANIFESTO_MAX = 200;
let callingCards = new Map(); // killer key -> text
let manifestos = new Map(); // player key -> text
let killedNames = new Set(); // lowercase names the moderator marked dead
let clues = []; // revealed notes everyone can inspect
let privateClues = new Map(); // detective key -> [check results only they can see]
// Each ability player's own results, shown in their "Ability results" tab.
let abilityLog = new Map(); // player key -> [{ id, night, kind, text, tone, target }]
let nightNumber = 0;
// 'auto': the Detective learns good/bad at sunrise by themselves. 'manual': the moderator answers.
let detectiveMode = 'auto';
let pendingReveals = []; // deaths at night, revealed when day starts
let nextClueId = 1;
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
  for (const r of roles.values()) if (isWolfRole(r)) n++;
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
  if (gameState === 'assigning') return false; // nothing is revealed until the game starts
  return !!u && isWolfRole(roles.get(key(u.name))) && wolfCount() >= 2;
}
function wolfNames() {
  return [...roles.entries()].filter(([, r]) => isWolfRole(r)).map(([k]) => userByName(k)?.name || k);
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
// During a game, everyone without a role is a Civilian (late joiners, skipped players, new bots…).
let fillingCivilians = false;
function fillCivilians() {
  if (gameState !== 'running' || fillingCivilians) return;
  const missing = [...users.values()].filter((u) => u.id !== moderatorId && !roles.has(key(u.name)));
  if (!missing.length) return;
  fillingCivilians = true;
  const before = displayRoleMap();
  for (const u of missing) roles.set(key(u.name), 'civilian');
  announceRoleChanges(before);
  fillingCivilians = false;
}

function broadcastState() {
  fillCivilians();
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
      character: u.character || null,
    })),
    moderator: moderatorId && users.get(moderatorId) ? users.get(moderatorId).name : null,
    phase,
    phaseStartedAt,
    gameState,
    serverNow: Date.now(),
    trial: trialPublic,
    wipe: { votes: wipeVotes.size, needed: wipeVoters().length },
    clues,
    dead: [...killedNames],
  };
  for (const [id, sock] of io.sockets.sockets) {
    const u = users.get(id);
    if (!u) continue;
    const s = { ...base };
    // Roles stay secret from players until the game starts.
    const myRole = gameState === 'assigning' && id !== moderatorId ? null : displayRole(u.name);
    s.me = {
      name: u.name,
      moderator: id === moderatorId,
      muted: mutedNames.has(key(u.name)),
      wiped: wipeVotes.has(id),
      dead: killedNames.has(key(u.name)) || mutedNames.has(key(u.name)),
      canCard: myRole === 'serialkiller',
      callingCard: myRole === 'serialkiller' ? callingCards.get(key(u.name)) || '' : null,
      manifesto: id === moderatorId ? null : manifestos.get(key(u.name)) || '',
      privateClues: privateClues.get(key(u.name)) || [],
      abilityLog: abilityLog.get(key(u.name)) || [],
      role: id === moderatorId ? null : myRole,
      wolfAccess: hasWolfAccess(id),
      wolfmates: isWolfRole(myRole) ? wolfNames() : [],
      packRoles: isWolfRole(myRole) ? Object.fromEntries(wolfNames().map((n) => [key(n), displayRole(n)])) : {},
    };
    s.me.arrestedToday = !!dayArrest && key(dayArrest.target) === key(u.name);
    s.me.arrestedTonight = arrestedTonight === key(u.name);
    if (id !== moderatorId && myRole === 'officer' && !killedNames.has(key(u.name))) {
      s.me.action = { kind: 'arrest', target: dayArrest && dayArrest.by === key(u.name) ? dayArrest.target : null, targets: arrestTargets(u.name), done: !!dayArrest };
    }
    const kind = id === moderatorId || !myRole ? null : actionKindFor(u.name);
    if (kind) {
      const mine = nightActions.get(key(u.name));
      s.me.action = { kind, target: mine?.target || null, skip: !!mine?.skip, targets: validTargets(u.name) };
      if (kind === 'investigate') {
        s.me.action.investigated = [...investigatedBy(u.name)]
          .map(([k, label]) => ({ name: userByName(k)?.name || k, label }))
          .filter((x) => userByName(x.name) && !mutedNames.has(key(x.name)));
      }
      // Wolves see what the rest of the pack picked.
      if (kind === 'kill' && isWolfRole(myRole)) {
        const o = nightOutcome();
        s.me.action.agreed = o.reason === 'killed' || o.reason === 'saved' ? o.victim || o.target : null;
        s.me.action.agreedNobody = o.reason === 'skipped';
        s.me.action.pack = wolfNames().filter((n) => key(n) !== key(u.name)).map((n) => ({ name: n, target: nightActions.get(key(n))?.target || null, skip: !!nightActions.get(key(n))?.skip }));
      }
    }
    if (id === moderatorId) {
      s.modView = {
        roles: Object.fromEntries(displayRoleMap()),
        protected: [...protectedNames],
        roleConfig,
        wolfCount: wolfCount(),
        nightActions: nightActionList(),
        arrest: dayArrest ? { by: userByName(dayArrest.by)?.name || dayArrest.by, target: dayArrest.target } : null,
        arrestedTonight: arrestedTonight ? userByName(arrestedTonight)?.name || arrestedTonight : null,
        outcome: phase === 'night' ? OUTCOME_TEXT[nightOutcome().reason](nightOutcome()) : null,
        detectiveMode,
        notes: Object.fromEntries([...roles.keys()].map((k) => [k, { manifesto: manifestos.get(k) || '', card: callingCards.get(k) || '' }])),
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
// Change a message already in a private thread (same id) and tell both sides.
function updateModThread(memberName, m) {
  const k = key(memberName);
  const member = userByName(k);
  if (member) io.to(member.id).emit('mod:update', { thread: k, message: m });
  if (moderatorId && moderatorId !== member?.id) io.to(moderatorId).emit('mod:update', { thread: k, message: m });
}
// Each actor gets one night-action message per night; changing the pick edits it.
let actionMsgs = new Map(); // actor key -> message object in their thread
function lockActionMessages() {
  for (const [k, m] of actionMsgs) {
    m.action.locked = true;
    updateModThread(k, m);
  }
  actionMsgs = new Map();
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
  nightActions = new Map();
  actionMsgs = new Map();
  autoProtected.clear();
  dayArrest = null;
  arrestedTonight = null;
  lastArrest = null;
  callingCards = new Map();
  manifestos = new Map();
  family = {};
  familyFlags = {};
  batmanSeen = new Set();
  startWolves = 0;
  killedNames = new Set();
  clues = [];
  privateClues = new Map();
  abilityLog = new Map();
  nightNumber = 0;
  pendingReveals = [];
  trial = null;
  phase = 'day';
  phaseStartedAt = Date.now();
  io.emit('lobby:history', []);
  for (const [id, sock] of io.sockets.sockets) if (users.has(id)) sock.emit('mod:thread', []);
  sendModThreads();
  sendWolfHistoryToAll();
  io.emit('role:cleared');
  io.emit('trial:cleared');
  gameState = 'waiting';
  systemLobby(`${reason} All chats were wiped. Waiting for the moderator to start a new game.`);
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
    wolf: trial.result === 'guilty' && isWerewolf(trial.accusedName) && !hardMode(),
  });
  if (trial.result === 'guilty') revealDeath({ victim: trial.accusedName, card: null, announce: false });
}
function eligibleVoters() {
  if (!trial) return [];
  return [...users.values()].filter(
    (u) => u.id !== moderatorId && key(u.name) !== key(trial.accusedName) && !mutedNames.has(key(u.name)) && !(dayArrest && key(dayArrest.target) === key(u.name))
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

// ---- Night actions ----
const ACTION_FOR_ROLE = { werewolf: 'kill', joker: 'kill', doctor: 'heal', detective: 'investigate', vigilante: 'vigil' };
const ACTION_VERB = { kill: 'kill', heal: 'heal', investigate: 'investigate', vigil: 'kill' };
function actionKindFor(name) {
  const r = roles.get(key(name));
  if (r === 'batman') return canInterrogate(key(name)) ? 'interrogate' : null;
  return ACTION_FOR_ROLE[r] || null;
}
// Batman's Interrogate: only if the game started with 4+ wolves, the moderator allows it,
// and he hasn't lost it by interrogating someone innocent.
let startWolves = 0;
function canInterrogate(k) {
  return roles.get(k) === 'batman' && roleConfig.interrogate && startWolves >= 4 && !familyFlags.interrogateLost && !isDeadKey(k);
}
const hardMode = () => roleConfig.difficulty === 'hard';
// Players this actor may pick tonight.
// Players this Detective already investigated (result known or waiting on the moderator).
// lowercase name -> 'Wolf' | 'Killer' | 'Civilian' | null (still waiting)
function investigatedBy(actorName) {
  const out = new Map();
  for (const e of abilityLog.get(key(actorName)) || []) {
    if (e.kind !== 'investigate' || !e.target) continue;
    const label = e.pending ? null : e.clue?.label || (e.tone === 'bad' ? (/Killer/.test(e.text) ? 'Killer' : 'Wolf') : 'Civilian');
    out.set(key(e.target), label);
  }
  return out;
}
function validTargets(actorName) {
  const kind = actionKindFor(actorName);
  if (!kind) return [];
  // A Detective can't waste a night on someone they already investigated.
  const done = kind === 'investigate' ? investigatedBy(actorName) : new Map();
  return [...users.values()].filter((u) => {
    if (done.has(key(u.name))) return false;
    if (u.id === moderatorId || mutedNames.has(key(u.name))) return false;
    const self = key(u.name) === key(actorName);
    if (kind === 'heal') return true; // the doctor may protect themselves
    if (self) return false;
    if (kind === 'kill' && isWolfRole(roles.get(key(u.name)))) return false; // wolves don't hunt wolves
    return true;
  }).map((u) => u.name);
}
const NO_KILL = '__nobody__';
function setNightAction(actorName, targetName) {
  const k = key(actorName);
  const kind = actionKindFor(actorName);
  if (!kind) return 'You have no night action.';
  if (phase !== 'night') return 'You can only choose at night.';
  if (mutedNames.has(k)) return 'You are muted and cannot act.';
  if (arrestedTonight === k) return 'You were arrested today, so you cannot use your ability tonight.';
  if (kind === 'heal' && autoProtected.has(k)) {
    protectedNames.delete(autoProtected.get(k));
    autoProtected.delete(k);
  }
  if (!targetName) {
    nightActions.delete(k);
  } else if (targetName === NO_KILL) {
    // The killer decides not to kill anyone tonight.
    if (kind !== 'kill' && kind !== 'vigil') return 'You cannot choose that.';
    if (nightActions.get(k)?.skip) return null;
    nightActions.set(k, { kind, target: null, skip: true });
  } else {
    const target = validTargets(actorName).find((n) => key(n) === key(targetName));
    if (!target) return 'You cannot choose that player.';
    if (nightActions.get(k)?.target === target) return null;
    nightActions.set(k, { kind, target });
    if (kind === 'heal') {
      protectedNames.add(key(target));
      autoProtected.set(k, key(target));
    }
  }
  const actor = userByName(k)?.name || actorName;
  const act = nightActions.get(k);
  const text = act?.skip ? 'chose to kill nobody tonight' : act ? `chose to ${ACTION_VERB[kind]} ${act.target}` : 'has not chosen yet';
  const existing = actionMsgs.get(k);
  if (existing && modThreads.get(k)?.includes(existing)) {
    existing.text = text;
    existing.action = { kind, target: act?.target || null, skip: !!act?.skip, changes: (existing.action.changes || 0) + 1 };
    existing.edited = now();
    updateModThread(k, existing);
  } else {
    const m = msg(actor, text, { action: { kind, target: act?.target || null, skip: !!act?.skip, changes: 0 } });
    actionMsgs.set(k, m);
    pushModThread(k, m);
  }
  return null;
}
function nightActionList() {
  const out = [];
  for (const [k, r] of roles) {
    const kind = actionKindFor(k);
    if (!kind) continue;
    const a = nightActions.get(k);
    out.push({ actor: userByName(k)?.name || k, role: displayRole(k), kind, target: a?.target || null, skip: !!a?.skip, muted: mutedNames.has(k) });
  }
  return out;
}
// Bots with a role pick someone at random a few seconds into the night.
function scheduleBotActions() {
  for (const b of bots()) {
    if (!actionKindFor(b.name)) continue;
    setTimeout(() => {
      if (phase !== 'night' || !users.has(b.id) || nightActions.has(key(b.name)) || arrestedTonight === key(b.name)) return;
      const options = validTargets(b.name);
      if (!options.length) return;
      // Bot wolves go along with a packmate's pick so the pack can agree.
      const packPick = actionKindFor(b.name) === 'kill' ? livingWolves().map((k) => nightActions.get(k)?.target).find(Boolean) : null;
      setNightAction(b.name, packPick || options[Math.floor(Math.random() * options.length)]);
      broadcastState();
    }, 2000 + Math.random() * 4000);
  }
}

// Night kills rotate at random between the killer's own animation and the "body found" one.
// The same animation never plays three times in a row. Add names to the list to grow the rotation.
let recentNightAnimations = [];
function pickNightAnimation(own) {
  let options = [own, 'found'];
  const [a, b] = recentNightAnimations.slice(-2);
  if (a && a === b) options = options.filter((o) => o !== a);
  const pick = options[Math.floor(Math.random() * options.length)];
  recentNightAnimations = [...recentNightAnimations, pick].slice(-2);
  return pick;
}

// True if this player is a werewolf (not a lone Serial Killer).
function isWerewolf(name) {
  return displayRole(name) === 'werewolf' || displayRole(name) === 'joker';
}

// ---- The Officer's arrest (by day) ----
function arrestTargets(officerName) {
  return [...users.values()]
    .filter((u) => u.id !== moderatorId && key(u.name) !== key(officerName) && !killedNames.has(key(u.name)) && !mutedNames.has(key(u.name)))
    .map((u) => u.name);
}
function makeArrest(officerName, targetName) {
  const k = key(officerName);
  if (roles.get(k) !== 'officer') return 'Only the Officer can arrest.';
  if (gameState !== 'running' || phase !== 'day') return 'You can only arrest during the day.';
  if (mutedNames.has(k) || killedNames.has(k)) return 'You cannot arrest anyone now.';
  if (dayArrest) return 'Someone has already been arrested today.';
  const target = arrestTargets(officerName).find((n) => key(n) === key(targetName));
  if (!target) return 'You cannot arrest that player.';
  dayArrest = { by: k, target };
  // They can't vote today: drop a vote they already cast.
  if (trial && trial.open && trial.votes.delete(target)) maybeAutoFinishTrial();
  systemLobby(`🚔 ${target} was arrested by the Officer. They cannot vote today or use an ability tonight.`);
  const u = userByName(target);
  if (u) io.to(u.id).emit('arrested');
  if (moderatorId) io.to(moderatorId).emit('notice', `🚔 ${userByName(k)?.name || k} arrested ${target}.`);
  return null;
}
// A bot Officer arrests someone at random a few seconds into the day.
function scheduleBotArrest() {
  for (const b of bots()) {
    if (roles.get(key(b.name)) !== 'officer') continue;
    setTimeout(() => {
      if (phase !== 'day' || dayArrest || !users.has(b.id)) return;
      const options = arrestTargets(b.name);
      if (options.length && !makeArrest(b.name, options[Math.floor(Math.random() * options.length)])) broadcastState();
    }, 3000 + Math.random() * 4000);
  }
}

// ---- Settling the night ----
// Living wolves (not dead or muted) are the ones who must agree.
function livingWolves() {
  return [...roles.entries()].filter(([k, r]) => isWolfRole(r) && !killedNames.has(k) && !mutedNames.has(k)).map(([k]) => k);
}
// What happens at sunrise with tonight's picks.
function nightOutcome() {
  const all = livingWolves();
  if (!all.length) return { victim: null, reason: 'nokiller' };
  // An arrested wolf sits this night out; if every killer is arrested, nobody dies.
  const wolves = all.filter((k) => k !== arrestedTonight);
  if (!wolves.length) return { victim: null, reason: 'arrested' };
  const acts = wolves.map((k) => nightActions.get(k));
  // Everyone chose "nobody": an agreed night without a kill.
  if (acts.every((a) => a?.skip)) return { victim: null, reason: 'skipped' };
  if (acts.some((a) => a?.skip)) return { victim: null, reason: 'disagree' };
  const picks = acts.map((a) => a?.target || null);
  if (picks.some((t) => !t)) return { victim: null, reason: wolves.length > 1 ? 'disagree' : 'nopick', picks };
  if (new Set(picks.map(key)).size > 1) return { victim: null, reason: 'disagree', picks };
  const target = picks[0];
  if (!userByName(target) || killedNames.has(key(target))) return { victim: null, reason: 'nopick' };
  const healed = [...nightActions.values()].some((a) => a.kind === 'heal' && key(a.target) === key(target));
  if (healed) return { victim: null, reason: 'saved', target };
  return { victim: target, reason: 'killed' };
}
const OUTCOME_TEXT = {
  killed: (o) => `${o.victim} will die`,
  saved: (o) => `${o.target} was attacked but the Doctor saved them`,
  disagree: () => 'The wolves did not agree on one victim',
  nopick: () => 'The killer did not choose anyone',
  skipped: () => 'The killer chose not to kill anyone',
  arrested: () => 'The killer was arrested and could not kill',
  nokiller: () => 'There is no killer alive',
};
function killPlayer(name) {
  const k = key(name);
  killedNames.add(k);
  mutedNames.add(k);
  nightActions.delete(k);
}

// ---- Ability results ----
let nextAbilityId = 1;
function addAbilityResult(k, entry) {
  const e = { id: nextAbilityId++, night: entry.night ?? nightNumber, ts: now(), ...entry };
  if (!abilityLog.has(k)) abilityLog.set(k, []);
  abilityLog.get(k).push(e);
  return e;
}
function sendAbilityResult(k, entry) {
  const e = addAbilityResult(k, entry);
  if (e.publicClue) addClue('interrogate', e.publicClue.about, e.publicClue.text);
  const u = userByName(k);
  if (u) io.to(u.id).emit('ability:result', e);
  // An automatic detective result is also a private clue, like a moderator answer.
  if (e.clue) {
    if (!privateClues.has(k)) privateClues.set(k, []);
    privateClues.get(k).push(e.clue);
  }
}
// What each ability player learns at sunrise. Worked out before anyone dies.
let lastArrest = null; // yesterday's arrest, for the Officer's morning result
function abilityResults(outcome, vig = []) {
  const out = [];
  const single = wolfCount() === 1;
  // Everyone attacked tonight who survived because the Doctor protected them.
  const saved = new Set([...(outcome.reason === 'saved' ? [key(outcome.target)] : []), ...vig.filter((v) => v.saved).map((v) => key(v.target))]);
  for (const [k, r] of roles) {
    if (!['werewolf', 'joker', 'doctor', 'detective', 'vigilante', 'batman', 'officer'].includes(r) || killedNames.has(k) || mutedNames.has(k)) continue;
    const pick = nightActions.get(k)?.target || null;
    if (r === 'officer') {
      if (lastArrest && lastArrest.by === k) out.push([k, { kind: 'arrest', text: `You arrested ${lastArrest.target}. They could not use an ability last night.`, tone: 'neutral', target: lastArrest.target }]);
    } else if (arrestedTonight === k) {
      out.push([k, { kind: 'arrested', text: 'You were arrested, so you could not use your ability last night.', tone: 'bad' }]);
    } else if (r === 'batman') {
      out.push([k, batmanClue(k)]);
      // Interrogate: a villain is exposed to everyone; an innocent costs Batman the ability.
      const q = nightActions.get(k);
      if (q?.kind === 'interrogate' && q.target) {
        if (isWolfRole(roles.get(key(q.target)))) {
          out.push([k, { kind: 'interrogate', text: `You interrogated ${q.target}: they are a villain! Everyone can now see it in the clues.`, tone: 'bad', target: q.target, publicClue: { about: q.target, text: `${q.target} is a villain.` } }]);
        } else {
          familyFlags.interrogateLost = true;
          out.push([k, { kind: 'interrogate', text: `You interrogated ${q.target}: they are innocent. You can no longer interrogate.`, tone: 'good', target: q.target }]);
        }
      }
    } else if (r === 'vigilante') {
      const mine = vig.find((v) => v.actor === k);
      if (nightActions.get(k)?.skip) out.push([k, { kind: 'vigil', text: 'You chose not to kill anyone last night.', tone: 'neutral' }]);
      else if (!mine) out.push([k, { kind: 'vigil', text: 'You did not choose anyone last night.', tone: 'neutral' }]);
      else if (mine.saved) out.push([k, { kind: 'vigil', text: `You shot at ${mine.target}, but they survived. Someone protected them.`, tone: 'neutral', target: mine.target }]);
      else out.push([k, { kind: 'vigil', text: `You killed ${mine.target}.`, tone: 'bad', target: mine.target }]);
    } else if (isWolfRole(r)) {
      let text, tone;
      if (outcome.reason === 'killed') [text, tone] = [`You killed ${outcome.victim}.`, 'bad'];
      else if (outcome.reason === 'saved') [text, tone] = [`You attacked ${outcome.target}, but they survived. Someone protected them.`, 'neutral'];
      else if (outcome.reason === 'disagree') [text, tone] = ['The pack did not agree on one victim, so nobody was killed.', 'neutral'];
      else if (outcome.reason === 'skipped') [text, tone] = [single ? 'You chose not to kill anyone last night.' : 'The pack chose not to kill anyone last night.', 'neutral'];
      else [text, tone] = [single ? 'You did not choose anyone, so nobody was killed.' : 'Nobody was chosen, so nobody was killed.', 'neutral'];
      out.push([k, { kind: 'kill', text, tone, target: outcome.victim || outcome.target || pick }]);
    } else if (r === 'doctor') {
      if (!pick) out.push([k, { kind: 'heal', text: 'You did not protect anyone last night.', tone: 'neutral' }]);
      else if (saved.has(key(pick))) out.push([k, { kind: 'heal', text: `You protected ${pick}. They were attacked, and you saved them!`, tone: 'good', target: pick }]);
      else out.push([k, { kind: 'heal', text: `You protected ${pick}. It was a quiet night for them.`, tone: 'neutral', target: pick }]);
    } else if (r === 'detective') {
      if (!pick) out.push([k, { kind: 'investigate', text: 'You did not investigate anyone last night.', tone: 'neutral' }]);
      else if (detectiveMode === 'manual') out.push([k, { kind: 'investigate', text: `You investigated ${pick}. The moderator will tell you what they found.`, tone: 'neutral', target: pick, pending: true }]);
      else {
        const tr = displayRole(pick);
        const bad = tr === 'werewolf' || tr === 'serialkiller' || tr === 'joker';
        const label = bad ? (tr === 'serialkiller' ? 'Killer' : 'Wolf') : 'Civilian';
        const text = `${pick} is ${label === 'Killer' ? 'the Killer' : 'a ' + label}.`;
        const clue = { id: nextClueId++, kind: 'check', about: pick, result: bad ? 'wolf' : 'civilian', label, text, ts: now(), private: true };
        out.push([k, { kind: 'investigate', text, tone: bad ? 'bad' : 'good', target: pick, clue }]);
      }
    }
  }
  return out;
}

// ---- Deaths, calling cards and manifestos ----
function addClue(kind, about, text) {
  const clue = { id: nextClueId++, kind, about, text, ts: now() };
  clues.push(clue);
  const m = msg(null, text, { clue });
  push(lobby, m);
  io.emit('lobby:message', m);
  io.emit('clue:reveal', clue);
}
// Announce a death and reveal any notes. card = the killer's calling card text, if any.
// Pick a random funny death line, avoiding the last few used.
let recentDeathLines = [];
function deathLine(victim) {
  const fresh = DEATH_LINES.map((_, i) => i).filter((i) => !recentDeathLines.includes(i));
  const i = fresh[Math.floor(Math.random() * fresh.length)];
  recentDeathLines = [...recentDeathLines, i].slice(-10);
  return DEATH_LINES[i].replace('{name}', victim);
}
function revealDeath({ victim, card, announce = true, line }) {
  if (announce) systemLobby(line || `☠️ ${victim} was found dead.`);
  if (card) addClue('card', victim, card);
  const manifesto = manifestos.get(key(victim));
  if (manifesto) addClue('manifesto', victim, manifesto);
  checkFamily();
}

// ---- The family: Mother, Father and Son ----
// Remember who the family members are (their role changes later).
let family = {};
let familyFlags = {};
function syncFamily() {
  for (const [k, r] of roles) if (FAMILY.includes(r)) family[r] = k;
}
const isDeadKey = (k) => killedNames.has(k) || mutedNames.has(k);
function checkFamily() {
  syncFamily();
  const { mother, father, son } = family;
  // The Son dies: the Mother turns Joker (joins the wolves), the Father turns Vigilante.
  if (son && isDeadKey(son) && !familyFlags.sonDown) {
    familyFlags.sonDown = true;
    const before = displayRoleMap();
    if (mother && !isDeadKey(mother) && roles.get(mother) === 'mother') roles.set(mother, 'joker');
    if (father && !isDeadKey(father) && roles.get(father) === 'father') roles.set(father, 'vigilante');
    announceRoleChanges(before);
    if (moderatorId) io.to(moderatorId).emit('notice', '🃏 The Son died: the Mother is now the Joker and the Father is the Vigilante.');
    if (!hardMode()) systemLobby('🃏 The Son is dead. Grief changes his parents: the Mother has become the Joker, and the Father has become the Vigilante.');
  }
  // Both parents die: the Son becomes Batman.
  if (mother && father && son && isDeadKey(mother) && isDeadKey(father) && !isDeadKey(son) && !familyFlags.batman && roles.get(son) === 'son') {
    familyFlags.batman = true;
    const before = displayRoleMap();
    roles.set(son, 'batman');
    announceRoleChanges(before);
    if (moderatorId) io.to(moderatorId).emit('notice', '🦇 Both parents died: the Son is now Batman.');
    if (!hardMode()) systemLobby('🦇 Both parents are gone. Their Son has become Batman, and he is watching the village.');
  }
}
// Batman's clue each morning: someone who used an ability, or someone an ability was used on.
// Never about the same player twice.
let batmanSeen = new Set();
const PAST = { kill: 'attacked', vigil: 'attacked', heal: 'protected', investigate: 'investigated', interrogate: 'interrogated' };
function batmanClue(self) {
  const options = [];
  for (const [actor, a] of nightActions) {
    if (!a.target || a.skip || actor === self) continue; // nothing he already knows
    const actorName = userByName(actor)?.name || actor;
    options.push({ about: key(actorName), text: `${actorName} used an ability tonight.` });
    options.push({ about: key(a.target), text: `${a.target} was ${PAST[a.kind]} tonight.` });
  }
  const fresh = options.filter((o) => !batmanSeen.has(o.about) && o.about !== self);
  if (!fresh.length) return { kind: 'clue', text: 'The night was quiet. You learned nothing new.', tone: 'neutral' };
  const pick = fresh[Math.floor(Math.random() * fresh.length)];
  batmanSeen.add(pick.about);
  return { kind: 'clue', text: pick.text, tone: 'neutral' };
}
// The Vigilante's shot at sunrise: kills unless the Doctor protected the target.
function vigilanteOutcome() {
  const out = [];
  for (const [k, a] of nightActions) {
    if (a.kind !== 'vigil' || !a.target || isDeadKey(k)) continue;
    if (!userByName(a.target) || killedNames.has(key(a.target))) continue;
    const healed = [...nightActions.values()].some((h) => h.kind === 'heal' && key(h.target) === key(a.target));
    out.push({ actor: k, target: a.target, saved: healed });
  }
  return out;
}
// The Serial Killer's calling card is left if the victim is the one they picked tonight.
function callingCardFor(victimName) {
  for (const [k, a] of nightActions) {
    if (a.kind === 'kill' && key(a.target) === key(victimName) && displayRole(k) === 'serialkiller') {
      return callingCards.get(k) || null;
    }
  }
  return null;
}

function familyInPlay(playerCount) {
  return roleConfig.family === 'on' || (roleConfig.family === 'auto' && playerCount >= 20);
}
// If one family member is in play, all three must be.
function familyProblem() {
  const have = FAMILY.filter((r) => [...roles.values()].includes(r));
  if (have.length && have.length < 3) return `The family plays together: also give out ${FAMILY.filter((r) => !have.includes(r)).map((r) => r[0].toUpperCase() + r.slice(1)).join(' and ')}.`;
  return null;
}

// Shuffle roles out to every player. Returns an error message, or null.
// quiet = don't announce yet (the game start does that).
function randomizeRoles(quiet = false) {
  const players = [...users.values()].filter((u) => u.id !== moderatorId);
  // The family (Mother, Father, Son) is dealt with 20+ players, or when switched on.
  const withFamily = familyInPlay(players.length);
  const special = roleConfig.werewolf + roleConfig.doctor + roleConfig.detective + roleConfig.officer + (withFamily ? 3 : 0);
  if (players.length === 0) return 'There are no players to give roles to.';
  if (special > players.length) return `Not enough players: you picked ${special} special roles but there are only ${players.length} players.`;
  const deck = [...Array(roleConfig.werewolf).fill('werewolf'), ...Array(roleConfig.doctor).fill('doctor'), ...Array(roleConfig.detective).fill('detective'), ...Array(roleConfig.officer).fill('officer'), ...(withFamily ? FAMILY : [])];
  while (deck.length < players.length) deck.push('civilian');
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const before = displayRoleMap();
  roles = new Map(players.map((p, i) => [key(p.name), deck[i]]));
  protectedNames = new Set();
  family = {};
  familyFlags = {};
  batmanSeen = new Set();
  startWolves = 0;
  syncFamily();
  if (!quiet) {
    announceRoleChanges(before, true);
    systemLobby('The moderator handed out secret roles. Check your pop-up!');
  }
  return null;
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

  // Character select: each character can be picked by one player at a time.
  socket.on('character:pick', (id, ack) => {
    const u = me();
    if (!u) return;
    if (id === null || id === undefined) {
      u.character = null;
    } else {
      if (!CHARACTERS.includes(id)) return ack?.({ ok: false, error: 'Unknown character.' });
      const holder = [...users.values()].find((o) => o !== u && o.character === id);
      if (holder) return ack?.({ ok: false, error: `${holder.name} already picked that character.` });
      u.character = id;
    }
    ack?.({ ok: true });
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
    syncFamily();
    // While the moderator is still handing out roles, players aren't told yet:
    // everyone gets their final role when the game starts.
    if (gameState !== 'assigning') announceRoleChanges(before);
    if (gameState === 'running' && FAMILY.includes(role)) {
      const fam = familyProblem();
      if (fam) socket.emit('notice', fam);
    }
    broadcastState();
  });

  // Detective check: the moderator answers "wolf" or "civilian" about a player. It stays in the asker's chat.
  socket.on('mod:check', ({ to, target, result } = {}) => {
    if (!isMod(socket)) return;
    if (result !== 'wolf' && result !== 'civilian') return;
    const asker = key(String(to || ''));
    if (!userByName(asker) && !modThreads.has(asker)) return socket.emit('notice', 'Pick a player to answer.');
    const t = userByName(String(target || ''));
    const targetName = t ? t.name : String(target || '').slice(0, 20);
    if (!targetName) return socket.emit('notice', 'Pick who they asked about.');
    // With a single wolf the answer reads "Killer" instead of "Wolf".
    const label = result === 'wolf' ? (wolfCount() === 1 ? 'Killer' : 'Wolf') : 'Civilian';
    pushModThread(asker, msg(me().name, `${targetName} is ${label === 'Civilian' ? 'a civilian' : 'the ' + label.toLowerCase()}`, {
      moderator: true,
      check: { target: targetName, result, label },
    }));
    // The result also goes into that detective's own, private clues.
    const clue = { id: nextClueId++, kind: 'check', about: targetName, result, label, text: `${targetName} is ${label === 'Killer' ? 'the Killer' : 'a ' + label}.`, ts: now(), private: true };
    if (!privateClues.has(asker)) privateClues.set(asker, []);
    privateClues.get(asker).push(clue);
    const detective = userByName(asker);
    if (detective) io.to(detective.id).emit('clue:reveal', clue);
    // Fill in a waiting result for this player if there is one, otherwise add a new one.
    const waiting = (abilityLog.get(asker) || []).filter((e) => e.pending && key(e.target || '') === key(targetName)).pop();
    const answer = { text: clue.text, tone: result === 'wolf' ? 'bad' : 'good', fromModerator: true, pending: false };
    if (waiting) Object.assign(waiting, answer);
    else addAbilityResult(asker, { kind: 'investigate', target: targetName, ...answer });
    broadcastState();
  });

  socket.on('detective:mode', (mode) => {
    if (!isMod(socket) || (mode !== 'auto' && mode !== 'manual')) return;
    detectiveMode = mode;
    socket.emit('notice', mode === 'auto' ? '🔍 Detectives now learn their results automatically at sunrise.' : '🔍 You now answer the Detective yourself.');
    broadcastState();
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
    for (const r of ['werewolf', 'doctor', 'detective', 'officer']) {
      const n = Number(cfg[r]);
      if (Number.isInteger(n) && n >= 0 && n <= 20) roleConfig[r] = n;
    }
    if (['auto', 'on', 'off'].includes(cfg.family)) roleConfig.family = cfg.family;
    if (['normal', 'hard'].includes(cfg.difficulty)) roleConfig.difficulty = cfg.difficulty;
    if (typeof cfg.interrogate === 'boolean') roleConfig.interrogate = cfg.interrogate;
    broadcastState();
  });

  socket.on('roles:randomize', () => {
    if (!isMod(socket)) return;
    const err = randomizeRoles(gameState === 'assigning');
    if (err) return socket.emit('notice', err);
    broadcastState();
  });

  // Start a new game from the start menu.
  // New game from the start menu. With random roles it starts right away;
  // otherwise it waits while the moderator hands out roles by hand.
  socket.on('game:start', ({ randomize } = {}) => {
    if (!isMod(socket) || gameState !== 'waiting') return;
    if (randomize) {
      if (roleConfig.werewolf < 1) return socket.emit('notice', 'Add at least one killer (Werewolf) to the roles first.');
      const err = randomizeRoles(true);
      if (err) return socket.emit('notice', err);
      return beginGame(true);
    }
    gameState = 'assigning';
    systemLobby('🎭 The moderator is handing out roles. The game starts soon…');
    broadcastState();
  });

  // Manual roles: start once at least one killer has a role.
  socket.on('game:begin', () => {
    if (!isMod(socket) || gameState !== 'assigning') return;
    if (wolfCount() < 1) return socket.emit('notice', 'Give at least one player the Werewolf role first (one Werewolf plays as the Serial Killer).');
    const fam = familyProblem();
    if (fam) return socket.emit('notice', fam);
    syncFamily();
    beginGame(false);
  });

  // Back from handing out roles to the start menu.
  socket.on('game:cancel', () => {
    if (!isMod(socket) || gameState !== 'assigning') return;
    gameState = 'waiting';
    systemLobby('The moderator went back to the start menu.');
    broadcastState();
  });

  function beginGame(dealt) {
    gameState = 'running';
    startWolves = wolfCount();
    nightNumber = 0;
    phase = 'day';
    phaseStartedAt = Date.now();
    io.emit('game:started');
    systemLobby('🎮 A new game has started! It is day.');
    // Players without a role are Civilians; then everyone gets their final role at once.
    for (const u of users.values()) if (u.id !== moderatorId && !roles.has(key(u.name))) roles.set(key(u.name), 'civilian');
    announceRoleChanges(new Map(), true);
    systemLobby('Everyone has a secret role now. Check your pop-up!');
    io.emit('phase:changed', { phase, silent: true });
    broadcastState();
  }

  // End the game: wipe everything and go back to the start menu.
  socket.on('game:end', () => {
    if (!isMod(socket) || gameState === 'waiting') return;
    wipeEverything('The moderator ended the game.');
    broadcastState();
  });

  // The moderator removes a player from the game. Their role and protection are cleared.
  // Kick everyone and reset: all players (and bots) go back to the join screen,
  // everything is wiped and character picks are cleared.
  socket.on('mod:kickAll', () => {
    if (!isMod(socket)) return;
    for (const u of [...users.values()]) {
      if (u.id === socket.id) continue;
      users.delete(u.id);
      if (u.bot) continue;
      const sock = io.sockets.sockets.get(u.id);
      sock?.emit('kicked', { reset: true });
      sock?.disconnect(true);
    }
    me().character = null;
    wipeEverything('The moderator reset the game.');
    lobby = [];
    io.emit('lobby:history', []);
    systemLobby('🔄 The game was reset. Waiting for players to join.');
    socket.emit('game:reset');
    broadcastState();
  });

  socket.on('mod:kick', (name) => {
    if (!isMod(socket)) return;
    const target = userByName(String(name || ''));
    if (!target || target.id === socket.id) return;
    const before = displayRoleMap();
    roles.delete(key(target.name));
    protectedNames.delete(key(target.name));
    wipeVotes.delete(target.id);
    if (trial && trial.open) trial.votes.delete(target.name);
    nightActions.delete(key(target.name));
    autoProtected.delete(key(target.name));
    manifestos.delete(key(target.name));
    callingCards.delete(key(target.name));
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

  socket.on('card:set', (text) => {
    const u = me();
    if (!u || displayRole(u.name) !== 'serialkiller') return;
    const t = typeof text === 'string' ? text.trim().slice(0, CARD_MAX) : '';
    if (t) callingCards.set(key(u.name), t);
    else callingCards.delete(key(u.name));
    socket.emit('notice', t ? '🃏 Calling card saved.' : 'Calling card removed.');
    broadcastState();
  });

  socket.on('manifesto:set', (text) => {
    const u = me();
    if (!u || isMod(socket)) return;
    if (killedNames.has(key(u.name)) || mutedNames.has(key(u.name))) return socket.emit('notice', 'You can no longer change your manifesto.');
    const t = typeof text === 'string' ? text.trim().slice(0, MANIFESTO_MAX) : '';
    if (t) manifestos.set(key(u.name), t);
    else manifestos.delete(key(u.name));
    socket.emit('notice', t ? '📜 Manifesto saved.' : 'Manifesto removed.');
    broadcastState();
  });

  // The moderator marks a player dead (or brings them back). Dead players can only talk to the moderator.
  socket.on('mod:kill', (name) => {
    if (!isMod(socket)) return;
    const target = userByName(String(name || ''));
    if (!target || target.id === moderatorId) return;
    const k = key(target.name);
    if (killedNames.has(k)) {
      killedNames.delete(k);
      mutedNames.delete(k);
      pendingReveals = pendingReveals.filter((r) => key(r.victim) !== k);
      systemLobby(`✨ ${target.name} is back among the living.`);
      return broadcastState();
    }
    killedNames.add(k);
    mutedNames.add(k);
    nightActions.delete(k);
    const reveal = { victim: target.name, card: callingCardFor(target.name) };
    if (phase === 'night') {
      pendingReveals.push(reveal); // discovered at sunrise
      socket.emit('notice', `${target.name} is dead. It will be revealed when day starts.`);
    } else {
      // A daytime death gets its own pop-up for everyone.
      io.emit('death:shown', { victim: target.name, wolf: isWerewolf(target.name) && !hardMode() });
      revealDeath(reveal);
    }
    broadcastState();
  });

  socket.on('arrest:choose', (target) => {
    const u = me();
    if (!u || isMod(socket)) return;
    const err = makeArrest(u.name, String(target || ''));
    if (err) return socket.emit('notice', err);
    broadcastState();
  });

  socket.on('night:choose', (target) => {
    const u = me();
    if (!u || isMod(socket)) return;
    const err = setNightAction(u.name, target ? String(target) : null);
    if (err) return socket.emit('notice', err);
    if (actionKindFor(u.name) === 'kill' && target) {
      for (const b of bots()) if (actionKindFor(b.name) === 'kill' && livingWolves().includes(key(b.name))) setNightAction(b.name, String(target));
    }
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
    if (gameState !== 'running') return socket.emit('notice', 'Start a new game first.');
    const newNight = p === 'night' && phase !== 'night';
    const wasNight = phase === 'night';
    phase = p;
    phaseStartedAt = Date.now();
    // Sunrise locks in tonight's picks; the next night starts new messages.
    if (p === 'day') lockActionMessages();
    if (newNight) {
      // Yesterday's arrest now blocks that player's ability for the night.
      arrestedTonight = dayArrest ? key(dayArrest.target) : null;
      lastArrest = dayArrest;
      dayArrest = null;
      nightNumber++;
      // A fresh night: everyone picks again, and last night's protections end.
      actionMsgs = new Map();
      nightActions = new Map();
      autoProtected.clear();
      protectedNames = new Set();
      scheduleBotActions();
    }
    io.emit('phase:changed', { phase });
    systemLobby(p === 'night' ? 'Night falls over the village.' : 'The sun rises. It is day.');
    if (p === 'day' && wasNight) {
      // Settle the night: the agreed, unhealed victim dies.
      const outcome = nightOutcome();
      let list = pendingReveals;
      pendingReveals = [];
      if (outcome.victim) {
        const card = callingCardFor(outcome.victim);
        killPlayer(outcome.victim);
        if (!list.some((r) => key(r.victim) === key(outcome.victim))) list = [{ victim: outcome.victim, card }, ...list];
      }
      if (moderatorId) io.to(moderatorId).emit('notice', `🌅 ${OUTCOME_TEXT[outcome.reason](outcome)}.`);
      // The Vigilante's shot.
      const vig = vigilanteOutcome();
      for (const v of vig) {
        if (v.saved || list.some((r) => key(r.victim) === key(v.target))) continue;
        killPlayer(v.target);
        list.push({ victim: v.target, card: null });
        if (moderatorId) io.to(moderatorId).emit('notice', `🎯 The Vigilante killed ${v.target}.`);
      }
      const results = abilityResults(outcome, vig);
      // Give the sunrise animation a moment before the news.
      setTimeout(() => {
        // Night deaths get a funny morning story.
        for (const r of list) r.line = deathLine(r.victim);
        // Which animation to show: a lone Serial Killer or the wolf pack.
        // A werewolf among the dead gets the silver-bullet animation instead.
        const killer = list.some((r) => isWerewolf(r.victim)) && !hardMode() ? 'wolfdeath' : pickNightAnimation(wolfCount() === 1 ? 'killer' : 'night');
        io.emit('night:result', { victims: list.map((r) => r.victim), lines: list.map((r) => r.line), killer });
        if (!list.length) systemLobby('🌅 Nobody died last night.');
        for (const r of list) revealDeath(r);
        // Then each ability player gets their own result.
        for (const [k, entry] of results) sendAbilityResult(k, entry);
        arrestedTonight = null;
        lastArrest = null;
        scheduleBotArrest();
        broadcastState();
      }, 1800);
    }
    broadcastState();
  });

  // ---- Trial ----
  socket.on('trial:start', (name) => {
    if (!isMod(socket)) return;
    if (gameState !== 'running') return socket.emit('notice', 'Start a new game first.');
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

// The AI helper: players can ask it questions about the game.
//
// The AI never runs the game or decides anything. All game logic stays in server.js.
// It only answers questions, and for every question its context is built here from
// ONLY what that one player is allowed to know. Anything not put in the context can't leak,
// however the question is worded.

// ---------- Fixed texts: always right and free ----------

const ROLE_LABEL = {
  civilian: 'Civilian',
  prostitute: 'Prostitute',
  werewolf: 'Werewolf',
  serialkiller: 'Serial Killer',
  doctor: 'Doctor',
  detective: 'Detective',
  officer: 'Officer',
  mother: 'Mother',
  father: 'Father',
  son: 'Son',
  joker: 'Joker',
  vigilante: 'Vigilante',
  batman: 'Batman',
  dkjoker: 'The Joker',
  harley: 'Harley Quinn',
  ivy: 'Poison Ivy',
  clayface: 'Clayface',
};
// Game mode "The Dark Knight" renames the village roles.
const DK_LABEL = { civilian: 'Citizen', doctor: 'Thomas Wayne', detective: 'The Batman', officer: 'Commissioner Gordon' };
const DK_ROLE_INFO = {
  civilian: 'Citizen (Gotham side). You have no night ability. Talk in the main lobby, work out who The Joker and his villains are, and vote Guilty in trials to send them to Arkham Asylum.',
  doctor: 'Thomas Wayne (Gotham side). Each night pick one player to protect with the Protect button. You can protect yourself, but not two nights in a row. If The Joker picks that player, they survive. If Poison Ivy poisons you, you cannot protect anyone that night.',
  detective: 'The Batman (Gotham side). Each night pick one player to investigate. In the morning you learn their role. Careful: Clayface shows up as the role he chose as a disguise, and if Poison Ivy poisoned you that night your intel is wrong. You cannot investigate the same player twice.',
  officer: 'Commissioner Gordon (Gotham side). By day you may arrest one player (once per day, final). Everyone is told. The arrested player cannot vote that day and cannot use their ability the following night.',
  dkjoker: 'The Joker (villain). You are the only one who kills: each night pick one victim with the Kill button, or kill nobody. Scheme with the other villains at Amusement Mile, the secret chat of the villains, which is open at night. Thomas Wayne can save your victim.',
  harley: "Harley Quinn (villain, The Joker's sidekick). You have no ability. You win if The Joker wins, so help him stay hidden and steer the votes. You can talk with the villains at Amusement Mile at night.",
  ivy: 'Poison Ivy (villain). Each night pick one player to poison with the Poison button. If they have an ability it is confused that night: Thomas Wayne cannot protect, and The Batman gets wrong intel. You cannot poison other villains.',
  clayface: 'Clayface (villain). With the Disguise button you pick any role except The Batman. When The Batman investigates you, he sees that role instead of Clayface. You have no other ability.',
};
const DK_RULES = 'The Dark Knight mode: the village is Gotham. The Joker is the only killer. Villains (The Joker, Harley Quinn, Poison Ivy, Clayface) are not killed: when voted Guilty they are sent to Arkham Asylum. There is no Mother, Father or Son in this mode.';
const labelIn = (mode, r) => (mode === 'darkknight' && DK_LABEL[r]) || ROLE_LABEL[r] || r || 'no role yet';
const infoIn = (mode, r) => (mode === 'darkknight' && DK_ROLE_INFO[r]) || ROLE_INFO[r];

const ROLE_INFO = {
  prostitute:
    "Prostitute (village side). Each night choose whose house you spend the night at with the Stay with button, or pick yourself to stay home. If the wolves come for you while you are away, they find nobody and you survive. But if they come for the person you are staying with, you both die. At home, you can be attacked as normal.",
  civilian:
    'Civilian (village side). You have no night ability. Talk in the main lobby, work out who the killers are, and vote Guilty in trials to get rid of them. The village wins when all killers are gone.',
  werewolf:
    'Werewolf (wolf side). At night you and your pack pick one victim with the Kill button. Plan it in the wolf den, which is only open at night. Everyone in the pack must pick the same player, or nobody dies. You can also all choose "Kill nobody tonight". The Doctor can save your victim.',
  serialkiller:
    'Serial Killer (a lone werewolf, killer side). You work alone. Each night pick one victim with the Kill button, or kill nobody. You can write a calling card (100 characters) that is left with your victims. The Doctor can save your victim.',
  doctor:
    'Doctor (village side). Each night pick one player to protect with the Protect button. You can protect yourself, but not two nights in a row. If the killers pick that player, they survive. Your result shows in your Ability results the next morning.',
  detective:
    'Detective (village side). Each night pick one player to investigate. In the morning you learn if they are good (Civilian) or bad (Wolf or Killer). You cannot investigate the same player twice.',
  officer:
    'Officer (village side). By day you may arrest one player (once per day, final). Everyone is told. The arrested player cannot vote that day and cannot use their ability the following night. You get a result the next morning.',
  mother:
    'Mother (village side, part of the family with the Father and the Son). You have no night ability. If your Son dies, grief turns you into the Joker and you join the wolves.',
  father:
    'Father (village side, part of the family with the Mother and the Son). You have no night ability. If your Son dies, you become the Vigilante.',
  son: 'Son (village side, part of the family with the Mother and the Father). You have no night ability. If both your parents die, you become Batman.',
  joker:
    'Joker (wolf side). Your Son died, so you now hunt with the wolves: you join the wolf den and pick a victim with the pack at night. The Detective sees you as a Wolf.',
  vigilante:
    'Vigilante (village side). Your Son died. Each night you may kill one player with the Kill button, or choose to kill nobody. Be careful not to shoot a villager.',
  batman:
    'Batman (village side). Both your parents died. Every morning you get a clue in your Ability results: someone who used an ability, or someone an ability was used on. In games that started with 4+ wolves you may also interrogate one player at night: a villain is exposed to everyone, but if they are innocent you lose that ability.',
};

const RULES = {
  phases:
    'Day and night: the moderator switches between day and night. By day everyone talks in the main lobby and trials can happen. At night players with abilities make their choice. A timer next to the sun or moon shows how long the phase has lasted.',
  night:
    'Night actions: at night, players with an ability (Werewolves / Serial Killer kill, Doctor protects, Detective investigates, Vigilante kills, Batman interrogates) open their ability tile and pick a player. You can change your pick until morning. At sunrise the night is settled: the killers\' victim dies unless the Doctor protected them, and everyone with an ability gets a result in their Ability results.',
  trial:
    'Trials: by day the moderator can put a player on trial. Everyone else votes Guilty or Innocent; votes stay hidden until voting ends. If Guilty wins, that player is out: they are muted and can only talk to the moderator. A player arrested by the Officer cannot vote that day.',
  manifesto:
    'Manifesto: every player can write last words (200 characters) with the Manifesto button. It is revealed to everyone when you die, at sunrise for a night death. You cannot change it after you die.',
  card: 'Calling card: only the Serial Killer has one (100 characters). If the Serial Killer\'s victim dies, the card is found with them and shown to everyone when day starts.',
  wipe: 'Vote to wipe: when there is no moderator, players can vote to wipe. When every player has voted, all chats, roles and mutes are cleared and a new game can start. Bots and the moderator don\'t vote.',
  death:
    'Deaths: dead players can only talk to the moderator. Their manifesto is revealed. On Normal difficulty a werewolf death gets a special animation; on Hard, nothing about roles is revealed on death.',
  wolfden: 'Wolf den: a secret chat for the werewolves when there are two or more. Wolves can only write in it at night.',
  moderator: 'The moderator runs the game: switches day and night, starts trials, hands out roles and answers private messages in Talk to moderator.',
};

const RULES_TEXT = Object.values(RULES).join('\n');
const ROLES_TEXT = Object.values(ROLE_INFO).join('\n');

const roleLabel = (r) => ROLE_LABEL[r] || r || 'no role yet';

// Answers for common questions without asking the AI. Returns text, or null to ask the AI.
function fixedAnswer(question, view) {
  const q = ` ${String(question || '').toLowerCase()} `;
  // Questions about other players are never answered from the fixed texts.
  const aboutMe = /\b(my role|my job|my ability|my power|what am i|who am i|what do i do|what can i do|what does my)\b/.test(q);
  if (aboutMe && !/\b(use|now|tonight|today|left|still)\b/.test(q)) return myRoleAnswer(view);
  if (/\bhow (do|does|to)\b|\bwhat (is|are|does)\b|\bexplain\b|\brules?\b/.test(q)) {
    if (/\btrials?\b|\bguilty\b|\binnocent\b/.test(q)) return RULES.trial;
    if (/\bmanifesto|last words\b/.test(q)) return RULES.manifesto;
    if (/\bcalling card\b/.test(q)) return RULES.card;
    if (/\bwipe\b/.test(q)) return RULES.wipe;
    if (/\bwolf den\b/.test(q)) return RULES.wolfden;
    if (/\bnight actions?\b|\babilit(y|ies)\b/.test(q)) return RULES.night;
  }
  return null;
}
function myRoleAnswer(view) {
  if (!view || view.moderator) return 'You are the moderator: you run the game. ' + RULES.moderator;
  if (!view.role) return 'You don\'t have a role yet. You get one when the moderator starts the game.';
  return infoIn(view.mode, view.role) || `Your role is ${labelIn(view.mode, view.role)}.`;
}

// ---------- What one player is allowed to know ----------
//
// game: the server's live state (see aiGame() in server.js). This function is the ONLY
// place that reads it for the AI, and it only copies out what `name` may see:
//   - their own role and its rules, their own ability results, private clues and moderator chat
//   - public things: players alive/dead, deaths and announcements in the lobby, revealed clues,
//     trials (votes only after voting ended), the phase
//   - wolves: their pack and the pack's picks tonight
// Dead players get only what they knew when they died.
function playerView(game, name) {
  const k = String(name).toLowerCase();
  const me = game.players.find((p) => p.key === k);
  const isMod = !!me?.moderator;
  const diedAt = game.deathAt.get(k) ?? null;
  const dead = diedAt != null;
  // A dead player's knowledge stops at the moment they died.
  const known = (ts) => !dead || ts == null || ts <= diedAt;
  const hidden = game.gameState === 'assigning'; // roles are secret until the game starts

  const view = {
    name: me?.name || name,
    mode: game.mode || 'classic',
    moderator: isMod,
    phase: game.phase,
    night: game.nightNumber,
    gameState: game.gameState,
    difficulty: game.difficulty,
    dead,
    role: null,
    players: game.players.filter((p) => !p.moderator).map((p) => ({ name: p.name, dead: game.deathAt.has(p.key) && known(game.deathAt.get(p.key)) })),
    moderatorName: game.moderator,
    events: [],
    trial: null,
    abilityResults: [],
    privateClues: [],
    modChat: [],
    myManifesto: '',
    myCard: '',
    action: null,
    pack: null,
    disguise: null,
  };
  // The moderator gets the general rules only, never the game's secrets.
  if (isMod || !me) return view;

  view.role = hidden ? null : game.displayRole(k);

  // Public: announcements and revealed notes in the main lobby (not players' chatter).
  view.events = game.lobby
    .filter((m) => (m.system || m.clue) && known(m.ts))
    .slice(-25)
    .map((m) => (m.clue ? clueLine(m.clue) : m.text));

  // Public: the trial. Votes are secret until voting ends.
  if (game.trial && known(game.trial.startedAt)) {
    const t = game.trial;
    view.trial = { accused: t.accusedName, open: t.open, result: t.open ? null : t.result };
    if (!t.open) view.trial.votes = [...t.votes.entries()].map(([n, v]) => `${n}: ${v}`);
    else view.trial.myVote = t.votes.get(me.name) || null;
  }

  // Their own private things.
  view.abilityResults = (game.abilityLog.get(k) || []).filter((e) => known(e.ts)).slice(-10).map((e) => ({ night: e.night, text: e.pending ? 'Waiting for the moderator…' : e.text }));
  view.privateClues = (game.privateClues.get(k) || []).filter((c) => known(c.ts)).slice(-10).map((c) => c.text || `${c.about}: ${c.label}`);
  view.modChat = (game.modThreads.get(k) || [])
    .filter((m) => known(m.ts))
    .slice(-10)
    .filter((m) => modText(m))
    .map((m) => `${m.from === me.name ? 'You' : m.moderator ? 'Moderator' : m.from}: ${modText(m)}`);
  view.myManifesto = game.manifestos.get(k) || '';
  if (view.role === 'serialkiller') view.myCard = game.callingCards.get(k) || '';

  // Their own ability right now (alive players only).
  if (!dead && !hidden) {
    const a = game.actionFor(me.name);
    if (a) view.action = { kind: a.kind, chosen: a.skip ? 'nobody' : a.target || null, canChooseNow: a.kind === 'arrest' ? game.phase === 'day' && !a.done : game.phase === 'night' && !a.blocked, blocked: !!a.blocked, targets: a.targets || [] };
  }

  // Wolves: their pack. Picks only while they are alive.
  if (!hidden && game.disguiseOf) view.disguise = game.disguiseOf(k);
  if (!hidden && (game.isVillain ? game.isVillain(k) : ['werewolf', 'joker'].includes(game.roleOf(k)))) {
    const pack = game.wolfNames().filter((n) => n.toLowerCase() !== k);
    if (pack.length) {
      view.pack = pack.map((n) => {
        const p = { name: n, role: labelIn(view.mode, game.displayRole(n.toLowerCase())) };
        if (!dead && game.phase === 'night') {
          const pick = game.nightActions.get(n.toLowerCase());
          p.pick = pick?.skip ? 'nobody' : pick?.target || 'not chosen yet';
        }
        return p;
      });
    }
  }
  return view;
}
function clueLine(c) {
  if (c.kind === 'card') return `Calling card found with ${c.about}: "${c.text}"`;
  if (c.kind === 'manifesto') return `${c.about}'s manifesto: "${c.text}"`;
  return c.text;
}
function modText(m) {
  if (m.role) return ''; // the role is already given above, with the right name for the game mode
  if (m.check) return `Investigation result: ${m.check.target} is ${m.check.label || m.check.result}.`;
  if (m.action) return m.action.skip ? 'Night action: kill nobody.' : m.action.target ? `Night action: ${m.action.kind} ${m.action.target}.` : '';
  return m.text || '';
}

// ---------- The prompt ----------
function buildSystemPrompt(view) {
  const L = [];
  L.push(
    'You are the Village Helper in an online werewolf-style social deduction game called Village Chat.',
    'Answer the player\'s questions about the game in 1-4 short sentences. Stay in the cozy village theme.',
    'Only talk about this game. You do not run the game and cannot change anything; the moderator and the game do that.',
    'You only know what is written below. It is everything this player is allowed to know. If the answer is not here, say you don\'t know. Never guess other players\' roles or night picks.',
    '',
    '# Rules',
    RULES_TEXT,
    '',
    '# Roles',
    view.mode === 'darkknight' ? DK_RULES + '\n' + Object.values(DK_ROLE_INFO).join('\n') : ROLES_TEXT,
    '',
    '# This player'
  );
  if (view.moderator) {
    L.push(`${view.name} is the moderator. Help with the rules only.`);
    return L.join('\n');
  }
  L.push(`Name: ${view.name}`);
  L.push(`Role: ${view.role ? labelIn(view.mode, view.role) : 'none yet'}`);
  if (view.disguise) L.push(`Your disguise: The Batman sees you as ${labelIn(view.mode, view.disguise)}.`);
  L.push(`Status: ${view.dead ? 'dead (can only talk to the moderator; knows only what happened before dying)' : 'alive'}`);
  L.push(`Game: ${view.gameState === 'running' ? `running, ${view.phase}${view.night ? `, night ${view.night} so far` : ''}` : view.gameState === 'assigning' ? 'the moderator is handing out roles' : 'not started'}`);
  L.push(`Difficulty: ${view.difficulty}`);
  L.push(`Moderator: ${view.moderatorName || 'nobody yet'}`);
  L.push(`Players: ${view.players.map((p) => p.name + (p.dead ? ' (dead)' : '')).join(', ') || 'none'}`);
  if (view.action) {
    const a = view.action;
    L.push(
      `Ability: ${a.kind}. ${a.blocked ? 'Blocked tonight (arrested).' : a.canChooseNow ? 'Can be used now.' : a.kind === 'arrest' ? 'Only by day, once per day.' : 'Only at night.'}` +
        (a.chosen ? ` Current choice: ${a.chosen}.` : '') +
        (a.canChooseNow && a.targets.length ? ` Can pick: ${a.targets.join(', ')}.` : '')
    );
  }
  if (view.pack) {
    L.push((view.mode === 'darkknight' ? 'Your team (the other villains): ' : 'Your pack (the other wolves): ') + view.pack.map((p) => `${p.name} (${p.role})${!p.pick ? '' : p.pick === 'not chosen yet' ? ', has not picked yet' : ' picked ' + p.pick}`).join(', '));
  }
  if (view.myManifesto) L.push(`Your manifesto: "${view.myManifesto}"`);
  if (view.myCard) L.push(`Your calling card: "${view.myCard}"`);
  if (view.abilityResults.length) L.push('Your ability results:\n' + view.abilityResults.map((e) => `- Night ${e.night}: ${e.text}`).join('\n'));
  if (view.privateClues.length) L.push('Your private clues:\n' + view.privateClues.map((c) => '- ' + c).join('\n'));
  if (view.trial) {
    const t = view.trial;
    L.push(t.open ? `Trial now: ${t.accused} is on trial, voting is open.${t.myVote ? ' You voted ' + t.myVote + '.' : ''}` : `Last trial: ${t.accused} was found ${t.result}. Votes: ${t.votes.join(', ') || 'none'}.`);
  }
  if (view.modChat.length) L.push('Your private chat with the moderator (latest):\n' + view.modChat.map((l) => '- ' + l).join('\n'));
  if (view.events.length) L.push('\n# Public events (latest last)\n' + view.events.map((e) => '- ' + e).join('\n'));
  return L.join('\n');
}

// history: [{ role: 'user'|'assistant', text }] from this player's AI chat (oldest first).
function buildMessages(view, history, question) {
  const msgs = [{ role: 'system', content: buildSystemPrompt(view) }];
  for (const h of history.slice(-6)) msgs.push({ role: h.role === 'user' ? 'user' : 'assistant', content: String(h.text).slice(0, 1000) });
  msgs.push({ role: 'user', content: question });
  return msgs;
}

// ---------- Talking to Ollama ----------
const OLLAMA_OPTIONS = { num_ctx: 8192, temperature: 0.3, num_predict: 300 }; // the same on every call

// Streams one answer. Calls onToken(text) for each piece. Resolves with the full text.
async function streamChat({ url, model, messages, fetchImpl = fetch, signal, onToken }) {
  const res = await fetchImpl(url.replace(/\/+$/, '') + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true, keep_alive: '24h', options: OLLAMA_OPTIONS }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Ollama answered ${res.status}`);
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  const handle = (line) => {
    if (!line.trim()) return false;
    const data = JSON.parse(line);
    if (data.error) throw new Error(String(data.error));
    const piece = data.message?.content || '';
    if (piece) {
      full += piece;
      onToken?.(piece);
    }
    return !!data.done;
  };
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (handle(line)) return full;
    }
  }
  handle(buf);
  return full;
}

// Queue and limits. Ollama runs on a CPU, one answer at a time.
class AiHelper {
  constructor({ url, model, fetchImpl, timeoutMs = 90000, maxQueue = 3, maxPerGame = 10, maxChars = 500, log = console } = {}) {
    this.url = (url || '').trim();
    this.model = model || 'qwen2.5:3b';
    this.fetchImpl = fetchImpl || ((...a) => fetch(...a));
    this.timeoutMs = timeoutMs;
    this.maxQueue = maxQueue;
    this.maxPerGame = maxPerGame;
    this.maxChars = maxChars;
    this.log = log;
    this.queue = []; // waiting jobs
    this.running = null;
    this.busyPlayers = new Set();
    this.used = new Map(); // player key -> questions asked this game
  }
  get enabled() {
    return !!this.url;
  }
  questionsLeft(k) {
    return Math.max(0, this.maxPerGame - (this.used.get(k) || 0));
  }
  isBusy(k) {
    return this.busyPlayers.has(k);
  }
  resetCounts() {
    this.used.clear();
  }
  // Checks the limits and queues the question. Returns { ok: true } or { ok: false, reason, text }.
  // job: { player, messages, onStart, onToken, onDone(text), onError(text) }
  ask(job) {
    if (!this.enabled) return { ok: false, reason: 'off', text: 'The AI is offline right now. Try the My role button, or ask the moderator.' };
    if (this.busyPlayers.has(job.player)) return { ok: false, reason: 'one', text: 'Wait for your last answer first.' };
    if (this.questionsLeft(job.player) <= 0) return { ok: false, reason: 'limit', text: `You have used all ${this.maxPerGame} questions for this game. Ask the moderator instead.` };
    if (this.queue.length + (this.running ? 1 : 0) >= this.maxQueue) return { ok: false, reason: 'busy', text: 'The AI is busy, try again in a moment.' };
    this.used.set(job.player, (this.used.get(job.player) || 0) + 1);
    this.busyPlayers.add(job.player);
    this.queue.push(job);
    this.next();
    return { ok: true, position: this.queue.length + (this.running ? 1 : 0) - 1 };
  }
  next() {
    if (this.running || !this.queue.length) return;
    const job = (this.running = this.queue.shift());
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    const safe = (fn, ...a) => {
      try {
        fn?.(...a);
      } catch (e) {
        this.log.error?.('AI callback failed:', e);
      }
    };
    // Free the player and the queue first, so the player can ask again as soon as they get the answer.
    const finish = () => {
      clearTimeout(timer);
      this.busyPlayers.delete(job.player);
      this.running = null;
    };
    safe(job.onStart);
    streamChat({ url: this.url, model: this.model, messages: job.messages, fetchImpl: this.fetchImpl, signal: ctrl.signal, onToken: (t) => safe(job.onToken, t) })
      .then((text) => {
        finish();
        safe(job.onDone, text.trim() || 'Hmm, I have no answer for that. Try asking another way.');
      })
      .catch((e) => {
        finish();
        this.used.set(job.player, Math.max(0, (this.used.get(job.player) || 0) - 1)); // a failed answer doesn't use up a question
        this.log.warn?.('AI request failed:', e?.message || e);
        safe(job.onError, ctrl.signal.aborted ? 'The AI took too long to answer. Try again in a moment.' : 'The AI is not reachable right now. Try again later, or ask the moderator.');
      })
      .finally(() => this.next());
  }
}

module.exports = { DK_ROLE_INFO, DK_LABEL, ROLE_INFO, ROLE_LABEL, RULES, fixedAnswer, myRoleAnswer, playerView, buildSystemPrompt, buildMessages, streamChat, AiHelper, OLLAMA_OPTIONS };

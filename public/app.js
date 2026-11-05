/* global io, ART */
const socket = io();
const $ = (id) => document.getElementById(id);
const key = (n) => String(n).toLowerCase();

let me = null; // my name
let state = null; // latest public state from server
let channel = 'lobby'; // 'lobby' | 'mod' | 'group:<id>'
let lobbyMsgs = [];
const groupMsgs = {}; // id -> []
let myThread = []; // my private chat with the moderator
let modThreads = {}; // moderator only: key -> []
let selectedThread = null; // moderator only: key of member being viewed
const unreadThreads = new Set();
let modUnread = 0;
let currentPhase = 'day';
let trialPopupShownFor = null;

$('joinLogo').innerHTML = ART.night;

// ---------- Helpers ----------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 3500);
}
function amMod() {
  return !!state?.me?.moderator;
}
function amMuted() {
  return !!state?.me?.muted;
}
function displayName(k) {
  const u = state?.users.find((x) => key(x.name) === k);
  return u ? u.name : k;
}
function openModal(build) {
  const card = $('modalCard');
  card.innerHTML = '';
  build(card);
  $('modal').classList.remove('hidden');
}
function closeModal() {
  $('modal').classList.add('hidden');
}
$('modal').addEventListener('click', (e) => {
  if (e.target === $('modal')) closeModal();
});

// ---------- Join ----------
$('joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('nameInput').value.trim();
  socket.emit('join', name, (res) => {
    if (!res.ok) return ($('joinError').textContent = res.error);
    me = res.name;
    $('join').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('msgInput').focus();
  });
});

socket.on('disconnect', () => toast('Connection lost. Reconnecting…'));
socket.on('connect', () => {
  // After a reconnect the server forgot us; rejoin with the same name.
  if (me) {
    socket.emit('join', me, (res) => {
      if (!res.ok) toast('Could not rejoin: ' + res.error + ' Refresh the page.');
    });
  }
});

// ---------- Server events ----------
socket.on('state', (s) => {
  state = s;
  if (amMod() && !selectedThread) {
    const first = s.users.find((u) => !u.moderator);
    if (first) selectedThread = key(first.name);
  }
  if (channel.startsWith('group:') && !s.groups.some((g) => 'group:' + g.id === channel)) channel = 'lobby';
  renderAll();
  maybeShowTrialPopup();
});

socket.on('notice', toast);

socket.on('lobby:history', (list) => {
  lobbyMsgs = list;
  if (channel === 'lobby') renderMessages();
});
socket.on('lobby:message', (m) => {
  lobbyMsgs.push(m);
  if (channel === 'lobby') appendMessage(m);
});

socket.on('group:history', ({ id, messages }) => {
  groupMsgs[id] = messages;
  if (channel === 'group:' + id) renderMessages();
});
socket.on('group:message', ({ id, message }) => {
  (groupMsgs[id] ||= []).push(message);
  if (channel === 'group:' + id) appendMessage(message);
});
socket.on('group:opened', (id) => switchChannel('group:' + id));

socket.on('mod:thread', (list) => {
  myThread = list;
  if (channel === 'mod' && !amMod()) renderMessages();
});
socket.on('mod:threads', (threads) => {
  modThreads = threads;
  if (channel === 'mod' && amMod()) renderAll();
});
socket.on('mod:message', ({ thread, message }) => {
  if (amMod()) {
    (modThreads[thread] ||= []).push(message);
    if (channel === 'mod' && selectedThread === thread) appendMessage(message);
    else if (message.from !== me) unreadThreads.add(thread);
  } else {
    myThread.push(message);
    if (channel === 'mod') appendMessage(message);
  }
  if (channel !== 'mod' && message.from !== me) modUnread++;
  renderSidebar();
  if (channel === 'mod' && amMod()) renderThreadTabs();
});

socket.on('phase:changed', ({ phase, silent }) => {
  setPhase(phase, !silent);
});

socket.on('role:assigned', ({ role }) => {
  openModal((card) => {
    const art = el('div', 'art role');
    art.innerHTML = ART[role];
    card.append(art);
    card.append(el('h2', '', role === 'werewolf' ? 'You are a Werewolf' : 'You are a Civilian'));
    card.append(
      el(
        'p',
        '',
        role === 'werewolf'
          ? 'Hunt at night. Blend in during the day. Only you and the moderator can see this.'
          : 'Find the werewolves before it is too late. Only you and the moderator can see this.'
      )
    );
    const actions = el('div', 'actions');
    const ok = el('button', 'primary', 'Got it');
    ok.onclick = closeModal;
    actions.append(ok);
    card.append(actions);
  });
});
socket.on('roles:cleared', () => {
  modThreads = {};
  unreadThreads.clear();
  if (channel === 'mod') renderAll();
});

socket.on('trial:started', ({ accused }) => {
  trialPopupShownFor = null;
  // State arrives right after and will open the popup.
  setTimeout(maybeShowTrialPopup, 50, accused);
});
socket.on('trial:cleared', () => closeModal());
socket.on('trial:result', (r) => {
  openModal((card) => {
    const art = el('div', 'art');
    art.innerHTML = ART.scales;
    card.append(art);
    card.append(el('h2', '', `${r.accused} is`));
    card.append(el('h2', r.result === 'guilty' ? 'verdict-guilty' : 'verdict-innocent', r.result.toUpperCase()));
    card.append(el('p', '', `${r.guilty} guilty · ${r.innocent} innocent`));
    const ul = el('ul');
    if (r.votes.length === 0) ul.append(el('li', '', 'Nobody voted.'));
    for (const v of r.votes) {
      const li = el('li');
      li.append(el('span', '', v.name));
      li.append(el('b', v.vote === 'guilty' ? 'verdict-guilty' : 'verdict-innocent', v.vote));
      ul.append(li);
    }
    card.append(ul);
    if (r.result === 'guilty') {
      card.append(el('p', '', `${r.accused} is now muted and can only talk to the moderator until the main chat is wiped.`));
    }
    const actions = el('div', 'actions');
    const ok = el('button', 'primary', 'Close');
    ok.onclick = closeModal;
    actions.append(ok);
    card.append(actions);
  });
});

// ---------- Phase ----------
function setPhase(phase, animate) {
  currentPhase = phase;
  document.body.classList.toggle('night', phase === 'night');
  const corner = $('phaseCorner');
  if (!animate) {
    corner.innerHTML = ART[phase];
    return;
  }
  const ov = $('phaseOverlay');
  ov.innerHTML = ART[phase] + `<div class="caption">${phase === 'night' ? 'Night' : 'Day'}</div>`;
  ov.style.left = '';
  ov.style.top = '';
  ov.style.width = '';
  ov.style.height = '';
  ov.classList.remove('hidden');
  corner.style.visibility = 'hidden';
  // Pop in at the center.
  requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add('show')));
  clearTimeout(setPhase._t1);
  clearTimeout(setPhase._t2);
  // After a few seconds, fly into the corner.
  setPhase._t1 = setTimeout(() => {
    const cap = ov.querySelector('.caption');
    if (cap) cap.remove();
    const r = corner.getBoundingClientRect();
    ov.style.left = r.left + r.width / 2 + 'px';
    ov.style.top = r.top + r.height / 2 + 'px';
    ov.style.width = r.width + 'px';
    ov.style.height = r.height + 'px';
    setPhase._t2 = setTimeout(() => {
      corner.innerHTML = ART[phase];
      corner.style.visibility = '';
      ov.classList.remove('show');
      ov.classList.add('hidden');
    }, 950);
  }, 2600);
}

// ---------- Trial ----------
function canVote() {
  const t = state?.trial;
  if (!t || !t.open) return false;
  return !amMod() && !amMuted() && key(t.accused) !== key(me);
}
function myVote() {
  return state?.trial?.votes.find((v) => key(v.name) === key(me));
}
function maybeShowTrialPopup() {
  const t = state?.trial;
  if (!t || !t.open || trialPopupShownFor === t.accused) return;
  trialPopupShownFor = t.accused;
  openModal((card) => {
    const art = el('div', 'art');
    art.innerHTML = ART.scales;
    card.append(art);
    card.append(el('h2', '', `${t.accused} is on trial!`));
    if (key(t.accused) === key(me)) {
      card.append(el('p', '', 'The village is deciding your fate. Plead your case in the main chat.'));
    } else if (canVote()) {
      card.append(el('p', '', 'Cast your vote. Everyone will see who voted what when the trial ends.'));
    } else {
      card.append(el('p', '', 'The village is voting.'));
    }
    const actions = el('div', 'actions');
    if (canVote()) {
      const g = el('button', 'danger', 'Guilty');
      g.onclick = () => {
        socket.emit('trial:vote', 'guilty');
        closeModal();
      };
      const i = el('button', 'primary', 'Innocent');
      i.onclick = () => {
        socket.emit('trial:vote', 'innocent');
        closeModal();
      };
      actions.append(g, i);
    }
    const c = el('button', 'ghost', canVote() ? 'Later' : 'Close');
    c.onclick = closeModal;
    actions.append(c);
    card.append(actions);
  });
}

function openTrialPicker() {
  const candidates = state.users.filter((u) => !u.moderator);
  if (candidates.length === 0) return toast('There is nobody to put on trial.');
  openModal((card) => {
    const art = el('div', 'art');
    art.innerHTML = ART.scales;
    card.append(art);
    card.append(el('h2', '', 'Who goes on trial?'));
    const sel = el('select');
    for (const u of candidates) {
      const o = el('option', '', u.name + (u.muted ? ' (muted)' : ''));
      o.value = u.name;
      sel.append(o);
    }
    card.append(sel);
    const actions = el('div', 'actions');
    const go = el('button', 'danger', 'Put on trial');
    go.onclick = () => {
      socket.emit('trial:start', sel.value);
      closeModal();
    };
    const c = el('button', 'ghost', 'Cancel');
    c.onclick = closeModal;
    actions.append(go, c);
    card.append(actions);
  });
}

$('dayBtn').onclick = () => socket.emit('phase:set', 'day');
$('nightBtn').onclick = () => socket.emit('phase:set', 'night');
$('trialBtn').onclick = openTrialPicker;
$('endTrialBtn').onclick = () => socket.emit('trial:end');
$('cancelTrialBtn').onclick = () => socket.emit('trial:cancel');

// ---------- Roles ----------
document.querySelectorAll('#roleBar button').forEach((b) => {
  b.onclick = () => {
    if (!selectedThread) return;
    const name = displayName(selectedThread);
    socket.emit('mod:role', { to: name, role: b.dataset.role });
  };
});

// ---------- Channels ----------
function switchChannel(c) {
  channel = c;
  if (c === 'mod') modUnread = 0;
  $('sidebar').classList.remove('open');
  renderAll();
  $('msgInput').focus();
}
document.querySelectorAll('.sidebar .channel').forEach((b) => {
  b.onclick = () => switchChannel(b.dataset.channel);
});
$('menuBtn').onclick = () => $('sidebar').classList.toggle('open');

$('newGroupBtn').onclick = () => {
  openModal((card) => {
    card.append(el('h2', '', 'Create a group'));
    card.append(el('p', '', 'Only members of a group can read its messages.'));
    const input = el('input');
    input.maxLength = 30;
    input.placeholder = 'Group name';
    input.style.width = '100%';
    card.append(input);
    const actions = el('div', 'actions');
    const go = el('button', 'primary', 'Create');
    const create = () => {
      if (!input.value.trim()) return;
      socket.emit('group:create', input.value);
      closeModal();
    };
    go.onclick = create;
    input.addEventListener('keydown', (e) => e.key === 'Enter' && create());
    const c = el('button', 'ghost', 'Cancel');
    c.onclick = closeModal;
    actions.append(go, c);
    card.append(actions);
    setTimeout(() => input.focus(), 50);
  });
};

// ---------- Sending ----------
$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('msgInput').value.trim();
  if (!text) return;
  if (channel === 'lobby') socket.emit('lobby:send', text);
  else if (channel === 'mod') {
    if (amMod()) {
      if (!selectedThread) return toast('Pick a member to message.');
      socket.emit('mod:send', { to: displayName(selectedThread), text });
    } else socket.emit('mod:send', { text });
  } else socket.emit('group:send', { id: channel.slice(6), text });
  $('msgInput').value = '';
});

// ---------- Rendering ----------
function renderAll() {
  if (!state) return;
  renderSidebar();
  renderHeader();
  renderModToolbar();
  renderTrialBanner();
  renderThreadTabs();
  renderComposer();
  renderMessages();
}

function renderSidebar() {
  if (!state) return;
  document.querySelectorAll('.sidebar .channel').forEach((b) => {
    b.classList.toggle('selected', b.dataset.channel === channel);
  });
  $('modChannelLabel').textContent = amMod() ? 'Moderator inbox' : 'Talk to moderator';
  const badge = $('modUnread');
  badge.textContent = modUnread;
  badge.classList.toggle('hidden', modUnread === 0);

  const gl = $('groupList');
  gl.innerHTML = '';
  if (state.groups.length === 0) gl.append(el('div', 'section-title', 'No groups yet'));
  for (const g of state.groups) {
    const b = el('button', 'group-item' + (channel === 'group:' + g.id ? ' selected' : ''));
    b.append(el('span', '', '👥 ' + g.name));
    b.append(el('span', 'count', String(g.members.length)));
    b.onclick = () => switchChannel('group:' + g.id);
    gl.append(b);
  }

  const mb = $('modBox');
  mb.innerHTML = '';
  if (!state.moderator) {
    mb.append(el('div', '', 'No moderator yet.'));
    const b = el('button', '', 'Become moderator');
    b.onclick = () => socket.emit('mod:claim');
    mb.append(b);
  } else if (amMod()) {
    mb.append(el('div', '', 'You are the moderator.'));
    const others = state.users.filter((u) => !u.moderator);
    if (others.length) {
      const sel = el('select');
      for (const u of others) {
        const o = el('option', '', u.name);
        o.value = u.name;
        sel.append(o);
      }
      const t = el('button', '', 'Hand moderator to…');
      t.onclick = () => socket.emit('mod:transfer', sel.value);
      mb.append(sel, t);
    }
    const s = el('button', '', 'Step down');
    s.onclick = () => socket.emit('mod:stepDown');
    mb.append(s);
  } else {
    mb.append(el('div', '', '🛡️ ' + state.moderator));
  }

  $('playerCount').textContent = state.users.length;
  const pl = $('playerList');
  pl.innerHTML = '';
  for (const u of state.users) {
    const li = el('li', key(u.name) === key(me) ? 'me' : '');
    li.append(el('span', '', u.name));
    if (u.moderator) li.append(el('span', 'tag mod', 'mod'));
    if (u.muted) li.append(el('span', 'tag muted', 'muted'));
    pl.append(li);
  }
}

function currentGroup() {
  return channel.startsWith('group:') ? state.groups.find((g) => 'group:' + g.id === channel) : null;
}
function inCurrentGroup() {
  const g = currentGroup();
  return !!g && g.members.some((n) => key(n) === key(me));
}

function renderHeader() {
  const title = $('chatTitle');
  const actions = $('headerActions');
  actions.innerHTML = '';
  const wipe = (kind, label) => {
    const voted = kind === 'main' ? state.me.wipedMain : state.me.wipedMod;
    const n = kind === 'main' ? state.wipe.main : state.wipe.mod;
    const b = el('button', voted ? 'active' : '', `${voted ? '✓ ' : ''}${label} (${n}/${state.wipe.needed})`);
    b.title = 'Everyone must vote for the chat to be wiped. Click again to take back your vote.';
    b.onclick = () => socket.emit('wipe:vote', kind);
    actions.append(b);
  };
  if (channel === 'lobby') {
    title.textContent = '# Main lobby';
    wipe('main', '🧹 Vote to wipe');
  } else if (channel === 'mod') {
    title.textContent = amMod() ? '🛡️ Moderator inbox' : '🛡️ Private chat with moderator';
    wipe('mod', '🧹 Vote to wipe');
  } else {
    const g = currentGroup();
    title.textContent = '👥 ' + (g ? g.name : '');
    if (g) {
      const b = el('button', inCurrentGroup() ? 'ghost' : 'primary', inCurrentGroup() ? 'Leave group' : 'Join group');
      b.onclick = () => socket.emit(inCurrentGroup() ? 'group:leave' : 'group:join', g.id);
      actions.append(b);
    }
  }
}

function renderModToolbar() {
  const show = amMod() && channel === 'lobby';
  $('modToolbar').classList.toggle('hidden', !show);
  if (!show) return;
  const open = !!state.trial?.open;
  $('dayBtn').classList.toggle('active', state.phase === 'day');
  $('nightBtn').classList.toggle('active', state.phase === 'night');
  $('trialBtn').disabled = open;
  $('endTrialBtn').classList.toggle('hidden', !open);
  $('cancelTrialBtn').classList.toggle('hidden', !open);
}

function renderTrialBanner() {
  const t = state.trial;
  const banner = $('trialBanner');
  const show = !!t && t.open && channel === 'lobby';
  banner.classList.toggle('hidden', !show);
  if (!show) return;
  banner.innerHTML = '';
  banner.append(el('span', '', '⚖️'));
  banner.append(el('span', 'who', `${t.accused} is on trial`));
  banner.append(el('span', '', `· ${t.votes.length} voted${t.votes.length ? ': ' + t.votes.map((v) => v.name).join(', ') : ''}`));
  if (canVote()) {
    const mine = myVote();
    const g = el('button', 'danger', (mine ? 'Change: ' : '') + 'Guilty');
    g.onclick = () => socket.emit('trial:vote', 'guilty');
    const i = el('button', 'primary', (mine ? 'Change: ' : '') + 'Innocent');
    i.onclick = () => socket.emit('trial:vote', 'innocent');
    banner.append(g, i);
    if (mine) banner.append(el('span', '', '(vote cast)'));
  }
}

function renderThreadTabs() {
  const tabs = $('threadTabs');
  const show = amMod() && channel === 'mod';
  tabs.classList.toggle('hidden', !show);
  $('roleBar').classList.toggle('hidden', !show || !selectedThread);
  if (!show) return;
  const keys = new Set(state.users.filter((u) => !u.moderator).map((u) => key(u.name)));
  for (const k of Object.keys(modThreads)) if (k !== key(me)) keys.add(k);
  if (selectedThread && !keys.has(selectedThread)) selectedThread = null;
  if (!selectedThread && keys.size) selectedThread = [...keys][0];
  tabs.innerHTML = '';
  if (keys.size === 0) tabs.append(el('span', 'empty', 'No members yet.'));
  for (const k of keys) {
    const online = state.users.some((u) => key(u.name) === k);
    const b = el('button', k === selectedThread ? 'active' : '', displayName(k) + (online ? '' : ' (offline)'));
    if (unreadThreads.has(k)) b.append(el('span', 'dot'));
    b.onclick = () => {
      selectedThread = k;
      unreadThreads.delete(k);
      renderAll();
    };
    tabs.append(b);
  }
  $('roleTarget').textContent = selectedThread ? displayName(selectedThread) : '';
  if (selectedThread) unreadThreads.delete(selectedThread);
}

function renderComposer() {
  const input = $('msgInput');
  const btn = $('composer').querySelector('button');
  let disabled = false;
  let ph = 'Type a message…';
  if (channel === 'lobby') {
    if (amMuted()) {
      disabled = true;
      ph = 'You are muted. You can only talk to the moderator.';
    } else ph = 'Message the whole lobby…';
  } else if (channel === 'mod') {
    if (amMod()) {
      disabled = !selectedThread;
      ph = selectedThread ? `Private message to ${displayName(selectedThread)}…` : 'No member selected';
    } else ph = 'Only the moderator can see this…';
  } else {
    if (!inCurrentGroup()) {
      disabled = true;
      ph = 'Join the group to chat.';
    } else if (amMuted()) {
      disabled = true;
      ph = 'You are muted. You can only talk to the moderator.';
    } else ph = 'Message the group…';
  }
  input.disabled = disabled;
  btn.disabled = disabled;
  input.placeholder = ph;
}

function currentMessages() {
  if (channel === 'lobby') return lobbyMsgs;
  if (channel === 'mod') return amMod() ? modThreads[selectedThread] || [] : myThread;
  const g = currentGroup();
  if (!g) return [];
  return inCurrentGroup() ? groupMsgs[g.id] || [] : null;
}

function renderMessages() {
  const box = $('messages');
  box.innerHTML = '';
  const list = currentMessages();
  if (list === null) {
    box.append(el('div', 'empty', 'Join this group to see its messages.'));
    return;
  }
  if (list.length === 0) {
    let t = 'No messages yet. Say hello!';
    if (channel === 'mod') {
      t = amMod()
        ? selectedThread
          ? `No messages with ${displayName(selectedThread)} yet.`
          : 'Members who message you will appear here.'
        : 'Messages here are only seen by you and the moderator.';
    }
    box.append(el('div', 'empty', t));
    return;
  }
  for (const m of list) appendMessage(m, false);
  box.scrollTop = box.scrollHeight;
}

function appendMessage(m, scroll = true) {
  const box = $('messages');
  const empty = box.querySelector('.empty');
  if (empty) empty.remove();
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  let div;
  if (m.system) {
    div = el('div', 'msg system', m.text);
  } else {
    const mine = key(m.from) === key(me);
    div = el('div', 'msg' + (mine ? ' me' : '') + (m.moderator ? ' modmsg' : '') + (m.role ? ' role' : ''));
    if (m.role) {
      const art = el('span');
      art.innerHTML = ART[m.role];
      div.append(art);
      const wrap = el('div');
      wrap.append(el('div', 'from', m.from + ' (moderator)'));
      wrap.append(el('div', '', `Role given: ${m.role === 'werewolf' ? '🐺 Werewolf' : '🧑‍🌾 Civilian'}`));
      div.append(wrap);
    } else {
      const from = el('div', 'from', m.from + (m.moderator ? ' (moderator)' : ''));
      from.append(el('span', 'time', new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
      div.append(from);
      div.append(el('div', '', m.text));
    }
  }
  box.append(div);
  if (scroll && (nearBottom || key(m.from || '') === key(me))) box.scrollTop = box.scrollHeight;
}

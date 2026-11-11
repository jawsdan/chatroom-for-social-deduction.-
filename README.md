# Village Chat

A real-time chatroom for werewolf-style social deduction games.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000 (set `PORT` to change it). Everyone who wants to play opens the same address — to play with friends over the internet, host it somewhere like Render, Railway or Fly.io, or share your machine with a tunnel (e.g. ngrok).

## AI helper (optional)

The AI helper lives in each player's **Talk to moderator** chat: switch on **🤖 AI** next to the message box and messages go to the AI instead of the moderator. The moderator can read every player's AI questions and answers in that player's inbox tab. Players can ask things like *what does my role do?*, *can I use my ability now?*, *what happened last night?* or *how do trials work?*. Answers stream in word by word.

- **It only answers questions.** It never runs the game or decides anything; all game logic is plain code in `server.js`.
- **No leaks.** For each question the server builds the AI's context from only what that player is allowed to know: their own role and its rules, their own ability results, private clues and moderator chat, public events (deaths, trials, revealed calling cards / manifestos, announcements), the current phase and the general rules. Other players' roles, night picks, the wolf den and other private chats are never sent. Wolves also get their pack and the pack's picks. Dead players only get what they knew before they died. The moderator's AI only knows the rules. Bots never use the AI. See `playerView` in `ai.js`.
- **Fixed answers first.** Every role and the common rules (night actions, trials, manifesto, calling card, wipe votes) have a short fixed explanation in `ai.js`. They are shown instantly for *what does my role do*-type questions and by the **My role** button, cost nothing and work even when the AI is off. The same texts are in the AI's system prompt.
- **Limits** (the AI is slow on a CPU): one question at a time per player, at most 3 questions waiting in total (above that: *The AI is busy, try again in a moment*), 10 questions per player per game (reset on a new game or wipe; failed answers don't count), 500 characters per question, short answers (1-4 sentences), and only the last 6 messages of the player's AI chat as history. Each answer times out after 90 seconds.

Settings (environment variables):

| Variable | Default | What it does |
| --- | --- | --- |
| `OLLAMA_URL` | *(empty)* | Address of the Ollama server, e.g. `http://ollama:11434`. **Empty or unset = AI off**: the AI switch says *The AI is offline* (the *My role* button and fixed answers still work) and the rest of the game works normally. |
| `AI_MODEL` | `qwen2.5:3b` | The Ollama model to use. It must already be pulled on the Ollama server. |
| `PORT` | `3000` | The port the website runs on. |

The server only calls `POST {OLLAMA_URL}/api/chat` (streaming, `keep_alive: 24h`, always the same options: `num_ctx 8192`, `temperature 0.3`, `num_predict 300`, so the model never reloads). It never pulls, creates, copies or deletes models. It uses Node's built-in `fetch`; no extra packages.

Run the tests (no Ollama needed, it is faked):

```bash
npm test
```

## Game mode: The Dark Knight

On the start menu the moderator can switch the game mode between **Original** and **The Dark Knight** (only between games; switching clears the roles). Everyone's screen gets the Batman look (the villains get The Joker's). The background is Gotham's rooftops by day and Amusement Mile in the rain by night (`dk-day` / `dk-night` in `public/video`; character spots are `spotDk` in `public/characters.js`).

- **Gotham's side:** Citizen (Civilian), **Thomas Wayne** (the Doctor), **The Batman** (the Detective) and **Commissioner Gordon** (the Officer). There is no Mother, Father or Son in this mode.
- **The villains** meet at **Amusement Mile**, their secret chat, at night:
  - **The Joker** is the only one who kills: he picks a victim each night (or nobody).
  - **Harley Quinn** is his sidekick. She has no ability and wins if The Joker wins.
  - **Poison Ivy** poisons one player each night. A poisoned Thomas Wayne cannot protect that night (he is told), and a poisoned Batman gets wrong intel (he is not told).
  - **Clayface** picks a disguise with the *Disguise* button: any role except The Batman. The Batman sees him as that role.
- **The Batman's intel** names the role of the player he investigated (always automatic in this mode).
- **Arkham:** villains are not killed. When they are voted Guilty (or removed by the moderator) everyone is told they were sent to Arkham Asylum; on *Hard* nothing is said.
- **Roles:** random roles deal one Joker, the villains switched on in *Roles in this game* (Harley Quinn, Poison Ivy, Clayface) and the chosen number of Thomas Wayne / The Batman / Commissioner Gordon; everyone else is a Citizen. Handing out roles by hand needs one Joker.
- Only The Joker kills, so once he is in Arkham there are no more night kills.

## Features

- **Main menu** — before a game everyone sees a simple menu of big buttons, top to bottom: *Start game* (for the moderator; *Become moderator* when nobody runs the game, *Waiting to start* for players), *Choose character*, *Game mode*, *Role overview* (tap any role to see the same pop-up a player gets with that role), *Players* (the moderator adds or removes bots there), *Roles* and *Moderator* (moderator only: role setup, hand over or step down) and *Go to chat*. Each opens its own page with a Back button. Tap your name (top left; *Menu* on phones) to open it again, also during a game, and it opens by itself when a game ends.
- **Main lobby** — everyone who joins is here and can type. Players only have the main lobby and their private chat with the moderator.
- **Moderator** — anyone can click *Become moderator* when the seat is empty. The moderator can step down or hand the role to someone else. The moderator can read and write in every chat.
- **Talk to moderator** — every player has a private chat with the moderator. Nobody else sees it. The moderator sees one tab per player.
- **🤖 AI switch** — in *Talk to moderator*, players can ask the AI helper instead (see *AI helper* above). Off when `OLLAMA_URL` is empty.
- **Roles** — Civilian, Werewolf, Doctor, Detective (investigates at night) and Officer (arrests by day). If there is only **one** werewolf, they are shown as the **Serial Killer** instead. Each player gets a pop-up card with their role that only they can see.
  - Give roles one at a time from a player's tab in the moderator inbox, or
  - pick how many of each role to play with in *Roles in this game* and click *Hand out random roles*. Everyone left over is a Civilian.
- **Moderator's player list** — always shows every player's role. The 🛡️ button marks a player as *protected* so the moderator doesn't forget, and ✕ kicks a player (after a confirm). Only the moderator sees these.
- **The family (Mother, Father, Son)** — village-side roles that always play together. Random roles include them when 20+ players have joined (the moderator can set the Family switch to Auto 20+ / On / Off), and they can be handed out by hand; a game can't start with only part of the family.
  - **Son dies:** the Mother becomes the **Joker** and joins the wolves (wolf den, shared kill, reads as Wolf to the Detective); the Father becomes the **Vigilante** (village side, may kill one player each night or nobody).
  - **Announcements:** on *Normal* difficulty, everyone is told when the Son dies (and the parents change) and when Batman comes into play. On *Hard*, nothing about roles is revealed on death (no family announcements, no werewolf death animation).
  - **Interrogate:** in games that started with 4+ wolves (and with the moderator's *Interrogate* switch On), Batman may interrogate one player at night. A villain is exposed to everyone in the clues; an innocent costs Batman the ability for the rest of the game.
  - **Both parents die:** the Son becomes **Batman**, who gets one random clue every morning in his results — someone who used an ability, or someone an ability was used on — never about the same player twice.
  - Role pictures live in `public/img/roles` (and `sm/`). To change one, replace the file and bump `ROLE_IMG_VERSION` in `public/art.js`.
- **Officer (arrest)** — by day the Officer can arrest one player (final, once per day). Everyone is told. The arrested player cannot vote that day and cannot use their ability the following night (an arrested lone killer means no kill). The Officer gets a result the next morning. The Officer count is set in *Roles in this game* (0 by default).
- **Night actions** — at night the Werewolves / Serial Killer pick someone to kill, the Doctor picks someone to heal (they're marked protected automatically; the Doctor can protect themselves, but not two nights in a row) and the Detective picks someone to investigate. They can change their pick until morning. The moderator sees every pick in *Tonight's choices*, as a note in that player's chat and as a pop-up. Wolves also see their pack's picks. Picks and protections reset when the next night starts. Bots with roles pick at random.
- **Morning stories** — each night death comes with one of 30 stories about how the body was found. The Dark Knight has its own 30, about how The Joker left the body (`deaths.js`).
- **Deaths** — the moderator marks a player dead with 💀 (✨ brings them back). Dead players can only talk to the moderator. A guilty trial counts as a death too.
- **Calling card** (Serial Killer only, 100 characters) — if the moderator kills the player the Serial Killer picked that night, the card pops up for everyone when day starts.
- **Manifesto** (every player, 200 characters) — last words revealed when that player dies: at sunrise for a night death, right away otherwise.
- **Clues bar** — revealed calling cards and manifestos are posted in the main chat and collected in the *Clues* bar at the top, where anyone can click to read them again.
- **Moderator desk** — on computers and iPads the right side only shows the players. The moderator's tools are on the left: small tiles for *Roles* (good and bad team, one row per role with − and +, plus the settings), *Wipe* (a counter and who has voted), *Bots*, *Reset* (kick all) and *End game*, then the day/night controls, the trial and tonight's picks. The moderator's boxes are blue. On phones the same tiles are in the Game panel.
- **Moderator overview** — in the moderator inbox, three boxes show who is alive, who is dead, and which roles are still alive.
- **Ability results** — Werewolves / Serial Killer, the Doctor and the Detective get a personal *Ability results* box in the left sidebar. Every morning it shows what their night action did (who was killed, who was saved, whether the Detective's pick is good or bad), with a pop-up.
- **Ability players (moderator)** — the moderator's left sidebar lists every player with an ability, their role and their latest pick. Click one to open your private chat with them.
- **Characters** — The Firekeeper, Sleepy Snout, The Joker, Little Boo and Grinny (animated, with the background removed). The ghosts float a little above the ground.
- **Character select** — after entering a name you pick a character (or none). Your character stands by the campfire with your name above it, and turns into a ghost if you die. Each character can be picked by one player at a time. Tap your name card to change it. New characters are added in `public/characters.js` (and `CHARACTERS` in `server.js`).
- **Detective results: Automatic or Manual** — in *Roles in this game* the moderator picks whether the Detective learns good/bad automatically at sunrise, or the moderator answers by hand.
- **Detective checks** — when an Detective asks the moderator about someone, the moderator opens the Detective's tab, picks the player they asked about and clicks *Wolf* (or *Killer* when there is only one) or *Civilian*. The answer stays in the Detective's chat and is also saved, privately, in the Detective's clues bar.
- **Batman & Joker filters** — the Batman and Joker screens put a film filter over the background: cold, dark colors with rain, searchlights and lightning for Batman; purple-and-green colors with neon laughter and falling cards for the Joker.
- **Role themes** — each player's screen matches their own secret role: red with fangs and dripping blood for Werewolves, blood splatter for the Serial Killer, teal with a heartbeat line for the Doctor, police lights and caution tape for the Detective, and a village with clouds (fireflies at night) for Civilians. The moderator sees the plain look.
- **Test bots** — the moderator can add 1–10 bots. Bots count as players, get roles and vote at random in trials. They don't count for wipe votes. *Remove bots* takes them out again.
- **Wolf den** — a secret chat for the werewolves (when there are two or more). Wolves can only write in it at night. The moderator can always read it.
- **Day / Night** — the moderator switches the phase. A big sun or moon pops up in the middle of everyone's screen, then moves to the corner of the chat.
- **Phase videos** — the background is an animated campfire scene during the day and at night. They cross-fade when the phase changes and are stretched to fill the screen on computers and iPads (phones crop them instead). Big screens (2560x1440 and up) get sharper 1280x720 versions (`day-hd` / `night-hd` in `public/video`); character spots for those are `spotHd` in `public/characters.js`.
- **Phase timer** — a timer next to the sun/moon in the top corner counts up from 00:00 each time day or night starts. Everyone sees the same time.
- **Trial** — the moderator clicks *Put someone on trial* and picks a player. Everyone votes *Guilty* or *Innocent*. When everyone has voted (or the moderator clicks *End voting*), a pop-up shows who voted what. If guilty wins, that player is muted and can only talk to the moderator until the next wipe.
- **Kick all & reset** — the moderator can send everyone (players and bots) back to the join screen, wipe everything and clear all character picks, so everyone joins again and picks a character.
- **Vote to wipe** — one *Vote to wipe* button with a vote counter (it fills up as players vote). When **every player** has voted, all chats (main lobby, private moderator chats and the wolf den), roles, protections and mutes are cleared and it becomes day. The moderator doesn't vote (and can wipe straight away when no players are left). Bots don't vote either.

## Use it like an app (iPad / iPhone)

Open the site in Safari, tap **Share → Add to Home Screen**. It gets its own icon and opens full screen without the browser bars. Swipe in from the left or right edge to open the side panels on smaller screens.

Everything is kept in memory, so restarting the server clears it.

# Village Chat

A real-time chatroom for werewolf-style social deduction games.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000 (set `PORT` to change it). Everyone who wants to play opens the same address — to play with friends over the internet, host it somewhere like Render, Railway or Fly.io, or share your machine with a tunnel (e.g. ngrok).

## Features

- **Start menu** — the game waits in a start menu until the moderator presses *New game*. With random roles it starts right away; otherwise the moderator gives each player a role in the menu (players see *Waiting for the moderator to assign roles*) and presses *Start game*. A game needs at least one killer (Werewolf). The timer doesn't run until then. People can join at any time, also mid-game. *End game* wipes everything and returns to the start menu.
- **Main lobby** — everyone who joins is here and can type. Players only have the main lobby and their private chat with the moderator.
- **Moderator** — anyone can click *Become moderator* when the seat is empty. The moderator can step down or hand the role to someone else. The moderator can read and write in every chat.
- **Talk to moderator** — every player has a private chat with the moderator. Nobody else sees it. The moderator sees one tab per player.
- **Roles** — Civilian, Werewolf, Doctor and Officer. If there is only **one** werewolf, they are shown as the **Serial Killer** instead. Each player gets a pop-up card with their role that only they can see.
  - Give roles one at a time from a player's tab in the moderator inbox, or
  - pick how many of each role to play with in *Roles in this game* and click *Hand out random roles*. Everyone left over is a Civilian.
- **Moderator's player list** — always shows every player's role. The 🛡️ button marks a player as *protected* so the moderator doesn't forget, and ✕ kicks a player (after a confirm). Only the moderator sees these.
- **The family (Mother, Father, Son)** — village-side roles that always play together. Random roles include them when 20+ players have joined (the moderator can set the Family switch to Auto 20+ / On / Off), and they can be handed out by hand; a game can't start with only part of the family.
  - **Son dies:** the Mother becomes the **Joker** and joins the wolves (wolf den, shared kill, reads as Wolf to the Officer); the Father becomes the **Vigilante** (village side, may kill one player each night or nobody).
  - **Both parents die:** the Son becomes **Batman**, who gets one random clue every morning in his results — someone who used an ability, or someone an ability was used on — never about the same player twice.
  - Role pictures live in `public/img/roles` (and `sm/`). To change one, replace the file and bump `ROLE_IMG_VERSION` in `public/art.js`.
- **Night actions** — at night the Werewolves / Serial Killer pick someone to kill, the Doctor picks someone to heal (they're marked protected automatically) and the Officer picks someone to investigate. They can change their pick until morning. The moderator sees every pick in *Tonight's choices*, as a note in that player's chat and as a pop-up. Wolves also see their pack's picks. Picks and protections reset when the next night starts. Bots with roles pick at random.
- **Deaths** — the moderator marks a player dead with 💀 (✨ brings them back). Dead players can only talk to the moderator. A guilty trial counts as a death too.
- **Calling card** (Serial Killer only, 100 characters) — if the moderator kills the player the Serial Killer picked that night, the card pops up for everyone when day starts.
- **Manifesto** (every player, 200 characters) — last words revealed when that player dies: at sunrise for a night death, right away otherwise.
- **Clues bar** — revealed calling cards and manifestos are posted in the main chat and collected in the *Clues* bar at the top, where anyone can click to read them again.
- **Moderator overview** — in the moderator inbox, three boxes show who is alive, who is dead, and which roles are still alive.
- **Ability results** — Werewolves / Serial Killer, the Doctor and the Officer get a personal *Ability results* box in the left sidebar. Every morning it shows what their night action did (who was killed, who was saved, whether the Officer's pick is good or bad), with a pop-up.
- **Ability players (moderator)** — the moderator's left sidebar lists every player with an ability, their role and their latest pick. Click one to open your private chat with them.
- **Character select** — after entering a name you pick a character (or none). Your character stands by the campfire with your name above it, and turns into a ghost if you die. Each character can be picked by one player at a time. Tap your name card to change it. New characters are added in `public/characters.js` (and `CHARACTERS` in `server.js`).
- **Officer results: Automatic or Manual** — in *Roles in this game* the moderator picks whether the Officer learns good/bad automatically at sunrise, or the moderator answers by hand.
- **Officer checks** — when an Officer asks the moderator about someone, the moderator opens the Officer's tab, picks the player they asked about and clicks *Wolf* (or *Killer* when there is only one) or *Civilian*. The answer stays in the Officer's chat and is also saved, privately, in the Officer's clues bar.
- **Role themes** — each player's screen matches their own secret role: red with fangs and dripping blood for Werewolves, blood splatter for the Serial Killer, teal with a heartbeat line for the Doctor, police lights and caution tape for the Officer, and a village with clouds (fireflies at night) for Civilians. The moderator sees the plain look.
- **Test bots** — the moderator can add 1–10 bots. Bots count as players, get roles and vote at random in trials. They don't count for wipe votes. *Remove bots* takes them out again.
- **Wolf den** — a secret chat for the werewolves (when there are two or more). Wolves can only write in it at night. The moderator can always read it.
- **Day / Night** — the moderator switches the phase. A big sun or moon pops up in the middle of everyone's screen, then moves to the corner of the chat.
- **Phase videos** — the chat background is an animated campfire scene during the day and a haunted house at night. They cross-fade when the phase changes (videos in `public/video`).
- **Phase timer** — a timer next to the sun/moon in the top corner counts up from 00:00 each time day or night starts. Everyone sees the same time.
- **Trial** — the moderator clicks *Put someone on trial* and picks a player. Everyone votes *Guilty* or *Innocent*. When everyone has voted (or the moderator clicks *End voting*), a pop-up shows who voted what. If guilty wins, that player is muted and can only talk to the moderator until the next wipe.
- **Kick all & reset** — the moderator can send everyone (players and bots) back to the join screen, wipe everything and clear all character picks, so everyone joins again and picks a character.
- **Vote to wipe** — one *Vote to wipe* button with a vote counter (it fills up as players vote). When **every player** has voted, all chats (main lobby, private moderator chats and the wolf den), roles, protections and mutes are cleared and it becomes day. The moderator doesn't vote (and can wipe straight away when no players are left). Bots don't vote either.

## Use it like an app (iPad / iPhone)

Open the site in Safari, tap **Share → Add to Home Screen**. It gets its own icon and opens full screen without the browser bars. Swipe in from the left or right edge to open the side panels on smaller screens.

Everything is kept in memory, so restarting the server clears it.

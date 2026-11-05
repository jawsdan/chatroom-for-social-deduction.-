# Village Chat

A real-time chatroom for werewolf-style social deduction games.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000 (set `PORT` to change it). Everyone who wants to play opens the same address — to play with friends over the internet, host it somewhere like Render, Railway or Fly.io, or share your machine with a tunnel (e.g. ngrok).

## Features

- **Main lobby** — everyone who joins is here and can type. Players only have the main lobby and their private chat with the moderator.
- **Moderator** — anyone can click *Become moderator* when the seat is empty. The moderator can step down or hand the role to someone else. The moderator can read and write in every chat.
- **Talk to moderator** — every player has a private chat with the moderator. Nobody else sees it. The moderator sees one tab per player.
- **Roles** — Civilian, Werewolf, Doctor and Officer. If there is only **one** werewolf, they are shown as the **Serial Killer** instead. Each player gets a pop-up card with their role that only they can see.
  - Give roles one at a time from a player's tab in the moderator inbox, or
  - pick how many of each role to play with in *Roles in this game* and click *Hand out random roles*. Everyone left over is a Civilian.
- **Moderator's player list** — always shows every player's role. The 🛡️ button marks a player as *protected* so the moderator doesn't forget. Only the moderator sees this.
- **Officer checks** — when an Officer asks the moderator about someone, the moderator opens the Officer's tab, picks the player they asked about and clicks *Wolf* or *Civilian*. The answer stays in the Officer's chat as a card.
- **Role themes** — each player's screen matches their own secret role: red with fangs and dripping blood for Werewolves, blood splatter for the Serial Killer, teal with a heartbeat line for the Doctor, police lights and caution tape for the Officer, and a village with clouds (fireflies at night) for Civilians. The moderator sees the plain look.
- **Test bots** — the moderator can add 1–10 bots. Bots count as players, get roles and vote at random in trials. They don't count for wipe votes. *Remove bots* takes them out again.
- **Wolf den** — a secret chat for the werewolves (when there are two or more). Wolves can only write in it at night. The moderator can always read it.
- **Day / Night** — the moderator switches the phase. A big sun or moon pops up in the middle of everyone's screen, then moves to the corner of the chat.
- **Trial** — the moderator clicks *Put someone on trial* and picks a player. Everyone votes *Guilty* or *Innocent*. When everyone has voted (or the moderator clicks *End voting*), a pop-up shows who voted what. If guilty wins, that player is muted and can only talk to the moderator.
- **Wipe votes** — the main chat and the moderator chat each have a *Vote to wipe* button. A chat is only wiped when **every** player has voted. Wiping the main chat starts a fresh game: roles, protections and mutes are cleared and it becomes day.

Everything is kept in memory, so restarting the server clears it.

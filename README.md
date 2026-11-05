# Village Chat

A real-time chatroom for werewolf-style social deduction games.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000 (set `PORT` to change it). Everyone who wants to play opens the same address — to play with friends over the internet, host it somewhere like Render, Railway or Fly.io, or share your machine with a tunnel (e.g. ngrok).

## Features

- **Main lobby** — everyone who joins is here and can type.
- **Groups (left sidebar)** — anyone can create a group; only members can read its messages.
- **Moderator** — anyone can click *Become moderator* when the seat is empty. The moderator can step down or hand the role to someone else.
- **Talk to moderator** — every player has a private chat with the moderator. Nobody else sees it. The moderator sees one tab per player.
- **Roles** — inside a player's private tab, the moderator clicks *Civilian* or *Werewolf*. A role card pops up for that player only.
- **Day / Night** — the moderator switches the phase. A big sun or moon pops up in the middle of everyone's screen, then moves to the corner of the chat.
- **Trial** — the moderator clicks *Trial* and picks a player. Everyone gets a pop-up and votes *Guilty* or *Innocent*. When everyone has voted (or the moderator clicks *End voting*), a pop-up shows who voted what. If guilty wins, that player is muted and can only talk to the moderator.
- **Wipe votes** — the main chat and the moderator chat each have a *Vote to wipe* button. A chat is only wiped when **every** player has voted, so one person can't troll. Wiping the main chat starts a fresh game: all mutes are lifted and it becomes day.

Everything is kept in memory, so restarting the server clears it.

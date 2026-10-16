# Novawerk sign-in

Novawerk Chat signs in with the Novawerk account only (NB-ADR-0014). There are no chat passwords
and no join links; the profile is edited on novawerk.io/settings and copied here at each sign-in.

## How it works

1. Someone opens the chat without a session. `/session/new` sends them to the Novawerk API's
   `GET /auth/chat`.
2. Signed in on novawerk.io: the API answers with a ticket and sends them to
   `/sso/novawerk?ticket=…`. Signed out: novawerk.io's sign-in page, which comes back to the chat.
3. The ticket is an HS256 JWT signed with `CHAT_SSO_SECRET`: issuer `nw-api`, audience
   `novawerk-chat`, 60 seconds, a `jti` the chat accepts once (Redis). It carries the account id,
   the email, name, handle, picture link, bio and role.
4. `NovawerkSso.user_for` finds the chat user by email, or creates one, and copies the name, bio,
   role and (in a job) the picture. The very first sign-in also creates the account and the
   `general` room, as Campfire's first run did.

## Rooms

- Maintainers are administrators here and are in every room: they join every closed room at
  sign-in, and stay in a closed room whoever edits its members.
- Members are in the open rooms, and in closed rooms they are invited to (a project's team).
- Someone who stops being a maintainer leaves the closed rooms at their next sign-in.
- Records, account details and partner notes never go in an open room.

## Settings

| Variable | What |
|----------|------|
| `CHAT_SSO_SECRET` | 32+ random characters, the same as the API's `CHAT_SSO_SECRET`. Set by hand on the server; never in git. Unset: Campfire's own password sign-in (local development). |
| `NOVAWERK_API_URL` | Default `https://api.novawerk.io` |
| `NOVAWERK_WEB_URL` | Default `https://novawerk.io` |

The API needs `CHAT_URL=https://chat.novawerk.io` and the same `CHAT_SSO_SECRET`.

## Not yet

- A chat session lives on after the Novawerk account is deleted or suspended, until the person
  signs out or an administrator deactivates them here. The next sign-in is refused.
- Someone whose email changes on novawerk.io gets a new chat user.

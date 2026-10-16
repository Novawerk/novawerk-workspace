---
title: Privacy notice
category: legal
status: evolving
summary: What personal data novawerk.io collects, why, who processes it for us, how long we keep it, and your rights.
source:
  - apps/web, apps/api, packages/db/src/schema.ts
  - apps/api/src/intake-chat/cleanup.ts (chat retention)
  - apps/api/src/resume-cleanup.ts (CVs that were never sent)
  - apps/api/src/newsletter.ts (double opt-in, unconfirmed addresses deleted)
  - apps/web/lib/analytics.ts, apps/api/src/analytics/ (visit counts, docs/analytics.md)
  - novawerk.io DNS and email setup (2026-10-03)
  - apps/web (sign-in, settings, task board pages), apps/api/src/routes/auth.ts, packages/tasks (accounts; NB-ADR-0014)
updated: 2026-10-16
---

# Privacy notice

Last updated: 16 October 2026

We keep this short and concrete. If anything here is unclear, write to
info@novawerk.io and a person will answer.

## Who is responsible

The controller for personal data processed on novawerk.io is:

Novawerk e.V. i.G. (association in formation)<br>
Email: info@novawerk.io

The association is being registered. We add its postal address here as soon
as the registration is complete.

## What we collect, and why

### When you visit the website

When you open novawerk.io, our hosting provider processes the technical data
your browser sends with every request: IP address, date and time, the page you
asked for, the referring page and your browser type. We need this to deliver
the site and keep it secure.

- **Legal basis:** Art. 6(1)(f) GDPR — our legitimate interest in running a
  working, secure website.
- **How long:** server logs are kept for a short time, at most 30 days, and we
  don't combine them with other data.

The public website sets **no cookies**. Our fonts are served from our own
domain, so your browser does not contact Google Fonts. Project images are
served from our file storage at Vercel, which hosts the site anyway.

### How we count visits

We count how people use the website, so we can make it better. We do this
ourselves, without cookies and without an analytics company.

- **What:** the page you open, the site that sent you (only its domain, such
  as github.com), campaign tags in the link (such as `utm_source`), whether you
  use a phone or a computer, your country and region (such as "Germany,
  Berlin"), and which buttons and steps you use. For example: you opened the
  chat, sent a message, or sent your pitch. We never record what you type. We
  don't store your IP address, your city or your browser's details. Your
  country and region come from your IP address, which our hosting provider
  reads anyway to deliver the page; we keep only the result.
- **How we tell visits apart:** your browser makes up a random number when you
  open the site and forgets it when you close the tab. Counting stores nothing
  on your device, so we can't recognise you when you come back. (A Novawerk
  account keeps one small flag in your browser; see "Your Novawerk account".
  Counting never reads it.)
- **Why:** to see which pages people read, how they find us, and where the
  pitch chat and the task board get stuck.
- **Legal basis:** Art. 6(1)(f) GDPR — our legitimate interest in knowing how
  our website is used, in a way that doesn't identify you.
- **Who:** the counts stay in our own database at Neon in Frankfurt. No one
  else gets them.
- **How long:** 13 months, then we delete them.
- **Opting out:** if your browser sends "Do Not Track" or "Global Privacy
  Control", we don't count you at all. You can also object at any time
  (Art. 21 GDPR) by writing to us.

### When you chat with our assistant (novawerk.io/submit)

Pitching a project starts with a chat. An AI
assistant asks you questions and writes your answers into a draft next to the
chat. You can read and change the draft at any time.

- **What:** everything you type in the chat, the draft, when each message
  was written, and the text of a CV you attach (see "When you attach a CV").
  The assistant only asks for what the pitch or application needs. Please
  don't share anything sensitive, such as health information.
- **Why:** to help you put your pitch or application together. Nothing reaches
  us as a pitch or application until you press Send.
- **Who:** the replies come from Claude, an AI model made by Anthropic PBC in
  the USA. Your messages, the draft and the text of a CV you attach are sent
  to Anthropic, which processes them for us as a processor and does not use
  them to train its models (see "Who processes your data for us" for the
  transfer).
- **Decisions:** the assistant can't send anything and decides nothing. A
  person reads every pitch and application you send.
- **Legal basis:** Art. 6(1)(b) GDPR — you asked us to help you write your
  pitch or application.
- **How long:** a chat is deleted 14 days after its last message, whether you
  sent it or not. What you send is kept as a pitch or application (see
  "How long we keep it").

Your browser keeps the chat's id, not its content, in local storage, so
reloading the page continues the chat. "Start over" removes it. This is
strictly necessary for the chat to work (§ 25(2) no. 2 TDDDG).

### When you pitch a project (novawerk.io/submit)

- **What:** your name and email, the project name, your answers about the
  product, the user journey, references and what's new, the team and the
  timeline, any links you add, your CV if you attach one, and the time you
  sent it.
- **Why:** to read your pitch, get back to you, and, if we take the project
  on, start it with you as its Initiator.
- **Legal basis:** Art. 6(1)(b) GDPR — you asked us to consider your pitch.

### Applications to join (closed)

We no longer take applications; `novawerk.io/join` now leads to the task board.
For applications sent before, this is what we kept:

- **What:** your name and email, your city if you give it, what you can do,
  your background and motivation, how much time you have, any links you add,
  your CV if you attach one, and the time you accepted this notice.
- **Why:** to read your application, get back to you, and, if you join, add
  you as a Member.
- **Legal basis:** Art. 6(1)(b) GDPR — you asked to join.

### When you attach a CV

You can attach a CV (PDF or Word, up to 5 MB) to a pitch or an application,
in the chat or in the form. It is optional.

- **What:** the file and its name.
- **Why:** to see what you bring before we reply, and, in the chat, to fill in
  your draft from it so you type less.
- **Where:** your browser sends the file straight to our private file storage
  at Vercel in Frankfurt. Only Members who can sign in to our admin panel can
  open the file.
- **The chat assistant:** when you attach a CV in the chat, we take the text
  out of it and the assistant reads it once, to fill in your draft. That text
  goes to Anthropic like your messages (see the chat section above), and it
  stays in the chat until the chat is deleted. Before it goes, we remove the
  phone numbers we recognise; the assistant never gets the file itself. If you
  would rather not, leave the CV out and add a link to it instead.
- **Legal basis:** Art. 6(1)(b) GDPR — you asked us to consider your pitch or
  application, and to help you write it.
- **How long:** the file as long as the pitch or application it belongs to.
  If you attach a CV and don't send, we delete it after a day, or together
  with the chat it is in.

### Your Novawerk account (the task board, the admin panel, the team chat)

Anyone can read the task board at novawerk.io/tasks without an account. To
propose, post, suggest or +1, you sign in at novawerk.io/sign-in with GitHub,
with Google, or with a code we email you. The first sign-in makes your
Novawerk account. Everyone has one account of the same kind: the people who
run Novawerk have a "maintainer" role on theirs, and the members of a
project's team can open that project in our admin panel. You can link more
than one way of signing in to the same account in Settings.

- **What we keep about you:** your handle and display name; your email address
  if you sign in with Google or a code; your GitHub account's number, login
  name and picture link if you sign in with GitHub (we read only your public
  GitHub profile and never keep your GitHub token), and the primary email
  address GitHub has verified for you; whether you are a maintainer; what you
  write on your profile (bio, about, links, colours); whether your profile is
  public and on the contributors wall; when you accepted the community pledge.
- **Signing in with Google:** Google tells us the email address it has verified
  for you and your name, and we keep the address (and use the name for a new
  account). We never get your Google password, and Google gets nothing from
  us beyond the sign-in itself.
- **What you do on the board:** your proposals, posts and replies, suggestions,
  +1s and reports, the tasks you hold, the pull requests linked to them, and the
  Werk you earn. When a pull request names a task, GitHub tells us its number,
  its author's GitHub login and whether it was merged.
- **What is public:** your handle on everything you do on the board
  (proposals, posts, suggestions, +1s, the task timeline). Your profile page and
  your place on the contributors wall only if you turn your profile on (it is
  off by default). A note explaining why a proposal wasn't chosen goes only to
  you. We never show your email address to anyone.
- **Your GitHub email:** each time you sign in with GitHub, we keep the
  primary email address GitHub has verified for you. We use it only to send
  you the notices below, and only when you have no email of your own on the
  account. It never signs you in and is never shown to anyone. If GitHub
  returns no verified primary address, we keep the one we had. When you
  delete the account we keep it only until the goodbye email has gone out, at
  most 7 days.
- **Screenshots on suggestions:** a screenshot you attach to a suggestion
  stays in our private file store, where only maintainers can see it, until a
  maintainer accepts the suggestion. Then we publish a copy without the picture's
  metadata (such as the camera, the place or the date it was taken). While it
  is private, we delete it when the suggestion is declined or marked a
  duplicate, or when you delete your account. Once a suggestion is accepted,
  the public copy stays with the task, like the suggestion itself, as "a
  former contributor" after you delete your account. An upload you never sent
  with a suggestion is deleted after a day.
- **Tokens for agents:** if you make a personal access token, we keep its name,
  its scopes, when it expires and when it was last used, and only a hash of the
  token itself. Everything a token does shows "via agent".
- **Emails:** fixed notices about your own account and tasks, to your own
  address only: sign-in codes; a maintainer's decision on your proposal (chosen or
  not chosen); replies to your posts and on your tasks (at most one email per
  task an hour); a reminder when a task you hold has had no activity for 7
  days; a task you hold being released or closed; what happened to a
  suggestion of yours (accepted, declined, a duplicate, or more info needed);
  Werk you earn; and a goodbye when you delete your account. You can turn off
  replies and reminders in Settings, or with the one-click link in each of
  those emails; the others come with the account. The newsletter comes only if
  you sign up for it separately.
- **Why:** to run your account and the task board, and to credit your work.
- **Legal basis:** Art. 6(1)(b) GDPR — you asked for an account and to take
  part in the board. Showing your profile publicly is your choice, and you can
  turn it off in Settings at any time.
- **How long:** until you delete your account in Settings. Deleting removes
  your profile, proposals, +1s and tokens, and gives back a task you hold. Your
  posts and the tasks you finished stay on the board as "a former contributor",
  without your handle, and so do your suggestions. Merged code stays in the
  public git history under your GitHub name, as GitHub keeps it. We keep your
  address only until the goodbye email has gone out, at most 7 days.

**The team chat** (chat.novawerk.io) runs on our own server and signs in only
with your Novawerk account. Each time you open it, we hand it your account's
number, your email address (the one you sign in with, else the one GitHub
gave us), your name, handle, picture link, bio and whether you are a
maintainer, so it can show your profile; it keeps them for as long as you use
the chat. What you write in the chat stays on that server. When you delete your
account, or it is suspended, we tell the chat at once and it signs you out
there; a deleted account is removed from the chat, and its messages stay.

Signing in sets one cookie, `nw_session`, on api.novawerk.io. It keeps you
signed in for 30 days, on the website, in the admin panel and in the team chat. Signing in with GitHub also sets `nw_github_state` for
10 minutes, which checks that the answer from GitHub belongs to your sign-in.
Both are strictly necessary for the account to work (§ 25(2) no. 2 TDDDG).
Sign-in codes are stored only as a hash and stop working after 10 minutes.

The website also keeps one flag in your browser's local storage,
`nw:contributor`. It holds just "1": it is set when you sign in and removed
when you sign out, and it lets the site show your account in the header on
every page. Without it, pages outside the task board don't ask whether you are
signed in. It contains nothing about you and is never sent anywhere. This too
is strictly necessary for the account to work (§ 25(2) no. 2 TDDDG).

In Settings you can download your data as a file: your account and profile,
your notification settings, your proposals (with the private notes on them),
your +1s, and your tokens (names, scopes and dates, never the token itself).
What you post, suggest and work on is public on the board already.

### When you sign up for the newsletter

- **What:** your email address, where you signed up, and when you confirmed.
- **Why:** to send you our newsletter. First we email you a link to confirm
  that the address is yours (double opt-in). Until you click it you get
  nothing else from us, and the link stops working after 72 hours. If you
  don't confirm, we delete your address, with no marker, once the link has
  expired and at least 30 days have passed since you signed up.
- **If you signed up before we asked people to confirm (14 October 2026)**
  and never confirmed, we deleted your address. We don't email you to ask.
  Sign up again if you want the newsletter.
- **Legal basis:** your consent, Art. 6(1)(a) GDPR. You can unsubscribe at any
  time with the link in every newsletter or by writing to us. After you
  unsubscribe we keep your address marked as unsubscribed, so we don't email
  you again by mistake (Art. 6(1)(f) GDPR).

### When you email us

If you write to info@novawerk.io, we use your message and address to answer
you (Art. 6(1)(b) or (f) GDPR, depending on what you write about).

### How we use AI

Besides the chat assistant above, which also runs on Claude, we use Claude,
an AI model made by Anthropic, to get through pitches and applications faster. It writes a short
internal summary and drafts a reply.

- A person at Novawerk reads every pitch and application and makes every
  decision. No decision about you is made automatically (Art. 22 GDPR).
- Every email we send you is read and approved by a person first.
- Anthropic processes the text for us as a processor and does not use it to
  train its models.

## Who processes your data for us

We use these providers to run Novawerk. Each one only gets what it needs for
its job, under data processing terms with us (Art. 28 GDPR).

| Provider | What for | Where the data is |
|----------|----------|-------------------|
| Vercel Inc., USA | Hosting the website and our API; server logs | EU and USA |
| Neon Inc., USA | Our database | EU (Frankfurt, Germany) |
| Plus Five Five, Inc. (Resend), USA | Sending emails; passing emails sent to info@novawerk.io on to Slack | EU (Ireland) |
| Google Ireland Ltd. (Google Workspace) | Our email inbox; signing in with Google | EU and USA |
| Slack Technologies, LLC, USA | Our team chat, where we read emails sent to info@novawerk.io | USA |
| Anthropic PBC, USA | The chat assistant on /submit; AI summaries and draft replies | USA |
| GitHub, Inc., USA | Running our scheduled tasks, such as the AI summaries; signing in with GitHub and telling us about pull requests on the task board | USA |
| Vercel Inc., USA (Vercel Blob) | Storing project images, CVs and internal files | EU (Frankfurt) |

When data goes to the USA, the transfer is covered by the EU–US Data Privacy
Framework where the provider is certified under it, and otherwise by the EU
Standard Contractual Clauses (Art. 46(2)(c) GDPR).

We don't sell your data and don't share it with anyone else, unless the law
requires us to.

## How long we keep it

| Data | How long |
|------|----------|
| Chats with the assistant | Deleted 14 days after the last message, sent or not |
| A CV you attach but don't send | Deleted after a day, or with the chat it is in |
| Pitches and applications we decline | Deleted 12 months after our decision |
| Pitches we take on | As long as the project exists |
| Applications we accept | While you are a Member; deleted within 3 months after you leave |
| Newsletter address | Until you unsubscribe; after that only the "unsubscribed" marker |
| Newsletter address you never confirmed | Deleted once the confirmation link has expired and the address is at least 30 days old |
| Your Novawerk account | Until you delete it in Settings; your posts, suggestions and finished tasks then stay as "a former contributor" |
| A deleted account's email address | Until the goodbye email has gone out, at most 7 days |
| A screenshot you upload but don't send | Deleted after a day |
| A screenshot on a suggestion, while private | Until a maintainer accepts, declines or marks the suggestion a duplicate, or you delete your account |
| The public copy of a screenshot on an accepted suggestion | As long as the task is on the board |
| Notices we emailed you (a record of each one) | Deleted after 30 days |
| Sign-in codes | Stop working after 10 minutes; stored only as a hash |
| Emails with you | Deleted together with the pitch or application they belong to; other emails after 2 years |
| Server logs | Up to 30 days |
| Visit counts (no IP, no cookies) | 13 months |

Where the law makes us keep something longer, such as records of donations,
we keep only that, only for as long as required.

## Your rights

You can ask us at any time to:

- tell you what data we have about you (Art. 15 GDPR),
- correct it (Art. 16),
- delete it (Art. 17),
- restrict how we use it (Art. 18),
- give it to you in a common format (Art. 20),

and you can object to processing based on our legitimate interest (Art. 21).
If you gave consent, you can withdraw it at any time; that doesn't affect
anything we did before (Art. 7(3)).

To do any of this, email info@novawerk.io. With a Novawerk account you can
also download your data and delete your account yourself, in Settings.

You can also complain to a data protection authority, for example the one in
Berlin: Berliner Beauftragte für Datenschutz und Informationsfreiheit,
Alt-Moabit 59–61, 10555 Berlin, www.datenschutz-berlin.de.

## Do you have to give us this data?

No law requires it. But without your name, email and answers we can't review a
pitch, without an account you can't propose on the task board, and without
your email we can't send a newsletter.

## Signing in to the admin panel

The admin panel uses the same account and the same cookie as the website (see
"Your Novawerk account"). It opens for maintainers and for the members of a
project's team; nobody else sees anything in it.

## Changes

We update this notice when what we do changes. The date at the top shows the
current version.

## Related

- [Imprint](./imprint.md)

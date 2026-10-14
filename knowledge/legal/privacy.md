---
title: Privacy notice
category: legal
status: evolving
summary: What personal data novawerk.io collects, why, who processes it for us, how long we keep it, and your rights.
source:
  - apps/web, apps/api, packages/db/src/schema.ts
  - apps/api/src/intake-chat/cleanup.ts (chat retention)
  - apps/api/src/resume-cleanup.ts (CVs that were never sent)
  - apps/web/lib/analytics.ts, apps/api/src/analytics/ (visit counts, docs/analytics.md)
  - novawerk.io DNS and email setup (2026-10-03)
updated: 2026-10-14
---

# Privacy notice

Last updated: 14 October 2026

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
  open the site and forgets it when you close the tab. Nothing is stored on
  your device, so we can't recognise you when you come back.
- **Why:** to see which pages people read, how they find us, and where the
  pitch and join chats get stuck.
- **Legal basis:** Art. 6(1)(f) GDPR — our legitimate interest in knowing how
  our website is used, in a way that doesn't identify you.
- **Who:** the counts stay in our own database at Neon in Frankfurt. No one
  else gets them.
- **How long:** 13 months, then we delete them.
- **Opting out:** if your browser sends "Do Not Track" or "Global Privacy
  Control", we don't count you at all. You can also object at any time
  (Art. 21 GDPR) by writing to us.

### When you chat with our assistant (novawerk.io/submit and /join)

Pitching a project and applying to join both start with a chat. An AI
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

### When you apply to join (novawerk.io/join)

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

### When you sign up for the newsletter

- **What:** your email address, where you signed up, and when you confirmed.
- **Why:** to send you our newsletter. First we email you a link to confirm
  that the address is yours (double opt-in). Until you click it you get
  nothing else from us, and the link stops working after 72 hours.
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
| Google Ireland Ltd. (Google Workspace) | Our email inbox | EU and USA |
| Slack Technologies, LLC, USA | Our team chat, where we read emails sent to info@novawerk.io | USA |
| Anthropic PBC, USA | The chat assistant on /submit and /join; AI summaries and draft replies | USA |
| GitHub, Inc., USA | Running our scheduled tasks, such as the AI summaries | USA |
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

To do any of this, email info@novawerk.io.

You can also complain to a data protection authority, for example the one in
Berlin: Berliner Beauftragte für Datenschutz und Informationsfreiheit,
Alt-Moabit 59–61, 10555 Berlin, www.datenschutz-berlin.de.

## Do you have to give us this data?

No law requires it. But without your name, email and answers we can't review a
pitch or an application, and without your email we can't send a newsletter.

## Signing in to the admin panel

Members who sign in to our admin panel with their Google account get one
cookie that keeps them signed in. It is strictly necessary for that service
(§ 25(2) TDDDG). Visitors of the public website never get it.

## Changes

We update this notice when what we do changes. The date at the top shows the
current version.

## Related

- [Imprint](./imprint.md)

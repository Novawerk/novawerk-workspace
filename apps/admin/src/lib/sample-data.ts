// SAMPLE DATA — fictional people, pitches, emails, projects and money so every screen renders
// without apps/api. Used only when VITE_USE_SAMPLE_DATA=true. Never shown in builds that talk
// to the API.

import { emptyPostCard } from "@nw/contracts"

import type {
  AdminMetrics,
  Deliverable,
  DocumentRow,
  FinanceEntry,
  IntakeTranscript,
  Me,
  Member,
  MemberApplication,
  OutboxEmail,
  Partner,
  Post,
  Project,
  ProjectSubmission,
  StatusChange,
  Subscriber,
} from "./types"

const now = Date.now()
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString()
const daysAgoDate = (d: number) => new Date(now - d * 86_400_000).toISOString().slice(0, 10)

export const SAMPLE_ME: Me = {
  id: "sample-admin",
  displayName: "Sample Admin",
  email: "admin@example.com",
  canAdmin: true,
}

const member = (id: string, displayName: string, opts: Partial<Member> = {}): Member => ({
  id,
  displayName,
  email: `${id}@example.com`,
  canAdmin: false,
  joinedOn: daysAgoDate(200),
  active: true,
  createdAt: hoursAgo(24 * 200),
  ...opts,
})

export const SAMPLE_MEMBERS: Member[] = [
  member("sample-admin", "Sample Admin", { email: "admin@example.com", canAdmin: true, joinedOn: daysAgoDate(400) }),
  member("mara", "Mara Lindqvist", { canAdmin: true }),
  member("jonas", "Jonas Weber"),
  member("aiko", "Aiko Tanaka"),
  member("daniel", "Daniel Kim", { joinedOn: daysAgoDate(5), createdAt: hoursAgo(120) }),
  member("ole", "Ole Brandt", { active: false, joinedOn: daysAgoDate(600) }),
]

export const SAMPLE_SUBMISSIONS: ProjectSubmission[] = [
  {
    id: "5b0c1e9a-1f2d-4c6e-9a51-0d6a3f1e2b01",
    name: "Lena Hoffmann",
    email: "lena@example.com",
    projectName: "Kiez Pantry",
    product:
      "A web app that lists surplus food from bakeries and small shops in one neighbourhood. Shops post what is left at closing time. Neighbours reserve it and pick it up within the hour.",
    userJourney:
      "A shop owner opens the app at 18:30, snaps a photo of the leftover bread and taps 'post'. A neighbour gets a push note, reserves two loaves and walks over. The shop marks it collected. Nothing goes in the bin.",
    referencesAndInnovation:
      "Too Good To Go does this for big chains and takes a cut. We stay hyper-local, free and open source. Each Kiez runs its own instance and owns its data.",
    team:
      "Me (product, ran a food-sharing group for three years) and a friend who is a backend developer. We need a designer and someone for the mobile front end.",
    timeline:
      "Prototype in 6 weeks with three bakeries in Neukölln. Public pilot after 3 months. We meet weekly and can each give 6–8 hours a week.",
    links: "https://example.com/kiez-pantry-deck",
    resumePathname: null,
    resumeName: null,
    aiSummary:
      "Hyper-local surplus-food app for small shops. Clear user journey and a willing pilot group of three bakeries. Strong fit with open-by-default. Gaps: no designer yet, no plan for moderation or food-safety rules.",
    status: "new",
    reviewerId: null,
    notes: null,
    projectId: null,
    consentAt: hoursAgo(3),
    createdAt: hoursAgo(3),
    updatedAt: hoursAgo(3),
  },
  {
    id: "5b0c1e9a-1f2d-4c6e-9a51-0d6a3f1e2b02",
    name: "Tomás Rivera",
    email: "tomas@example.com",
    projectName: "Repair Map",
    product:
      "An open map of repair cafés, cobblers and tailors, with opening hours and what they can fix. Anyone can add a place. Data is published as open data every night.",
    userJourney:
      "Your kettle breaks. You search 'kettle' and see three places within 2 km that fix small appliances, with the next repair café date. You go there instead of buying a new one.",
    referencesAndInnovation:
      "OpenStreetMap has some of this but no 'what can they fix' field. Repair Café International lists events, not shops. We combine both and add a simple skills taxonomy.",
    team: "Solo for now. I am a GIS analyst. Two repair café organisers want to help test.",
    timeline: "A first map for Berlin by the end of the quarter. Other cities after that if people add data.",
    links: null,
    resumePathname: null,
    resumeName: null,
    aiSummary:
      "Open map of repair services with a 'what can they fix' taxonomy. Builds on OpenStreetMap. Solo initiator with GIS skills. Needs a front-end developer and a plan for keeping data fresh.",
    status: "discussing",
    reviewerId: "mara",
    notes: "Call on Thursday. Ask how they plan to keep listings current.",
    projectId: null,
    consentAt: hoursAgo(28),
    createdAt: hoursAgo(28),
    updatedAt: hoursAgo(20),
  },
  {
    id: "5b0c1e9a-1f2d-4c6e-9a51-0d6a3f1e2b03",
    name: "Priya Nair",
    email: "priya@example.com",
    projectName: "Quiet Hours",
    product:
      "A browser extension that batches notifications from chat and mail into two digests a day. It runs locally. No account, no server.",
    userJourney:
      "You install the extension and pick two times, say 11:00 and 16:00. Between those times chat badges stay hidden. At 11:00 you get one calm summary of what you missed.",
    referencesAndInnovation:
      "Focus modes exist in operating systems but they are all-or-nothing. We batch instead of block, and everything stays on the device.",
    team: "Two developers who already shipped a small extension together. We want a researcher to run a short diary study.",
    timeline: "Beta in 8 weeks. Diary study with 15 people in month three.",
    links: "https://example.com/quiet-hours",
    resumePathname: null,
    resumeName: null,
    aiSummary: null,
    status: "new",
    reviewerId: null,
    notes: null,
    projectId: null,
    consentAt: hoursAgo(50),
    createdAt: hoursAgo(50),
    updatedAt: hoursAgo(50),
  },
  {
    id: "5b0c1e9a-1f2d-4c6e-9a51-0d6a3f1e2b04",
    name: "Felix Braun",
    email: "felix@example.com",
    projectName: "Open Transit Board",
    product:
      "A cheap e-ink display for shop windows that shows the next buses and trams from open timetable data.",
    userJourney:
      "A café owner plugs in the display, scans a QR code and picks the nearest stops. Guests see live departures while they wait for their coffee.",
    referencesAndInnovation:
      "Commercial boards cost hundreds of euros and need a contract. Ours uses open GTFS data and a €30 bill of materials.",
    team: "Hardware tinkerer (me) and an embedded developer. We need help with the setup web page.",
    timeline: "Ten boards in ten cafés within four months.",
    links: null,
    resumePathname: null,
    resumeName: null,
    aiSummary:
      "Low-cost e-ink departure board on open GTFS data. Concrete hardware plan and BOM. Fits the build-in-the-open principle. Main risk: hardware support load.",
    status: "accepted",
    reviewerId: "jonas",
    notes: "Accepted at the dev review. Jonas mentors.",
    projectId: "c0ffee00-0000-4000-8000-000000000003",
    consentAt: hoursAgo(140),
    createdAt: hoursAgo(140),
    updatedAt: hoursAgo(90),
  },
  {
    id: "5b0c1e9a-1f2d-4c6e-9a51-0d6a3f1e2b05",
    name: "Sam Okafor",
    email: "sam@example.com",
    projectName: "Crypto Rewards for Recycling",
    product: "A token that pays people for recycling. Users scan bottles and earn coins they can trade.",
    userJourney: "Scan a bottle with your phone, earn a token, trade it on an exchange.",
    referencesAndInnovation: "Deposit schemes exist, but they are not on a blockchain.",
    team: "Me. I am looking for developers.",
    timeline: "Launch the token next month.",
    links: null,
    resumePathname: null,
    resumeName: null,
    aiSummary:
      "Token incentive for recycling. Overlaps with existing deposit schemes. Revenue model depends on token trading. Weak fit with Novawerk's principles.",
    status: "declined",
    reviewerId: "aiko",
    notes: "Declined: duplicates the deposit system and centres on token trading.",
    projectId: null,
    consentAt: hoursAgo(220),
    createdAt: hoursAgo(220),
    updatedAt: hoursAgo(200),
  },
]

export const SAMPLE_APPLICATIONS: MemberApplication[] = [
  {
    id: "8e1f7a3c-2b4d-4f60-8a7e-3c9b5d2e1a01",
    name: "Noor Haddad",
    email: "noor@example.com",
    city: "Berlin",
    functions: ["design", "research"],
    background: "Product designer, 6 years in health tech. Runs a small UX research meetup.",
    motivation:
      "I want to work on things that matter to my neighbours, with people who build in the open. I can run user interviews and turn them into flows and prototypes.",
    availability: "2to5",
    links: "https://example.com/noor",
    resumePathname: "_resumes/3f2b8c1e-6a4d-4e7f-9b0a-1c2d3e4f5a6b-noor-haddad-cv.pdf",
    resumeName: "Noor Haddad CV.pdf",
    aiSummary:
      "Designer and researcher with health-tech background. Motivation matches the community focus. Could support Kiez Pantry, which needs a designer.",
    status: "new",
    reviewerId: null,
    memberId: null,
    notes: null,
    consentAt: hoursAgo(5),
    createdAt: hoursAgo(5),
    updatedAt: hoursAgo(5),
  },
  {
    id: "8e1f7a3c-2b4d-4f60-8a7e-3c9b5d2e1a02",
    name: "Marek Nowak",
    email: "marek@example.com",
    city: "Leipzig",
    functions: ["developer"],
    background: "Backend developer (Go, Postgres). Maintains two small open-source libraries.",
    motivation:
      "I have spare evenings and want to ship something real with a team instead of side projects that die alone.",
    availability: "5to10",
    links: "https://example.com/marek",
    resumePathname: null,
    resumeName: null,
    aiSummary: "Experienced backend developer with open-source track record. Good availability.",
    status: "reviewing",
    reviewerId: "mara",
    memberId: null,
    notes: "Intro call booked.",
    consentAt: hoursAgo(30),
    createdAt: hoursAgo(30),
    updatedAt: hoursAgo(26),
  },
  {
    id: "8e1f7a3c-2b4d-4f60-8a7e-3c9b5d2e1a03",
    name: "Chloé Martin",
    email: "chloe@example.com",
    city: null,
    functions: ["marketing", "operations"],
    background: "Community manager at a co-working space.",
    motivation:
      "I love bringing people together and want to help organise events and newsletters for the community.",
    availability: "lt2",
    links: null,
    resumePathname: null,
    resumeName: null,
    aiSummary: null,
    status: "new",
    reviewerId: null,
    memberId: null,
    notes: null,
    consentAt: hoursAgo(60),
    createdAt: hoursAgo(60),
    updatedAt: hoursAgo(60),
  },
  {
    id: "8e1f7a3c-2b4d-4f60-8a7e-3c9b5d2e1a04",
    name: "Daniel Kim",
    email: "daniel@example.com",
    city: "Hamburg",
    functions: ["pm", "developer"],
    background: "Former startup CTO, now freelance.",
    motivation:
      "I want to mentor first-time initiators and help them turn a pitch into a plan they can ship.",
    availability: "gt10",
    links: null,
    resumePathname: null,
    resumeName: null,
    aiSummary: "Senior builder, wants to mentor initiators. High availability.",
    status: "accepted",
    reviewerId: "jonas",
    memberId: "daniel",
    notes: "Welcome call done.",
    consentAt: hoursAgo(160),
    createdAt: hoursAgo(160),
    updatedAt: hoursAgo(120),
  },
]

// ─── Intake transcript (for the first sample pitch) ───────────────────────────

export const SAMPLE_TRANSCRIPTS: Record<string, IntakeTranscript> = {
  "5b0c1e9a-1f2d-4c6e-9a51-0d6a3f1e2b01": {
    sessionId: "sample-session-1",
    startedAt: hoursAgo(4),
    messages: [
      {
        id: "1",
        role: "assistant",
        text: "Hi! I help you put together a pitch for Novawerk. What would you like to build?",
        createdAt: hoursAgo(4),
      },
      {
        id: "2",
        role: "user",
        text: "An app for bakeries in my Kiez to share leftover bread at closing time.",
        createdAt: hoursAgo(3.9),
      },
      {
        id: "3",
        role: "assistant",
        text: "Nice. Who posts the food, and who picks it up? Walk me through one evening.",
        createdAt: hoursAgo(3.9),
      },
      {
        id: "4",
        role: "user",
        text: "The shop owner posts a photo at 18:30, neighbours reserve and pick it up within the hour.",
        createdAt: hoursAgo(3.8),
      },
      {
        id: "5",
        role: "assistant",
        text: "Got it. I added that to your draft. Is anyone building it with you yet?",
        createdAt: hoursAgo(3.8),
      },
    ],
  },
}

// ─── Outbox ──────────────────────────────────────────────────────────────────

const email = (o: Partial<OutboxEmail> & Pick<OutboxEmail, "id" | "to" | "subject" | "body">): OutboxEmail => ({
  draftedBy: "intake",
  relatedTable: null,
  relatedId: null,
  status: "pending",
  approvedBy: null,
  approvedAt: null,
  sentAt: null,
  providerMessageId: null,
  error: null,
  createdAt: hoursAgo(2),
  ...o,
})

export const SAMPLE_OUTBOX: OutboxEmail[] = [
  email({
    id: "0b0b0b0b-0000-4000-8000-000000000001",
    to: "lena@example.com",
    subject: "We got your pitch: Kiez Pantry",
    body: "Hi Lena,\n\nThank you for pitching Kiez Pantry. We read every pitch and get back to you within a week.\n\nAll the best,\nNovawerk",
    relatedTable: "project_submissions",
    relatedId: "5b0c1e9a-1f2d-4c6e-9a51-0d6a3f1e2b01",
    createdAt: hoursAgo(2.5),
  }),
  email({
    id: "0b0b0b0b-0000-4000-8000-000000000002",
    to: "noor@example.com",
    subject: "Your application to Novawerk",
    body: "Hi Noor,\n\nThank you for wanting to join Novawerk. We'd love to meet you.\n\nCould you join a 20-minute intro call next week?\n\nAll the best,\nNovawerk",
    relatedTable: "member_applications",
    relatedId: "8e1f7a3c-2b4d-4f60-8a7e-3c9b5d2e1a01",
    createdAt: hoursAgo(4),
  }),
  email({
    id: "0b0b0b0b-0000-4000-8000-000000000003",
    to: "jane@acme.example.org",
    subject: "Novawerk and Acme Foundation",
    body: "Hi Jane,\n\nWe build small, open tools with our neighbours in Berlin. Could we tell you about it in a short call?\n\nAll the best,\nNovawerk",
    draftedBy: "sponsor-outreach",
    relatedTable: "partners",
    relatedId: "acme-foundation",
    createdAt: hoursAgo(30),
  }),
  email({
    id: "0b0b0b0b-0000-4000-8000-000000000004",
    to: "daniel@example.com",
    subject: "Welcome to Novawerk",
    body: "Hi Daniel,\n\nWelcome aboard. See you at the next all-hands.\n\nNovawerk",
    draftedBy: "admin:mara",
    relatedTable: "member_applications",
    relatedId: "8e1f7a3c-2b4d-4f60-8a7e-3c9b5d2e1a04",
    status: "sent",
    approvedBy: "jonas",
    approvedAt: hoursAgo(100),
    sentAt: hoursAgo(100),
    providerMessageId: "sample-message-id",
    createdAt: hoursAgo(110),
  }),
  email({
    id: "0b0b0b0b-0000-4000-8000-000000000005",
    to: "felix@example.com",
    subject: "Your Novawerk pitch: Open Transit Board",
    body: "Hi Felix,\n\nGood news: we want to build Open Transit Board with you.\n\nNovawerk",
    draftedBy: "admin:jonas",
    relatedTable: "project_submissions",
    relatedId: "5b0c1e9a-1f2d-4c6e-9a51-0d6a3f1e2b04",
    status: "failed",
    approvedBy: "jonas",
    approvedAt: hoursAgo(80),
    error: "The novawerk.io domain is not verified.",
    createdAt: hoursAgo(85),
  }),
]

// ─── Portfolio ───────────────────────────────────────────────────────────────

const project = (o: Partial<Project> & Pick<Project, "id" | "slug" | "title">): Project => ({
  tagline: null,
  description: "",
  body: null,
  status: "draft",
  year: 2026,
  link: null,
  coverUrl: null,
  gallery: [],
  featured: false,
  sortOrder: 100,
  launchDate: null,
  submissionId: null,
  createdAt: hoursAgo(24 * 90),
  updatedAt: hoursAgo(24 * 10),
  team: [],
  ...o,
})

export const SAMPLE_PROJECTS: Project[] = [
  project({
    id: "c0ffee00-0000-4000-8000-000000000001",
    slug: "berlin-food-map",
    title: "Berlin Chinese Food Map",
    tagline: "A community-curated guide to eating well in Berlin.",
    description: "An open, non-profit guide to Chinese restaurants in Berlin, edited by the people who eat there.",
    body: "## Why\n\nWe wanted one honest list.\n\n## How\n\n- Anyone can suggest a place.\n- Members check it before it goes live.",
    status: "building",
    link: "https://berlinfoodmap.novawerk.io/",
    featured: true,
    sortOrder: 10,
    team: [
      { memberId: "aiko", displayName: "Aiko Tanaka", role: "Design" },
      { memberId: "mara", displayName: "Mara Lindqvist", role: "Initiator" },
    ],
  }),
  project({
    id: "c0ffee00-0000-4000-8000-000000000002",
    slug: "yima-app",
    title: "YIMA",
    tagline: "Privacy-first period calendar.",
    description: "A small tool, designed without profit as a constraint.",
    status: "launched",
    launchDate: daysAgoDate(8),
    link: "https://novawerk.github.io/YIMA/",
    featured: true,
    sortOrder: 20,
    team: [{ memberId: "jonas", displayName: "Jonas Weber", role: "Developer" }],
  }),
  project({
    id: "c0ffee00-0000-4000-8000-000000000003",
    slug: "open-transit-board",
    title: "Open Transit Board",
    submissionId: "5b0c1e9a-1f2d-4c6e-9a51-0d6a3f1e2b04",
    createdAt: hoursAgo(90),
    updatedAt: hoursAgo(90),
  }),
]

// ─── Lifecycle and posts ─────────────────────────────────────────────────────

const FOOD_MAP = SAMPLE_PROJECTS[0]!
const YIMA = SAMPLE_PROJECTS[1]!

export const SAMPLE_HISTORY: (StatusChange & { projectId: string })[] = [
  { id: 1, projectId: FOOD_MAP.id, fromStatus: null, toStatus: "draft", changedBy: "mara", changedByName: "Mara Lindqvist", changedAt: hoursAgo(24 * 60) },
  { id: 2, projectId: FOOD_MAP.id, fromStatus: "draft", toStatus: "planning", changedBy: "mara", changedByName: "Mara Lindqvist", changedAt: hoursAgo(24 * 40) },
  { id: 3, projectId: FOOD_MAP.id, fromStatus: "planning", toStatus: "building", changedBy: "sample-admin", changedByName: "Sample Admin", changedAt: hoursAgo(24 * 15) },
  { id: 4, projectId: YIMA.id, fromStatus: "launching", toStatus: "launched", changedBy: "jonas", changedByName: "Jonas Weber", changedAt: hoursAgo(24 * 8) },
]

const deliverable = (o: Partial<Deliverable> & Pick<Deliverable, "id" | "projectId" | "title">): Deliverable => ({
  ownerId: null,
  ownerName: null,
  doneWhen: null,
  dueOn: null,
  doneOn: null,
  createdAt: hoursAgo(24 * 14),
  updatedAt: hoursAgo(24 * 2),
  ...o,
})

export const SAMPLE_DELIVERABLES: Deliverable[] = [
  deliverable({
    id: "d0000000-0000-4000-8000-000000000001",
    projectId: FOOD_MAP.id,
    title: "Seed list of 20 restaurants",
    ownerId: "aiko",
    ownerName: "Aiko Tanaka",
    doneWhen: "Public on Notion, one line per place",
    dueOn: daysAgoDate(3),
    doneOn: daysAgoDate(4),
  }),
  deliverable({
    id: "d0000000-0000-4000-8000-000000000002",
    projectId: FOOD_MAP.id,
    title: "Map front end prototype",
    ownerId: "mara",
    ownerName: "Mara Lindqvist",
    doneWhen: "Clickable on a phone",
    dueOn: daysAgoDate(-12),
  }),
]

const projectRef = (p: Project) => ({ id: p.id, title: p.title, slug: p.slug, link: p.link, coverUrl: p.coverUrl, gallery: p.gallery })

const post = (o: Partial<Post> & Pick<Post, "id" | "projectId" | "kind" | "dueOn" | "project">): Post => ({
  seq: 0,
  label: null,
  status: "planned",
  langs: ["zh", "en"],
  platforms: null,
  withCard: true,
  images: [],
  brief: null,
  photoUrl: null,
  content: null,
  sourcePath: null,
  sourceHash: null,
  sourceCommit: null,
  draftRequestedAt: null,
  draftedAt: null,
  draftError: null,
  approvedBy: null,
  approvedAt: null,
  publishedAt: null,
  createdAt: hoursAgo(24 * 3),
  updatedAt: hoursAgo(24 * 2),
  ...o,
})

export const SAMPLE_POSTS: Post[] = [
  post({
    id: "a0000000-0000-4000-8000-000000000001",
    projectId: FOOD_MAP.id,
    project: projectRef(FOOD_MAP),
    kind: "kickoff",
    dueOn: daysAgoDate(15),
    status: "published",
    draftedAt: hoursAgo(24 * 15),
    approvedBy: "mara",
    approvedAt: hoursAgo(24 * 15),
    content: {
      zh: {
        title: "又有人许愿了：柏林中餐地图",
        body: "在柏林想吃口靠谱的中餐，每次都要在朋友圈问一圈。\n\n我们想做一份由真实吃过的人维护的地图。\n\n许愿人：Mara\n首个交付：20 家店的种子清单 · Aiko · 两周内\n\n招募：1 位写过 Next.js 的 Builder，2–3 位住在柏林的 Supporter。\n\n——\nNovawerk 是一个非盈利社区，我们一起把愿望做成真的东西。",
        card: {
          ...emptyPostCard(),
          eyebrow: "Novawerk 又有人许愿了",
          headline: "柏林中餐地图",
          lede: "在柏林想吃口靠谱的中餐，不用每次都在朋友圈问一圈。",
          points: ["首个交付：20 家店的种子清单 · Aiko", "招募 1 位 Builder：写过 Next.js"],
          footer: "许愿人 Mara",
        },
      },
      en: {
        title: "Someone wished for it: Berlin Chinese Food Map",
        body: "Finding decent Chinese food in Berlin shouldn't take a group chat every weekend. We're building a map kept by the people who eat there.\n\nWished by: Mara\nFirst deliverable: a seed list of 20 places · Aiko · in two weeks\n\nWe're looking for one Builder who has shipped Next.js.",
        card: {
          ...emptyPostCard(),
          eyebrow: "Someone wished for it",
          headline: "Berlin Chinese Food Map",
          lede: "A map of Chinese restaurants in Berlin, kept by the people who eat there.",
          points: ["First deliverable: 20 places · Aiko", "Looking for a Builder who has shipped Next.js"],
          footer: "Wished by Mara",
        },
      },
    },
    publishedAt: hoursAgo(24 * 15),
  }),
  post({
    id: "a0000000-0000-4000-8000-000000000002",
    projectId: FOOD_MAP.id,
    project: projectRef(FOOD_MAP),
    kind: "progress",
    seq: 2,
    dueOn: daysAgoDate(1),
    status: "drafted",
    draftedAt: hoursAgo(20),
    content: {
      zh: {
        title: "柏林中餐地图 · 第 2 周",
        body: "完成：20 家店种子清单上线（Aiko 交付）\n\n这周的小困难：【待补充：这周遇到的一个小困难或小决定】\n\n下一个交付：地图前端原型 · Mara · 两周后",
        card: {
          ...emptyPostCard(),
          eyebrow: "第 2 周进展",
          headline: "柏林中餐地图",
          lede: "【待补充：这周的小故事，一句话】",
          points: ["完成：20 家店种子清单 · Aiko", "下一个：地图前端原型 · Mara"],
        },
      },
      en: {
        title: "Berlin Chinese Food Map · week 2",
        body: "Done: the seed list of 20 places is up (Aiko).\nNext: a clickable map prototype (Mara).",
        card: { ...emptyPostCard(), eyebrow: "Week 2", headline: "Berlin Chinese Food Map", points: ["Done: 20 places · Aiko", "Next: map prototype · Mara"] },
      },
    },
  }),
  post({
    id: "a0000000-0000-4000-8000-000000000003",
    projectId: YIMA.id,
    project: projectRef(YIMA),
    kind: "ten_day",
    dueOn: daysAgoDate(-2),
    status: "planned",
    brief: "Collect two or three real quotes from the comments before drafting.",
  }),
  post({
    id: "a0000000-0000-4000-8000-000000000004",
    projectId: null,
    project: null,
    kind: "custom",
    label: "Open day",
    seq: 1,
    dueOn: daysAgoDate(-6),
    status: "approved",
    platforms: ["xiaohongshu", "linkedin", "discord"],
    draftedAt: hoursAgo(30),
    approvedAt: hoursAgo(30),
    sourcePath: "posts/open-day",
    sourceCommit: "3f2a9c1",
    content: {
      zh: {
        title: "来工作坊坐坐：10 月开放日",
        body: "周六下午，我们开放工作坊。\n\n看看我们正在做的三个项目，和做它们的人聊聊。也可以带上一个你一直想做的东西——我们叫它“愿望”。\n\n不用报名，直接来。",
        card: {
          ...emptyPostCard(),
          eyebrow: "Novawerk 开放日",
          headline: "来工作坊坐坐",
          lede: "看看我们正在做的东西，带上你的愿望。",
          points: ["14:00–18:00 · Kreuzberg", "三个项目现场演示", "不用报名，直接来"],
          footer: "novawerk.io",
        },
      },
      en: {
        title: "Open day at the workshop",
        body: "On Saturday afternoon we open the workshop.\n\nSee the three projects we are building and meet the people who build them. Bring something you have always wanted to exist: we call it a wish.\n\nNo sign-up. Just come by.",
        card: {
          ...emptyPostCard(),
          eyebrow: "Novawerk open day",
          headline: "Come by the workshop",
          lede: "See what we are building, and bring a wish.",
          points: ["14:00–18:00 · Kreuzberg", "Three projects, live", "No sign-up needed"],
          footer: "novawerk.io",
        },
      },
    },
  }),
]

// ─── Partners, money, files, newsletter ──────────────────────────────────────

const partner = (o: Partial<Partner> & Pick<Partner, "id" | "name">): Partner => ({
  stage: "intro",
  primaryContact: null,
  primaryEmail: null,
  owner: null,
  lastTouchAt: null,
  createdAt: hoursAgo(24 * 30),
  ...o,
})

export const SAMPLE_PARTNERS: Partner[] = [
  partner({
    id: "acme-foundation",
    name: "Acme Foundation",
    primaryContact: "Jane Doe",
    primaryEmail: "jane@acme.example.org",
    owner: "mara",
  }),
  partner({ id: "kiez-fonds", name: "Kiez Fonds", stage: "follow-up", owner: "jonas", lastTouchAt: hoursAgo(24 * 6) }),
  partner({
    id: "open-city-grants",
    name: "Open City Grants",
    stage: "grant-ask",
    primaryContact: "Sam Rivera",
    primaryEmail: "sam@opencity.example.org",
    owner: "sample-admin",
    lastTouchAt: hoursAgo(24 * 2),
  }),
  partner({ id: "hosting-co", name: "Hosting Co.", stage: "renewal", owner: "aiko", lastTouchAt: hoursAgo(24 * 40) }),
  partner({ id: "old-sponsor", name: "Old Sponsor GmbH", stage: "closed", lastTouchAt: hoursAgo(24 * 200) }),
]

const entry = (o: Partial<FinanceEntry> & Pick<FinanceEntry, "id" | "entryDate" | "direction" | "amountCents">): FinanceEntry => ({
  currency: "EUR",
  category: null,
  description: null,
  owner: "sample-admin",
  partnerId: null,
  receiptDocumentId: null,
  createdAt: hoursAgo(24),
  ...o,
})

export const SAMPLE_FINANCE: FinanceEntry[] = [
  entry({ id: 5, entryDate: daysAgoDate(2), direction: "out", amountCents: 1999, category: "hosting", description: "Vercel Pro, October", receiptDocumentId: 3 }),
  entry({ id: 4, entryDate: daysAgoDate(9), direction: "out", amountCents: 8450, category: "workshop", description: "Snacks for the build night" }),
  entry({ id: 3, entryDate: daysAgoDate(20), direction: "in", amountCents: 250_000, category: "grant", description: "Kiez Fonds micro-grant", partnerId: "kiez-fonds" }),
  entry({ id: 2, entryDate: daysAgoDate(45), direction: "out", amountCents: 1200, category: "domains", description: "novawerk.io renewal" }),
  entry({ id: 1, entryDate: daysAgoDate(70), direction: "in", amountCents: 50_000, category: "donation", description: "Member donations, summer" }),
]

export const SAMPLE_DOCUMENTS: DocumentRow[] = [
  { id: 1, kind: "contract", title: "Kiez Fonds grant agreement", r2Key: "contracts/kiez-fonds-2026.pdf", owner: "sample-admin", counterparty: "Kiez Fonds", signedOn: daysAgoDate(25), projectId: null, createdAt: hoursAgo(24 * 25) },
  { id: 2, kind: "nda", title: "Open City Grants NDA", r2Key: "contracts/open-city-nda.pdf", owner: "sample-admin", counterparty: "Open City Grants", signedOn: daysAgoDate(4), projectId: null, createdAt: hoursAgo(24 * 4) },
  { id: 3, kind: "receipt", title: "Vercel invoice, October", r2Key: "receipts/vercel-2026-10.pdf", owner: null, counterparty: "Vercel", signedOn: null, projectId: null, createdAt: hoursAgo(48) },
]

export const SAMPLE_SUBSCRIBERS: Subscriber[] = [
  { id: 6, email: "kim@example.com", status: "pending", source: "website", confirmedAt: null, createdAt: hoursAgo(5) },
  { id: 5, email: "lou@example.com", status: "confirmed", source: "website", confirmedAt: hoursAgo(29), createdAt: hoursAgo(30) },
  { id: 4, email: "ines@example.com", status: "unsubscribed", source: "website", confirmedAt: null, createdAt: hoursAgo(24 * 12) },
  { id: 3, email: "pat@example.com", status: "confirmed", source: "build-night", confirmedAt: hoursAgo(24 * 19), createdAt: hoursAgo(24 * 20) },
  { id: 2, email: "rae@example.com", status: "pending", source: "website", confirmedAt: null, createdAt: hoursAgo(24 * 33) },
  { id: 1, email: "tom@example.com", status: "confirmed", source: "website", confirmedAt: hoursAgo(24 * 59), createdAt: hoursAgo(24 * 60) },
]

// ─── Metrics ─────────────────────────────────────────────────────────────────

/** A steady pseudo-random number in [0, 1) per seed, so the 7-day range is the tail of the 30-day one. */
function noise(seed: number) {
  let t = (seed * 2_654_435_761 + 0x6d2b79f5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
}

/** Visits with a weekly rhythm (busy Monday and Tuesday, quiet weekend) and a newsletter every four weeks. */
function sampleDaily(days: number): AdminMetrics["traffic"]["daily"] {
  return Array.from({ length: days }, (_, i) => {
    const ago = days - 1 - i
    const date = daysAgoDate(ago)
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    const base = weekday === 0 || weekday === 6 ? 46 : weekday <= 2 ? 86 : 72
    const newsletter = ago % 28 === 9 ? 40 : 0
    const visits = Math.round(base + newsletter + (noise(ago) - 0.5) * 30)
    const pageViews = Math.round(visits * (1.35 + noise(ago + 1000) * 0.35))
    return { date, visits, pageViews }
  })
}

/**
 * Sample metrics for a small non-profit site, scaled to `days` (the numbers are tuned for 30).
 * `inbox` is "right now", so the sample store passes in what its inbox screens show.
 */
export function sampleMetrics(days: number, inbox: AdminMetrics["inbox"]): AdminMetrics {
  const k = days / 30
  const s = (n: number) => Math.round(n * k)
  const daily = sampleDaily(days)
  const visits = daily.reduce((sum, d) => sum + d.visits, 0)
  const pageViews = daily.reduce((sum, d) => sum + d.pageViews, 0)
  const ofViews = (share: number) => Math.round(pageViews * share)
  const ofVisits = (share: number) => Math.round(visits * share)
  const pitchSent = s(20)
  const joinSent = s(35)

  return {
    range: { days, from: daily[0]?.date ?? daysAgoDate(0), to: daily.at(-1)?.date ?? daysAgoDate(0) },
    traffic: {
      visits,
      pageViews,
      daily,
      topPages: [
        { path: "/", views: ofViews(0.44) },
        { path: "/submit", views: ofViews(0.19) },
        { path: "/join", views: ofViews(0.17) },
        { path: "/about", views: ofViews(0.13) },
        { path: "/privacy", views: ofViews(0.03) },
      ],
      topReferrers: [
        { host: "github.com", visits: ofVisits(0.11) },
        { host: "www.linkedin.com", visits: ofVisits(0.08) },
        { host: "news.ycombinator.com", visits: ofVisits(0.035) },
        { host: "t.co", visits: ofVisits(0.015) },
      ],
      topCampaigns: [
        { source: "newsletter", visits: ofVisits(0.06) },
        { source: "linkedin", visits: ofVisits(0.025) },
      ],
      topCountries: [
        { country: "DE", visits: ofVisits(0.66) },
        { country: "NL", visits: ofVisits(0.06) },
        { country: "US", visits: ofVisits(0.055) },
        { country: "AT", visits: ofVisits(0.05) },
        { country: "CH", visits: ofVisits(0.04) },
        { country: "GB", visits: ofVisits(0.035) },
        { country: "CN", visits: ofVisits(0.02) },
        { country: "FR", visits: ofVisits(0.015) },
        { country: "PL", visits: ofVisits(0.01) },
      ],
      topRegions: [
        { region: "DE-BE", visits: ofVisits(0.31) },
        { region: "DE-BY", visits: ofVisits(0.08) },
        { region: "DE-NW", visits: ofVisits(0.07) },
        { region: "DE-HH", visits: ofVisits(0.05) },
        { region: "DE-BB", visits: ofVisits(0.04) },
        { region: "NL-NH", visits: ofVisits(0.035) },
        { region: "AT-9", visits: ofVisits(0.03) },
        { region: "DE-HE", visits: ofVisits(0.03) },
        { region: "DE-BW", visits: ofVisits(0.028) },
        { region: "CH-ZH", visits: ofVisits(0.022) },
      ],
      unknownLocation: ofVisits(0.03),
      devices: { mobile: ofVisits(0.62), desktop: visits - ofVisits(0.62) },
      ctaClicks: [
        { target: "submit", placement: "hero", clicks: s(96) },
        { target: "join", placement: "hero", clicks: s(71) },
        { target: "submit", placement: "header", clicks: s(38) },
        { target: "join", placement: "header", clicks: s(44) },
        { target: "submit", placement: "get-involved", clicks: s(29) },
        { target: "join", placement: "get-involved", clicks: s(52) },
        { target: "submit", placement: "footer", clicks: s(6) },
        { target: "join", placement: "footer", clicks: s(9) },
      ],
      projectClicks: [
        { project: "berlin-food-map", clicks: s(41) },
        { project: "yima-app", clicks: s(27) },
        { project: "open-transit-board", clicks: s(12) },
      ],
    },
    intake: {
      funnel: {
        pitch: { opened: s(140), engaged: s(82), ready: s(31), submitted: s(19) },
        join: { opened: s(210), engaged: s(120), ready: s(48), submitted: s(33) },
      },
      exits: {
        pitch: { beforeFirstMessage: s(51), whileDrafting: s(43), withDraftReady: s(9) },
        join: { beforeFirstMessage: s(83), whileDrafting: s(61), withDraftReady: s(12) },
      },
      chats: {
        pitch: { started: s(152), engaged: s(90), submitted: pitchSent, avgTurnsToSubmit: pitchSent ? 7.4 : null },
        join: { started: s(226), engaged: s(131), submitted: joinSent, avgTurnsToSubmit: joinSent ? 5.8 : null },
      },
      replyFailures: [
        { reason: "network", count: s(6) },
        { reason: "busy", count: s(2) },
        { reason: "limit", count: s(1) },
        { reason: "error", count: s(2) },
      ],
      fallbacks: s(2),
    },
    forms: {
      pitch: { submitted: s(3), failed: s(1) },
      join: { submitted: s(4), failed: 0 },
      newsletter: { submitted: s(14), failed: s(1) },
    },
    agents: [
      {
        agent: "intake",
        turns: s(640),
        errors: s(5),
        p50Ms: 4_800,
        p95Ms: 14_200,
        inputTokens: s(912_000),
        cachedInputTokens: s(604_000),
        outputTokens: s(98_500),
      },
      {
        agent: "admin-assistant",
        turns: s(84),
        errors: s(1),
        p50Ms: 6_900,
        p95Ms: 19_400,
        inputTokens: s(486_000),
        cachedInputTokens: s(341_000),
        outputTokens: s(41_200),
      },
    ],
    received: {
      pitches: pitchSent + s(3),
      applications: joinSent + s(4),
      newsletter: s(14),
      pitchesViaChat: pitchSent,
      applicationsViaChat: joinSent,
    },
    inbox,
  }
}

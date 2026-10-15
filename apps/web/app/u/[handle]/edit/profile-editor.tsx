"use client";

import {
  PROFILE_ACCENTS,
  PROFILE_BANNERS,
  profileUpdateInput,
  type ContributorMe,
  type ProfileAccent,
  type ProfileBanner,
  type PublicContributorProfile,
} from "@nw/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, use, useEffect, useId, useState } from "react";

import { ProfileView, type ProfileData } from "@/components/board/profile-view";
import { Check, SignInPanel } from "@/components/board/sign-in";
import { buttonGhost, buttonInk, container, eyebrow, field, fieldHint, fieldLabel, textLink } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api } from "@/lib/contrib-api";
import { useSession, useToast } from "@/lib/session";

const SWATCH: Record<ProfileAccent, string> = {
  green: "bg-pa-green",
  blue: "bg-pa-blue",
  teal: "bg-pa-teal",
  plum: "bg-pa-plum",
  amber: "bg-pa-amber",
  ink: "bg-pa-ink",
};

export function ProfileEditor({ handle }: { handle: Promise<string> }) {
  return (
    <Suspense fallback={<div className={`${container} py-16 text-sm text-muted`}>Loading…</div>}>
      <Gate handle={handle} />
    </Suspense>
  );
}

function Gate({ handle: handlePromise }: { handle: Promise<string> }) {
  const handle = use(handlePromise);
  const { session } = useSession();
  if (session.status === "loading") return <div className={`${container} py-16 text-sm text-muted`}>Loading…</div>;
  if (session.status !== "signed-in") {
    return (
      <div className={`${container} grid place-items-center py-14`}>
        <div className="w-full max-w-[460px] border border-line bg-paper p-6">
          <SignInPanel returnTo={`/u/${handle}/edit`} />
        </div>
      </div>
    );
  }
  if (session.me.handle !== handle) {
    return (
      <div className={`${container} grid gap-3 py-16`}>
        <h1 className="text-2xl font-semibold tracking-tight">You can only edit your own profile</h1>
        <p>
          <Link className={textLink} href={`/u/${session.me.handle}/edit`}>
            Edit @{session.me.handle} instead
          </Link>
        </p>
      </div>
    );
  }
  return <Editor me={session.me} />;
}

type Draft = {
  handle: string;
  displayName: string;
  bio: string;
  links: string;
  about: string;
  accent: ProfileAccent;
  banner: ProfileBanner;
  public: boolean;
};

const draftOf = (me: ContributorMe): Draft => ({
  handle: me.handle,
  displayName: me.displayName,
  bio: me.bio ?? "",
  links: me.links.join("\n"),
  about: me.about ?? "",
  accent: me.accent,
  banner: me.banner,
  public: me.public,
});

function Editor({ me }: { me: ContributorMe }) {
  const { setMe } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [d, setD] = useState<Draft>(() => draftOf(me));
  const [published, setPublished] = useState<PublicContributorProfile | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const ids = { handle: useId(), name: useId(), bio: useId(), links: useId(), about: useId() };
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  // Stats and task lists for the preview come from the public profile (if there is one yet).
  useEffect(() => {
    let cancelled = false;
    void api<PublicContributorProfile>(`/public/contributors/${me.handle}`).then((res) => {
      if (!cancelled && res.ok) setPublished(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [me.handle]);

  const links = d.links
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const preview: ProfileData = {
    handle: d.handle || me.handle,
    name: d.displayName || me.handle,
    avatarUrl: me.avatarUrl,
    bio: d.bio.trim() || null,
    about: d.about.trim() || null,
    links,
    accent: d.accent,
    banner: d.banner,
    since: me.createdAt,
    stats: published?.stats ?? { done: 0, inProgress: 0, werk: 0 },
    inProgress: published?.inProgress ?? [],
    done: published?.done ?? [],
    ideasAccepted: published?.ideasAccepted ?? [],
  };

  const save = async () => {
    const patch = {
      ...(d.handle !== me.handle ? { handle: d.handle.trim().toLowerCase() } : {}),
      displayName: d.displayName,
      bio: d.bio,
      about: d.about,
      links,
      accent: d.accent,
      banner: d.banner,
      public: d.public,
    };
    const parsed = profileUpdateInput.safeParse(patch);
    if (!parsed.success) {
      setIssues(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "form"), i.message])));
      return;
    }
    setIssues({});
    setBusy(true);
    const res = await api<ContributorMe>("/contrib/me/profile", { method: "PATCH", body: parsed.data });
    setBusy(false);
    if (!res.ok) {
      setIssues(Object.fromEntries(Object.entries(res.issues).map(([k, v]) => [k, v[0] ?? ""])));
      if (Object.keys(res.issues).length === 0) toast(res.error);
      return;
    }
    track("profile_saved", {});
    setMe(res.data);
    toast("Profile saved.");
    router.push(res.data.public ? `/u/${res.data.handle}` : "/settings");
    router.refresh();
  };

  const err = (k: string) => (issues[k] ? <p className="text-sm text-danger">{issues[k]}</p> : null);
  const opt = "h-8 border border-line-strong bg-paper px-2.5 text-[13px] aria-pressed:border-ink aria-pressed:shadow-[inset_0_0_0_1px_var(--color-ink)]";

  return (
    <div className={container}>
      <div className="flex flex-wrap items-end justify-between gap-4 pt-7">
        <div>
          <p className={eyebrow}>Edit profile</p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">How others see you</h1>
        </div>
        <div className="flex gap-2">
          <Link href={me.public ? `/u/${me.handle}` : "/settings"} className={buttonGhost}>
            Cancel
          </Link>
          <button type="button" className={buttonInk} disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="grid items-start gap-7 pt-7 pb-16 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <form
          className="grid gap-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-1.5">
            <label htmlFor={ids.handle} className={fieldLabel}>
              Handle <span className={fieldHint}>your address: /u/{d.handle || "…"}</span>
            </label>
            <input id={ids.handle} value={d.handle} onChange={(e) => set("handle", e.target.value)} className={`${field} h-10 font-mono`} aria-invalid={issues.handle ? true : undefined} />
            {err("handle")}
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={ids.name} className={fieldLabel}>
              Display name
            </label>
            <input id={ids.name} value={d.displayName} maxLength={100} onChange={(e) => set("displayName", e.target.value)} className={`${field} h-10`} />
            {err("displayName")}
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={ids.bio} className={fieldLabel}>
              Bio <span className={fieldHint}>{d.bio.length}/160</span>
            </label>
            <textarea id={ids.bio} value={d.bio} maxLength={160} onChange={(e) => set("bio", e.target.value)} className={`${field} min-h-[70px] resize-y`} />
            {err("bio")}
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={ids.links} className={fieldLabel}>
              Links <span className={fieldHint}>up to 4, one per line, starting with https://</span>
            </label>
            <textarea id={ids.links} value={d.links} onChange={(e) => set("links", e.target.value)} className={`${field} min-h-[70px] resize-y font-mono text-sm`} />
            {err("links")}
          </div>
          <fieldset className="grid gap-1.5">
            <legend className={`${fieldLabel} mb-1.5`}>Accent</legend>
            <div className="flex flex-wrap gap-2">
              {PROFILE_ACCENTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-label={a}
                  aria-pressed={d.accent === a}
                  onClick={() => set("accent", a)}
                  className={`size-8 border border-line-strong ${SWATCH[a]} aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-ink`}
                />
              ))}
            </div>
            <p className={fieldHint}>Six colours that read well in light and dark.</p>
          </fieldset>
          <fieldset className="grid gap-1.5">
            <legend className={`${fieldLabel} mb-1.5`}>Banner</legend>
            <div className="flex flex-wrap gap-1.5">
              {PROFILE_BANNERS.map((b) => (
                <button key={b} type="button" aria-pressed={d.banner === b} onClick={() => set("banner", b)} className={`${opt} capitalize`}>
                  {b}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-1.5">
            <label htmlFor={ids.about} className={fieldLabel}>
              About <span className={fieldHint}>Markdown: bold, lists, links. No images or HTML. {d.about.length}/1500</span>
            </label>
            <textarea id={ids.about} value={d.about} maxLength={1500} onChange={(e) => set("about", e.target.value)} className={`${field} min-h-[150px] resize-y font-mono text-[13px]`} />
            {err("about")}
          </div>
          <Check checked={d.public} onChange={(v) => set("public", v)}>
            <b>Public profile.</b> Off hides this page and takes you off Contributors. Tasks still show your handle.
          </Check>
        </form>

        <div className="grid min-w-0 gap-2">
          <p className={eyebrow}>Preview</p>
          {/* A picture of the page, not part of it: no focus stops, no second h1 for screen readers. */}
          <div className="overflow-hidden border border-line bg-canvas" inert>
            <ProfileView profile={preview} compact />
          </div>
        </div>
      </div>
    </div>
  );
}

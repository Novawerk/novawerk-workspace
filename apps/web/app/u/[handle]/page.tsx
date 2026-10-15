import { HANDLE_PATTERN } from "@nw/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BoardOffline } from "@/components/board/bits";
import { ProfileView } from "@/components/board/profile-view";
import { container } from "@/components/ui";
import { getProfile } from "@/lib/board";

import { OwnerActions } from "./owner-actions";

const valid = (handle: string) => handle.length <= 40 && HANDLE_PATTERN.test(handle);

export async function generateMetadata({ params }: PageProps<"/u/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const profile = valid(handle) ? await getProfile(handle) : "missing";
  if (!profile || profile === "missing") return { title: "Profile", robots: { index: false } };
  return {
    title: `${profile.name} (@${profile.handle})`,
    description: profile.bio ?? `@${profile.handle} builds Novawerk's tools with us.`,
    alternates: { canonical: `/u/${profile.handle}` },
  };
}

/** A public profile. Private, unknown and suspended handles are a 404. */
export default function ProfilePage({ params }: PageProps<"/u/[handle]">) {
  return (
    <Suspense fallback={<div aria-hidden="true" className="h-[148px] border-b border-line bg-subtle" />}>
      {params.then(({ handle }) => (
        <Profile handle={handle} />
      ))}
    </Suspense>
  );
}

async function Profile({ handle }: { handle: string }) {
  if (!valid(handle)) notFound();
  const profile = await getProfile(handle);
  if (profile === "missing") notFound();
  if (!profile) {
    return (
      <div className={`${container} py-16`}>
        <BoardOffline what="This profile" />
      </div>
    );
  }
  return <ProfileView profile={profile} actions={<OwnerActions handle={profile.handle} />} />;
}

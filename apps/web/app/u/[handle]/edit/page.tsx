import type { Metadata } from "next";

import { ProfileEditor } from "./profile-editor";

export const metadata: Metadata = { title: "Edit profile", robots: { index: false } };

export default function EditProfilePage({ params }: PageProps<"/u/[handle]/edit">) {
  return <ProfileEditor handle={params.then((p) => p.handle)} />;
}

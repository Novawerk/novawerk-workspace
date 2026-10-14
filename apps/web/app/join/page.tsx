import type { Metadata } from "next";

import { Modal } from "@/components/modal";

import HomePage from "../page";
import { JoinIntake } from "./join-intake";

export const metadata: Metadata = {
  title: "Join Novawerk",
  description: "Bring what you're good at and build something real with others. Everyone at Novawerk is a Member.",
  alternates: { canonical: "/join" },
};

// Opened directly (shared link, refresh): the home page with the Intake Agent dialog on top.
// Clicking "Join" on the site uses app/@modal/(.)join instead.
export default function JoinPage() {
  return (
    <>
      <HomePage />
      <Modal label="Join Novawerk" closeTo="/">
        <JoinIntake />
      </Modal>
    </>
  );
}

import type { Metadata } from "next";

import { Modal } from "@/components/modal";

import HomePage from "../page";
import { SubmitIntake } from "./submit-intake";

export const metadata: Metadata = {
  title: "Pitch a project",
  description: "Have an idea that should exist? Tell us about it. We usually reply within a few days.",
  alternates: { canonical: "/submit" },
};

// Opened directly (shared link, refresh): the home page with the Intake Agent dialog on top.
// Clicking "Pitch a project" on the site uses app/@modal/(.)submit instead.
export default function SubmitPage() {
  return (
    <>
      <HomePage />
      <Modal label="Pitch a project" closeTo="/">
        <SubmitIntake />
      </Modal>
    </>
  );
}

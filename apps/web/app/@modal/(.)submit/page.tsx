import { Modal } from "@/components/modal";

import { SubmitIntake } from "../../submit/submit-intake";

// Clicking "Pitch a project" opens the Intake Agent here, over the current page.
// Opening /submit directly (shared link, refresh) renders app/submit/page.tsx instead.
export default function SubmitModal() {
  return (
    <Modal label="Pitch a project">
      <SubmitIntake />
    </Modal>
  );
}

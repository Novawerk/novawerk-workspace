import { Modal } from "@/components/modal";

import { JoinIntake } from "../../join/join-intake";

// Clicking "Join" opens the Intake Agent here, over the current page.
// Opening /join directly (shared link, refresh) renders app/join/page.tsx instead.
export default function JoinModal() {
  return (
    <Modal label="Join Novawerk">
      <JoinIntake />
    </Modal>
  );
}

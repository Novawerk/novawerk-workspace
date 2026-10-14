import { IntakeAgent } from "@/components/intake/intake-agent";

import { ApplicationWizard } from "./application-wizard";

/** The "Join Novawerk" Intake Agent, shared by the /join page and the dialog. */
export function JoinIntake() {
  return (
    <IntakeAgent
      mode="join"
      title="Join Novawerk"
      subtitle="Tell us about you. We write your intro together."
      plainForm={<ApplicationWizard />}
    />
  );
}

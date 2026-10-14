import { IntakeAgent } from "@/components/intake/intake-agent";

import { SubmissionWizard } from "./submission-wizard";

/** The "Pitch a project" Intake Agent, shared by the /submit page and the dialog. */
export function SubmitIntake() {
  return (
    <IntakeAgent
      mode="pitch"
      title="Pitch a project"
      subtitle="Tell us about your idea. We draft the pitch with you."
      plainForm={<SubmissionWizard />}
    />
  );
}

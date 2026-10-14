"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { projectSubmissionInput } from "@nw/contracts";
import type { z } from "zod";

import { Checkbox, FormSuccess, Honeypot, TextArea, TextField } from "@/components/forms/fields";
import { ResumeFormField } from "@/components/forms/resume-field";
import { applyServerIssues } from "@/components/forms/server-issues";
import { Review, Wizard, firstStepWithError, useFormDraft, type WizardStep } from "@/components/forms/wizard";
import { buttonOutline, textLink } from "@/components/ui";
import { sendForm } from "@/lib/api";
import { FORM_DRAFT_KEYS } from "@/lib/form-drafts";
import { SEND_FAILED_MESSAGE } from "@/lib/site";

type Input = z.input<typeof projectSubmissionInput>;
type Output = z.output<typeof projectSubmissionInput>;

const FIELDS = [
  "name",
  "email",
  "projectName",
  "product",
  "userJourney",
  "referencesAndInnovation",
  "team",
  "timeline",
  "links",
  "resume",
  "consent",
] as const satisfies readonly (keyof Input)[];

const DRAFT_KEY = FORM_DRAFT_KEYS.pitch;
const NOT_SAVED = ["consent", "website"] as const;
const LAST_STEP = 6;

/** "Pitch a project", one question per step: the plain-form fallback of the Intake Agent on /submit. */
export function SubmissionWizard() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<React.ReactNode>(null);

  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(projectSubmissionInput),
    defaultValues: {
      name: "",
      email: "",
      projectName: "",
      product: "",
      userJourney: "",
      referencesAndInnovation: "",
      team: "",
      timeline: "",
      links: "",
      resume: null,
      website: "",
    },
  });
  const { register, formState, getValues, handleSubmit, setError, control } = form;
  const errors = formState.errors;

  const draft = useFormDraft(DRAFT_KEY, form, { omit: NOT_SAVED, lastStep: LAST_STEP });

  const values = getValues();
  const steps: WizardStep<Input>[] = [
    {
      id: "you",
      title: "About you",
      intro: "So we know who to reply to.",
      fields: ["name", "email"],
      content: (
        <>
          <TextField id="name" label="Name" autoComplete="name" registration={register("name")} error={errors.name?.message} />
          <TextField
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            registration={register("email")}
            error={errors.email?.message}
          />
        </>
      ),
    },
    {
      id: "product",
      title: "Your idea",
      intro: "Plain words are fine. Nothing has to be final.",
      fields: ["projectName", "product"],
      content: (
        <>
          <TextField
            id="projectName"
            label="Project name"
            helper="A working title is fine."
            registration={register("projectName")}
            error={errors.projectName?.message}
          />
          <TextArea
            id="product"
            label="Product"
            helper="What it is, and whose problem it solves."
            rows={7}
            registration={register("product")}
            error={errors.product?.message}
          />
        </>
      ),
    },
    {
      id: "journey",
      title: "User journey",
      intro: "Walk us through it from the user's side.",
      fields: ["userJourney"],
      content: (
        <TextArea
          id="userJourney"
          label="User journey"
          helper="The steps someone goes through, from first hearing about it to using it."
          rows={9}
          registration={register("userJourney")}
          error={errors.userJourney?.message}
        />
      ),
    },
    {
      id: "references",
      title: "References and what's new",
      intro: "Most good ideas have neighbours. Tell us about them.",
      fields: ["referencesAndInnovation"],
      content: (
        <TextArea
          id="referencesAndInnovation"
          label="References and what's new"
          helper="Similar products or projects, and how yours differs."
          rows={9}
          registration={register("referencesAndInnovation")}
          error={errors.referencesAndInnovation?.message}
        />
      ),
    },
    {
      id: "team",
      title: "Team — your strengths",
      intro: "You don't need a full team. Tell us who's in and who's missing.",
      fields: ["team", "resume"],
      content: (
        <>
          <TextArea
            id="team"
            label="Team"
            helper="Who is on it, what they're good at, and which skills you still need."
            rows={9}
            registration={register("team")}
            error={errors.team?.message}
          />
          <ResumeFormField control={control} name="resume" label="Your CV" helper="Shows us what you bring to it." />
        </>
      ),
    },
    {
      id: "timeline",
      title: "Timeline / launch plan",
      intro: "Rough is fine. We'll cut it down together.",
      fields: ["timeline", "links"],
      content: (
        <>
          <TextArea
            id="timeline"
            label="Timeline"
            helper="What you want done by when."
            rows={7}
            registration={register("timeline")}
            error={errors.timeline?.message}
          />
          <TextArea
            id="links"
            label="Links"
            optional
            rows={3}
            helper="A prototype, a repo, a deck — anything that helps us understand it."
            registration={register("links")}
            error={errors.links?.message}
          />
        </>
      ),
    },
    {
      id: "send",
      title: "Check and send",
      intro: "Have a last look. We read every submission and usually reply within a few days.",
      fields: ["consent"],
      content: (
        <>
          <Review
            onEdit={draft.setStep}
            items={[
              { label: "Name", value: values.name ?? "", step: 0 },
              { label: "Email", value: values.email ?? "", step: 0 },
              { label: "Project name", value: values.projectName ?? "", step: 1 },
              { label: "Product", value: values.product ?? "", step: 1 },
              { label: "User journey", value: values.userJourney ?? "", step: 2 },
              { label: "References", value: values.referencesAndInnovation ?? "", step: 3 },
              { label: "Team", value: values.team ?? "", step: 4 },
              { label: "Your CV", value: values.resume?.name ?? "", step: 4 },
              { label: "Timeline", value: values.timeline ?? "", step: 5 },
              { label: "Links", value: values.links ?? "", step: 5 },
            ]}
          />
          <Checkbox id="consent" registration={register("consent")} error={errors.consent?.message}>
            I agree that Novawerk stores what I send here and contacts me about it, as described in
            the{" "}
            <Link className={textLink} href="/privacy" target="_blank">
              privacy notice<span className="sr-only"> (opens in a new tab)</span>
            </Link>
            .
          </Checkbox>
          <Honeypot registration={register("website")} />
        </>
      ),
    },
  ];

  const send = handleSubmit(
    async (output) => {
      setFormError(null);
      const result = await sendForm("pitch", output);
      if (result.ok) {
        draft.clear();
        return setSent(true);
      }
      if (result.reason === "invalid") {
        const unmatched = applyServerIssues(result.issues, FIELDS, setError);
        const at = firstStepWithError(steps, form.formState.errors);
        if (at >= 0) draft.setStep(at);
        setFormError(unmatched.length > 0 ? unmatched.join(" ") : "Please check the highlighted fields.");
        return;
      }
      setFormError(SEND_FAILED_MESSAGE);
    },
    (invalid) => {
      // Something earlier is wrong (e.g. edited after a draft restore): go there.
      const at = firstStepWithError(steps, invalid);
      if (at >= 0) draft.setStep(at);
    },
  );

  if (sent) {
    return (
      <FormSuccess title="Got it. We usually reply within a few days.">
        <p>We sent your pitch to the team. Keep an eye on your inbox — we may ask a few questions first.</p>
        <div className="mt-6">
          <Link href="/" className={buttonOutline}>
            Back to the projects
          </Link>
        </div>
      </FormSuccess>
    );
  }

  return (
    <Wizard
      trackAs="pitch"
      form={form as never}
      steps={steps}
      step={draft.step}
      onStepChange={draft.setStep}
      onSend={() => void send()}
      sendLabel="Send submission"
      formError={formError}
    />
  );
}

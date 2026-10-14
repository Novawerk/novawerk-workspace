"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AVAILABILITY_OPTIONS, FUNCTION_OPTIONS, memberApplicationInput } from "@nw/contracts";
import type { z } from "zod";

import { Checkbox, ChoiceGroup, FormSuccess, Honeypot, TextArea, TextField } from "@/components/forms/fields";
import { ResumeFormField } from "@/components/forms/resume-field";
import { applyServerIssues } from "@/components/forms/server-issues";
import { Review, Wizard, firstStepWithError, useFormDraft, type WizardStep } from "@/components/forms/wizard";
import { buttonOutline, textLink } from "@/components/ui";
import { sendForm } from "@/lib/api";
import { FORM_DRAFT_KEYS } from "@/lib/form-drafts";
import { SEND_FAILED_MESSAGE } from "@/lib/site";

type Input = z.input<typeof memberApplicationInput>;
type Output = z.output<typeof memberApplicationInput>;

const FIELDS = [
  "name",
  "email",
  "city",
  "functions",
  "background",
  "motivation",
  "availability",
  "links",
  "resume",
  "consent",
] as const satisfies readonly (keyof Input)[];

const DRAFT_KEY = FORM_DRAFT_KEYS.join;
const NOT_SAVED = ["consent", "website"] as const;
const LAST_STEP = 3;

const labelOf = (options: readonly { value: string; label: string }[], value: string | undefined) =>
  options.find((o) => o.value === value)?.label ?? "";

/** "Join Novawerk", step by step: the plain-form fallback of the Intake Agent on /join. */
export function ApplicationWizard() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<React.ReactNode>(null);

  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(memberApplicationInput),
    defaultValues: {
      name: "",
      email: "",
      city: "",
      functions: [],
      background: "",
      motivation: "",
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
      fields: ["name", "email", "city"],
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
          <TextField
            id="city"
            label="City"
            optional
            autoComplete="address-level2"
            registration={register("city")}
            error={errors.city?.message}
          />
        </>
      ),
    },
    {
      id: "skills",
      title: "What you do",
      intro: "Members carry a function on a project. Which ones fit you?",
      fields: ["functions", "background", "links", "resume"],
      content: (
        <>
          <ChoiceGroup
            id="functions"
            legend="What do you do?"
            helper="Pick all that fit."
            type="checkbox"
            options={FUNCTION_OPTIONS}
            registration={register("functions")}
            error={errors.functions?.message ?? errors.functions?.root?.message}
          />
          <TextField
            id="background"
            label="Background"
            helper="One line on what you do or study."
            registration={register("background")}
            error={errors.background?.message}
          />
          <TextArea
            id="links"
            label="Links"
            optional
            rows={3}
            helper="LinkedIn, GitHub, a portfolio — anything that shows your work."
            registration={register("links")}
            error={errors.links?.message}
          />
          <ResumeFormField control={control} name="resume" label="CV" />
        </>
      ),
    },
    {
      id: "why",
      title: "Why Novawerk",
      intro: "There's no wrong answer. Be specific if you can.",
      fields: ["motivation", "availability"],
      content: (
        <>
          <TextArea
            id="motivation"
            label="Why Novawerk?"
            helper="What do you want to build, learn or help with here?"
            rows={7}
            registration={register("motivation")}
            error={errors.motivation?.message}
          />
          <ChoiceGroup
            id="availability"
            legend="How much time can you give?"
            type="radio"
            options={AVAILABILITY_OPTIONS}
            registration={register("availability")}
            error={errors.availability?.message}
          />
        </>
      ),
    },
    {
      id: "send",
      title: "Check and send",
      intro: "Have a last look. We read every intro and usually reply within a few days.",
      fields: ["consent"],
      content: (
        <>
          <Review
            onEdit={draft.setStep}
            items={[
              { label: "Name", value: values.name ?? "", step: 0 },
              { label: "Email", value: values.email ?? "", step: 0 },
              { label: "City", value: values.city ?? "", step: 0 },
              {
                label: "What you do",
                value: (values.functions ?? []).map((f) => labelOf(FUNCTION_OPTIONS, f)).join(", "),
                step: 1,
              },
              { label: "Background", value: values.background ?? "", step: 1 },
              { label: "Links", value: values.links ?? "", step: 1 },
              { label: "CV", value: values.resume?.name ?? "", step: 1 },
              { label: "Why Novawerk", value: values.motivation ?? "", step: 2 },
              { label: "Time", value: labelOf(AVAILABILITY_OPTIONS, values.availability), step: 2 },
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
      const result = await sendForm("join", output);
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
      const at = firstStepWithError(steps, invalid);
      if (at >= 0) draft.setStep(at);
    },
  );

  if (sent) {
    return (
      <FormSuccess title="Welcome aboard — almost. We'll be in touch within a few days.">
        <p>Your intro is with the team. Meanwhile, have a look at what Members are building.</p>
        <div className="mt-6">
          <Link href="/" className={buttonOutline}>
            See the projects
          </Link>
        </div>
      </FormSuccess>
    );
  }

  return (
    <Wizard
      trackAs="join"
      form={form as never}
      steps={steps}
      step={draft.step}
      onStepChange={draft.setStep}
      onSend={() => void send()}
      sendLabel="Send intro"
      formError={formError}
    />
  );
}

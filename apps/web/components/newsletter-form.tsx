"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { NEWSLETTER_PATHS, newsletterSignupInput } from "@nw/contracts";
import type { z } from "zod";

import { sendForm } from "@/lib/api";
import { SEND_FAILED_MESSAGE } from "@/lib/site";

import { FieldError, FormAlert, Honeypot } from "./forms/fields";
import { buttonInk, textLink } from "./ui";

type Input = z.input<typeof newsletterSignupInput>;
type Output = z.output<typeof newsletterSignupInput>;

/** Double opt-in: a good signup goes to "check your inbox"; the email's link confirms it. */
export function NewsletterForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(newsletterSignupInput),
    defaultValues: { email: "", website: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await sendForm("newsletter", values);
    if (result.ok) return router.push(NEWSLETTER_PATHS.checkInbox);
    if (result.reason === "invalid" && result.issues.email?.[0]) {
      setError("email", { type: "server", message: result.issues.email[0] }, { shouldFocus: true });
      return;
    }
    setFormError(SEND_FAILED_MESSAGE);
  });

  const error = errors.email?.message;

  return (
    <form onSubmit={onSubmit} noValidate className="relative space-y-3">
      <label htmlFor="newsletter-email" className="block text-sm font-medium">
        Email
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="newsletter-email"
          type="email"
          autoComplete="email"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "newsletter-email-error" : undefined}
          className="block h-11 w-full min-w-0 border border-line-strong bg-paper px-3 text-base transition-colors duration-150 hover:border-ink focus:border-accent aria-[invalid=true]:border-danger"
          {...register("email")}
        />
        <button type="submit" disabled={isSubmitting} className={`${buttonInk} shrink-0`}>
          {isSubmitting ? "Subscribing…" : "Subscribe"}
        </button>
      </div>
      <FieldError id="newsletter-email" error={error} />
      <p className="text-xs text-muted">
        We email you a link to confirm first. Unsubscribe any time. See our{" "}
        <Link className={textLink} href="/privacy">
          privacy notice
        </Link>
        .
      </p>
      <Honeypot registration={register("website")} />
      {formError ? <FormAlert>{formError}</FormAlert> : null}
    </form>
  );
}

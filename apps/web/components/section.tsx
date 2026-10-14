import { container } from "./ui";

/** A full-width band with a thin top rule, a heading and an optional intro line. */
export function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t border-line">
      <div className={`${container} py-16 sm:py-24`}>
        <div className="max-w-2xl">
          <h2 id={id} className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {title}
          </h2>
          {intro ? <p className="mt-3 text-base text-muted sm:text-lg">{intro}</p> : null}
        </div>
        {children ? <div className="mt-10 sm:mt-12">{children}</div> : null}
      </div>
    </section>
  );
}

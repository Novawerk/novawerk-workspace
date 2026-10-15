"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef } from "react";

/** Inside a route modal: closes it. Outside (a full page): null, so callers hide their Close button. */
const ModalCloseContext = createContext<(() => void) | null>(null);
export const useModalClose = () => useContext(ModalCloseContext);

/**
 * A large route modal. Two ways in:
 * - clicking a link: an intercepted route (app/@modal/(.)submit) opens it over the
 *   current page, and closing goes back (router.back()), so Back/Forward behave;
 * - opening the URL directly: app/submit/page.tsx renders the home page with the modal on top,
 *   and closing replaces the URL with `closeTo` (there's nothing to go back to).
 * Built on the native <dialog> (Esc, focus trap, inert background). The content draws its own
 * header and Close button.
 */
export function Modal({
  label,
  closeTo,
  children,
}: {
  label: string;
  /** Set when the modal is the page itself (direct URL): close navigates here instead of back. */
  closeTo?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    // The page behind shouldn't scroll while the dialog is open.
    const { overflow } = document.documentElement.style;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = overflow;
      // Next keeps the previous route's tree around, hidden (React Activity), for Back/Forward.
      // Close the native dialog too, or it would stay modal — invisible but blocking the page.
      dialog?.close();
    };
  }, []);

  const close = () => (closeTo ? router.replace(closeTo, { scroll: false }) : router.back());

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-paper p-0 text-ink backdrop:bg-ink/45 sm:m-auto sm:h-[min(52rem,calc(100dvh-3rem))] sm:w-[calc(100%-3rem)] sm:max-w-6xl sm:border sm:border-line sm:shadow-[0_32px_96px_-24px_rgba(15,15,15,0.45)]"
    >
      <ModalCloseContext.Provider value={close}>{children}</ModalCloseContext.Provider>
    </dialog>
  );
}

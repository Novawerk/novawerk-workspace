// When a click on a modal <dialog> means "close". Pure, so it has tests.

/**
 * A click on the dialog element itself, outside the panel, is a click on the backdrop. It closes
 * the dialog only when the press also started there: dragging a text selection out of a field and
 * letting go over the backdrop doesn't. Some dialogs never close from the backdrop at all.
 */
export function closesOnBackdropClick({
  clickOnDialog,
  pressStartedOnDialog,
  closeOnBackdrop,
  dismissible,
}: {
  clickOnDialog: boolean;
  pressStartedOnDialog: boolean;
  closeOnBackdrop: boolean;
  dismissible: boolean;
}): boolean {
  return dismissible && closeOnBackdrop && clickOnDialog && pressStartedOnDialog;
}

/**
 * The sign-in prompt for an agent's confirm link (/tasks/NW-n?confirm=…): shown to a signed-out
 * visitor until they close it themselves. The page keeps a note with a way to open it again.
 */
export function confirmPromptOpen({
  confirmId,
  status,
  closedByUser,
}: {
  confirmId: string | null;
  status: string;
  closedByUser: boolean;
}): boolean {
  return !!confirmId && status === "signed-out" && !closedByUser;
}

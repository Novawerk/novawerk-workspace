// Novawerk Chat: data-turbo-confirm opens a styled dialog instead of the browser's alert.
// A form whose button is .btn--negative (ban, delete, remove) gets a red confirm button.
import { Turbo } from "@hotwired/turbo-rails"

function confirmDialog(message, form, submitter) {
  const destructive = !!(submitter?.classList.contains("btn--negative") || form?.querySelector(".btn--negative"))
  const label = submitter?.dataset.confirmLabel || submitter?.textContent.trim() || "Confirm"

  const dialog = document.createElement("dialog")
  dialog.className = "nw-dialog"
  dialog.innerHTML = `
    <form method="dialog" class="nw-dialog__body">
      <p class="nw-dialog__title"></p>
      <div class="nw-dialog__actions">
        <button value="cancel" class="btn">Cancel</button>
        <button value="confirm" class="btn ${destructive ? "nw-btn-danger-solid" : "btn--reversed"}" autofocus></button>
      </div>
    </form>`
  dialog.querySelector(".nw-dialog__title").textContent = message
  dialog.querySelector('[value="confirm"]').textContent = label
  document.body.append(dialog)

  return new Promise(resolve => {
    dialog.addEventListener("close", () => {
      resolve(dialog.returnValue === "confirm")
      dialog.remove()
    }, { once: true })
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close("cancel") })
    dialog.showModal()
  })
}

if (Turbo.config?.forms) {
  Turbo.config.forms.confirm = confirmDialog
} else {
  Turbo.setConfirmMethod(confirmDialog)
}

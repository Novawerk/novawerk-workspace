// Novawerk Chat: data-turbo-confirm opens a styled dialog instead of the browser's alert.
// A form whose button is .btn--negative (ban, delete, remove) gets a red confirm button, and then
// Cancel has the focus, so Enter never destroys anything. The message's first sentence is the
// title ("Delete this message?"), the rest the description (as on board Main).
import { Turbo } from "@hotwired/turbo-rails"

function splitMessage(message) {
  const match = message.match(/^(.+?[?.!])\s+(.+)$/s)
  return match ? [ match[1], match[2] ] : [ message, "" ]
}

function confirmDialog(message, form, submitter) {
  const destructive = !!(submitter?.classList.contains("btn--negative") || form?.querySelector(".btn--negative"))
  const label = submitter?.dataset.confirmLabel || submitter?.textContent.trim() || "Confirm"
  const [ title, description ] = splitMessage(message)

  // Menus that led here close first, so they don't stay open behind the dialog.
  document.querySelectorAll(".nw-toolbar__more[open], .nw-hdr-menu[open], .nw-row-menu[open]").forEach(menu => menu.removeAttribute("open"))

  const dialog = document.createElement("dialog")
  dialog.className = "nw-dialog"
  dialog.innerHTML = `
    <form method="dialog" class="nw-dialog__body">
      <div class="nw-stack nw-dialog__text">
        <p class="nw-dialog__title"></p>
        <p class="nw-dialog__desc"></p>
      </div>
      <div class="nw-dialog__actions">
        <button value="cancel" class="btn nw-btn-outline"${destructive ? " autofocus" : ""}>Cancel</button>
        <button value="confirm" class="btn ${destructive ? "nw-btn-danger-solid" : "btn--reversed"}"${destructive ? "" : " autofocus"}></button>
      </div>
    </form>`
  dialog.querySelector(".nw-dialog__title").textContent = title
  dialog.querySelector(".nw-dialog__desc").textContent = description
  dialog.querySelector(".nw-dialog__desc").hidden = !description
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

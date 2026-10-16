import { Controller } from "@hotwired/stimulus"

// Novawerk Chat: a button that opens a <dialog> next to it (the sign-in link dialog).
export default class extends Controller {
  static targets = [ "dialog" ]

  open() {
    this.dialogTarget.showModal()
  }

  close() {
    this.dialogTarget.close()
  }

  closeOnBackdrop({ target }) {
    if (target === this.dialogTarget) this.close()
  }
}

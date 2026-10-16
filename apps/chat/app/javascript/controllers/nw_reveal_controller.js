import { Controller } from "@hotwired/stimulus"

// Novawerk Chat: show or hide a secret field (Edit bot · Bot key); the eye icon follows.
export default class extends Controller {
  static targets = [ "field", "button", "show", "hide" ]

  toggle() {
    const reveal = this.fieldTarget.type === "password"
    this.fieldTarget.type = reveal ? "text" : "password"

    if (this.hasShowTarget) this.showTarget.toggleAttribute("hidden", reveal)
    if (this.hasHideTarget) this.hideTarget.toggleAttribute("hidden", !reveal)
    if (this.hasButtonTarget) this.buttonTarget.title = reveal ? "Hide key" : "Show key"
  }
}

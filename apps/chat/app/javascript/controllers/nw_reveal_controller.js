import { Controller } from "@hotwired/stimulus"

// Novawerk Chat: show or hide a secret field (Edit bot · Bot key).
export default class extends Controller {
  static targets = [ "field" ]

  toggle() {
    this.fieldTarget.type = this.fieldTarget.type === "password" ? "text" : "password"
  }
}

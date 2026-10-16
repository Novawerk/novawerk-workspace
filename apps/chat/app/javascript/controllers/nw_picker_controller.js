import { Controller } from "@hotwired/stimulus"

// Novawerk Chat: the closed-room member picker's "Select all" and "N of M picked".
export default class extends Controller {
  static targets = [ "count" ]

  selectAll() {
    this.#boxes.filter(box => box.offsetParent !== null).forEach(box => { box.checked = true })
    this.count()
  }

  count() {
    if (this.hasCountTarget) this.countTarget.textContent = this.element.querySelectorAll("input.nw-check:checked").length
  }

  get #boxes() {
    return [ ...this.element.querySelectorAll("input.nw-check:not([disabled])") ]
  }
}

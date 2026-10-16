import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static classes = [ "toggle" ]

  toggle() {
    this.element.classList.toggle(this.toggleClass)
  }

  // Novawerk Chat: the phone sidebar sheet also closes from its dimmed backdrop and Esc.
  close() {
    this.element.classList.remove(this.toggleClass)
  }

  closeOnClickOutside({ target }) {
    if (this.element.classList.contains(this.toggleClass) && !this.element.contains(target)) this.close()
  }
}

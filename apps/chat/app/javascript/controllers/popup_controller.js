import { Controller } from "@hotwired/stimulus"

const BOTTOM_THRESHOLD = 90

export default class extends Controller {
  static targets = [ "menu" ]
  static classes = [ "orientationTop" ]

  close() {
    this.element.open = false
    // Novawerk Chat: focus left inside would keep a message's hover toolbar showing.
    if (this.element.contains(document.activeElement)) document.activeElement.blur()
  }

  toggle() {
    this.#orient()
  }

  // Novawerk Chat: a click on the details element itself is its phone backdrop (::before), so it closes too.
  closeOnClickOutside({ target }) {
    if (!this.element.contains(target) || target === this.element) this.close()
  }

  #orient() {
    // Novawerk Chat: menus without an orientation class (bell, emoji, row menus) just skip it.
    if (this.hasOrientationTopClass) this.element.classList.toggle(this.orientationTopClass, this.#distanceToBottom < BOTTOM_THRESHOLD)
    this.menuTarget.style.setProperty("--max-width", this.#maxWidth + "px")
  }

  get #distanceToBottom() {
    return window.innerHeight - this.#boundingClientRect.bottom
  }

  get #maxWidth() {
    return window.innerWidth - this.#boundingClientRect.left
  }

  get #boundingClientRect() {
    return this.menuTarget.getBoundingClientRect()
  }
}

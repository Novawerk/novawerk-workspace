import { Controller } from "@hotwired/stimulus"

// Novawerk Chat: on touch screens, holding a message for half a second opens its actions menu,
// which phones show as a sheet from the bottom.
const HOLD_MS = 450
const MOVE_TOLERANCE = 10

export default class extends Controller {
  start(event) {
    if (event.touches?.length !== 1 || event.target.closest("a, button, summary, input, [contenteditable]")) return

    const { clientX, clientY } = event.touches[0]
    this.origin = { x: clientX, y: clientY }
    this.timer = setTimeout(() => this.#open(event.target), HOLD_MS)
  }

  move(event) {
    if (!this.timer || !this.origin) return
    const { clientX, clientY } = event.touches[0]
    if (Math.abs(clientX - this.origin.x) > MOVE_TOLERANCE || Math.abs(clientY - this.origin.y) > MOVE_TOLERANCE) this.cancel()
  }

  cancel() {
    clearTimeout(this.timer)
    this.timer = null
  }

  #open(target) {
    this.timer = null
    const message = target.closest(".message")
    const details = message?.querySelector(".nw-toolbar__more")
    if (!details) return

    navigator.vibrate?.(10)
    details.open = true
  }
}

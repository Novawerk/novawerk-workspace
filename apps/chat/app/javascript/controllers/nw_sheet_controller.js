import { Controller } from "@hotwired/stimulus"

// Novawerk Chat: a bottom sheet (the phone message menu) closes when swiped down or on Esc.
const SWIPE_CLOSE = 60

export default class extends Controller {
  start(event) {
    this.startY = event.touches[0].clientY
  }

  end(event) {
    if (this.startY === undefined) return
    if (event.changedTouches[0].clientY - this.startY > SWIPE_CLOSE) this.close()
    this.startY = undefined
  }

  close() {
    this.element.closest("details")?.removeAttribute("open")
  }
}

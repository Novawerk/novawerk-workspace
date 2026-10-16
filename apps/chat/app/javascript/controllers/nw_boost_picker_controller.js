import { Controller } from "@hotwired/stimulus"

// Novawerk Chat: the reaction picker (RoomStates · I). Filters emoji by name and closes on Esc or
// a click outside by reloading the message's boosts row.
export default class extends Controller {
  static targets = [ "item", "none", "search", "close" ]

  // Opens upward when there's no room above the composer (the last messages in a room).
  connect() {
    const limit = document.querySelector(".composer")?.getBoundingClientRect().top ?? window.innerHeight
    if (this.element.getBoundingClientRect().bottom > limit - 8) this.element.classList.add("nw-boost-picker--up")
  }

  filter() {
    const query = this.searchTarget.value.trim().toLowerCase()
    let shown = 0
    this.itemTargets.forEach(item => {
      item.hidden = query && !item.dataset.words.includes(query)
      if (!item.hidden) shown++
    })
    this.noneTarget.hidden = shown > 0
  }

  close() {
    this.closeTarget.click()
  }

  closeOnClickOutside({ target }) {
    if (!this.element.contains(target) && !target.closest(".message__boost-btn, .boost__action")) this.close()
  }
}

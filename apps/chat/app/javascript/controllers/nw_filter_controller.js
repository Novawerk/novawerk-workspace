import { Controller } from "@hotwired/stimulus"

// Novawerk Chat: filter a list as you type (Account settings, Members, emoji). Optional targets: a
// count that reads "1 of 4" while filtering, and a line shown when nothing matches.
export default class extends Controller {
  static targets = [ "item", "count", "none", "query" ]
  static values = { noun: String }

  filter({ target: { value } }) {
    const query = value.trim().toLowerCase()
    let shown = 0
    this.itemTargets.forEach(item => {
      item.hidden = query && !item.dataset.nwFilterText.includes(query)
      if (!item.hidden) shown++
    })

    const total = this.itemTargets.length
    if (this.hasCountTarget) this.countTarget.textContent = query ? `${shown} of ${total}` : `${total} ${this.nounValue || ""}`.trim()
    if (this.hasNoneTarget) this.noneTarget.hidden = shown > 0
    if (this.hasQueryTarget) this.queryTarget.textContent = value.trim()
  }
}

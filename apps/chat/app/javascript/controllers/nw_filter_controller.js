import { Controller } from "@hotwired/stimulus"

// Novawerk Chat: filter a list as you type (Account settings · Search members).
export default class extends Controller {
  static targets = [ "item" ]

  filter({ target: { value } }) {
    const query = value.trim().toLowerCase()
    this.itemTargets.forEach(item => { item.hidden = query && !item.dataset.nwFilterText.includes(query) })
  }
}

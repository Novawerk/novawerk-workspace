import { Controller } from "@hotwired/stimulus"

// Novawerk Chat: the toolbar's "Add reaction" button opens the message menu (quick reactions first).
export default class extends Controller {
  static targets = [ "details" ]

  open(event) {
    event.preventDefault()
    event.stopPropagation()
    this.detailsTarget.open = true
  }
}

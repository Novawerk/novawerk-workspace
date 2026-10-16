import { Controller } from "@hotwired/stimulus"

// Novawerk Chat: "This device · Notifications On/Off/Blocked" on My profile.
export default class extends Controller {
  static targets = [ "badge" ]

  connect() {
    const permission = "Notification" in window ? Notification.permission : "denied"
    const [ text, tone ] = { granted: [ "On", "soft" ], denied: [ "Blocked", "danger" ] }[permission] || [ "Off", "plain" ]
    this.badgeTarget.textContent = text
    this.badgeTarget.className = `nw-badge${tone === "plain" ? "" : ` nw-badge--${tone}`}`
  }
}

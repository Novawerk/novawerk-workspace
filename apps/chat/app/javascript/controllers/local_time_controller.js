import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = [ "time", "date", "datetime" ]

  initialize() {
    this.timeFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: "short" })
    this.dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "long" })
    this.dateTimeFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: "short", dateStyle: "short" })
  }

  timeTargetConnected(target) {
    this.#formatTime(this.timeFormatter, target)
  }

  // Novawerk Chat: day dividers say "Today" and "Yesterday", as in the design.
  dateTargetConnected(target) {
    this.#formatTime(this.dateFormatter, target)

    const day = new Date(target.getAttribute("datetime")).toDateString()
    const today = new Date()
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
    if (day === today.toDateString()) target.textContent = "Today"
    else if (day === yesterday.toDateString()) target.textContent = "Yesterday"
  }

  datetimeTargetConnected(target) {
    this.#formatTime(this.dateTimeFormatter, target)
  }

  #formatTime(formatter, target) {
    const dt = new Date(target.getAttribute("datetime"))
    target.textContent = formatter.format(dt)
    target.title = this.dateTimeFormatter.format(dt)
  }
}

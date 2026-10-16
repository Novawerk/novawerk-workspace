import { Controller } from "@hotwired/stimulus"

// Novawerk Chat: Open and Closed are separate forms; switching keeps the name typed so far. The link
// gets the name before Turbo follows it.
export default class extends Controller {
  switch(event) {
    const name = this.element.closest("form")?.querySelector("#room_name")?.value?.trim()
    if (!name) return

    const url = new URL(event.currentTarget.getAttribute("href"), location.href)
    url.searchParams.set("name", name)
    event.currentTarget.setAttribute("href", url.pathname + url.search)
  }
}

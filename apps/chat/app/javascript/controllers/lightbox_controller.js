import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = [ "image", "dialog", "zoomedImage", "download", "share", "original", "filename", "author", "avatar", "details" ]

  open(event) {
    event.preventDefault()

    this.dialogTarget.showModal()
    this.#set(event.target.closest("a"))
  }

  reset() {
    this.zoomedImageTarget.src = ""
    this.downloadTarget.href = ""
    this.shareTarget.dataset.webShareFilesValue = "";
  }

  #set(target) {
    this.zoomedImageTarget.src = target.href
    if (this.hasOriginalTarget) this.originalTarget.href = target.href
    if (this.hasFilenameTarget) this.filenameTarget.textContent = target.dataset.lightboxFilename || ""
    if (this.hasAuthorTarget) this.authorTarget.textContent = target.dataset.lightboxAuthor || ""
    if (this.hasDetailsTarget) this.detailsTarget.textContent = this.#details(target.dataset)
    if (this.hasAvatarTarget) { this.avatarTarget.src = target.dataset.lightboxAvatar || ""; this.avatarTarget.hidden = !target.dataset.lightboxAvatar }
    this.downloadTarget.href = target.dataset.lightboxUrlValue;
    this.shareTarget.dataset.webShareFilesValue = target.dataset.lightboxUrlValue;
  }

  #details({ lightboxRoom, lightboxTime, lightboxSize }) {
    // "Mira Kaya in #design · Yesterday 17:42 · 1.2 MB"; in a direct message the room is left out.
    return [ lightboxRoom || "", lightboxTime && this.#when(new Date(lightboxTime)), lightboxSize ].filter(part => part !== undefined).join(" · ").replace(/^ /, "")
  }

  #when(date) {
    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86400000)
    if (days === 0) return `Today ${time}`
    if (days === 1) return `Yesterday ${time}`
    return `${date.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`
  }
}

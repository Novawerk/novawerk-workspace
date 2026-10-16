import { Controller } from "@hotwired/stimulus"
import FileUploader from "models/file_uploader"
import { onNextEventLoopTick, nextFrame } from "helpers/timing_helpers"
import { escapeHTML } from "helpers/string_helpers"

export default class extends Controller {
  static classes = ["toolbar"]
  static targets = [ "clientid", "fields", "fileList", "text", "replyBar", "replyName" ]
  static values = { roomId: Number }
  static outlets = [ "messages" ]

  #files = []

  connect() {
    this.#restoreDraft()
    document.addEventListener("selectionchange", this.#markBlockSelection)

    if (!this.#usingTouchDevice) {
      onNextEventLoopTick(() => this.textTarget.focus())
    }
  }

  disconnect() {
    document.removeEventListener("selectionchange", this.#markBlockSelection)
  }

  // Novawerk Chat: in a quote, list or code block Enter adds a line, so the hint says ⌘Enter sends.
  #markBlockSelection = () => {
    const node = window.getSelection()?.anchorNode
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement
    const inBlock = !!(element && this.textTarget.contains(element) && element.closest("blockquote, pre, code, li"))
    this.element.classList.toggle("composer--in-block", inBlock)
  }

  saveDraft() {
    if (this.textTarget.isBlank) {
      localStorage.removeItem(this.#draftKey)
    } else {
      localStorage.setItem(this.#draftKey, this.textTarget.value)
    }
  }

  submit(event) {
    event.preventDefault()

    if (!this.fieldsTarget.disabled) {
      this.#submitFiles()
      this.#submitMessage()
      // Novawerk Chat: the formatting toolbar stays as the writer left it; a sent reply ends the reply.
      this.#hideReplyBar()
      this.textTarget.focus()
    }
  }

  submitEnd(event) {
    if (!event.detail.success) {
      this.messagesOutlet.failPendingMessage(this.clientidTarget.value)
    }
  }

  toggleToolbar(event) {
    const on = this.element.classList.toggle(this.toolbarClass)
    event?.currentTarget?.setAttribute?.("aria-pressed", on)
    this.textTarget.focus()
  }

  collapseToolbar() {
    this.element.classList.remove(this.toolbarClass)
  }

  replaceMessageContent(content, { replyingTo } = {}) {
    this.textTarget.value = content
    this.textTarget.focus()
    this.textTarget.selection.placeCursorAtTheEnd()

    if (replyingTo && this.hasReplyBarTarget) {
      this.replyNameTarget.textContent = replyingTo
      this.replyBarTarget.hidden = false
    }
  }

  // Novawerk Chat: "Replying to Lena ×" above the composer; × takes the quote out again.
  cancelReply() {
    this.textTarget.value = ""
    this.#hideReplyBar()
    this.saveDraft()
    this.textTarget.focus()
  }

  #hideReplyBar() {
    if (this.hasReplyBarTarget) this.replyBarTarget.hidden = true
  }

  submitByKeyboard(event) {
    if (event.key != "Enter" || this.textTarget.hasOpenPrompt) return

    const toolbarVisible = this.element.classList.contains(this.toolbarClass)
    const metaEnter = event.metaKey || event.ctrlKey
    const plainEnter = !event.shiftKey && !event.isComposing

    if (!this.#usingTouchDevice && (metaEnter || (plainEnter && !toolbarVisible))) {
      event.stopPropagation()
      this.submit(event)
    }
  }

  filePicked(event) {
    for (const file of event.target.files) {
      this.#files.push(file)
    }
    event.target.value = null
    this.#updateFileList()
  }

  fileUnpicked(event) {
    this.#files.splice(event.params.index, 1)
    this.#updateFileList()
  }

  pasteFiles(event) {
    if (event.clipboardData.files.length > 0) {
      event.preventDefault()
    }

    for (const file of event.clipboardData.files) {
      this.#files.push(file)
    }

    this.#updateFileList()
  }

  dropFiles({ detail: { files } }) {
    for (const file of files) {
      this.#files.push(file)
    }

    this.#updateFileList()
  }

  preventAttachment(event) {
    event.preventDefault()
  }

  online() {
    this.fieldsTarget.disabled = false
  }

  offline() {
    this.fieldsTarget.disabled = true
  }

  #restoreDraft() {
    const draft = localStorage.getItem(this.#draftKey)

    if (draft) {
      this.textTarget.value = draft
      this.textTarget.selection.placeCursorAtTheEnd()
    }
  }

  get #draftKey() {
    return `composer-draft-${this.roomIdValue}`
  }

  get #usingTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
  }

  async #submitMessage() {
    if (this.#validInput()) {
      const clientMessageId = this.#generateClientId()

      await this.messagesOutlet.insertPendingMessage(clientMessageId, this.textTarget)
      await nextFrame()

      this.clientidTarget.value = clientMessageId
      this.element.requestSubmit()
      this.#reset()
    }
  }

  #validInput() {
    return !this.textTarget.isBlank
  }

  async #submitFiles() {
    const files = this.#files

    this.#files = []
    this.#updateFileList()

    for (const file of files) {
      const clientMessageId = this.#generateClientId()
      const uploader = new FileUploader(file, this.element.action, clientMessageId, this.#uploadProgress.bind(this))

      const body = this.#pendingUploadProgress(file.name)
      await this.messagesOutlet.insertPendingMessage(clientMessageId, body)

      const resp = await uploader.upload()

      Turbo.renderStreamMessage(resp)
    }
  }

  #uploadProgress(percent, clientMessageId, file) {
    const body = this.#pendingUploadProgress(file.name, percent)
    this.messagesOutlet.updatePendingMessage(clientMessageId, body)
  }

  #generateClientId() {
    return Math.random().toString(36).slice(2)
  }

  #reset() {
    this.textTarget.value = ""
    localStorage.removeItem(this.#draftKey)
  }

  #updateFileList() {
    this.#files.sort((a, b) => a.name.localeCompare(b.name))

    // Novawerk Chat: a chip per file (icon or thumbnail, name, size, ×), as on board RoomStates · G.
    const fileNodes = this.#files.map((file, index) => {
      const node = document.createElement("div")
      node.className = "nw-file-chip"

      const icon = file.type.match(/^image\/.*/)
        ? `<img role="presentation" class="nw-file-chip__thumb" src="${URL.createObjectURL(file)}">`
        : `<span class="nw-file-chip__icon" aria-hidden="true"></span>`
      node.innerHTML = `${icon}
        <span class="nw-file-chip__text"><span class="nw-file-chip__name">${escapeHTML(file.name)}</span><span class="nw-file-chip__size">${this.#humanSize(file.size)}</span></span>
        <button type="button" class="nw-file-chip__remove" data-action="composer#fileUnpicked" data-composer-index-param="${index}" title="Remove ${escapeHTML(file.name)}" aria-label="Remove ${escapeHTML(file.name)}"></button>`

      return node
    })

    this.fileListTarget.replaceChildren(...fileNodes)
  }

  #humanSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  #pendingUploadProgress(filename, percent=0) {
    return `
      <div class="message__pending-upload flex align-center gap" style="--percentage: ${percent}%">
        <div class="composer__file-thumbnail composer__file-thumbnail--common colorize--black borderless flex-item-no-shrink"></div>
        <div>${escapeHTML(filename)} - <span>${percent}%</span></div>
      </div>
    `
  }
}

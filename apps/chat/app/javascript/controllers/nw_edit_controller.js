import { Controller } from "@hotwired/stimulus"

// Novawerk Chat: editing a message puts the caret at the end of the text, and Enter saves before the
// editor can turn it into a new line (Shift+Enter still adds one; an open @ prompt keeps Enter).
export default class extends Controller {
  static targets = [ "editor" ]

  connect() {
    this.#focusAtEnd()
  }

  submitOnEnter(event) {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing || this.editorTarget.hasOpenPrompt) return

    event.preventDefault()
    event.stopPropagation()
    this.element.requestSubmit()
  }

  #focusAtEnd(attempt = 0) {
    const editor = this.editorTarget
    if (!editor.editor) {
      if (attempt < 40) setTimeout(() => this.#focusAtEnd(attempt + 1), 50)
      return
    }

    editor.focus()
    requestAnimationFrame(() => editor.selection?.placeCursorAtTheEnd())
  }
}

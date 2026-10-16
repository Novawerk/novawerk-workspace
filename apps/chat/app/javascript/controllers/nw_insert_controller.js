import { Controller } from "@hotwired/stimulus"

// Novawerk Chat: the composer's @ and emoji buttons put their text where the cursor is.
export default class extends Controller {
  insert({ params: { text } }) {
    const editor = this.element.closest("form")?.querySelector("[contenteditable=true]")
    if (!editor) return

    editor.focus()
    document.execCommand("insertText", false, text)
  }
}

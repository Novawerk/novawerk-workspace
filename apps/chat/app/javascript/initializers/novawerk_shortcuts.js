// Novawerk Chat: ⌘K (Ctrl+K elsewhere) goes to search, as the sidebar's search field says. On the
// search page it focuses the field. Inside the editor ⌘K stays the editor's "Link" shortcut.
import { Turbo } from "@hotwired/turbo-rails"

document.addEventListener("keydown", event => {
  if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return
  if (event.target.closest?.("lexxy-editor, [contenteditable]")) return

  event.preventDefault()
  const field = document.querySelector(".searches__input")
  if (field) {
    field.focus()
    field.select()
  } else {
    Turbo.visit("/searches")
  }
})

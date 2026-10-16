import { Controller } from "@hotwired/stimulus"
import { Turbo } from "@hotwired/turbo-rails"

// Novawerk Chat: marks the search words in each result (Search board), and a click anywhere on a
// result opens the message, not only its time and room badge.
export default class extends Controller {
  static values = { query: String }

  connect() {
    const escape = word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const words = this.queryValue.split(/[\s-]+/).filter(Boolean)
    if (words.length === 0) return

    // The whole phrase first ("sign-in" also finds "sign in"), then any word of three letters or more.
    const alternatives = [ words.map(escape).join("[\\s-]+"), ...words.filter(word => word.length > 2).map(escape) ]
    const pattern = new RegExp(`(${alternatives.join("|")})`, "gi")
    this.element.querySelectorAll(".message__body-content").forEach(body => this.#mark(body, pattern))
  }

  open(event) {
    if (event.target.closest("a, button, summary, input, details, .message__actions")) return
    if (window.getSelection()?.toString()) return

    const link = event.target.closest(".message")?.querySelector(".message__permalink")
    if (link) Turbo.visit(link.href)
  }

  #mark(root, pattern) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodes = []
    while (walker.nextNode()) {
      if (pattern.test(walker.currentNode.nodeValue) && !walker.currentNode.parentElement.closest("mark")) nodes.push(walker.currentNode)
      pattern.lastIndex = 0
    }

    nodes.forEach(node => {
      const fragment = document.createDocumentFragment()
      node.nodeValue.split(pattern).forEach((part, index) => {
        if (index % 2 === 1) {
          const mark = document.createElement("mark")
          mark.textContent = part
          fragment.append(mark)
        } else if (part) {
          fragment.append(part)
        }
      })
      node.replaceWith(fragment)
    })
  }
}

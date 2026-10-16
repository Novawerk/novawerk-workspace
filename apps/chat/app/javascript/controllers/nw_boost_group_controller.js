import { Controller } from "@hotwired/stimulus"

// Novawerk Chat: reactions as in the design. Boosts arrive one per person (and live, through Turbo
// Streams), so they're grouped here: one pill per emoji with a count, highlighted when one is mine.
// Clicking an emoji pill takes my reaction back, or adds the same emoji. Text boosts stay as they are.
const EMOJI_ONLY = /^(\p{Extended_Pictographic}|\p{Emoji_Component}|️|‍)+$/u

export default class extends Controller {
  connect() {
    this.observer = new MutationObserver(() => this.group())
    this.observer.observe(this.element, { childList: true })
    this.element.addEventListener("click", this.toggle, true)
    this.group()
  }

  disconnect() {
    this.observer?.disconnect()
    this.element.removeEventListener("click", this.toggle, true)
  }

  group() {
    const groups = new Map()
    this.element.querySelectorAll(":scope > .boost-item").forEach(item => {
      const content = this.#contentOf(item)
      if (!EMOJI_ONLY.test(content)) return
      if (!groups.has(content)) groups.set(content, [])
      groups.get(content).push(item)
    })

    groups.forEach((items, content) => {
      const [ head, ...rest ] = items
      head.classList.add("nw-boost--emoji")
      head.classList.remove("nw-boost--folded")
      rest.forEach(item => item.classList.add("nw-boost--folded"))

      let count = head.querySelector(".nw-boost__count")
      if (!count) {
        count = document.createElement("span")
        count.className = "nw-boost__count"
        head.append(count)
      }
      count.textContent = items.length
      head.classList.toggle("nw-boost--mine", items.some(item => this.#isMine(item)))
      head.dataset.nwEmoji = content
    })
  }

  toggle = (event) => {
    const head = event.target.closest(".nw-boost--emoji")
    if (!head || event.target.closest("form")) return

    event.preventDefault()
    event.stopPropagation()

    const content = head.dataset.nwEmoji
    const mine = [ ...this.element.querySelectorAll(":scope > .boost-item") ]
      .find(item => this.#contentOf(item) === content && this.#isMine(item))

    if (mine) {
      mine.querySelector("form")?.requestSubmit()
    } else {
      const message = this.element.closest(".message")
      message?.querySelector(`.quick-boosts button[data-emoji="${CSS.escape(content)}"]`)?.closest("form")?.requestSubmit()
    }
  }

  #contentOf(item) {
    return item.querySelector("[data-boost-delete-target=content]")?.textContent.trim() || ""
  }

  #isMine(item) {
    return String(window.Current?.user?.id) === item.dataset.boostDeleteBoosterIdValue
  }
}

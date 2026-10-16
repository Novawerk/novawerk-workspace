// Novawerk Chat: form fields show a red message under themselves instead of the browser's bubble.
document.addEventListener("invalid", event => {
  const field = event.target
  const wrapper = field.closest?.(".nw-field")
  if (!wrapper) return

  event.preventDefault()
  field.classList.add("is-invalid")

  let message = wrapper.querySelector(".nw-field__error")
  if (!message) {
    message = document.createElement("span")
    message.className = "nw-field__error"
    message.setAttribute("role", "alert")
    wrapper.append(message)
  }
  message.textContent = field.validationMessage

  if (!wrapper.closest("form")?.querySelector(".is-invalid:focus")) field.focus()
}, true)

document.addEventListener("input", ({ target }) => {
  if (!target.classList?.contains("is-invalid") || !target.checkValidity()) return
  target.classList.remove("is-invalid")
  target.closest(".nw-field")?.querySelector(".nw-field__error")?.remove()
})

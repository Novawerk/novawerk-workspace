// Novawerk Chat: a toast for things that happen in place (copied, message deleted), styled like the
// layout's flash toast. A form with data-nw-toast shows its text once it submits successfully.
const CHECK = `<svg aria-hidden="true" class="lucide" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`

export function toast(text) {
  document.querySelectorAll(".nw-toast--live").forEach(old => old.remove())

  const element = document.createElement("div")
  element.className = "flash nw-toast nw-toast--live"
  element.setAttribute("role", "status")
  element.innerHTML = `${CHECK}<span></span>`
  element.querySelector("span").textContent = text
  element.addEventListener("animationend", () => element.remove())
  document.body.append(element)
}

window.nwToast = toast

document.addEventListener("turbo:submit-end", ({ target, detail }) => {
  const text = target.dataset?.nwToast || detail?.formSubmission?.submitter?.dataset?.nwToast
  if (text && detail.success) toast(text)
})

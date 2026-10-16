// Novawerk Chat: mark the open room in the sidebar, like Slack's highlighted channel.
// The sidebar is its own turbo frame, so re-mark after the page and the frame load.
function markCurrentRoom() {
  const roomId = window.Current?.room?.id

  document.querySelectorAll("#sidebar [data-room-id]").forEach(link => {
    if (roomId && parseInt(link.dataset.roomId) === roomId) {
      link.setAttribute("aria-current", "page")
    } else {
      link.removeAttribute("aria-current")
    }
  })
}

document.addEventListener("turbo:load", markCurrentRoom)
document.addEventListener("turbo:frame-load", markCurrentRoom)

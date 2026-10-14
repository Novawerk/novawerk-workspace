// Loaded lazily: the Markdown renderer pulls in Streamdown and its plugins.

import { MessageResponse } from "@nw/ui/ai-elements/message"

export default function MarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <MessageResponse className="text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
      {markdown}
    </MessageResponse>
  )
}

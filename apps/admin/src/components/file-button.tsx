import * as React from "react"
import { UploadIcon } from "lucide-react"

import { Button } from "@nw/ui/core/components/ui/button"

/** A button that opens the file picker. Picks reset, so choosing the same file again works. */
export function FileButton({
  accept,
  multiple,
  disabled,
  onFiles,
  children,
  variant = "outline",
  size = "sm",
  title,
}: {
  accept: string
  multiple?: boolean
  disabled?: boolean
  onFiles: (files: File[]) => void
  children: React.ReactNode
  variant?: "outline" | "secondary" | "ghost"
  size?: "sm" | "default"
  title?: string
}) {
  const input = React.useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          event.target.value = ""
          if (files.length) onFiles(files)
        }}
      />
      <Button type="button" variant={variant} size={size} disabled={disabled} title={title} onClick={() => input.current?.click()}>
        <UploadIcon /> {children}
      </Button>
    </>
  )
}

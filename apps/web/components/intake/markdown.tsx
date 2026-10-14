"use client";

import { memo } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";

// The agent's replies: GitHub-flavoured Markdown, no raw HTML (react-markdown drops it), no
// images (no tracking pixels in a chat), links open in a new tab. Styles: `.chat-md` in globals.css.

const remarkPlugins: Options["remarkPlugins"] = [remarkGfm];
const disallowedElements = ["img"];

const components: Components = {
  a: ({ href, title, children }) => (
    <a href={href} title={title} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ),
  table: ({ children }) => (
    <div className="chat-md-table">
      <table>{children}</table>
    </div>
  ),
};

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="chat-md">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        components={components}
        disallowedElements={disallowedElements}
        unwrapDisallowed
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

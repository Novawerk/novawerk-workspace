// Light / dark / system theme. The shadcn `sonner` Toaster reads the theme from next-themes,
// so apps use this re-export (one copy of the context) instead of depending on next-themes.
// next-themes is framework-agnostic; it works in a Vite SPA as well as in Next.js.
export { ThemeProvider, useTheme } from "next-themes"

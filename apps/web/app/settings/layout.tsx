import type { Metadata } from "next";

import { container } from "@/components/ui";

import { SettingsNav } from "./settings-nav";

export const metadata: Metadata = {
  title: { default: "Settings", template: "%s · Settings · Novawerk" },
  robots: { index: false },
};

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className={container}>
      <SettingsNav />
      <div className="grid items-start gap-8 pt-6 pb-16 md:grid-cols-[200px_minmax(0,1fr)]">
        <SettingsNav side />
        <div className="grid min-w-0 gap-6">{children}</div>
      </div>
    </div>
  );
}

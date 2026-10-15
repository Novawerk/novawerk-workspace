import type { Metadata } from "next";

import { TokenSettings } from "./token-settings";

export const metadata: Metadata = { title: "Tokens & agents" };

export default function TokensPage() {
  return <TokenSettings />;
}

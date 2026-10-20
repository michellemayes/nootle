import type { Metadata } from "next";
import { SharedNote } from "./SharedNote";
import { THEME_SCRIPT } from "./theme";

export const metadata: Metadata = {
  title: "Shared meeting notes - Nootle",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <SharedNote id={id} />
    </>
  );
}

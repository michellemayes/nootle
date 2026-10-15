import { AppleLogo } from "@/components/AppleLogo";
import { RELEASES_URL } from "@/components/site-config";

export function DownloadButton() {
  return (
    <a
      href={RELEASES_URL}
      className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] active:scale-[0.96] transition-[background-color,box-shadow,transform,scale] duration-200 hover:shadow-[0_0_30px_-5px_var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
    >
      <AppleLogo className="w-4 h-4 mr-2" />
      Download for Mac
    </a>
  );
}

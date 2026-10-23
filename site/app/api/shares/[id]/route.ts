import { changeRoutes } from "@/lib/sealed-routes";
import { shares } from "@/lib/shares";

/** The encrypted note, for the share page to decrypt in the browser. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const share = await shares.read((await params).id);
  if (!share) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(
    { iv: share.iv, ciphertext: share.ciphertext },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** PUT replaces the note, keeping its link; DELETE makes the link stop working. */
export const { PUT, DELETE } = changeRoutes(shares);

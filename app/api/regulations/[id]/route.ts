import { NextResponse } from "next/server";
import { getRegulationById } from "@/lib/search";

const SITE = process.env.THAISEC_SITE_URL ?? "https://scg-thaisec.vercel.app";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const reg = await getRegulationById(id);
  if (!reg) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ...reg, detailUrl: `${SITE}/regulations/${reg.id}` });
}

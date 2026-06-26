import { NextResponse } from "next/server";
import { listRegulationTypes } from "@/lib/search";

export async function GET() {
  const types = await listRegulationTypes();
  return NextResponse.json({ total: types.length, types });
}

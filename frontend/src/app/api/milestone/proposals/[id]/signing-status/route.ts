import { NextRequest, NextResponse } from "next/server";
import { getMockSigningStatus } from "@/lib/milestoneSigningStore";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const status = getMockSigningStatus(id);

  if (!status) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  return NextResponse.json(status);
}

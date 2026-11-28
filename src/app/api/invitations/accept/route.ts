import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Open your invitation link and continue with the invited Google account.",
    },
    { status: 410 },
  );
}

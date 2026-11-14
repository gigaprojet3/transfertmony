import { NextResponse } from "next/server";
import { publicUser, requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

export async function GET(request) {
  try {
    const user = await requireUser(request);
    return NextResponse.json({ user: publicUser(user) });
  } catch (err) {
    return errorResponse(err);
  }
}

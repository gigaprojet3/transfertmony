import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Next.js 16 : « proxy » remplace l'ancien middleware. Protège les pages privées.
export async function proxy(request) {
  const userId = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};

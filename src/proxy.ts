import { NextResponse, type NextRequest } from "next/server";

// Checagem otimista: manda ao login quem não tem cookie de sessão. A autenticação
// efetiva acontece no servidor, em cada página, action e route handler.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("zf_session")) {
    const url = new URL("/login", request.url);
    if (request.nextUrl.pathname !== "/") url.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|ico)$).*)"],
};

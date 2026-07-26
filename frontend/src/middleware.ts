import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales } from "./i18n/locales";

const PROTECTED_ROUTES = [
  "/dashboard",
  "/invest",
  "/contractor",
  "/admin",
  "/governance",
  "/settings",
  "/history",
];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const intlMiddleware = createMiddleware({
    locales,
    defaultLocale: "en",
    localePrefix: "always",
  });

  const intlResponse = intlMiddleware(request);
  if (intlResponse) {
    return intlResponse;
  }

  if (!isProtectedRoute(pathname)) return NextResponse.next();

  const sessionToken = request.cookies.get("session")?.value;
  if (!sessionToken) {
    const loginUrl = new URL("/en", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|og-image.png).*)",
  ],
};

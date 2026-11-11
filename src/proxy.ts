import { clerkMiddleware } from "@clerk/nextjs/server";

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/sign-in" ||
    pathname.startsWith("/sign-in/") ||
    pathname === "/sign-up" ||
    pathname.startsWith("/sign-up/") ||
    pathname === "/api/webhooks/clerk"
  );
}

export default clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;

  if (isPublicPath(pathname)) {
    return;
  }

  // APIs return 401 instead of redirecting an API client to an HTML sign-in page.
  if (pathname.startsWith("/api/")) {
    const { userId } = await auth();
    if (!userId) {
      return Response.json(
        { success: false, error: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }
    return;
  }

  // All application pages require an authenticated Clerk session.
  await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

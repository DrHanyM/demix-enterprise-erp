export function createAdminAuthenticator({ clerkClient, resourceUrl, adminUserId, verifyToken }) {
  if (!clerkClient || typeof clerkClient.authenticateRequest !== "function") {
    throw new TypeError("clerkClient.authenticateRequest is required");
  }
  if (typeof resourceUrl !== "string" || !resourceUrl) {
    throw new TypeError("resourceUrl is required");
  }
  if (typeof adminUserId !== "string" || !adminUserId.startsWith("user_")) {
    throw new TypeError("A single Clerk admin user ID is required");
  }
  if (typeof verifyToken !== "function") throw new TypeError("verifyToken is required");

  return async function authenticateAdminRequest(req) {
    const authorization = req.headers.authorization || "";
    if (!authorization.startsWith("Bearer ") || authorization.length <= 7) {
      return { status: 401 };
    }

    try {
      const clerkRequest = new Request(resourceUrl, {
        method: "GET",
        headers: { authorization },
      });
      const requestState = await clerkClient.authenticateRequest(clerkRequest, {
        acceptsToken: "oauth_token",
        audience: resourceUrl,
      });
      if (!requestState.isAuthenticated) return { status: 401 };

      const authInfo = verifyToken(requestState.toAuth(), requestState.token);
      if (authInfo?.extra?.verifiedBy !== "clerk" ||
          typeof authInfo?.extra?.userId !== "string" ||
          !authInfo.extra.userId) {
        return { status: 401 };
      }
      if (authInfo.extra.userId !== adminUserId) return { status: 403 };
      return { status: 200, authInfo };
    } catch {
      return { status: 401 };
    }
  };
}

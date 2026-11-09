const DEFAULT_AUTH_TIMEOUT_MS = 8_000;

function safeErrorDetails(error) {
  return {
    name: typeof error?.name === "string" ? error.name : "Error",
    message: typeof error?.message === "string" ? error.message.slice(0, 240) : "Unknown authentication error",
  };
}

export function createAdminAuthenticator({
  clerkClient,
  resourceUrl,
  adminUserId,
  verifyToken,
  timeoutMs = DEFAULT_AUTH_TIMEOUT_MS,
}) {
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
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new TypeError("timeoutMs must be a positive number");
  }

  return async function authenticateAdminRequest(req) {
    const authorization = req.headers.authorization || "";
    if (!authorization.startsWith("Bearer ") || authorization.length <= 7) {
      return { status: 401 };
    }

    const startedAt = Date.now();
    let timeoutHandle;
    let timedOut = false;

    try {
      // Pass a bounded signal to Clerk and keep an independent deadline so a
      // stalled upstream verification can never hold a Vercel invocation open.
      const clerkRequest = new Request(resourceUrl, {
        method: "GET",
        headers: { authorization },
        signal: AbortSignal.timeout(timeoutMs),
      });

      const requestState = await Promise.race([
        clerkClient.authenticateRequest(clerkRequest, {
          acceptsToken: "oauth_token",
          audience: resourceUrl,
        }),
        new Promise((_, reject) => {
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            reject(new Error("Clerk token verification timed out"));
          }, timeoutMs);
        }),
      ]);

      if (!requestState.isAuthenticated) {
        console.info("[mcp-auth] token rejected", JSON.stringify({
          elapsedMs: Date.now() - startedAt,
          reason: "not_authenticated",
        }));
        return { status: 401 };
      }

      const authInfo = verifyToken(requestState.toAuth(), requestState.token);
      if (authInfo?.extra?.verifiedBy !== "clerk" ||
          typeof authInfo?.extra?.userId !== "string" ||
          !authInfo.extra.userId) {
        console.info("[mcp-auth] token rejected", JSON.stringify({
          elapsedMs: Date.now() - startedAt,
          reason: "missing_verified_clerk_identity",
        }));
        return { status: 401 };
      }

      if (authInfo.extra.userId !== adminUserId) {
        console.warn("[mcp-auth] authenticated non-admin denied", JSON.stringify({
          elapsedMs: Date.now() - startedAt,
        }));
        return { status: 403 };
      }

      console.info("[mcp-auth] administrator authenticated", JSON.stringify({
        elapsedMs: Date.now() - startedAt,
      }));
      return { status: 200, authInfo };
    } catch (error) {
      const details = safeErrorDetails(error);
      console.error("[mcp-auth] verification failed", JSON.stringify({
        elapsedMs: Date.now() - startedAt,
        timedOut,
        ...details,
      }));
      return { status: timedOut || error?.name === "TimeoutError" || error?.name === "AbortError" ? 503 : 401 };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  };
}

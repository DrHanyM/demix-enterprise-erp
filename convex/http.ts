
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const http = httpRouter();

http.route({
  path: "/clerk-user-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Verify the trusted Next.js relay.
    const expectedSecret = process.env.DEMIX_WEBHOOK_SECRET;
    const authorization = request.headers.get("authorization");

    if (!expectedSecret || authorization !== `Bearer ${expectedSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const rawBody = await request.text();

    if (rawBody.length > 64_000) {
      return new Response("Payload too large", { status: 413 });
    }

    let payload: Record<string, unknown>;

    try {
      const parsed: unknown = JSON.parse(rawBody);

      if (typeof parsed !== "object" || parsed === null) {
        return new Response("Invalid payload", { status: 400 });
      }

      payload = parsed as Record<string, unknown>;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (
      typeof payload.eventId !== "string" ||
      typeof payload.eventType !== "string" ||
      typeof payload.clerkUserId !== "string" ||
      typeof payload.invitationId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.emailVerified !== "boolean"
    ) {
      return new Response("Invalid webhook fields", { status: 400 });
    }

    try {
      const result = await ctx.runMutation(
        internal.invitations.acceptInvitationFromClerk,
        {
          eventId: payload.eventId,
          eventType: payload.eventType,
          clerkUserId: payload.clerkUserId,
          invitationId: payload.invitationId as Id<"invitations">,
          email: payload.email,
          emailVerified: payload.emailVerified,
        }
      );

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Clerk webhook processing failed:", error);

      return new Response(
        JSON.stringify({
          success: false,
          error: "WEBHOOK_PROCESSING_FAILED",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

export default http;

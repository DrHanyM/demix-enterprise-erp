
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextRequest, NextResponse } from "next/server";

type ClerkEmailAddress = {
  id?: string;
  email_address?: string;
  verification?: {
    status?: string;
  } | null;
};

type ClerkUserData = {
  id?: string;
  primary_email_address_id?: string | null;
  email_addresses?: ClerkEmailAddress[];
  public_metadata?: Record<string, unknown>;
};

export async function POST(request: NextRequest) {
  // 1. Verify the original Clerk webhook signature.
  let event: {
    type?: string;
    data?: ClerkUserData;
  };

  try {
    event = (await verifyWebhook(request)) as typeof event;
  } catch (error) {
    console.error("Clerk signature verification failed:", error);

    return NextResponse.json(
      { success: false, error: "INVALID_CLERK_SIGNATURE" },
      { status: 400 }
    );
  }

  // 2. Accept only the relevant Clerk events.
  if (
    event.type !== "user.created" &&
    event.type !== "user.updated"
  ) {
    return NextResponse.json({
      success: true,
      ignored: true,
      reason: "UNSUPPORTED_EVENT",
    });
  }

  const data = event.data;

  if (!data?.id) {
    return NextResponse.json(
      { success: false, error: "MISSING_CLERK_USER_ID" },
      { status: 400 }
    );
  }

  // 3. Read invitation ID from Clerk public metadata.
  const metadata = data.public_metadata ?? {};
  const invitationId = metadata.demixInvitationId;

  // Other Clerk users must not be registered in this ERP.
  if (
    typeof invitationId !== "string" ||
    !invitationId.trim()
  ) {
    return NextResponse.json({
      success: true,
      ignored: true,
      reason: "NO_DEMIX_INVITATION",
    });
  }

  // 4. Resolve the primary email address.
  const emailAddresses = data.email_addresses ?? [];

  const primaryEmail = emailAddresses.find(
    (item) => item.id === data.primary_email_address_id
  );

  if (!primaryEmail?.email_address) {
    return NextResponse.json(
      { success: false, error: "PRIMARY_EMAIL_NOT_FOUND" },
      { status: 400 }
    );
  }

  const emailVerified =
    primaryEmail.verification?.status === "verified";

  // 5. Read the trusted relay configuration.
  const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  const sharedSecret = process.env.DEMIX_WEBHOOK_SECRET;
  const eventId = request.headers.get("svix-id");

  if (!convexSiteUrl || !sharedSecret || !eventId) {
    console.error("Missing webhook relay configuration.");

    return NextResponse.json(
      { success: false, error: "WEBHOOK_CONFIGURATION_MISSING" },
      { status: 500 }
    );
  }

  // 6. Relay the verified event to Convex.
  try {
    const response = await fetch(
      `${convexSiteUrl.replace(/\/$/, "")}/clerk-user-webhook`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sharedSecret}`,
        },
        body: JSON.stringify({
          eventId,
          eventType: event.type,
          clerkUserId: data.id,
          invitationId,
          email: primaryEmail.email_address,
          emailVerified,
        }),
        cache: "no-store",
      }
    );

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("Convex webhook relay failed:", response.status);

      return NextResponse.json(
        {
          success: false,
          error: "CONVEX_WEBHOOK_FAILED",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Webhook relay error:", error);

    return NextResponse.json(
      { success: false, error: "WEBHOOK_RELAY_ERROR" },
      { status: 500 }
    );
  }
}

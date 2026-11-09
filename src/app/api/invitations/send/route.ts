
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";


const INVITATION_EXPIRY_DAYS = 30;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  // 1. التحقق من جلسة Clerk
  const { userId, getToken } = await auth();

  if (!userId) {
    return NextResponse.json(
      { success: false, error: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  // 2. الحصول على رمز Convex
  const token = await getToken({ template: "convex" });

  if (!token) {
    return NextResponse.json(
      { success: false, error: "CONVEX_TOKEN_UNAVAILABLE" },
      { status: 401 }
    );
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    return NextResponse.json(
      { success: false, error: "CONVEX_URL_NOT_CONFIGURED" },
      { status: 500 }
    );
  }

  // 3. قراءة بيانات الطلب
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const invitationIdValue =
    typeof body === "object" &&
    body !== null &&
    "invitationId" in body
      ? (body as { invitationId?: unknown }).invitationId
      : undefined;

  if (
    typeof invitationIdValue !== "string" ||
    !invitationIdValue.trim()
  ) {
    return NextResponse.json(
      { success: false, error: "INVALID_INVITATION_ID" },
      { status: 400 }
    );
  }

  const invitationId =
    invitationIdValue as Id<"invitations">;

  // 4. إنشاء عميل Convex موثق بهوية المستخدم
  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(token);

  try {
    // 5. التحقق من صلاحية المدير وملكية سجل الدعوة
    const invitation = await convex.query(
      api.invitations.getInvitationForSending,
      { invitationId }
    );

    if (!invitation) {
      return NextResponse.json(
        { success: false, error: "INVITATION_NOT_FOUND" },
        { status: 404 }
      );
    }

    // 6. إرسال الدعوة من خلال Clerk
    const clerk = await clerkClient();

    let clerkInvitation;
    try {
      clerkInvitation = await clerk.invitations.createInvitation({
        emailAddress: invitation.email,
        expiresInDays: INVITATION_EXPIRY_DAYS,
        notify: true,
        publicMetadata: {
          demixInvitationId: invitation.id,
        },
      });
    } catch (sendError) {
      const failureReason = sendError instanceof Error
        ? `CLERK_CREATE_FAILED:${sendError.name}`
        : "CLERK_CREATE_FAILED:UNKNOWN";
      try {
        await convex.mutation(api.invitations.markInvitationFailed, {
          invitationId,
          failureReason,
        });
      } catch (auditError) {
        console.error("Could not record Clerk invitation failure:", {
          invitationId,
          errorName: auditError instanceof Error ? auditError.name : "UNKNOWN",
        });
      }
      return NextResponse.json(
        {
          success: false,
          error: "CLERK_INVITATION_CREATE_FAILED",
          message: "رفض Clerk إنشاء الدعوة؛ تم تسجيل الفشل في سجل النظام إن كانت خدمة Convex متاحة.",
        },
        { status: 502 }
      );
    }

    // Clerk timestamps are milliseconds.
    const expiresAt =
      clerkInvitation.createdAt +
      INVITATION_EXPIRY_DAYS * DAY_IN_MS;

    // 7. حفظ نتيجة الإرسال في Convex
    try {
      await convex.mutation(
        api.invitations.markInvitationSent,
        {
          invitationId,
          clerkInvitationId: clerkInvitation.id,
          expiresAt,
        }
      );
    } catch (saveError) {
      // لا نعيد إرسال الدعوة؛ فقد يكون Clerk أرسل البريد بالفعل.
      console.error(
        "Invitation created in Clerk but not recorded in Convex:",
        {
          invitationId,
          clerkInvitationId: clerkInvitation.id,
          error: saveError,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error: "INVITATION_CREATED_BUT_NOT_RECORDED",
          message:
            "تم إنشاء الدعوة لدى Clerk، لكن تعذر تحديث سجل Convex. لا تعاود الإرسال قبل مراجعة حالة الدعوة.",
        },
        { status: 502 }
      );
    }

    // 8. نجاح العملية
    return NextResponse.json({
      success: true,
      status: "invited",
      invitationId,
      message: "تم إرسال الدعوة وتحديث سجلها بنجاح.",
    });
  } catch (error) {
    console.error("Invitation sending error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "INVITATION_SEND_FAILED",
        message:
          "تعذر تأكيد إتمام الإرسال. راجع حالة الدعوة قبل محاولة الإرسال مرة أخرى.",
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { success: false, error: { message: "Email address is required." } },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: { account_type: "personal" },
      },
    });

    return NextResponse.json({
      success: !error,
      data,
      error: error ? { message: error.message, code: error.code } : null,
    }, { status: error ? 400 : 200 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: { message: error instanceof Error ? error.message : "Unexpected error" },
    }, { status: 500 });
  }
}

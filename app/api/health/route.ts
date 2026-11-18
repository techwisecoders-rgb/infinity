import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  
  // Check database connectivity
  let dbStatus = "disconnected";
  let dbError = null;
  
  try {
    const { error } = await supabase.from("profiles").select("id").limit(1);
    if (!error) {
      dbStatus = "connected";
    } else {
      dbStatus = "error";
      dbError = error.message;
    }
  } catch (e) {
    dbStatus = "error";
    dbError = e instanceof Error ? e.message : "Unknown error";
  }

  // Check Supabase Auth
  let authStatus = "unknown";
  try {
    const { data: { session } } = await supabase.auth.getSession();
    authStatus = session ? "authenticated" : "unauthenticated";
  } catch {
    authStatus = "error";
  }

  // Check storage configuration
  const storageConfigured = !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );

  const health = {
    status: dbStatus === "connected" ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
    checks: {
      database: {
        status: dbStatus,
        error: dbError,
      },
      auth: {
        status: authStatus,
      },
      storage: {
        status: storageConfigured ? "configured" : "not_configured",
      },
    },
  };

  const statusCode = health.status === "healthy" ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
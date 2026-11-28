import crypto from "node:crypto";
import net from "node:net";
import tls from "node:tls";
import { createAdminClient } from "@/lib/supabase/admin";

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
    process.env.SMTP_USER?.trim() &&
    process.env.SMTP_PASS?.trim()
  );
}

function hashOtpCode(email: string, otp: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "infinity-otp-secret";
  return crypto
    .createHmac("sha256", secret)
    .update(`${email.trim().toLowerCase()}:${otp}`)
    .digest("hex");
}

function generateSixDigitOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

function createLineReader(socket: net.Socket | tls.TLSSocket) {
  let buffer = "";
  const waiters: Array<(line: string) => void> = [];
  const lines: string[] = [];

  function onData(chunk: Buffer) {
    buffer += chunk.toString("utf8");
    let idx = buffer.indexOf("\n");
    while (idx !== -1) {
      const line = buffer.slice(0, idx).replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);
      const waiter = waiters.shift();
      if (waiter) waiter(line);
      else lines.push(line);
      idx = buffer.indexOf("\n");
    }
  }

  socket.on("data", onData);

  async function readResponse(expectedPrefix: string): Promise<string> {
    const collected: string[] = [];
    while (true) {
      const line = lines.length > 0
        ? lines.shift()!
        : await new Promise<string>((resolve, reject) => {
            const onErr = (err: Error) => reject(err);
            socket.once("error", onErr);
            waiters.push((l) => {
              socket.removeListener("error", onErr);
              resolve(l);
            });
          });
      collected.push(line);
      if (/^\d{3} /.test(line)) {
        const code = line.slice(0, 3);
        if (!code.startsWith(expectedPrefix)) {
          throw new Error(`SMTP error (${code}): ${collected.join(" | ")}`);
        }
        return collected.join("\n");
      }
    }
  }

  function detach() {
    socket.removeListener("data", onData);
  }

  return { readResponse, detach };
}

async function sendSmtpMail(params: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const { host, port, user, pass, from, to, subject, html } = params;

  let socket: net.Socket | tls.TLSSocket = port === 465
    ? tls.connect({ host, port, servername: host, rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED === "true" })
    : net.connect({ host, port });

  socket.setTimeout(15000);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("error", reject);
    socket.once("timeout", () => reject(new Error("SMTP connection timed out")));
  });

  let reader = createLineReader(socket);
  await reader.readResponse("2");

  const sendCmd = async (cmd: string, expectedPrefix: string) => {
    socket.write(`${cmd}\r\n`);
    return reader.readResponse(expectedPrefix);
  };

  await sendCmd("EHLO infinity.local", "2");

  if (port !== 465) {
    await sendCmd("STARTTLS", "2");
    reader.detach();
    socket = tls.connect({ socket, servername: host, rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED === "true" });
    await new Promise<void>((resolve, reject) => {
      socket.once("secureConnect", () => resolve());
      socket.once("error", reject);
    });
    reader = createLineReader(socket);
    await sendCmd("EHLO infinity.local", "2");
  }

  await sendCmd("AUTH LOGIN", "3");
  await sendCmd(Buffer.from(user, "utf8").toString("base64"), "3");
  await sendCmd(Buffer.from(pass, "utf8").toString("base64"), "2");

  await sendCmd(`MAIL FROM:<${user}>`, "2");
  await sendCmd(`RCPT TO:<${to}>`, "2");
  await sendCmd("DATA", "3");

  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
  const message = [
    `From: ${from}`,
    `To: <${to}>`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
    ".",
  ].join("\r\n");

  await sendCmd(message, "2");
  await sendCmd("QUIT", "2").catch(() => {});
  socket.end();
}

export async function sendEmailOtp(email: string, purpose: "register" | "login"): Promise<{ expiresInSeconds: number }> {
  const normalizedEmail = email.trim().toLowerCase();
  const expiryMinutes = Math.max(1, Number(process.env.OTP_EXPIRY_MINUTES || 10));
  const expiresInSeconds = expiryMinutes * 60;
  const otp = generateSixDigitOtp();
  const codeHash = hashOtpCode(normalizedEmail, otp);
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  const admin = createAdminClient();

  // Invalidate any previous unconsumed OTPs for this email & purpose.
  await admin
    .from("otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("email", normalizedEmail)
    .eq("purpose", purpose)
    .is("consumed_at", null);

  const { error: insertError } = await admin.from("otp_codes").insert({
    email: normalizedEmail,
    code_hash: codeHash,
    purpose,
    expires_at: expiresAt,
  });

  if (insertError) {
    throw new Error(`Could not store verification code: ${insertError.message}`);
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER!.trim();
  const pass = process.env.SMTP_PASS!.trim();
  const fromName = (process.env.SMTP_FROM || "INFINITY").trim();
  const fromAddress = fromName.includes("@") ? fromName : `${fromName} <${user}>`;
  const actionText = purpose === "register" ? "complete your Infinity registration" : "sign in to your Infinity account";

  await sendSmtpMail({
    host: process.env.SMTP_HOST!.trim(),
    port,
    user,
    pass,
    from: fromAddress,
    to: normalizedEmail,
    subject: `${otp} is your Infinity 6-digit verification code`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #07101f; color: #f8fafc; border-radius: 12px; border: 1px solid rgba(57,232,244,0.25);">
        <div style="font-size: 13px; letter-spacing: 0.14em; color: #39e8f4; font-weight: 700; margin-bottom: 12px;">♾️ INFINITY VERIFICATION</div>
        <h2 style="margin: 0 0 12px; font-size: 20px; color: #ffffff;">Your 6-digit verification code</h2>
        <p style="margin: 0 0 20px; font-size: 14px; color: #cbd5e1; line-height: 1.5;">
          Enter the code below to ${actionText}. This code expires in ${expiryMinutes} minutes.
        </p>
        <div style="font-size: 32px; font-weight: 800; letter-spacing: 0.28em; text-align: center; padding: 16px; background: rgba(57,232,244,0.1); border: 1px solid rgba(57,232,244,0.35); border-radius: 10px; color: #39e8f4; margin-bottom: 20px;">
          ${otp}
        </div>
        <p style="margin: 0; font-size: 12px; color: #94a3b8;">
          Never share this code with anyone. If you did not request it, you can safely ignore this email.
        </p>
      </div>
    `,
  });

  return { expiresInSeconds };
}

export async function verifyEmailOtp(
  email: string,
  otp: string,
  purpose: "register" | "login",
): Promise<{ valid: boolean; message?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const admin = createAdminClient();

  const { data: record, error } = await admin
    .from("otp_codes")
    .select("*")
    .eq("email", normalizedEmail)
    .eq("purpose", purpose)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !record) {
    return { valid: false, message: "No active 6-digit verification code was found. Please request a new code." };
  }

  if (new Date(record.expires_at).getTime() < Date.now()) {
    await admin.from("otp_codes").update({ consumed_at: new Date().toISOString() }).eq("id", record.id);
    return { valid: false, message: "Your 6-digit verification code has expired. Please request a new code." };
  }

  if (record.attempts >= 5) {
    await admin.from("otp_codes").update({ consumed_at: new Date().toISOString() }).eq("id", record.id);
    return { valid: false, message: "Too many incorrect attempts. Please request a new 6-digit code." };
  }

  const expectedHash = hashOtpCode(normalizedEmail, otp);
  const valid = crypto.timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(record.code_hash, "hex"));

  if (!valid) {
    await admin.from("otp_codes").update({ attempts: record.attempts + 1 }).eq("id", record.id);
    return { valid: false, message: "Invalid 6-digit verification code. Please check and try again." };
  }

  await admin.from("otp_codes").update({ consumed_at: new Date().toISOString() }).eq("id", record.id);
  return { valid: true };
}

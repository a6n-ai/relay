import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { memoryOtpMailer } from "../../../auth/otp-mailer";

// Local-only sign-in helper: the code is readable only with the memory mailer, the DEV_OTP_PEEK flag and a localhost request.
export const Route = createFileRoute("/api/dev/otp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const localhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
        if (env.DEV_OTP_PEEK !== "1" || env.OTP_MAILER !== "memory" || !localhost) {
          return new Response(null, { status: 404 });
        }
        return Response.json({ otp: memoryOtpMailer.lastOtp(url.searchParams.get("email") ?? "") ?? null });
      },
    },
  },
});

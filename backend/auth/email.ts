/**
 * Outbound email for the auth service (password reset links).
 *
 * Provider strategy: Resend (one HTTPS call, no extra dependency) when the
 * optional ResendAPIKey secret is set; otherwise — and on any Resend failure —
 * the message is written to the service log so the operator can hand the link
 * to the tester. sendEmail() never throws: email delivery must not be able to
 * fail an auth request.
 */

import { secret } from "encore.dev/config";
import log from "encore.dev/log";

// Both secrets are optional. Like GoogleClientID (see config.ts), an unset
// secret must not break app boot, so reads are wrapped to never throw.
const resendApiKeyValue = secret("ResendAPIKey");
const emailFromValue = secret("EmailFrom");

function readSecret(read: () => string): string {
  try {
    return read() || "";
  } catch {
    return "";
  }
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendResult {
  delivered: boolean;
  provider: "resend" | "log";
}

const DEFAULT_FROM = "STOMP Scheduler <onboarding@resend.dev>";

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const apiKey = readSecret(() => resendApiKeyValue());

  if (apiKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: readSecret(() => emailFromValue()) || DEFAULT_FROM,
          to: msg.to,
          subject: msg.subject,
          text: msg.text,
          ...(msg.html && { html: msg.html }),
        }),
      });

      if (response.ok) {
        return { delivered: true, provider: "resend" };
      }

      const body = await response.text().catch(() => "");
      log.error("resend rejected email, falling back to log delivery", {
        to: msg.to,
        status: response.status,
        body,
      });
    } catch (err) {
      log.error("resend request failed, falling back to log delivery", {
        to: msg.to,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Log fallback: the alpha-default path. The operator retrieves the message
  // body (including any reset link) from the Encore logs.
  log.info("email (log delivery)", {
    to: msg.to,
    subject: msg.subject,
    body: msg.text,
  });
  return { delivered: false, provider: "log" };
}

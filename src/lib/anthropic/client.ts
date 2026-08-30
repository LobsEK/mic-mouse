import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

/**
 * Server-only Anthropic client. ANTHROPIC_API_KEY lives only in the server
 * environment (Vercel env vars / local .env) — it is never sent to the browser.
 */
export function getAnthropic() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to your .env (local) or Vercel project settings."
      );
    }
    // Identity-linked keys (sk-ant-api03-... created against a personal identity)
    // must name the workspace every request acts in; workspace-scoped keys don't.
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
    _client = new Anthropic({
      apiKey,
      defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
    });
  }
  return _client;
}

export const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";

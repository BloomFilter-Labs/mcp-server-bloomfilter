/**
 * get_account tool — Get account information for the authenticated wallet.
 *
 * Calls GET /account
 * Requires authentication (JWT).
 */

import type { BloomfilterClient } from "../client.js";
import { formatToolError } from "../client.js";
import type { McpToolResult, AccountResponse } from "../types.js";

export async function getAccount(client: BloomfilterClient): Promise<McpToolResult> {
  const keyError = client.requiresPrivateKey();
  if (keyError) return keyError;

  try {
    await client.ensureAuth();

    const { data } = await client.http.get<AccountResponse>("/account", {
      headers: client.getAuthHeaders(),
    });

    const text = [
      "Account Information:",
      `  Wallet: ${data.wallet_address}`,
      `  Domains: ${data.domains_registered}`,
      `  Total Spent: $${(data.total_spent_cents / 100).toFixed(2)}`,
      `  Member Since: ${data.created_at}`,
      `  Last Active: ${data.last_active_at}`,
    ].join("\n");

    return { content: [{ type: "text", text }] };
  } catch (error) {
    return formatToolError(error);
  }
}

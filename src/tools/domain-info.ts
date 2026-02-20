/**
 * get_domain_info tool — Get detailed information about a registered domain.
 *
 * Calls GET /domains/:domain
 * Requires authentication (JWT).
 */

import type { BloomfilterClient } from "../client.js";
import { formatToolError } from "../client.js";
import type { McpToolResult, DomainInfoResponse } from "../types.js";

export async function getDomainInfo(
  client: BloomfilterClient,
  params: { domain: string },
): Promise<McpToolResult> {
  const keyError = client.requiresPrivateKey();
  if (keyError) return keyError;

  try {
    await client.ensureAuth();

    const { data } = await client.http.get<DomainInfoResponse>(
      `/domains/${encodeURIComponent(params.domain)}`,
      { headers: client.getAuthHeaders() },
    );

    const nameservers = data.nameservers?.length ? data.nameservers.join(", ") : "none";

    const text = [
      `Domain: ${data.domain}`,
      `Status: ${data.status}`,
      `Created: ${data.registeredAt}`,
      `Expires: ${data.expiresAt}`,
      `Auto-Renew: ${data.autoRenew ? "Yes" : "No"}`,
      `Locked: ${data.locked ? "Yes" : "No"}`,
      `Nameservers: ${nameservers}`,
      `Owner: ${data.walletAddress}`,
    ].join("\n");

    return { content: [{ type: "text", text }] };
  } catch (error) {
    return formatToolError(error);
  }
}

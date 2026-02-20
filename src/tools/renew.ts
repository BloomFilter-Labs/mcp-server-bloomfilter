/**
 * renew_domain tool — Renew an existing domain registration.
 *
 * Calls POST /domains/renew with x402 payment.
 * Handles both synchronous (201) and asynchronous (202) responses.
 * On 202, polls the job status until completion or failure.
 *
 * Requires authentication (JWT) and payment (x402 USDC).
 */

import type { BloomfilterClient } from "../client.js";
import { formatToolError } from "../client.js";
import type { McpToolResult, RenewalResponse } from "../types.js";

export async function renewDomain(
  client: BloomfilterClient,
  params: { domain: string; years?: number },
): Promise<McpToolResult> {
  const keyError = client.requiresPrivateKey();
  if (keyError) return keyError;

  try {
    await client.ensureAuth();

    const response = await client.http.post<RenewalResponse>(
      "/domains/renew",
      { domain: params.domain, years: params.years ?? 1 },
      { headers: client.getAuthHeaders() },
    );

    let result = response.data;

    // Async provisioning — poll until complete
    if (response.status === 202 && result.jobId) {
      console.error(`[bloomfilter-mcp] Renewal queued (job ${result.jobId}), polling...`);

      const jobResult = await client.pollJobStatus(result.jobId);
      if (jobResult.result) {
        result = jobResult.result as RenewalResponse;
      }
    }

    // Format the result
    const lines = [`Domain renewed: ${result.domain}`];

    if (result.newExpiresAt) {
      lines.push(`New Expiry: ${result.newExpiresAt}`);
    }
    if (result.payment) {
      lines.push(`Cost: $${result.payment.amountUsd}`);
      if (result.payment.txHash) {
        lines.push(`Transaction: ${result.payment.txHash}`);
      }
      lines.push(`Network: ${result.payment.network}`);
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  } catch (error) {
    return formatToolError(error);
  }
}

/**
 * register_domain tool — Register a new domain name.
 *
 * Calls POST /domains/register with x402 payment.
 * Handles both synchronous (201) and asynchronous (202) responses.
 * On 202, polls the job status until completion or failure.
 *
 * Requires authentication (JWT) and payment (x402 USDC).
 */

import type { BloomfilterClient } from "../client.js";
import { formatToolError } from "../client.js";
import type { McpToolResult, RegistrationResponse } from "../types.js";

export async function registerDomain(
  client: BloomfilterClient,
  params: { domain: string; years?: number },
): Promise<McpToolResult> {
  const keyError = client.requiresPrivateKey();
  if (keyError) return keyError;

  try {
    await client.ensureAuth();

    const response = await client.http.post<RegistrationResponse>(
      "/domains/register",
      { domain: params.domain, years: params.years ?? 1 },
      { headers: client.getAuthHeaders() },
    );

    let result = response.data;

    // Async provisioning — poll until complete
    if (response.status === 202 && result.jobId) {
      console.error(`[bloomfilter-mcp] Registration queued (job ${result.jobId}), polling...`);

      const jobResult = await client.pollJobStatus(result.jobId);
      if (jobResult.result) {
        result = jobResult.result as RegistrationResponse;
      }
    }

    // Format the result
    const lines = [`Domain registered: ${result.domain}`, `Status: ${result.status}`];

    if (result.expiresAt) {
      lines.push(`Expires: ${result.expiresAt}`);
    }
    if (result.payment) {
      lines.push(`Cost: $${result.payment.amountUsd}`);
      if (result.payment.txHash) {
        lines.push(`Transaction: ${result.payment.txHash}`);
      }
      lines.push(`Network: ${result.payment.network}`);
    }
    if (result.dnsRecords && result.dnsRecords.length > 0) {
      lines.push("");
      lines.push("DNS Records:");
      for (const record of result.dnsRecords) {
        lines.push(`  ${record.type} ${record.host} \u2192 ${record.value}`);
      }
    }
    if (result.warnings && result.warnings.length > 0) {
      lines.push("");
      lines.push("Warnings:");
      for (const warning of result.warnings) {
        lines.push(`  \u26a0 ${warning}`);
      }
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  } catch (error) {
    return formatToolError(error);
  }
}

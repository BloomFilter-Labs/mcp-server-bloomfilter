/**
 * get_pricing tool — Get domain pricing for one or all TLDs.
 *
 * Calls GET /domains/pricing or GET /domains/pricing/:tld
 * No authentication or payment required.
 */

import type { BloomfilterClient } from "../client.js";
import { formatToolError } from "../client.js";
import type { McpToolResult, TldPricing } from "../types.js";

export async function getPricing(
  client: BloomfilterClient,
  params: { tld?: string },
): Promise<McpToolResult> {
  try {
    const url = params.tld
      ? `/domains/pricing/${encodeURIComponent(params.tld)}`
      : "/domains/pricing";

    const { data } = await client.http.get(url);

    // Single TLD
    if (params.tld) {
      const p = data as TldPricing;
      const text = [
        `Pricing for .${p.tld}:`,
        `  Registration: $${p.registration_price_usd}`,
        `  Renewal:      $${p.renewal_price_usd}`,
        `  Transfer:     $${p.transfer_price_usd}`,
      ].join("\n");

      return { content: [{ type: "text", text }] };
    }

    // All TLDs
    const pricing = (Array.isArray(data) ? data : (data.pricing ?? [])) as TldPricing[];

    if (pricing.length === 0) {
      return { content: [{ type: "text", text: "No pricing data available." }] };
    }

    const header = "TLD        Registration   Renewal        Transfer";
    const divider = "\u2500".repeat(header.length);

    const rows = pricing.map((p) => {
      const tld = `.${p.tld}`.padEnd(11);
      const reg = `$${p.registration_price_usd}`.padEnd(15);
      const renew = `$${p.renewal_price_usd}`.padEnd(15);
      const transfer = `$${p.transfer_price_usd}`;
      return `${tld}${reg}${renew}${transfer}`;
    });

    const text = `Domain Pricing:\n\n${header}\n${divider}\n${rows.join("\n")}`;

    return { content: [{ type: "text", text }] };
  } catch (error) {
    return formatToolError(error);
  }
}

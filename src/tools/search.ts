/**
 * search_domains tool — Search for available domain names.
 *
 * Calls GET /domains/search?query={query}&tlds={tlds}
 * No authentication or payment required.
 */

import type { BloomfilterClient } from "../client.js";
import { formatToolError } from "../client.js";
import type { McpToolResult, SearchResponse } from "../types.js";

export async function searchDomains(
  client: BloomfilterClient,
  params: { query: string; tlds?: string },
): Promise<McpToolResult> {
  try {
    const { data } = await client.http.get<SearchResponse>("/domains/search", {
      params: { query: params.query, ...(params.tlds && { tlds: params.tlds }) },
    });

    if (!data.results || data.results.length === 0) {
      return {
        content: [{ type: "text", text: `No results found for "${params.query}".` }],
      };
    }

    const lines = data.results.map((r) => {
      if (!r.available) {
        return `  \u274c ${r.domain} \u2014 unavailable`;
      }
      const price = r.priceUsd
        ? `$${r.priceUsd}`
        : r.priceCents
          ? `$${(r.priceCents / 100).toFixed(2)}`
          : "price unavailable";
      const premium = r.premium ? " (premium)" : "";
      return `  \u2705 ${r.domain} \u2014 ${price}/yr${premium}`;
    });

    const text = `Domain search results for "${params.query}":\n\n${lines.join("\n")}`;

    return { content: [{ type: "text", text }] };
  } catch (error) {
    return formatToolError(error);
  }
}

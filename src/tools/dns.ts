/**
 * DNS management tools — list, add, update, and delete DNS records.
 *
 * list_dns_records:   GET    /dns/:domain
 * add_dns_record:     POST   /dns/:domain       (x402 $0.10)
 * update_dns_record:  PUT    /dns/:domain/:id   (x402 $0.10)
 * delete_dns_record:  DELETE /dns/:domain/:id   (x402 $0.10)
 *
 * All require authentication (JWT).
 * Mutations require x402 payment ($0.10 USDC each).
 */

import type { BloomfilterClient } from "../client.js";
import { formatToolError } from "../client.js";
import type { McpToolResult, DnsRecordResponse } from "../types.js";

// ── List DNS Records ────────────────────────────────────────────────────────

export async function listDnsRecords(
  client: BloomfilterClient,
  params: { domain: string },
): Promise<McpToolResult> {
  const keyError = client.requiresPrivateKey();
  if (keyError) return keyError;

  try {
    await client.ensureAuth();

    const { data } = await client.http.get<{ records: DnsRecordResponse[] }>(
      `/dns/${encodeURIComponent(params.domain)}`,
      { headers: client.getAuthHeaders() },
    );

    const records = data.records ?? [];

    if (records.length === 0) {
      return {
        content: [{ type: "text", text: `No DNS records found for ${params.domain}.` }],
      };
    }

    const header = "ID             Type    Host                 Value                          TTL";
    const divider = "\u2500".repeat(header.length);

    const rows = records.map((r) => {
      const id = r.recordId.padEnd(15);
      const type = r.type.padEnd(8);
      const host = r.host.substring(0, 20).padEnd(21);
      const value = r.value.substring(0, 30).padEnd(31);
      const ttl = String(r.ttl);
      const distance = r.distance != null ? ` (priority: ${r.distance})` : "";
      return `${id}${type}${host}${value}${ttl}${distance}`;
    });

    const text = `DNS records for ${params.domain}:\n\n${header}\n${divider}\n${rows.join("\n")}`;

    return { content: [{ type: "text", text }] };
  } catch (error) {
    return formatToolError(error);
  }
}

// ── Add DNS Record ──────────────────────────────────────────────────────────

export async function addDnsRecord(
  client: BloomfilterClient,
  params: {
    domain: string;
    type: string;
    host: string;
    value: string;
    ttl?: number;
    distance?: number;
  },
): Promise<McpToolResult> {
  const keyError = client.requiresPrivateKey();
  if (keyError) return keyError;

  try {
    await client.ensureAuth();

    const body: Record<string, unknown> = {
      type: params.type,
      host: params.host,
      value: params.value,
    };
    if (params.ttl != null) body.ttl = params.ttl;
    if (params.distance != null) body.distance = params.distance;

    const { data } = await client.http.post<DnsRecordResponse>(
      `/dns/${encodeURIComponent(params.domain)}`,
      body,
      { headers: client.getAuthHeaders() },
    );

    const text = [
      `DNS record added to ${params.domain}:`,
      `  Record ID: ${data.recordId}`,
      `  Type: ${data.type}`,
      `  Host: ${data.host}`,
      `  Value: ${data.value}`,
      `  TTL: ${data.ttl}`,
      data.distance != null ? `  Priority: ${data.distance}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    return { content: [{ type: "text", text }] };
  } catch (error) {
    return formatToolError(error);
  }
}

// ── Update DNS Record ───────────────────────────────────────────────────────

export async function updateDnsRecord(
  client: BloomfilterClient,
  params: {
    domain: string;
    record_id: string;
    host: string;
    value: string;
    ttl?: number;
    distance?: number;
  },
): Promise<McpToolResult> {
  const keyError = client.requiresPrivateKey();
  if (keyError) return keyError;

  try {
    await client.ensureAuth();

    const body: Record<string, unknown> = {
      host: params.host,
      value: params.value,
    };
    if (params.ttl != null) body.ttl = params.ttl;
    if (params.distance != null) body.distance = params.distance;

    const { data } = await client.http.put<DnsRecordResponse>(
      `/dns/${encodeURIComponent(params.domain)}/${encodeURIComponent(params.record_id)}`,
      body,
      { headers: client.getAuthHeaders() },
    );

    const text = [
      `DNS record updated for ${params.domain}:`,
      `  Record ID: ${data.recordId}`,
      `  Type: ${data.type}`,
      `  Host: ${data.host}`,
      `  Value: ${data.value}`,
      `  TTL: ${data.ttl}`,
      data.distance != null ? `  Priority: ${data.distance}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    return { content: [{ type: "text", text }] };
  } catch (error) {
    return formatToolError(error);
  }
}

// ── Delete DNS Record ───────────────────────────────────────────────────────

export async function deleteDnsRecord(
  client: BloomfilterClient,
  params: { domain: string; record_id: string },
): Promise<McpToolResult> {
  const keyError = client.requiresPrivateKey();
  if (keyError) return keyError;

  try {
    await client.ensureAuth();

    await client.http.delete(
      `/dns/${encodeURIComponent(params.domain)}/${encodeURIComponent(params.record_id)}`,
      { headers: client.getAuthHeaders() },
    );

    return {
      content: [
        {
          type: "text",
          text: `DNS record ${params.record_id} deleted from ${params.domain}.`,
        },
      ],
    };
  } catch (error) {
    return formatToolError(error);
  }
}

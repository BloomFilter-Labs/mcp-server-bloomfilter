#!/usr/bin/env node

/**
 * @bloomfilter/mcp-server
 *
 * MCP server for Bloomfilter — enables AI agents to register ICANN domain
 * names, manage DNS records, and check pricing via the Model Context Protocol.
 *
 * Usage:
 *   BLOOMFILTER_PRIVATE_KEY=0x... npx @bloomfilter/mcp-server
 *
 * Environment variables:
 *   BLOOMFILTER_API_URL      — API base URL (default: https://api.bloomfilter.xyz)
 *   BLOOMFILTER_PRIVATE_KEY  — EVM private key for payments + auth (optional for free tools)
 *   BLOOMFILTER_NETWORK      — x402 network (default: eip155:8453)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { createBloomfilterClient } from "./client.js";
import type { BloomfilterConfig } from "./types.js";
import { DNS_RECORD_TYPES } from "./types.js";

// Tool handlers
import { searchDomains } from "./tools/search.js";
import { getPricing } from "./tools/pricing.js";
import { getDomainInfo } from "./tools/domain-info.js";
import { registerDomain } from "./tools/register.js";
import { renewDomain } from "./tools/renew.js";
import { listDnsRecords, addDnsRecord, updateDnsRecord, deleteDnsRecord } from "./tools/dns.js";
import { getAccount } from "./tools/account.js";

// ── Configuration ───────────────────────────────────────────────────────────

function loadConfig(): BloomfilterConfig {
  const apiUrl = process.env.BLOOMFILTER_API_URL ?? "https://api.bloomfilter.xyz";
  const network = process.env.BLOOMFILTER_NETWORK ?? "eip155:8453";

  let privateKey: `0x${string}` | undefined;
  if (process.env.BLOOMFILTER_PRIVATE_KEY) {
    const key = process.env.BLOOMFILTER_PRIVATE_KEY;
    privateKey = (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
  }

  return { apiUrl, privateKey, network };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = loadConfig();

  console.error("[bloomfilter-mcp] Starting Bloomfilter MCP server v0.1.0");
  console.error(`[bloomfilter-mcp] API: ${config.apiUrl}`);
  console.error(`[bloomfilter-mcp] Network: ${config.network}`);

  if (!config.privateKey) {
    console.error(
      "[bloomfilter-mcp] Warning: No BLOOMFILTER_PRIVATE_KEY set. " +
        "Only free tools (search, pricing) will work. " +
        "Set BLOOMFILTER_PRIVATE_KEY to enable registration, renewal, DNS, and account tools.",
    );
  }

  // Create the API client
  const client = await createBloomfilterClient(config);

  // Create the MCP server
  const server = new McpServer({
    name: "bloomfilter",
    version: "0.1.0",
  });

  // ── Register Tools ──────────────────────────────────────────────────────

  // 1. search_domains
  server.tool(
    "search_domains",
    "Search for available domain names. Returns availability and pricing for each TLD.",
    {
      query: z.string().describe("Domain name to search for (e.g., 'myproject', 'coolstartup')"),
      tlds: z
        .string()
        .optional()
        .describe(
          "Comma-separated TLDs to check (e.g., 'com,io,xyz'). Defaults to com,net,org,io,xyz",
        ),
    },
    async (params) => searchDomains(client, params),
  );

  // 2. get_pricing
  server.tool(
    "get_pricing",
    "Get domain registration, renewal, and transfer pricing. Omit tld for all TLDs, or specify one.",
    {
      tld: z
        .string()
        .optional()
        .describe("Specific TLD to get pricing for (e.g., 'com', 'io'). Omit for all TLDs."),
    },
    async (params) => getPricing(client, params),
  );

  // 3. get_domain_info
  server.tool(
    "get_domain_info",
    "Get detailed information about a registered domain (status, expiry, nameservers, etc.).",
    {
      domain: z.string().describe("Fully qualified domain name (e.g., 'example.com')"),
    },
    async (params) => getDomainInfo(client, params),
  );

  // 4. register_domain
  server.tool(
    "register_domain",
    "Register a new domain name. Requires USDC payment via x402. Handles async provisioning automatically.",
    {
      domain: z.string().describe("Domain to register (e.g., 'myproject.com')"),
      years: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Registration period in years (1-10, default: 1)"),
    },
    async (params) => registerDomain(client, params),
  );

  // 5. renew_domain
  server.tool(
    "renew_domain",
    "Renew an existing domain registration. Requires USDC payment via x402.",
    {
      domain: z.string().describe("Domain to renew (e.g., 'myproject.com')"),
      years: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Renewal period in years (1-10, default: 1)"),
    },
    async (params) => renewDomain(client, params),
  );

  // 6. list_dns_records
  server.tool(
    "list_dns_records",
    "List all DNS records for a domain you own.",
    {
      domain: z.string().describe("Domain to list DNS records for (e.g., 'myproject.com')"),
    },
    async (params) => listDnsRecords(client, params),
  );

  // 7. add_dns_record
  server.tool(
    "add_dns_record",
    "Add a DNS record to a domain you own. Costs $0.10 USDC per record. " +
      "IMPORTANT: Always add DNS records one at a time (sequentially, not in parallel). " +
      "After registering a new domain, wait at least 30 seconds before adding DNS records.",
    {
      domain: z.string().describe("Domain to add the record to (e.g., 'myproject.com')"),
      type: z
        .enum(DNS_RECORD_TYPES)
        .describe("DNS record type (A, AAAA, CNAME, MX, TXT, NS, SRV, CAA, FORWARD)"),
      host: z.string().describe("Record hostname (e.g., '@' for root, 'www', 'mail')"),
      value: z.string().describe("Record value (e.g., IP address, CNAME target, MX server)"),
      ttl: z
        .number()
        .int()
        .min(300)
        .max(86400)
        .optional()
        .describe("Time-to-live in seconds (300-86400, default: 3600)"),
      distance: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("MX priority / SRV weight (only for MX and SRV records)"),
    },
    async (params) => addDnsRecord(client, params),
  );

  // 8. update_dns_record
  server.tool(
    "update_dns_record",
    "Update an existing DNS record. Costs $0.10 USDC. Use list_dns_records to find the record_id. " +
      "IMPORTANT: Always update DNS records one at a time (sequentially, not in parallel).",
    {
      domain: z.string().describe("Domain the record belongs to (e.g., 'myproject.com')"),
      record_id: z.string().describe("ID of the DNS record to update (from list_dns_records)"),
      host: z.string().describe("New hostname for the record"),
      value: z.string().describe("New value for the record"),
      ttl: z
        .number()
        .int()
        .min(300)
        .max(86400)
        .optional()
        .describe("New TTL in seconds (300-86400)"),
      distance: z.number().int().min(0).optional().describe("New MX priority / SRV weight"),
    },
    async (params) => updateDnsRecord(client, params),
  );

  // 9. delete_dns_record
  server.tool(
    "delete_dns_record",
    "Delete a DNS record from a domain you own. Costs $0.10 USDC. " +
      "IMPORTANT: Always delete DNS records one at a time (sequentially, not in parallel).",
    {
      domain: z.string().describe("Domain the record belongs to (e.g., 'myproject.com')"),
      record_id: z.string().describe("ID of the DNS record to delete (from list_dns_records)"),
    },
    async (params) => deleteDnsRecord(client, params),
  );

  // 10. get_account
  server.tool(
    "get_account",
    "Get account information — wallet address, domain count, total spent.",
    {},
    async () => getAccount(client),
  );

  // ── Start Server ────────────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[bloomfilter-mcp] Server started, waiting for requests...");
}

// ── Error Handling ────────────────────────────────────────────────────────

main().catch((error) => {
  console.error("[bloomfilter-mcp] Fatal error:", error);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.error("[bloomfilter-mcp] Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.error("[bloomfilter-mcp] Shutting down...");
  process.exit(0);
});

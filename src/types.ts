/**
 * Inlined types and constants for the Bloomfilter MCP server.
 *
 * These are intentionally NOT imported from @bloomfilter/shared because:
 * 1. @bloomfilter/shared uses Zod v4; MCP SDK requires Zod v3
 * 2. Keeping the MCP server fully self-contained makes it easier to
 *    publish independently and mirror to the open-source repo
 */

// ── Configuration ───────────────────────────────────────────────────────────

export interface BloomfilterConfig {
  /** Base URL of the Bloomfilter API */
  apiUrl: string;
  /** EVM private key (hex, 0x-prefixed) for signing payments + SIWE auth */
  privateKey?: `0x${string}`;
  /** x402 network identifier (CAIP-2 format, e.g. "eip155:8453") */
  network: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Polling interval for async job status checks (ms) */
export const JOB_POLL_INTERVAL_MS = 2_000;

/** Maximum time to poll for a job before timing out (ms) — 5 minutes */
export const JOB_TIMEOUT_MS = 300_000;

/** HTTP request timeout (ms) */
export const HTTP_TIMEOUT_MS = 30_000;

// ── DNS Record Types ────────────────────────────────────────────────────────

export const DNS_RECORD_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "NS",
  "SRV",
  "CAA",
  "FORWARD",
] as const;

export type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];

// ── API Response Types ──────────────────────────────────────────────────────

export interface SearchResultDomain {
  domain: string;
  available: boolean;
  premium: boolean;
  priceCents?: number;
  priceUsd?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResultDomain[];
}

export interface TldPricing {
  tld: string;
  registration_price_usd: string;
  renewal_price_usd: string;
  transfer_price_usd: string;
}

export interface PricingResponse {
  tld?: string;
  pricing: TldPricing | TldPricing[];
}

export interface DomainInfoResponse {
  domain: string;
  status: string;
  registeredAt: string;
  expiresAt: string;
  autoRenew: boolean;
  locked: boolean;
  nameservers: string[];
  walletAddress: string;
}

export interface RegistrationResponse {
  domain: string;
  status: string;
  registeredAt?: string;
  expiresAt?: string;
  jobId?: string;
  payment?: {
    amountUsd: string;
    txHash?: string;
    network: string;
    settled: boolean;
  };
  dnsRecords?: Array<{ type: string; host: string; value: string }>;
  warnings?: string[];
}

export interface RenewalResponse {
  domain: string;
  renewedAt?: string;
  newExpiresAt?: string;
  jobId?: string;
  payment?: {
    amountUsd: string;
    txHash?: string;
    network: string;
    settled: boolean;
  };
}

export interface DnsRecordResponse {
  recordId: string;
  type: string;
  host: string;
  value: string;
  ttl: number;
  distance?: number;
}

export interface AccountResponse {
  wallet_address: string;
  created_at: string;
  total_spent_cents: number;
  domains_registered: number;
  last_active_at: string;
}

export interface JobStatusResponse {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  domain: string;
  result?: RegistrationResponse | RenewalResponse;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NonceResponse {
  nonce: string;
  domain: string;
  uri: string;
  chainId: number;
  version: string;
  expiresIn: number;
}

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  walletAddress: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ErrorResponse {
  error: string;
  message: string;
  code: string;
  domain?: string;
  requestId?: string;
}

// ── MCP Tool Result ─────────────────────────────────────────────────────────

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

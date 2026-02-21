/**
 * Bloomfilter API client with x402 payment support and SIWE authentication.
 *
 * This module creates an axios instance optionally wrapped with @x402/axios
 * for automatic 402 payment handling, plus lazy SIWE authentication with
 * token caching and refresh.
 */

import axios from "axios";
import type { AxiosInstance } from "axios";
import { privateKeyToAccount } from "viem/accounts";
import type { LocalAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { z } from "zod";

import type {
  BloomfilterConfig,
  McpToolResult,
  NonceResponse,
  AuthTokenResponse,
  RefreshTokenResponse,
  JobStatusResponse,
} from "./types.js";
import { HTTP_TIMEOUT_MS, JOB_POLL_INTERVAL_MS, JOB_TIMEOUT_MS } from "./types.js";

// ── Config Validation ────────────────────────────────────────────────────────

const configSchema = z.object({
  apiUrl: z.string().url("apiUrl must be a valid URL"),
  privateKey: z
    .custom<`0x${string}`>((val) => typeof val === "string" && /^0x[0-9a-fA-F]{64}$/.test(val), {
      message: "privateKey must be a 0x-prefixed 32-byte hex string",
    })
    .optional(),
  network: z
    .string()
    .regex(/^eip155:\d+$/, 'network must be in CAIP-2 format (e.g. "eip155:8453")'),
});

// ── Types ───────────────────────────────────────────────────────────────────

export interface BloomfilterClient {
  /** The underlying axios instance (with x402 wrapping if private key provided) */
  http: AxiosInstance;
  /** Ensure the client is authenticated (lazy SIWE flow) */
  ensureAuth(): Promise<void>;
  /** Get auth headers for authenticated requests */
  getAuthHeaders(): Record<string, string>;
  /** Check if a private key is configured; returns error result if not, null if OK */
  requiresPrivateKey(): McpToolResult | null;
  /** Poll an async job until completion or failure */
  pollJobStatus(jobId: string): Promise<JobStatusResponse>;
}

// ── Token Cache ─────────────────────────────────────────────────────────────

interface TokenCache {
  accessToken: string;
  refreshToken: string;
  /** Timestamp (ms) when the access token expires */
  expiresAt: number;
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a Bloomfilter API client.
 *
 * If a private key is provided, the axios instance is wrapped with @x402/axios
 * for automatic 402 payment handling. Authentication uses SIWE (Sign-In With
 * Ethereum) — tokens are cached in memory and refreshed automatically.
 */
export async function createBloomfilterClient(
  config: BloomfilterConfig,
): Promise<BloomfilterClient> {
  // Validate config upfront — fail fast with clear messages
  configSchema.parse(config);

  let account: LocalAccount | undefined;
  let tokenCache: TokenCache | undefined;

  // Create base axios instance
  let httpClient: AxiosInstance = axios.create({
    baseURL: config.apiUrl,
    timeout: HTTP_TIMEOUT_MS,
    headers: { "Content-Type": "application/json" },
  });

  // If private key is provided, set up wallet + x402 payment wrapping
  if (config.privateKey) {
    account = privateKeyToAccount(config.privateKey);
    console.error(`[bloomfilter-mcp] Wallet: ${account.address}`);

    try {
      // Dynamic import to avoid issues when private key is not provided
      const { wrapAxiosWithPayment, x402Client } = await import("@x402/axios");
      const { ExactEvmScheme } = await import("@x402/evm");

      const x402 = new x402Client().register("eip155:*", new ExactEvmScheme(account));

      httpClient = wrapAxiosWithPayment(httpClient, x402);
    } catch (err) {
      console.error(
        "[bloomfilter-mcp] Warning: Failed to initialize x402 payment support.",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // ── SIWE Auth ───────────────────────────────────────────────────────────

  async function authenticate(): Promise<void> {
    if (!account) {
      throw new Error("Cannot authenticate without a private key");
    }

    try {
      // 1. Get nonce from API
      const { data: nonceData } = await httpClient.get<NonceResponse>("/auth/nonce");

      // 2. Construct SIWE message
      const message = createSiweMessage({
        address: account.address,
        chainId: nonceData.chainId,
        domain: nonceData.domain,
        nonce: nonceData.nonce,
        uri: nonceData.uri,
        version: "1",
        issuedAt: new Date(),
      });

      // 3. Sign the message
      const signature = await account.signMessage({ message });

      // 4. Verify with the API
      const { data: authData } = await httpClient.post<AuthTokenResponse>("/auth/verify", {
        message,
        signature,
      });

      // 5. Cache tokens
      tokenCache = {
        accessToken: authData.accessToken,
        refreshToken: authData.refreshToken,
        expiresAt: Date.now() + authData.expiresIn * 1000 - 60_000, // 1 min buffer
      };

      console.error(`[bloomfilter-mcp] Authenticated as ${account.address}`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Authentication failed: ${detail}`);
    }
  }

  async function refreshAuth(): Promise<boolean> {
    if (!tokenCache) return false;

    try {
      const { data } = await httpClient.post<RefreshTokenResponse>("/auth/refresh", {
        refreshToken: tokenCache.refreshToken,
      });

      tokenCache = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: Date.now() + data.expiresIn * 1000 - 60_000,
      };

      console.error("[bloomfilter-mcp] Token refreshed");
      return true;
    } catch {
      console.error("[bloomfilter-mcp] Token refresh failed, re-authenticating");
      tokenCache = undefined;
      return false;
    }
  }

  async function ensureAuth(): Promise<void> {
    if (!account) {
      throw new Error("BLOOMFILTER_PRIVATE_KEY is required for authenticated operations");
    }

    // No tokens yet — full auth
    if (!tokenCache) {
      await authenticate();
      return;
    }

    // Token still valid
    if (Date.now() < tokenCache.expiresAt) {
      return;
    }

    // Token expired — try refresh, fall back to full auth
    const refreshed = await refreshAuth();
    if (!refreshed) {
      await authenticate();
    }
  }

  function getAuthHeaders(): Record<string, string> {
    if (!tokenCache) return {};
    return { Authorization: `Bearer ${tokenCache.accessToken}` };
  }

  function requiresPrivateKey(): McpToolResult | null {
    if (config.privateKey) return null;
    return {
      content: [
        {
          type: "text",
          text:
            "Error: BLOOMFILTER_PRIVATE_KEY is required for this operation. " +
            "Set it as an environment variable to enable domain registration, " +
            "renewal, DNS management, and account access.\n\n" +
            "Example: BLOOMFILTER_PRIVATE_KEY=0x... bloomfilter-mcp",
        },
      ],
      isError: true,
    };
  }

  // ── Job Polling ─────────────────────────────────────────────────────────

  async function pollJobStatus(jobId: string): Promise<JobStatusResponse> {
    const startTime = Date.now();

    while (Date.now() - startTime < JOB_TIMEOUT_MS) {
      // Re-check auth on each poll — long polling loops can outlast token expiry
      await ensureAuth();

      const { data } = await httpClient.get<JobStatusResponse>(`/domains/status/${jobId}`, {
        headers: getAuthHeaders(),
      });

      if (data.status === "completed") {
        return data;
      }

      if (data.status === "failed") {
        throw new Error(data.error ?? `Job ${jobId} failed: domain provisioning was unsuccessful`);
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS));
    }

    throw new Error(
      `Job ${jobId} timed out after ${JOB_TIMEOUT_MS / 1000}s. ` +
        "The domain may still be provisioning — check status later with get_domain_info.",
    );
  }

  return {
    http: httpClient,
    ensureAuth,
    getAuthHeaders,
    requiresPrivateKey,
    pollJobStatus,
  };
}

// ── Error Formatting ──────────────────────────────────────────────────────

/**
 * Format any error into a consistent MCP tool result.
 *
 * Handles:
 * - Axios errors with Bloomfilter API error responses
 * - Rate limiting (429)
 * - Network/connection errors
 * - Generic errors
 */
export function formatToolError(error: unknown, apiUrl?: string): McpToolResult {
  if (axios.isAxiosError(error)) {
    // Rate limited
    if (error.response?.status === 429) {
      const data = error.response.data as Record<string, unknown> | undefined;
      const message = (data?.message as string) ?? "Too many requests";
      return {
        content: [{ type: "text", text: `Rate limited: ${message}. Please wait before retrying.` }],
        isError: true,
      };
    }

    // API error response
    if (error.response?.data) {
      const data = error.response.data as Record<string, unknown>;
      const status = error.response.status;

      // x402 payment responses — two cases:
      // 1. Initial 402 with accepts array (no x402 wrapper, or wrapper disabled)
      // 2. Retry 402 after x402 wrapper tried to pay but settlement failed
      if (status === 402) {
        if (data.accepts) {
          // Case 1: Initial 402 with payment requirements
          const accepts = data.accepts as Array<Record<string, unknown>>;
          const amount = accepts[0]?.price ?? accepts[0]?.amount;
          const description = (data.resource as Record<string, unknown> | undefined)?.description;
          const detail = description
            ? `${description} requires payment of ${amount} USDC`
            : `Payment of ${amount} USDC required`;
          return {
            content: [
              {
                type: "text",
                text: `Payment required: ${detail}. Ensure your wallet has sufficient USDC balance.`,
              },
            ],
            isError: true,
          };
        }
        // Case 2: Payment was attempted but failed (insufficient balance, settlement error, etc.)
        const serverMsg =
          (data.message as string) ?? (data.error as string) ?? (data.detail as string);
        const detail = serverMsg ?? "payment was attempted but could not be settled on-chain";
        return {
          content: [
            {
              type: "text",
              text: `Payment failed: ${detail}. Check that your wallet has sufficient USDC balance on Base.`,
            },
          ],
          isError: true,
        };
      }

      const code = (data.code as string) ?? `HTTP ${status}`;
      const message =
        (data.message as string) ??
        (data.error as string) ??
        (data.detail as string) ??
        error.response.statusText ??
        `Request failed with status ${status}`;
      return {
        content: [{ type: "text", text: `Error [${code}]: ${message}` }],
        isError: true,
      };
    }

    // Network/connection error
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      const url = apiUrl ?? error.config?.baseURL ?? "unknown";
      return {
        content: [
          {
            type: "text",
            text:
              `Failed to connect to Bloomfilter API at ${url}. ` +
              "Check that the API is running and BLOOMFILTER_API_URL is correct.",
          },
        ],
        isError: true,
      };
    }

    // Timeout
    if (error.code === "ECONNABORTED" || error.code === "ERR_CANCELED") {
      return {
        content: [
          {
            type: "text",
            text: "Request timed out. The Bloomfilter API may be slow or unreachable.",
          },
        ],
        isError: true,
      };
    }

    // Generic axios error
    return {
      content: [{ type: "text", text: `Request failed: ${error.message}` }],
      isError: true,
    };
  }

  // Non-axios error
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

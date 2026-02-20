# @bloomfilter/mcp-server

MCP server for [Bloomfilter](https://bloomfilter.xyz) — register ICANN domain names and manage DNS records from AI agents.

Bloomfilter is a domain registration API that uses [x402](https://www.x402.org/) for payments. You point your AI agent at the Bloomfilter API, give it a wallet with some USDC, and it can autonomously search, register, and configure domains. No login, no credit card, no dashboard — just HTTP requests and a crypto wallet.

This MCP server wraps the Bloomfilter API so that any MCP-compatible client (Claude Desktop, Cursor, Windsurf, custom agents, etc.) can use it as a tool provider.

## Quick Start

```bash
BLOOMFILTER_PRIVATE_KEY=0x... npx @bloomfilter/mcp-server
```

The server communicates over stdio (JSON-RPC). It's meant to be launched by an MCP client, not run standalone.

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bloomfilter": {
      "command": "npx",
      "args": ["-y", "@bloomfilter/mcp-server"],
      "env": {
        "BLOOMFILTER_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "bloomfilter": {
      "command": "npx",
      "args": ["-y", "@bloomfilter/mcp-server"],
      "env": {
        "BLOOMFILTER_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

### Environment Variables

| Variable                  | Required            | Default                       | Description                                                          |
| ------------------------- | ------------------- | ----------------------------- | -------------------------------------------------------------------- |
| `BLOOMFILTER_PRIVATE_KEY` | For paid operations | —                             | EVM private key (hex). Used for x402 payments and wallet-based auth. |
| `BLOOMFILTER_API_URL`     | No                  | `https://api.bloomfilter.xyz` | API base URL.                                                        |

Without a private key, only `search_domains` and `get_pricing` work — everything else requires a wallet.

## Tools

The server exposes 10 tools:

### Free (no wallet needed)

- **`search_domains`** — Check if a domain is available and get pricing. Searches across multiple TLDs at once.
- **`get_pricing`** — Get registration, renewal, and transfer pricing for one or all supported TLDs.

### Authenticated (wallet required)

- **`get_domain_info`** — Get details about a registered domain: status, expiry, nameservers, lock state.
- **`register_domain`** — Register a new domain. Pays with USDC via x402 automatically. Handles async provisioning (the server polls until the domain is live).
- **`renew_domain`** — Extend a domain registration. Same x402 payment flow.
- **`get_account`** — View wallet address, domain count, total spent.

### DNS Management (wallet required, $0.10 USDC per mutation)

- **`list_dns_records`** — List all DNS records for a domain.
- **`add_dns_record`** — Add a DNS record (A, AAAA, CNAME, MX, TXT, NS, SRV, CAA, FORWARD).
- **`update_dns_record`** — Update an existing DNS record by ID.
- **`delete_dns_record`** — Delete a DNS record by ID.

## How Payments Work

Bloomfilter uses the [x402 protocol](https://www.x402.org/) — an HTTP-native payment standard. When a tool triggers a paid API call, the server handles payment negotiation automatically:

1. The API responds with HTTP 402 and a payment requirement
2. The MCP server signs a USDC payment with your wallet
3. The API verifies the payment and completes the request

All payments are in USDC on Base (an Ethereum L2). You need USDC in the wallet corresponding to your private key.

## Authentication

The server authenticates with the Bloomfilter API using SIWE (Sign-In With Ethereum). This happens automatically on the first authenticated tool call — no setup needed beyond providing your private key.

## Building from Source

```bash
git clone https://github.com/TickHQ/mcp-server-bloomfilter.git
cd mcp-server-bloomfilter
npm install
npm run build
```

Requires Node.js 20+.

## License

MIT

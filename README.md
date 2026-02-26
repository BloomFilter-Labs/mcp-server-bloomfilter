# @bloomfilter/mcp-server

<a href="https://glama.ai/mcp/servers/@BloomFilter-Labs/bloomfilter">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@BloomFilter-Labs/bloomfilter/badge" />
</a>

MCP server for [Bloomfilter](https://bloomfilter.xyz), search & register domain names and manage DNS records from AI agents.

Bloomfilter is a domain registration and configuration API that uses [x402](https://www.x402.org/) for payments. Point your AI agent at the Bloomfilter API, give it a wallet with some USDC, and it can autonomously search, register, and configure domains.

No login, no credit card, no dashboard. Just HTTP requests and a crypto wallet.

This MCP server wraps the Bloomfilter API so that any MCP-compatible client (Claude Desktop, Cursor, Windsurf, custom agents, etc.) can use it as a tool provider.

## Quick Start

```bash
BLOOMFILTER_PRIVATE_KEY=0x... npx @bloomfilter/mcp-server
```

The server communicates over stdio (JSON-RPC). It's meant to be launched by an MCP client, not run standalone.

## Configuration

Add this JSON to your MCP client's config file:

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

### Config file location by client

| Client                                                                                    | Config file                           |
| ----------------------------------------------------------------------------------------- | ------------------------------------- |
| [Claude Desktop](https://claude.ai/download)                                              | `claude_desktop_config.json`          |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview)                    | `~/.claude/settings.json`             |
| [Cursor](https://cursor.com)                                                              | `.cursor/mcp.json`                    |
| [Windsurf](https://windsurf.com)                                                          | `~/.codeium/windsurf/mcp_config.json` |
| [VS Code + Copilot](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) | `.vscode/mcp.json`                    |
| [Cline](https://docs.cline.bot/mcp/configuring-mcp-servers)                               | Via Cline MCP settings UI             |
| [JetBrains IDEs](https://www.jetbrains.com/help/ai-assistant/mcp.html)                    | Settings > Tools > AI Assistant > MCP |

Any MCP-compatible client that supports stdio servers will work.

### Environment variables

| Variable                  | Required            | Default                       | Description                                                          |
| ------------------------- | ------------------- | ----------------------------- | -------------------------------------------------------------------- |
| `BLOOMFILTER_PRIVATE_KEY` | For paid operations | -                             | EVM private key (hex). Used for x402 payments and wallet-based auth. |
| `BLOOMFILTER_API_URL`     | No                  | `https://api.bloomfilter.xyz` | API base URL.                                                        |

Without a private key, only `search_domains` and `get_pricing` work. Everything else requires a wallet.

## Tools

The server exposes 10 tools:

### Free (no wallet needed)

- **`search_domains`:** Check if a domain is available and get pricing. Searches across multiple TLDs at once.
- **`get_pricing`:** Get registration, renewal, and transfer pricing for one or all supported TLDs.

### Authenticated (wallet required)

- **`get_domain_info`:** Get details about a registered domain: status, expiry, nameservers, lock state.
- **`register_domain`:** Register a new domain. Pays with USDC via x402 automatically. Handles async provisioning.
- **`renew_domain`:** Extend a domain registration. Same x402 payment flow.
- **`get_account`:** View wallet address, domain count, total spent.

### DNS Management (wallet required, $0.10 USDC per mutation)

- **`list_dns_records`:** List all DNS records for a domain.
- **`add_dns_record`:** Add a DNS record (A, AAAA, CNAME, MX, TXT, NS, SRV, CAA, FORWARD).
- **`update_dns_record`:** Update an existing DNS record by ID.
- **`delete_dns_record`:** Delete a DNS record by ID.

## How Payments Work

Bloomfilter uses the [x402 protocol](https://www.x402.org/), an HTTP-native payment standard. When a tool triggers a paid API call, the server handles payment negotiation automatically:

1. The API responds with HTTP 402 and a payment requirement
2. The MCP server signs a USDC payment with your wallet
3. The API verifies the payment and completes the request

All payments are in USDC on Base (an Ethereum L2). You need USDC in the wallet corresponding to your private key.

## Authentication

The server authenticates with the Bloomfilter API using SIWE (Sign-In With Ethereum). This happens automatically on the first authenticated tool call. No setup needed beyond providing your private key.

## Documentation

Full API reference and guides at [docs.bloomfilter.xyz](https://docs.bloomfilter.xyz).

## Building from Source

```bash
git clone https://github.com/BloomFilter-Labs/mcp-server-bloomfilter.git
cd mcp-server-bloomfilter
npm install
npm run build
```

Requires Node.js 20+.

## License

MIT

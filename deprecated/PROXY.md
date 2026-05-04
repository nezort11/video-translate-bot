# Telegram Proxy Documentation & Troubleshooting

This document tracks the proxy requirements for the `video-translate-bot` and the results of various proxy tests conducted to resolve connectivity issues between the worker service and Telegram's MTProto API (GramJS).

## ⚠️ Critical Requirement: Direct IPv4 Support

The Telegram library used by this bot, **GramJS**, communicates directly with Telegram's Data Center (DC) IP addresses via MTProto. For a proxy to work with this bot, it **MUST** support connecting to raw IPv4 addresses.

Most "Shared" or "IPV6" proxies only allow domain-based connections via remote DNS (masquerading as HTTPS traffic), which will **NOT** work for this application.

---

## ✅ Successful Proxies

### Provider: [CyberYozh](https://cyberyozh.com/)

| Proxy Type | Region | ISP | Result | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Residential Static** | USA | CenturyLink | ✅ **SUCCESS** | Bypassed all blocks. Requires 'Remote DNS' (`socks5h`). |

---

## 🚫 Tested Proxies & Failure Log

### Provider: [PROXY6](https://proxy6.net/)

| Proxy Type | Region | Result | Reason for Failure |
| :--- | :--- | :--- | :--- |
| **IPv6 Proxy** | N/A | ❌ FAILED | **Incompatible protocol.** GramJS requires direct IPv4 mapping to Telegram DCs. |
| **Standard IPv4 (Shared)** | Kazakhstan | ❌ FAILED | **Provider Block.** The proxy itself works for Google/web, but the provider explicitly blocks connections to Telegram IPs. |
| **Standard IPv4 (Shared)** | Japan | ❌ FAILED | **IP/Port Firewall.** The proxy times out when attempting to connect to raw Telegram DC IPs, likely due to provider-side security filters. |
| **MTProto Proxy** | USA | ❌ FAILED | **Library Limitation.** This proxy used "Fake-TLS" (secret starting with `ee`). GramJS only supports standard or `dd`-prefixed MTProto secrets. |

---

## ✅ Recommendations for New Proxies

When purchasing a new proxy to fix connectivity, look for these specific features:

1.  **"Dedicated" or "Mobile" over "Shared":** Shared proxies are almost always blacklisted by Telegram or restricted by the provider.
2.  **Explicit Telegram Support:** Choose providers that market their proxies specifically for Telegram bots or MTProto.
3.  **SOCKS5 with Direct IP:** Ensure the provider allows connections to any IP, not just domain names.
4.  **Local VPS (Best Option):** Renting a small Linux VPS in Europe (e.g., Amsterdam or Frankfurt) and setting up your own SOCKS5 proxy (using Dante or 3X-UI) is the most reliable long-term solution.

## 🛠 How to Test a Proxy
Before applying a proxy to the bot, test it from the terminal:

```bash
# Test if the proxy can reach Telegram's API domain
curl -v -x socks5://USER:PASS@IP:PORT https://api.telegram.org

# Test if the proxy can reach a raw Telegram DC IP (Critical for GramJS)
curl -v -x socks5://USER:PASS@IP:PORT 149.154.167.91:80
```

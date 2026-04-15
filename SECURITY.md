# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| Latest  | Yes       |

DubGrid is a proprietary SaaS application. Only the latest deployed version receives security updates.

## Reporting a Vulnerability

If you discover a security vulnerability in DubGrid, please report it responsibly:

1. **Email:** Send a detailed report to **security@dubgrid.com**
2. **Include:** Description of the vulnerability, steps to reproduce, potential impact, and any suggested fixes
3. **Do NOT** open a public GitHub issue for security vulnerabilities

### What to Expect

- **Acknowledgment:** Within 48 hours of your report
- **Assessment:** We will evaluate the severity and impact within 5 business days
- **Resolution:** Critical vulnerabilities are prioritized for immediate patching
- **Disclosure:** We follow coordinated disclosure — we will work with you on a timeline before any public disclosure

## Security Architecture

DubGrid implements defense-in-depth security:

- **Edge Middleware** — JWT verification and role-based route guards at the CDN edge
- **Custom JWT Claims** — Role and org context baked into signed tokens
- **Row-Level Security (RLS)** — Database-enforced org isolation on every table
- **Rate Limiting** — Upstash Redis-backed rate limits on all public API endpoints

For full details, see [RBAC_SYSTEM_DESIGN.md](RBAC_SYSTEM_DESIGN.md).

## Operational Security

- [Secret Rotation Runbook](docs/secrets-rotation.md)
- [Cookie & GDPR Compliance](docs/cookies-and-gdpr.md)

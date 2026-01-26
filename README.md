# Discord Server Manager

A Discord bot and API for managing game server provisioning via Ansible.

## Project Structure

```
discord-server-manager/
├── apps/
│   ├── discord-bot/     # Discord bot (discord.js)
│   └── api/             # Fastify API + job queue
├── packages/
│   └── shared/          # Shared types and utilities
├── ansible/
│   ├── playbooks/       # Game-specific playbooks
│   ├── roles/           # Reusable Ansible roles
│   └── inventory/       # Inventory templates
```

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Ansible (for server provisioning)

## Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Build all packages:
   ```bash
   pnpm build
   ```

3. Configure environment variables:
   - Copy `.env.example` to `.env` in each app directory
   - Set required values (DISCORD_TOKEN, etc.)

## Development

Run all apps in development mode:
```bash
pnpm dev
```

Run type checking across all packages:
```bash
pnpm typecheck
```

## Packages

- **@discord-server-manager/shared** - Shared types, constants, and utilities
- **@discord-server-manager/discord-bot** - Discord bot for user interactions
- **@discord-server-manager/api** - REST API and job queue for server provisioning

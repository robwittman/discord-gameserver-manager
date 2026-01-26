# Future Work

## In Progress: End-to-End Testing

Ready to test but needs configuration:

### API Server (`apps/api/.env`)
```bash
# Required
HOST_EXTERNAL=<your-public-ip>
HOST_INTERNAL=<internal-ip>
PROXMOX_HOST=https://<proxmox-ip>:8006
PROXMOX_TOKEN_ID=<user>@pam!<token-name>
PROXMOX_TOKEN_SECRET=<token-secret>
PROXMOX_BASE_IMAGE_VMID=<cloud-image-vm-id>
PROXMOX_SSH_PUBLIC_KEY="ssh-ed25519 ..."
PROXMOX_VLAN_TAG=<your-vlan>  # if needed
```

### Discord Bot (`apps/discord-bot/.env`)
```bash
DISCORD_TOKEN=<bot-token>  # Note: variable name is DISCORD_TOKEN, not DISCORD_BOT_TOKEN
API_URL=http://localhost:3000
DEPLOY_COMMANDS=true
```

### Proxmox Setup Required
1. Create API token in Proxmox (Datacenter > Permissions > API Tokens)
2. Import a cloud image as base VM (see `docs/PROXMOX_SETUP.md`)
3. Ensure qemu-guest-agent is installed in the image (or via cloud-init snippet)

### To Test
```bash
# Terminal 1
cd apps/api && pnpm dev

# Terminal 2
cd apps/discord-bot && pnpm dev
```

---

## Nice-to-Have Features

### Discord Bot Enhancements
- [ ] Discord notifications when jobs complete (provision finished, server started, etc.)
- [ ] Autocomplete for server names in slash commands
- [ ] Server config editing via Discord modals (game-specific settings)
- [ ] Pagination for server list when there are many servers

### API Improvements
- [ ] API authentication (JWT or API keys)
- [ ] Rate limiting
- [ ] Webhook notifications for job status changes

### SFTP Access
- [ ] Discord commands for granting/revoking SFTP access (`/server sftp add/remove`)
- [ ] Auto-generate SFTP credentials and DM to user
- [ ] SFTP port allocation from pool

### Additional Games
- [ ] Minecraft (Java Edition)
- [ ] Minecraft (Bedrock Edition)
- [ ] Terraria
- [ ] Factorio
- [ ] Project Zomboid
- [ ] Satisfactory
- [ ] ARK: Survival Evolved

### Infrastructure
- [ ] Unit tests for repositories and services
- [ ] Integration tests for API endpoints
- [ ] CI/CD pipeline
- [ ] Docker containerization
- [ ] Health check improvements (check Ansible connectivity, disk space, etc.)

### Proxmox Integration
The VM provisioning flow:
1. Clone VM from base cloud image
2. Configure cloud-init (user, SSH keys)
3. Start VM
4. Wait for qemu-guest-agent to report IP
5. Set `internalAddress` on server record
6. Run Ansible playbooks against that IP

**Implemented:**
- [x] Proxmox API client (`apps/api/src/services/proxmox.ts`)
- [x] VM lifecycle management (create, start, stop, destroy)
- [x] Cloud-init configuration (user, SSH keys, DNS)
- [x] IP address discovery via qemu-guest-agent
- [x] Integration with job executor (auto-provision VM on server creation)
- [x] Environment-based configuration (no template files required)
- [x] Game-specific resource overrides via `PROXMOX_RESOURCES_<GAME>`
- [x] Setup documentation (`docs/PROXMOX_SETUP.md`)

**Remaining:**
- [ ] Resource pool management (multi-node clusters)
- [ ] Windows VM support (different agent, different provisioning)
- [ ] VM resource scaling after creation (resize disk, add memory)
- [ ] Cloud-init snippets for custom first-boot scripts

### Monitoring & Observability
- [ ] Server resource monitoring (CPU, memory, disk)
- [ ] Player count tracking
- [ ] Uptime statistics
- [ ] Structured logging with log aggregation

### User Experience
- [ ] Web dashboard for server management
- [ ] Scheduled backups
- [ ] Scheduled restarts
- [ ] Server templates (save/load configurations)

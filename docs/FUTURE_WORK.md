# Future Work

## Completed: End-to-End VM Provisioning

### What Works
- Discord bot connects and responds to `/server create` commands
- API creates server records and allocates ports
- Proxmox API clones VM from template, configures cloud-init, starts VM
- Cloud-init snippet installs qemu-guest-agent on first boot
- Guest agent reports IP address to Proxmox
- Provisioning job completes and updates server record with IP

### Next Steps
- [ ] Ansible playbooks to install game server software on the VM
- [ ] Start/stop/restart commands via Discord
- [ ] Server deletion (destroy VM)

### Previous Blocker (Resolved): qemu-guest-agent Installation

The provision job waits for qemu-guest-agent to report the VM's IP address. Without the agent, provisioning times out.

**Options to resolve:**

1. **Fix VLAN 10 routing** (recommended)
   - Configure UDM to give VLAN 10 internet access
   - Then cloud-init can install packages via custom snippet
   - Snippet location: `/var/lib/vz/snippets/gameserver-init.yaml` on Proxmox
   - Enable with: `PROXMOX_CI_CUSTOM_USER_DATA=local:snippets/gameserver-init.yaml`

2. **Pre-install in template**
   ```bash
   # On Proxmox server:
   qm set 9000 --template 0
   qm start 9000
   # Login and: sudo apt install qemu-guest-agent
   qm stop 9000
   qm set 9000 --template 1
   ```

3. **Skip guest agent** (requires code changes)
   - Get IP from DHCP leases or ARP scanning instead
   - More complex, less reliable

### Configuration Reference

**API Server (`apps/api/.env`)**
```bash
HOST_EXTERNAL=74.70.224.53
HOST_INTERNAL=0.0.0.0

PROXMOX_HOST=https://192.168.1.254:8006
PROXMOX_TOKEN_ID=gameservermanager@pve!token
PROXMOX_TOKEN_SECRET=<token-secret>
PROXMOX_NODE=proxmox
PROXMOX_NETWORK_BRIDGE=vmbr1
PROXMOX_STORAGE=vmdata
PROXMOX_VLAN_TAG=10
PROXMOX_BASE_IMAGE_VMID=9000
PROXMOX_SSH_PUBLIC_KEY='ssh-ed25519 ...'
PROXMOX_TIMEOUT_CLONE=300

# Uncomment when VMs have internet access:
# PROXMOX_CI_CUSTOM_USER_DATA=local:snippets/gameserver-init.yaml
```

**Discord Bot (`apps/discord-bot/.env`)**
```bash
DISCORD_TOKEN=<bot-token>
API_URL=http://localhost:3000
DEPLOY_COMMANDS=true
```

### Template Setup (VM 9000)
- Base image: Ubuntu Noble cloud image
- Cloud-init drive: `ide2` (vmdata:vm-9000-cloudinit)
- Boot disk: `scsi0` (vmdata:vm-9000-disk-0)
- Boot order: `scsi0`
- Network: `vmbr1` with VLAN tag 10
- ciuser: `gameserver`
- cipassword: set for console debugging

### Cloud-init Snippet (`/var/lib/vz/snippets/gameserver-init.yaml`)
```yaml
#cloud-config
users:
  - name: gameserver
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    ssh_authorized_keys:
      - <public-key>
package_update: true
packages:
  - qemu-guest-agent
runcmd:
  - systemctl enable qemu-guest-agent
  - systemctl start qemu-guest-agent
```

**Note**: When using `cicustom`, it overrides Proxmox's built-in cloud-init fields, so user/SSH must be in the snippet.

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

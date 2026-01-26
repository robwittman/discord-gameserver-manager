# Proxmox Setup Guide

This guide explains how to set up Proxmox VE for automatic game server provisioning.

## Prerequisites

- Proxmox VE 7.0 or later
- API token with VM creation permissions
- Network configured with DHCP

## 1. Create API Token

1. Go to **Datacenter > Permissions > API Tokens**
2. Click **Add**
3. Select a user (e.g., `root@pam`)
4. Enter a Token ID (e.g., `gameservers`)
5. Uncheck "Privilege Separation" for simplicity (or configure specific permissions)
6. Copy the token secret - you won't see it again

Required permissions (if using privilege separation):
- `VM.Allocate` - Create VMs
- `VM.Clone` - Clone from template
- `VM.Config.*` - Configure VMs
- `VM.PowerMgmt` - Start/stop VMs
- `Datastore.AllocateSpace` - Allocate disk space

## 2. Create Base Cloud Image

Download a cloud image with qemu-guest-agent pre-installed, or install it via cloud-init.

### Option A: Ubuntu Cloud Image (Recommended)

```bash
# SSH into your Proxmox node
ssh root@proxmox

# Download Ubuntu 22.04 cloud image
cd /var/lib/vz/template/iso
wget https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img

# Create a new VM (ID 9000)
qm create 9000 --name ubuntu-cloud --memory 2048 --cores 2 --net0 virtio,bridge=vmbr0

# Import the disk
qm importdisk 9000 jammy-server-cloudimg-amd64.img local-lvm

# Attach the disk
qm set 9000 --scsihw virtio-scsi-pci --scsi0 local-lvm:vm-9000-disk-0

# Add cloud-init drive
qm set 9000 --ide2 local-lvm:cloudinit

# Set boot order
qm set 9000 --boot c --bootdisk scsi0

# Enable QEMU guest agent
qm set 9000 --agent enabled=1

# Convert to template
qm template 9000
```

### Option B: Debian Cloud Image

```bash
# Download Debian 12 cloud image
wget https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-generic-amd64.qcow2

# Create VM and import (same steps as above, using VM ID 9001)
qm create 9001 --name debian-cloud --memory 2048 --cores 2 --net0 virtio,bridge=vmbr0
qm importdisk 9001 debian-12-generic-amd64.qcow2 local-lvm
qm set 9001 --scsihw virtio-scsi-pci --scsi0 local-lvm:vm-9001-disk-0
qm set 9001 --ide2 local-lvm:cloudinit
qm set 9001 --boot c --bootdisk scsi0
qm set 9001 --agent enabled=1
qm template 9001
```

### Installing qemu-guest-agent via Cloud-Init

If your cloud image doesn't have qemu-guest-agent pre-installed, you can install it on first boot using a cloud-init snippet.

1. Create a snippet file on your Proxmox storage:

```bash
# Enable snippets on local storage (if not already enabled)
pvesm set local --content vztmpl,snippets,iso

# Create the user-data snippet
cat > /var/lib/vz/snippets/gameserver-userdata.yaml << 'EOF'
#cloud-config
package_update: true
packages:
  - qemu-guest-agent
runcmd:
  - systemctl enable qemu-guest-agent
  - systemctl start qemu-guest-agent
EOF
```

2. Configure the template to use this snippet:

```bash
qm set 9000 --cicustom "user=local:snippets/gameserver-userdata.yaml"
```

## 3. Configure Environment Variables

Add these to your API server's `.env` file:

```bash
# Proxmox connection
PROXMOX_HOST=https://your-proxmox-ip:8006
PROXMOX_TOKEN_ID=root@pam!gameservers
PROXMOX_TOKEN_SECRET=your-token-secret
PROXMOX_NODE=pve

# Base image VM ID
PROXMOX_BASE_IMAGE_VMID=9000

# SSH key for accessing VMs
PROXMOX_SSH_PUBLIC_KEY="ssh-ed25519 AAAA... your-key"

# Cloud-init user
PROXMOX_CI_USER=gameserver
```

## 4. Network Configuration

Ensure your network is configured for DHCP so new VMs get IP addresses automatically.

If using a specific VLAN or network segment for game servers:

```bash
# Example: Create VM on VLAN 100
qm set 9000 --net0 virtio,bridge=vmbr0,tag=100
```

## 5. Firewall Considerations

If using Proxmox's firewall, ensure:
- Game server ports (27000-27499 by default) are allowed
- SSH port (22) is allowed for Ansible
- QEMU guest agent communication is not blocked

## Troubleshooting

### VM doesn't get IP address
- Check DHCP server is running and has available leases
- Verify network bridge configuration
- Check cloud-init logs: `cat /var/log/cloud-init.log`

### Guest agent not responding
- Verify qemu-guest-agent is installed: `dpkg -l | grep qemu-guest-agent`
- Check service status: `systemctl status qemu-guest-agent`
- Ensure `--agent enabled=1` is set on the VM

### Clone fails
- Check storage has enough space
- Verify API token has VM.Clone permission
- Check Proxmox task log for details

### SSH connection fails
- Verify SSH key is correctly set in PROXMOX_SSH_PUBLIC_KEY
- Check cloud-init completed: `cloud-init status`
- Verify network connectivity to VM IP

# TODO

## Bugs

- [ ] **Orphaned VMs on clone timeout**: When cloning a VM times out, the VM ID is allocated but not stored on the server record (internal address is not set). If provisioning is retried, a new VM is created, orphaning the first one. We should:
  - Store the VM ID immediately after clone starts (before waiting for completion)
  - On retry, check if a VM ID exists and attempt to resume provisioning on that VM
  - Consider adding cleanup logic for orphaned VMs

- [x] **Poor error serialization in job logs**: ~~Errors are logged as `[object Object]` instead of the actual error message.~~ Fixed: `ProxmoxError` now extends `Error` with proper message formatting.

## Configuration

- [ ] Move `.env` files outside of the code directory (e.g., `/etc/discord-server-manager/`) to avoid conflicts during git pull deployments. Update the apps to load from an absolute path or `CONFIG_DIR` environment variable.

## Future Improvements

- [ ] Auto-start server after successful provisioning (queue a `start` job when provision completes)
- [ ] Add health check endpoints for PM2 monitoring
- [ ] Add log rotation configuration
- [ ] Consider adding a web dashboard for server management

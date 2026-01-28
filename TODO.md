# TODO

## Bugs

- [ ] **Orphaned VMs on clone timeout**: When cloning a VM times out, the VM ID is allocated but not stored on the server record (internal address is not set). If provisioning is retried, a new VM is created, orphaning the first one. We should:
  - Store the VM ID immediately after clone starts (before waiting for completion)
  - On retry, check if a VM ID exists and attempt to resume provisioning on that VM
  - Consider adding cleanup logic for orphaned VMs

- [x] **Poor error serialization in job logs**: ~~Errors are logged as `[object Object]` instead of the actual error message.~~ Fixed: `ProxmoxError` now extends `Error` with proper message formatting.

- [x] **Server delete should require ownership**: ~~The DELETE `/servers/:id` endpoint should verify the requester is the server owner before allowing deletion.~~ Fixed: Now requires userId in request body and validates against server.ownerId.

- [x] **Server delete doesn't clean up infrastructure**: ~~The DELETE `/servers/:id` endpoint only removes the database record without deprovisioning the VM or cleaning up port forwarding rules.~~ Fixed: Implemented soft delete with cleanup pipeline - stops server, runs deprovision playbook, deletes UniFi rules, destroys VM, releases ports, then soft deletes.

## Discord Bot Enhancements

- [ ] **Add Discord notifications for job completion**: When start/stop/backup/install-mods jobs are triggered via the Discord bot (not CLI), send a notification to the channel when the job completes successfully or fails. Currently only provisioning jobs notify users.
  - The job already has `notifyChannelId` and `notifyUserId` fields
  - Update `apps/discord-bot/src/commands/server.ts` to pass notification info when queuing start/stop/backup jobs
  - Update `apps/discord-bot/src/interactions/mods.ts` to pass notification info when queuing install-mods jobs
  - Affected jobs: start, stop, backup, install-mods

## Configuration

- [ ] Move `.env` files outside of the code directory (e.g., `/etc/discord-server-manager/`) to avoid conflicts during git pull deployments. Update the apps to load from an absolute path or `CONFIG_DIR` environment variable.

## Game-Specific

- [ ] **Vintage Story: Update LGSM template to include custom mod path**: New Vintage Story servers should automatically have `data/vintsserver/Mods` in their `ModPaths` config so custom mods are loaded without manual configuration.
  - Update `ansible/roles/lgsm/templates/vintsserver-serverconfig.json.j2`

- [ ] **Vintage Story .NET 8 requirement**: LGSM installs .NET 7 but Vintage Story now requires .NET 8. May need manual intervention or a custom playbook task to install .NET 8. See: https://github.com/GameServerManagers/linuxgsm/issues/4818

## Future Improvements

- [ ] Auto-start server after successful provisioning (queue a `start` job when provision completes)
- [ ] Include server ID in provisioning completion notifications (Discord embeds)
- [x] ~~Add `--watch` flag to CLI commands like `servers provision` to automatically stream job output~~ Done: Added to all job-spawning CLI commands
- [ ] Add health check endpoints for PM2 monitoring
- [ ] Add log rotation configuration
- [ ] Consider adding a web dashboard for server management

## Mod System

- [ ] Mod version pinning / game version compatibility checking
- [ ] Automatic mod updates
- [ ] Mod dependency resolution
- [ ] Mod conflict detection

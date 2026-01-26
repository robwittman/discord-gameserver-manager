# Ansible Configuration

This directory contains Ansible playbooks and roles for provisioning game servers.

## Structure

- `playbooks/` - Game-specific playbooks for provisioning different server types
- `roles/` - Reusable Ansible roles (common tasks, game-specific roles)
- `inventory/` - Inventory templates and dynamic inventory scripts

## Usage

Playbooks are executed by the API's job queue when provisioning servers. Each game type has its own playbook that handles installation and configuration.

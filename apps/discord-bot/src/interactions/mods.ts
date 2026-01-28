/**
 * Mod management interactions (buttons, modals, embeds)
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ButtonInteraction,
  ModalSubmitInteraction,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import * as api from "../api/client.js";

// Custom ID prefixes for mod interactions
export const MOD_INTERACTION_PREFIX = "mods:";

/**
 * Parse a mod interaction custom ID
 * Format: mods:<action>:<serverId>[:<extra>]
 */
export function parseModInteractionId(customId: string): {
  action: string;
  serverId: string;
  extra?: string;
} | null {
  if (!customId.startsWith(MOD_INTERACTION_PREFIX)) {
    return null;
  }

  const parts = customId.slice(MOD_INTERACTION_PREFIX.length).split(":");
  if (parts.length < 2) {
    return null;
  }

  const action = parts[0];
  const serverId = parts[1];

  if (!action || !serverId) {
    return null;
  }

  return {
    action,
    serverId,
    extra: parts[2],
  };
}

/**
 * Build the mods display embed with action buttons
 */
export async function buildModsEmbed(
  serverId: string,
  serverName: string,
  gameId: string
): Promise<{ embed: EmbedBuilder; components: ActionRowBuilder<MessageActionRowComponentBuilder>[] }> {
  const modsResult = await api.getServerMods(serverId);

  if (modsResult.error) {
    const embed = new EmbedBuilder()
      .setTitle("Error Loading Mods")
      .setColor(0xff0000)
      .setDescription(`Failed to load mods: ${modsResult.error}`);

    return { embed, components: [] };
  }

  const { mods, modsConfig } = modsResult.data!;

  // Check if game supports mods
  if (!modsConfig?.enabled) {
    const embed = new EmbedBuilder()
      .setTitle(`Mods: ${serverName}`)
      .setColor(0xff6600)
      .setDescription(`The game **${gameId}** does not support mods.`);

    return { embed, components: [] };
  }

  // Build the embed
  const enabledCount = mods.filter((m) => m.enabled).length;
  const embed = new EmbedBuilder()
    .setTitle(`Mods: ${serverName}`)
    .setColor(0x5865f2)
    .setDescription(
      mods.length === 0
        ? "No mods configured. Click **Add Mods** to get started!"
        : `**${mods.length}** mod(s) configured (${enabledCount} enabled)`
    );

  // Add mod source info
  if (modsConfig.repositoryUrl) {
    embed.addFields({
      name: "Mod Repository",
      value: `[${modsConfig.source}](${modsConfig.repositoryUrl})`,
      inline: true,
    });
  }

  if (modsConfig.framework) {
    embed.addFields({
      name: "Framework",
      value: modsConfig.framework.name,
      inline: true,
    });
  }

  // List mods (limit to avoid embed size limits)
  if (mods.length > 0) {
    const modLines = mods.slice(0, 15).map((mod, i) => {
      const status = mod.enabled ? "+" : "-";
      const name = mod.name || mod.id;
      const version = mod.version ? `@${mod.version}` : "";
      return `\`${status}\` **${i + 1}.** ${name}${version}`;
    });

    if (mods.length > 15) {
      modLines.push(`... and ${mods.length - 15} more`);
    }

    embed.addFields({
      name: "Installed Mods",
      value: modLines.join("\n"),
      inline: false,
    });
  }

  if (modsConfig.notes) {
    const firstLine = modsConfig.notes.split("\n")[0];
    if (firstLine) {
      embed.setFooter({ text: firstLine });
    }
  }

  // Build action buttons
  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  // Main action row
  const mainRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${MOD_INTERACTION_PREFIX}add:${serverId}`)
      .setLabel("Add Mods")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("➕"),
    new ButtonBuilder()
      .setCustomId(`${MOD_INTERACTION_PREFIX}install:${serverId}`)
      .setLabel("Install Mods")
      .setStyle(ButtonStyle.Success)
      .setEmoji("📥")
      .setDisabled(mods.length === 0 || enabledCount === 0),
    new ButtonBuilder()
      .setCustomId(`${MOD_INTERACTION_PREFIX}refresh:${serverId}`)
      .setLabel("Refresh")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔄")
  );

  components.push(mainRow);

  // Per-mod action rows (show for first few mods)
  const modsToShow = mods.slice(0, 3);
  for (const [i, mod] of modsToShow.entries()) {
    const modName = (mod.name ?? mod.id).slice(0, 20);

    const modRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${MOD_INTERACTION_PREFIX}toggle:${serverId}:${i}`)
        .setLabel(mod.enabled ? "Disable" : "Enable")
        .setStyle(mod.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${MOD_INTERACTION_PREFIX}remove:${serverId}:${i}`)
        .setLabel(`Remove ${modName}`)
        .setStyle(ButtonStyle.Danger)
    );

    components.push(modRow);
  }

  // If there are more mods, add a clear all button
  if (mods.length > 3) {
    const clearRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${MOD_INTERACTION_PREFIX}clear:${serverId}`)
        .setLabel(`Clear All (${mods.length} mods)`)
        .setStyle(ButtonStyle.Danger)
    );
    components.push(clearRow);
  }

  return { embed, components };
}

/**
 * Build the "Add Mods" modal
 */
export function buildAddModsModal(serverId: string): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`${MOD_INTERACTION_PREFIX}add-submit:${serverId}`)
    .setTitle("Add Mods");

  const modsInput = new TextInputBuilder()
    .setCustomId("mods_input")
    .setLabel("Mod IDs (one per line, optional @version)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("mod-id-here\nanother-mod@1.0.0")
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(2000);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(modsInput);
  modal.addComponents(row);

  return modal;
}

/**
 * Handle the "Add Mods" button click
 */
export async function handleAddModsButton(interaction: ButtonInteraction, serverId: string): Promise<void> {
  const modal = buildAddModsModal(serverId);
  await interaction.showModal(modal);
}

/**
 * Handle the "Add Mods" modal submission
 */
export async function handleAddModsSubmit(
  interaction: ModalSubmitInteraction,
  serverId: string
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const modsInput = interaction.fields.getTextInputValue("mods_input");
  const lines = modsInput
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    await interaction.editReply("No valid mod IDs provided.");
    return;
  }

  // Parse mod entries
  const addedMods: string[] = [];
  const failedMods: string[] = [];

  for (const line of lines) {
    // Parse format: modId or modId@version
    const match = line.match(/^([^@]+)(?:@(.+))?$/);
    if (!match || !match[1]) {
      failedMods.push(`Invalid format: ${line}`);
      continue;
    }

    const modId = match[1].trim();
    const version = match[2]?.trim();

    const result = await api.addServerMod(serverId, {
      id: modId,
      version,
      enabled: true,
    });

    if (result.error) {
      failedMods.push(`${modId}: ${result.error}`);
    } else {
      addedMods.push(modId);
    }
  }

  // Build response
  let response = "";
  if (addedMods.length > 0) {
    response += `**Added ${addedMods.length} mod(s):**\n${addedMods.map((m) => `+ ${m}`).join("\n")}\n\n`;
  }
  if (failedMods.length > 0) {
    response += `**Failed to add ${failedMods.length} mod(s):**\n${failedMods.map((m) => `- ${m}`).join("\n")}\n\n`;
  }

  response += "_Click **Refresh** to update the mod list, then **Install Mods** to apply changes to the server._";

  await interaction.editReply(response);
}

/**
 * Handle the "Install Mods" button click
 */
export async function handleInstallModsButton(
  interaction: ButtonInteraction,
  serverId: string
): Promise<void> {
  await interaction.deferReply();

  // Check permission
  const canManage = await api.canManageServer(serverId, interaction.user.id);
  if (canManage.error || !canManage.data?.canManage) {
    await interaction.editReply("You don't have permission to manage this server.");
    return;
  }

  // Queue the install-mods job
  const result = await api.queueJob(serverId, "install-mods");
  if (result.error) {
    await interaction.editReply(`Failed to start mod installation: ${result.error}`);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("Installing Mods")
    .setColor(0x5865f2)
    .setDescription("The install-mods job has been queued. Your mods will be downloaded and installed on the server.")
    .addFields({ name: "Job ID", value: `\`${result.data!.job.id}\``, inline: false })
    .setFooter({ text: "You'll be notified when the job completes" });

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle the "Refresh" button click
 */
export async function handleRefreshButton(
  interaction: ButtonInteraction,
  serverId: string
): Promise<void> {
  await interaction.deferUpdate();

  // Get server info for the name
  const serverResult = await api.getServer(serverId);
  if (serverResult.error) {
    await interaction.followUp({ content: `Failed to refresh: ${serverResult.error}`, ephemeral: true });
    return;
  }

  const server = serverResult.data!.server;
  const { embed, components } = await buildModsEmbed(serverId, server.name, server.gameId);

  await interaction.editReply({ embeds: [embed], components });
}

/**
 * Handle the "Toggle" (enable/disable) button click
 */
export async function handleToggleButton(
  interaction: ButtonInteraction,
  serverId: string,
  modIndex: number
): Promise<void> {
  await interaction.deferUpdate();

  // Get current mods to find the mod at this index
  const modsResult = await api.getServerMods(serverId);
  if (modsResult.error) {
    await interaction.followUp({ content: `Failed to toggle mod: ${modsResult.error}`, ephemeral: true });
    return;
  }

  const mod = modsResult.data!.mods[modIndex];
  if (!mod) {
    await interaction.followUp({ content: "Mod not found at that index.", ephemeral: true });
    return;
  }

  // Toggle the mod
  const result = await api.toggleServerMod(serverId, mod.id, {
    source: mod.source,
    enabled: !mod.enabled,
  });

  if (result.error) {
    await interaction.followUp({ content: `Failed to toggle mod: ${result.error}`, ephemeral: true });
    return;
  }

  // Refresh the display
  const serverResult = await api.getServer(serverId);
  if (serverResult.data) {
    const server = serverResult.data.server;
    const { embed, components } = await buildModsEmbed(serverId, server.name, server.gameId);
    await interaction.editReply({ embeds: [embed], components });
  }
}

/**
 * Handle the "Remove" button click
 */
export async function handleRemoveButton(
  interaction: ButtonInteraction,
  serverId: string,
  modIndex: number
): Promise<void> {
  await interaction.deferUpdate();

  // Get current mods to find the mod at this index
  const modsResult = await api.getServerMods(serverId);
  if (modsResult.error) {
    await interaction.followUp({ content: `Failed to remove mod: ${modsResult.error}`, ephemeral: true });
    return;
  }

  const mod = modsResult.data!.mods[modIndex];
  if (!mod) {
    await interaction.followUp({ content: "Mod not found at that index.", ephemeral: true });
    return;
  }

  // Remove the mod
  const result = await api.removeServerMod(serverId, mod.id, mod.source);
  if (result.error) {
    await interaction.followUp({ content: `Failed to remove mod: ${result.error}`, ephemeral: true });
    return;
  }

  // Refresh the display
  const serverResult = await api.getServer(serverId);
  if (serverResult.data) {
    const server = serverResult.data.server;
    const { embed, components } = await buildModsEmbed(serverId, server.name, server.gameId);
    await interaction.editReply({ embeds: [embed], components });
  }
}

/**
 * Handle the "Clear All" button click
 */
export async function handleClearButton(
  interaction: ButtonInteraction,
  serverId: string
): Promise<void> {
  await interaction.deferUpdate();

  // Clear all mods
  const result = await api.setServerMods(serverId, []);
  if (result.error) {
    await interaction.followUp({ content: `Failed to clear mods: ${result.error}`, ephemeral: true });
    return;
  }

  // Refresh the display
  const serverResult = await api.getServer(serverId);
  if (serverResult.data) {
    const server = serverResult.data.server;
    const { embed, components } = await buildModsEmbed(serverId, server.name, server.gameId);
    await interaction.editReply({ embeds: [embed], components });
  }
}

/**
 * Main handler for mod button interactions
 */
export async function handleModButtonInteraction(interaction: ButtonInteraction): Promise<boolean> {
  const parsed = parseModInteractionId(interaction.customId);
  if (!parsed) {
    return false;
  }

  const { action, serverId, extra } = parsed;

  // Check permission for most actions
  if (action !== "refresh") {
    const canManage = await api.canManageServer(serverId, interaction.user.id);
    if (canManage.error || !canManage.data?.canManage) {
      await interaction.reply({
        content: "You don't have permission to manage mods on this server.",
        ephemeral: true,
      });
      return true;
    }
  }

  switch (action) {
    case "add":
      await handleAddModsButton(interaction, serverId);
      break;
    case "install":
      await handleInstallModsButton(interaction, serverId);
      break;
    case "refresh":
      await handleRefreshButton(interaction, serverId);
      break;
    case "toggle":
      await handleToggleButton(interaction, serverId, parseInt(extra ?? "0", 10));
      break;
    case "remove":
      await handleRemoveButton(interaction, serverId, parseInt(extra ?? "0", 10));
      break;
    case "clear":
      await handleClearButton(interaction, serverId);
      break;
    default:
      return false;
  }

  return true;
}

/**
 * Main handler for mod modal interactions
 */
export async function handleModModalInteraction(interaction: ModalSubmitInteraction): Promise<boolean> {
  const parsed = parseModInteractionId(interaction.customId);
  if (!parsed) {
    return false;
  }

  const { action, serverId } = parsed;

  switch (action) {
    case "add-submit":
      await handleAddModsSubmit(interaction, serverId);
      break;
    default:
      return false;
  }

  return true;
}

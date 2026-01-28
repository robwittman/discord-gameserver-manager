import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  userMention,
} from "discord.js";
import * as api from "../api/client.js";

export const data = new SlashCommandBuilder()
  .setName("server")
  .setDescription("Manage game servers")
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("Create a new game server")
      .addStringOption((opt) =>
        opt.setName("game").setDescription("The game to create a server for").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("name").setDescription("Name for the server").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("List your servers in this guild")
  )
  .addSubcommand((sub) =>
    sub.setName("games").setDescription("List available games you can create servers for")
  )
  .addSubcommand((sub) =>
    sub
      .setName("info")
      .setDescription("Get server information and connection details")
      .addStringOption((opt) =>
        opt.setName("server").setDescription("Server ID or name").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("start")
      .setDescription("Start a server")
      .addStringOption((opt) =>
        opt.setName("server").setDescription("Server ID or name").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("stop")
      .setDescription("Stop a server")
      .addStringOption((opt) =>
        opt.setName("server").setDescription("Server ID or name").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("backup")
      .setDescription("Create a backup of a server")
      .addStringOption((opt) =>
        opt.setName("server").setDescription("Server ID or name").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("access")
      .setDescription("Manage server access for other users")
      .addStringOption((opt) =>
        opt.setName("server").setDescription("Server ID or name").setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("action")
          .setDescription("Action to perform")
          .setRequired(true)
          .addChoices(
            { name: "List managers", value: "list" },
            { name: "Add manager", value: "add" },
            { name: "Remove manager", value: "remove" }
          )
      )
      .addUserOption((opt) =>
        opt.setName("user").setDescription("User to add/remove (required for add/remove)")
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("delete")
      .setDescription("Delete a server")
      .addStringOption((opt) =>
        opt.setName("server").setDescription("Server ID or name").setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "create":
      return handleCreate(interaction);
    case "list":
      return handleList(interaction);
    case "games":
      return handleGames(interaction);
    case "info":
      return handleInfo(interaction);
    case "start":
      return handleStart(interaction);
    case "stop":
      return handleStop(interaction);
    case "backup":
      return handleBackup(interaction);
    case "access":
      return handleAccess(interaction);
    case "delete":
      return handleDelete(interaction);
    default:
      await interaction.reply({ content: "Unknown subcommand", ephemeral: true });
  }
}

async function handleCreate(interaction: ChatInputCommandInteraction) {
  const gameId = interaction.options.getString("game", true);
  const name = interaction.options.getString("name", true);

  await interaction.deferReply();

  // First verify the game exists
  const gameResult = await api.getGame(gameId);
  if (gameResult.error) {
    await interaction.editReply(`❌ Unknown game: ${gameId}`);
    return;
  }

  // Create the server with basic config
  // Include notification info so we get pinged when provisioning completes
  const result = await api.createServer({
    gameId,
    name,
    config: { serverName: name },
    ownerId: interaction.user.id,
    guildId: interaction.guildId!,
    notifyChannelId: interaction.channelId,
    notifyUserId: interaction.user.id,
  });

  if (result.error) {
    await interaction.editReply(`❌ Failed to create server: ${result.error}`);
    return;
  }

  const server = result.data!.server;
  const job = result.data!.job;

  // Check if port allocation failed (server won't be provisioned yet)
  if (result.data!.portAllocationFailed) {
    const embed = new EmbedBuilder()
      .setTitle("⚠️ Server Created - Awaiting Ports")
      .setColor(0xffa500)
      .setDescription("Your server has been created but port allocation is pending. An admin will assign ports shortly, and provisioning will begin automatically.")
      .addFields(
        { name: "Name", value: server.name, inline: true },
        { name: "Game", value: gameResult.data!.game.name, inline: true },
        { name: "Server ID", value: `\`${server.id}\``, inline: false }
      );

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Server is being provisioned
  const embed = new EmbedBuilder()
    .setTitle("🚀 Server Provisioning Started")
    .setColor(0x5865f2)
    .setDescription(`Your **${gameResult.data!.game.name}** server is being set up. This may take a few minutes.\n\nI'll ping you in this channel when it's ready!`)
    .addFields(
      { name: "Server Name", value: server.name, inline: true },
      { name: "Game", value: gameResult.data!.game.name, inline: true },
      { name: "Status", value: "⏳ Provisioning", inline: true }
    );

  if (job) {
    embed.addFields({ name: "Job ID", value: `\`${job.id}\``, inline: false });
  }

  embed.setFooter({ text: "You'll be notified when provisioning completes" });

  await interaction.editReply({ embeds: [embed] });
}

async function handleList(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const result = await api.listServers({ guildId: interaction.guildId! });

  if (result.error) {
    await interaction.editReply(`❌ Failed to list servers: ${result.error}`);
    return;
  }

  const servers = result.data!.servers;

  if (servers.length === 0) {
    await interaction.editReply("No servers found in this guild. Use `/server create` to create one!");
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🎮 Game Servers")
    .setColor(0x5865f2)
    .setDescription(`Found ${servers.length} server(s) in this guild`);

  for (const server of servers.slice(0, 10)) {
    const statusEmoji = getStatusEmoji(server.status);
    embed.addFields({
      name: `${statusEmoji} ${server.name}`,
      value: `Game: ${server.gameId} | Owner: ${userMention(server.ownerId)}\nID: \`${server.id}\``,
      inline: false,
    });
  }

  if (servers.length > 10) {
    embed.setFooter({ text: `Showing 10 of ${servers.length} servers` });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleGames(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const result = await api.listGames();

  if (result.error) {
    await interaction.editReply(`❌ Failed to list games: ${result.error}`);
    return;
  }

  const games = result.data!.games;

  if (games.length === 0) {
    await interaction.editReply("No games are currently configured.");
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🎮 Available Games")
    .setColor(0x5865f2)
    .setDescription("Use `/server create <game> <name>` to create a server");

  for (const game of games) {
    embed.addFields({
      name: game.name,
      value: `ID: \`${game.id}\`${game.steamAppId ? ` | Steam App: ${game.steamAppId}` : ""}`,
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleInfo(interaction: ChatInputCommandInteraction) {
  const serverQuery = interaction.options.getString("server", true);
  await interaction.deferReply();

  const server = await findServer(serverQuery, interaction.guildId!);
  if (!server) {
    await interaction.editReply(`❌ Server not found: ${serverQuery}`);
    return;
  }

  const [serverResult, connectionResult] = await Promise.all([
    api.getServer(server.id),
    api.getServerConnection(server.id),
  ]);

  if (serverResult.error) {
    await interaction.editReply(`❌ Failed to get server info: ${serverResult.error}`);
    return;
  }

  const serverData = serverResult.data!.server;
  const game = serverResult.data!.game;
  const statusEmoji = getStatusEmoji(serverData.status);

  const embed = new EmbedBuilder()
    .setTitle(`${statusEmoji} ${serverData.name}`)
    .setColor(getStatusColor(serverData.status))
    .addFields(
      { name: "Game", value: game?.name ?? serverData.gameId, inline: true },
      { name: "Status", value: serverData.status, inline: true },
      { name: "Owner", value: userMention(serverData.ownerId), inline: true }
    );

  // Add ports
  if (Object.keys(serverData.allocatedPorts).length > 0) {
    const ports = Object.entries(serverData.allocatedPorts)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    embed.addFields({ name: "Ports", value: ports, inline: true });
  }

  // Add connection info if available
  if (connectionResult.data?.connection) {
    const conn = connectionResult.data.connection;
    embed.addFields({
      name: conn.title,
      value: conn.lines.join("\n") || "No connection info",
      inline: false,
    });
  }

  embed.addFields({ name: "Server ID", value: `\`${serverData.id}\``, inline: false });
  embed.setTimestamp(new Date(serverData.updatedAt));

  await interaction.editReply({ embeds: [embed] });
}

async function handleStart(interaction: ChatInputCommandInteraction) {
  await handleJobAction(interaction, "start", "🚀 Starting server...");
}

async function handleStop(interaction: ChatInputCommandInteraction) {
  await handleJobAction(interaction, "stop", "🛑 Stopping server...");
}

async function handleBackup(interaction: ChatInputCommandInteraction) {
  await handleJobAction(interaction, "backup", "💾 Creating backup...");
}

async function handleJobAction(
  interaction: ChatInputCommandInteraction,
  action: string,
  message: string
) {
  const serverQuery = interaction.options.getString("server", true);
  await interaction.deferReply();

  const server = await findServer(serverQuery, interaction.guildId!);
  if (!server) {
    await interaction.editReply(`❌ Server not found: ${serverQuery}`);
    return;
  }

  // Check permission
  const canManage = await api.canManageServer(server.id, interaction.user.id);
  if (canManage.error || !canManage.data?.canManage) {
    await interaction.editReply("❌ You don't have permission to manage this server.");
    return;
  }

  const result = await api.queueJob(server.id, action);
  if (result.error) {
    await interaction.editReply(`❌ Failed to ${action} server: ${result.error}`);
    return;
  }

  const job = result.data!.job;
  await interaction.editReply(`${message}\nJob ID: \`${job.id}\``);
}

async function handleAccess(interaction: ChatInputCommandInteraction) {
  const serverQuery = interaction.options.getString("server", true);
  const action = interaction.options.getString("action", true);
  const user = interaction.options.getUser("user");

  await interaction.deferReply();

  const server = await findServer(serverQuery, interaction.guildId!);
  if (!server) {
    await interaction.editReply(`❌ Server not found: ${serverQuery}`);
    return;
  }

  // Check permission - only owner can manage access
  if (server.ownerId !== interaction.user.id) {
    await interaction.editReply("❌ Only the server owner can manage access.");
    return;
  }

  switch (action) {
    case "list": {
      const result = await api.getServerManagers(server.id);
      if (result.error) {
        await interaction.editReply(`❌ Failed to get managers: ${result.error}`);
        return;
      }

      const managers = result.data!.managers;
      const embed = new EmbedBuilder()
        .setTitle(`🔐 Server Access: ${server.name}`)
        .setColor(0x5865f2)
        .addFields({
          name: "Owner",
          value: userMention(result.data!.ownerId),
          inline: false,
        });

      if (managers.length > 0) {
        const managerList = managers
          .map((m) => `${userMention(m.userId)} (added by ${userMention(m.grantedBy)})`)
          .join("\n");
        embed.addFields({ name: "Managers", value: managerList, inline: false });
      } else {
        embed.addFields({ name: "Managers", value: "No additional managers", inline: false });
      }

      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case "add": {
      if (!user) {
        await interaction.editReply("❌ Please specify a user to add.");
        return;
      }

      const result = await api.addServerManager(server.id, user.id, interaction.user.id);
      if (result.error) {
        await interaction.editReply(`❌ Failed to add manager: ${result.error}`);
        return;
      }

      await interaction.editReply(`✅ Added ${userMention(user.id)} as a manager of ${server.name}`);
      break;
    }

    case "remove": {
      if (!user) {
        await interaction.editReply("❌ Please specify a user to remove.");
        return;
      }

      const result = await api.removeServerManager(server.id, user.id);
      if (result.error) {
        await interaction.editReply(`❌ Failed to remove manager: ${result.error}`);
        return;
      }

      await interaction.editReply(`✅ Removed ${userMention(user.id)} from ${server.name}`);
      break;
    }
  }
}

async function handleDelete(interaction: ChatInputCommandInteraction) {
  const serverQuery = interaction.options.getString("server", true);
  await interaction.deferReply();

  const server = await findServer(serverQuery, interaction.guildId!);
  if (!server) {
    await interaction.editReply(`❌ Server not found: ${serverQuery}`);
    return;
  }

  // Only owner can delete (also enforced by API)
  if (server.ownerId !== interaction.user.id) {
    await interaction.editReply("❌ Only the server owner can delete this server.");
    return;
  }

  const result = await api.deleteServer(server.id, interaction.user.id);
  if (result.error) {
    await interaction.editReply(`❌ Failed to delete server: ${result.error}`);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🗑️ Server Deletion Started")
    .setColor(0xff6600)
    .setDescription(`Server "${server.name}" is being deleted. This includes cleaning up VMs, port forwarding rules, and other resources.`)
    .addFields({ name: "Job ID", value: `\`${result.data!.job.id}\``, inline: false })
    .setFooter({ text: "The server will be removed once cleanup completes" });

  await interaction.editReply({ embeds: [embed] });
}

// Helper functions

async function findServer(
  query: string,
  guildId: string
): Promise<api.ServerInfo | null> {
  // First try as UUID
  if (query.match(/^[0-9a-f-]{36}$/i)) {
    const result = await api.getServer(query);
    if (result.data?.server.guildId === guildId) {
      return result.data.server;
    }
  }

  // Search by name in guild
  const result = await api.listServers({ guildId });
  if (result.error || !result.data) {
    return null;
  }

  const server = result.data.servers.find(
    (s) => s.name.toLowerCase() === query.toLowerCase() || s.id === query
  );

  return server ?? null;
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case "running":
      return "🟢";
    case "stopped":
      return "🔴";
    case "provisioning":
      return "🟡";
    case "pending":
      return "⏳";
    case "pending_ports":
      return "⚠️";
    case "deleting":
      return "🗑️";
    case "error":
      return "❌";
    default:
      return "❓";
  }
}

function getStatusColor(status: string): number {
  switch (status) {
    case "running":
      return 0x00ff00;
    case "stopped":
      return 0xff0000;
    case "provisioning":
      return 0xffff00;
    case "pending":
    case "pending_ports":
      return 0xffa500;
    case "deleting":
      return 0xff6600;
    case "error":
      return 0xff0000;
    default:
      return 0x808080;
  }
}

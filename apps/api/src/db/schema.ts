import Database from "better-sqlite3";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = join(__dirname, "../../../../data/servers.db");

let db: Database.Database | null = null;

const SCHEMA = `
-- Server instances
CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  config JSON NOT NULL,
  allocated_ports JSON NOT NULL,
  internal_address TEXT,
  vm_id INTEGER,
  vm_node TEXT,
  owner_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Port allocations (for tracking/querying)
CREATE TABLE IF NOT EXISTS port_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  pool TEXT NOT NULL,
  port INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  UNIQUE(pool, port)
);

-- SFTP access grants
CREATE TABLE IF NOT EXISTS sftp_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(server_id, user_id)
);

-- Provisioning jobs
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  logs JSON,
  notify_channel_id TEXT,
  notify_user_id TEXT
);

-- Server managers (users who can manage a server besides the owner)
CREATE TABLE IF NOT EXISTS server_managers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(server_id, user_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_servers_owner ON servers(owner_id);
CREATE INDEX IF NOT EXISTS idx_servers_guild ON servers(guild_id);
CREATE INDEX IF NOT EXISTS idx_servers_game ON servers(game_id);
CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
CREATE INDEX IF NOT EXISTS idx_port_allocations_server ON port_allocations(server_id);
CREATE INDEX IF NOT EXISTS idx_port_allocations_pool ON port_allocations(pool);
CREATE INDEX IF NOT EXISTS idx_sftp_access_server ON sftp_access(server_id);
CREATE INDEX IF NOT EXISTS idx_jobs_server ON jobs(server_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_server_managers_server ON server_managers(server_id);
CREATE INDEX IF NOT EXISTS idx_server_managers_user ON server_managers(user_id);
`;

/**
 * Initialize the database connection and schema
 */
export function initializeDatabase(dbPath?: string): Database.Database {
  const path = dbPath ?? process.env.DATABASE_PATH ?? DEFAULT_DB_PATH;

  db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(SCHEMA);

  // Run migrations for existing databases
  runMigrations(db);

  console.log(`Database initialized at ${path}`);
  return db;
}

/**
 * Run database migrations for schema changes
 */
function runMigrations(database: Database.Database): void {
  // Migration: Add notification columns to jobs table
  const jobsColumns = database.prepare("PRAGMA table_info(jobs)").all() as Array<{ name: string }>;
  const jobColumnNames = jobsColumns.map((c) => c.name);

  if (!jobColumnNames.includes("notify_channel_id")) {
    database.exec("ALTER TABLE jobs ADD COLUMN notify_channel_id TEXT");
    console.log("Migration: Added notify_channel_id column to jobs table");
  }

  if (!jobColumnNames.includes("notify_user_id")) {
    database.exec("ALTER TABLE jobs ADD COLUMN notify_user_id TEXT");
    console.log("Migration: Added notify_user_id column to jobs table");
  }

  // Migration: Add deleted_at column for soft delete
  const serverColumns = database.prepare("PRAGMA table_info(servers)").all() as Array<{ name: string }>;
  const serverColumnNames = serverColumns.map((c) => c.name);

  if (!serverColumnNames.includes("deleted_at")) {
    database.exec("ALTER TABLE servers ADD COLUMN deleted_at TEXT");
    database.exec("CREATE INDEX IF NOT EXISTS idx_servers_deleted ON servers(deleted_at)");
    console.log("Migration: Added deleted_at column to servers table");
  }
}

/**
 * Get the database instance
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

import pg from "pg";
import { 
  INITIAL_INVESTORS, 
  INITIAL_PROJECT_GROUPS, 
  INITIAL_PROJECT_CATEGORIES,
  INITIAL_BUILDING_GRADES,
  INITIAL_PROJECT_STATUSES, 
  INITIAL_PROJECT_STAGES, 
  INITIAL_AGENCIES, 
  INITIAL_FUNDING_SOURCES, 
  INITIAL_STEP_STATUSES, 
  INITIAL_LOCATIONS, 
  INITIAL_PROCESSES, 
  INITIAL_USERS,
  INITIAL_ROLES
} from "../src/data/appData.ts";
import { hashPassword } from "../src/lib/crypto.ts";
import { hashNewPassword, toStoredPassword, isLegacyHash, isScryptHash } from "./passwords.ts";
import { randomBytes } from "crypto";
import type { ProjectStepProgress, ProgressEntry, ProgressSide } from "../src/lib/stepProgress.ts";

// Seed accounts have no password in source. Use SEED_USER_PASSWORD, or a random one printed once.
// Resolved lazily because dotenv is loaded after this module is imported.
let seedUserPassword: string | null = null;
function getSeedUserPassword(): string {
  if (seedUserPassword) return seedUserPassword;
  const fromEnv = (process.env.SEED_USER_PASSWORD || "").trim();
  if (fromEnv) {
    seedUserPassword = fromEnv;
  } else {
    seedUserPassword = randomBytes(9).toString("base64url");
    console.warn(`🔑 SEED_USER_PASSWORD chưa được đặt. Mật khẩu tạm của các tài khoản mẫu (chỉ áp dụng khi DB trống hoặc chế độ In-Memory): ${seedUserPassword}`);
  }
  return seedUserPassword;
}

const { Pool } = pg;

// Define default processes with milestone flags pre-configured for the 7 standard milestone steps
const PROCESSES_WITH_MILESTONES = INITIAL_PROCESSES.map((proc: any) => {
  const parentSteps = (proc.parentSteps || []).map((parent: any) => {
    const name = (parent.shortName || parent.name || '').toLowerCase();
    const isM = name.includes('chủ trương') || 
                name.includes('1/500') || 
                name.includes('giao đất') || 
                name.includes('báo cáo') || 
                name.includes('nghiên cứu khả thi') || 
                name.includes('hạ tầng') || 
                name.includes('pccc') || 
                name.includes('xây dựng') || 
                name.includes('gpxd');
    return {
      ...parent,
      isMilestone: parent.isMilestone !== undefined ? parent.isMilestone : isM
    };
  });
  return {
    ...proc,
    parentSteps
  };
});

// Connection Pool configurations
let pool: any = null;
let isDbConnected = false;
let dbErrorMsg = "";

// In-Memory Fallback State (if database isn't connected)
let memoryStore = {
  // No sample data: when the database is unreachable the app shows nothing rather than fake projects
  projects: [] as any[],
  users: [...INITIAL_USERS] as any[],
  attachments: [] as any[],
  history: [] as any[],
  metadata: {
    investors: INITIAL_INVESTORS,
    projectGroups: INITIAL_PROJECT_GROUPS,
    projectCategories: INITIAL_PROJECT_CATEGORIES,
    buildingGrades: INITIAL_BUILDING_GRADES,
    projectStatuses: INITIAL_PROJECT_STATUSES,
    projectStages: INITIAL_PROJECT_STAGES,
    processingAgencies: INITIAL_AGENCIES,
    fundingSources: INITIAL_FUNDING_SOURCES,
    stepStatuses: INITIAL_STEP_STATUSES,
    locations: INITIAL_LOCATIONS,
    processes: PROCESSES_WITH_MILESTONES,
    roles: INITIAL_ROLES,
  } as Record<string, any[]>,
  emailConfig: {
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    username: "",
    password: "",
    fromEmail: "noreply@example.com",
    fromName: "Hệ thống Quản lý Dự án"
  },
  uploadConfig: {
    allowedExtensions: "JPG,JPEG,PNG,GIF,PDF,DOC,DOCX,XLS,XLSX,ZIP,RAR",
    maxSizeMb: 20
  },
  passwordPolicy: {
    minLength: 6,
    requireUppercase: false,
    requireLowercase: false,
    requireNumbers: false,
    requireSpecialChars: false
  },
  actualProgress: {} as Record<string, any>,
  stepProgress: {} as Record<string, ProjectStepProgress>
};

let lastConnectAttempt = 0;
let isConnecting = false;

function maskConnectionString(urlStr: string | undefined): string {
  if (!urlStr) return "undefined";
  let cleaned = urlStr.replace(/[\r\n]/g, "").trim();
  
  const prefixRegex = /^DATABASE_URL\s*=\s*/i;
  if (prefixRegex.test(cleaned)) {
    cleaned = cleaned.replace(prefixRegex, "").trim();
  }
  
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.substring(1, cleaned.length - 1).trim();
  }
  if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
    cleaned = cleaned.substring(1, cleaned.length - 1).trim();
  }

  try {
    const url = new URL(cleaned);
    if (url.password) {
      url.password = "********";
    }
    return url.toString();
  } catch (e) {
    if (cleaned.length > 25) {
      return cleaned.slice(0, 15) + "..." + cleaned.slice(-10);
    }
    return cleaned;
  }
}

export async function initDatabase(force = false) {
  let connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    // Sanitize any carriage returns, newlines, or extra spaces from raw secrets setup
    connectionString = connectionString.replace(/[\r\n]/g, "").trim();
    
    // Auto-strip leading DATABASE_URL= prefix
    const prefixRegex = /^DATABASE_URL\s*=\s*/i;
    if (prefixRegex.test(connectionString)) {
      connectionString = connectionString.replace(prefixRegex, "").trim();
    }
    
    // Auto-strip surrounding quotes
    if (connectionString.startsWith('"') && connectionString.endsWith('"')) {
      connectionString = connectionString.substring(1, connectionString.length - 1).trim();
    }
    if (connectionString.startsWith("'") && connectionString.endsWith("'")) {
      connectionString = connectionString.substring(1, connectionString.length - 1).trim();
    }
  }

  const hasDbConfig = !!(
    connectionString ||
    process.env.PGHOST ||
    process.env.PGDATABASE
  );

  const isPlaceholder = !connectionString || connectionString.includes("MY_DATABASE_URL") || connectionString.trim() === "";
  const hasConfig = hasDbConfig && !isPlaceholder;

  if (!hasConfig) {
    dbErrorMsg = "PostgreSQL environment variables (DATABASE_URL) are not configured or still have default placeholders.";
    console.log("ℹ️ PostgreSQL database connection parameters not configured. Running in resilient In-Memory Fallback mode.");
    return { isDbConnected: false, mode: "In-Memory Fallback", error: dbErrorMsg };
  }

  if (isDbConnected && !force) {
    return { isDbConnected: true, mode: "PostgreSQL Database" };
  }

  if (isConnecting) {
    return { isDbConnected: false, mode: "Connecting...", error: "Connection attempt already in progress." };
  }

  const now = Date.now();
  // Throttle connection attempts to once every 10 seconds, unless forced
  if (!force && lastConnectAttempt > 0 && now - lastConnectAttempt < 10000) {
    return { isDbConnected: isDbConnected, mode: isDbConnected ? "PostgreSQL Database" : "In-Memory Fallback", error: `Reconnection throttled. Please wait before retrying. Last error: ${dbErrorMsg}` };
  }

  lastConnectAttempt = now;
  isConnecting = true;

  try {
    // Clean up old pool if it exists
    if (pool) {
      try {
        await pool.end();
      } catch (e) {
        // ignore
      }
      pool = null;
    }

    // Log target host/port for visual diagnosis (masking password)
    let connectionLogTarget = "unknown";
    let sanitizedUrl = connectionString;

    if (connectionString) {
      try {
        const urlObj = new URL(connectionString);
        connectionLogTarget = `${urlObj.hostname}:${urlObj.port || '5432'} (Database: ${urlObj.pathname.slice(1)})`;
        
        // Strip sslmode from query parameters so pg query parser doesn't conflict/override our rejectUnauthorized config
        urlObj.searchParams.delete("sslmode");
        sanitizedUrl = urlObj.toString();
      } catch (e) {
        connectionLogTarget = connectionString.substring(0, 40) + "...";
      }
    } else {
      connectionLogTarget = `${process.env.PGHOST}:${process.env.PGPORT || '5432'} (Database: ${process.env.PGDATABASE})`;
    }

    console.log(`🔌 Attempting to connect to PostgreSQL database: ${connectionLogTarget}`);

    // Determine if connecting to a local database (localhost or 127.0.0.1)
     let isLocalConnection = false;
    let sslModeDisable = false;
   if (connectionString) {
      try {
        const urlObj = new URL(connectionString);
        isLocalConnection = urlObj.hostname === "localhost" || urlObj.hostname === "127.0.0.1";
        sslModeDisable = urlObj.searchParams.get("sslmode") === "disable";
      } catch (e) {}
    } else {
      const dbHost = process.env.PGHOST || "";
      isLocalConnection = dbHost === "localhost" || dbHost === "127.0.0.1";
    }

    const sslConfig = (isLocalConnection || sslModeDisable) ? false : { rejectUnauthorized: false };

    // Self-signed Postgres certificates are accepted through sslConfig above, for this connection only.
    // Do NOT set NODE_TLS_REJECT_UNAUTHORIZED=0: that disables certificate checks for every outgoing
    // HTTPS/TLS connection in the process (SMTP, external APIs…).

    const config: any = connectionString
      ? {
          connectionString: sanitizedUrl,
          connectionTimeoutMillis: 15000, // 15 seconds to allow cold-started serverless databases to wake up
          max: 5, // Reduce pool size to avoid "too many clients" errors
          idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
          ssl: sslConfig
        }
      : {
          host: process.env.PGHOST,
          user: process.env.PGUSER,
          password: process.env.PGPASSWORD,
          database: process.env.PGDATABASE,
          port: process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432,
          connectionTimeoutMillis: 15000,
          max: 5, // Reduce pool size to avoid "too many clients" errors
          idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
          ssl: sslConfig
        };

    pool = new Pool(config);

    // Test query to verify connection
    const client = await pool.connect();
    try {
      isDbConnected = true;
      dbErrorMsg = "";
      console.log(`✅ Successfully connected to PostgreSQL database at ${connectionLogTarget}!`);

      // Run Table Initializations
      await bootstrapTables();
    } finally {
      client.release();
    }

    isConnecting = false;
    return { isDbConnected: true, mode: "PostgreSQL Database" };
  } catch (err: any) {
    isDbConnected = false;
    isConnecting = false;
    dbErrorMsg = err.message || "Unknown error";
    console.log(`⚠️ PostgreSQL connection timed out or is unreachable (${dbErrorMsg}). Falling back to resilient In-Memory mode.`);
    return { isDbConnected: false, mode: "In-Memory Fallback", error: dbErrorMsg };
  }
}

async function bootstrapTables() {
  if (!isDbConnected || !pool) return;

  try {
    // 1. Create app_metadata table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_metadata (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL
      );
    `);

    // 2. Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id VARCHAR(100) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        role_id VARCHAR(100),
        user_type VARCHAR(100),
        agency_id VARCHAR(100),
        investor_id VARCHAR(100),
        avatar TEXT
      );
    `);

    // Add username column if not exists and update existing rows if empty
    await pool.query(`
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS username VARCHAR(255);
    `);
    await pool.query(`
      UPDATE app_users 
      SET username = SPLIT_PART(email, '@', 1) 
      WHERE username IS NULL OR username = '';
    `);

    // Add phone column if not exists
    await pool.query(`
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone VARCHAR(100);
    `);

    // Add is_follower column if not exists
    await pool.query(`
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_follower BOOLEAN DEFAULT FALSE;
    `);

    // Add must_change_password column if not exists
    await pool.query(`
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS department TEXT DEFAULT '';
    `);

    // 3. Create projects table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id VARCHAR(100) PRIMARY KEY,
        code VARCHAR(100) NOT NULL,
        name TEXT NOT NULL,
        investor TEXT,
        location TEXT,
        total_area DOUBLE PRECISION,
        height INTEGER,
        apartment_count INTEGER,
        progress INTEGER,
        status TEXT,
        project_group TEXT,
        building_grade TEXT,
        project_category TEXT,
        current_step TEXT,
        parent_step TEXT,
        child_step TEXT,
        start_date VARCHAR(100),
        end_date VARCHAR(100),
        deadline VARCHAR(100),
        stage VARCHAR(100),
        is_key_project BOOLEAN,
        is_public_investment BOOLEAN,
        process_id VARCHAR(100),
        chutruong_cdt_date VARCHAR(100),
        chutruong_nn_date VARCHAR(100),
        qh1500_cdt_date VARCHAR(100),
        qh1500_nn_date VARCHAR(100),
        qdgiaodat_cdt_date VARCHAR(100),
        qdgiaodat_nn_date VARCHAR(100),
        pccc_cdt_date VARCHAR(100),
        pccc_nn_date VARCHAR(100),
        htkt_dtm_cdt_date VARCHAR(100),
        htkt_dtm_nn_date VARCHAR(100),
        baocaonckt_cdt_date VARCHAR(100),
        baocaonckt_nn_date VARCHAR(100),
        gpxaydung_cdt_date VARCHAR(100),
        gpxaydung_nn_date VARCHAR(100),
        progress_status_2026 TEXT,
        milestones JSONB DEFAULT '{}'::jsonb
      );
    `);

    // Migration to ensure columns are TEXT if they existed as VARCHAR
    const colsToText = ['investor', 'location', 'status', 'project_group', 'building_grade', 'project_category', 'current_step', 'parent_step', 'child_step'];
    for (const col of colsToText) {
      await pool.query(`
        DO $$
        BEGIN
            ALTER TABLE projects ALTER COLUMN ${col} TYPE TEXT;
        EXCEPTION WHEN OTHERS THEN
        END;
        $$;
      `);
    }

    // Migration for existing table
    await pool.query(`
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS milestones JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS extra JSONB DEFAULT '{}'::jsonb;
    `);

    // 3.5. Create project_actual_progress table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_actual_progress (
        project_id VARCHAR(100) PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        data JSONB NOT NULL
      );
    `);

    // 3.6. Progress per process step and side (cdt = chủ đầu tư, nn = cơ quan xử lý). Single source of
    // the plan / actual dates; the milestone view is computed from it (src/lib/stepProgress.ts).
    // step_key is a child step id, or "ms:<mốc>" for a milestone no procedure of the process is linked to.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_progress (
        project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        step_key TEXT NOT NULL,
        side VARCHAR(10) NOT NULL,
        plan_date VARCHAR(10),
        actual_date VARCHAR(10),
        expected_date VARCHAR(10),
        status TEXT,
        note TEXT,
        attachments JSONB DEFAULT '[]'::jsonb,
        next_step_ids JSONB,
        source VARCHAR(20),
        updated_by TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (project_id, step_key, side)
      );
    `);
    // plan_source = 'auto': plan_date computed when the previous step closed (may be recomputed / reset)
    await pool.query(`ALTER TABLE project_progress ADD COLUMN IF NOT EXISTS plan_source VARCHAR(10);`);

    // 4. Create 9 distinct name-only category tables
    await pool.query(`CREATE TABLE IF NOT EXISTS db_investors (name TEXT PRIMARY KEY);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS db_project_groups (name TEXT PRIMARY KEY);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS db_project_categories (name TEXT PRIMARY KEY);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS db_building_grades (name TEXT PRIMARY KEY);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS db_project_statuses (name TEXT PRIMARY KEY);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS db_project_stages (name TEXT PRIMARY KEY);`);
    await pool.query(`ALTER TABLE db_project_stages ADD COLUMN IF NOT EXISTS milestones TEXT;`);
    await pool.query(`ALTER TABLE db_project_stages ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;`);
    await pool.query(`CREATE TABLE IF NOT EXISTS db_funding_sources (name TEXT PRIMARY KEY);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS db_step_statuses (name TEXT PRIMARY KEY);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS db_roles (name TEXT PRIMARY KEY);`);

    // 5. Create 3 complex object-based category tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS db_processing_agencies (
        id VARCHAR(100) PRIMARY KEY,
        name TEXT NOT NULL,
        display_order INTEGER,
        departments JSONB NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS db_locations (
        id SERIAL PRIMARY KEY,
        ward TEXT NOT NULL,
        old_area TEXT NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS db_processes (
        id VARCHAR(100) PRIMARY KEY,
        name TEXT NOT NULL,
        parent_steps JSONB NOT NULL
      );
    `);

    // 6. Create project_attachments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_attachments (
        id SERIAL PRIMARY KEY,
        project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        size TEXT NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 7. Create project_history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_history (
        id SERIAL PRIMARY KEY,
        project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_name VARCHAR(255) NOT NULL,
        action_type VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        old_status VARCHAR(100),
        new_status VARCHAR(100)
      );
    `);

    // 8. Create email_config table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_config (
        id VARCHAR(50) PRIMARY KEY,
        host VARCHAR(255) NOT NULL,
        port INTEGER NOT NULL,
        secure BOOLEAN NOT NULL,
        username VARCHAR(255),
        password VARCHAR(255),
        from_email VARCHAR(255) NOT NULL,
        from_name VARCHAR(255) NOT NULL
      );
    `);

    // 9. Create upload_config table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS upload_config (
        id VARCHAR(50) PRIMARY KEY,
        allowed_extensions VARCHAR(255) NOT NULL,
        max_size_mb INTEGER NOT NULL
      );
    `);

    // 10. Create password_policy table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_policy (
        id VARCHAR(50) PRIMARY KEY,
        min_length INTEGER NOT NULL DEFAULT 6,
        require_uppercase BOOLEAN NOT NULL DEFAULT FALSE,
        require_lowercase BOOLEAN NOT NULL DEFAULT FALSE,
        require_numbers BOOLEAN NOT NULL DEFAULT FALSE,
        require_special_chars BOOLEAN NOT NULL DEFAULT FALSE
      );
    `);

    console.log("✅ PostgreSQL schema tables bootstrapped successfully.");

    // Seed database if empty
    await seedDatabaseIfEmpty();
  } catch (error) {
    console.error("❌ Failed to bootstrap databases tables: ", error);
  }
}

async function seedDatabaseIfEmpty() {
  if (!isDbConnected || !pool) return;

  try {
    // Check metadata count and seed app_metadata for compatibility
    const metadataCountRes = await pool.query("SELECT COUNT(*) FROM app_metadata;");
    const hasMetadata = parseInt(metadataCountRes.rows[0].count) > 0;

    if (!hasMetadata) {
      console.log("🌱 Database app_metadata is empty. Seeding defaults...");
      const metadataKeys = Object.keys(memoryStore.metadata);
      for (const key of metadataKeys) {
        await pool.query(
          "INSERT INTO app_metadata (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
          [key, JSON.stringify(memoryStore.metadata[key])]
        );
      }
      console.log("🌱 Seeded app_metadata lists successfully.");
    }

    // Users live only in app_users; drop the legacy copy (it may hold client-sent plaintext passwords)
    await pool.query("DELETE FROM app_metadata WHERE key = 'users'");

    // Seed simple name-only category tables
    const simpleSeeds = [
      { table: "db_investors", data: INITIAL_INVESTORS },
      { table: "db_project_groups", data: INITIAL_PROJECT_GROUPS },
      { table: "db_project_categories", data: INITIAL_PROJECT_CATEGORIES },
      { table: "db_building_grades", data: INITIAL_BUILDING_GRADES },
      { table: "db_project_statuses", data: INITIAL_PROJECT_STATUSES },
      { table: "db_funding_sources", data: INITIAL_FUNDING_SOURCES },
      { table: "db_step_statuses", data: INITIAL_STEP_STATUSES },
      { table: "db_roles", data: INITIAL_ROLES }
    ];

    for (const seed of simpleSeeds) {
      const countRes = await pool.query(`SELECT COUNT(*) FROM ${seed.table};`);
      if (parseInt(countRes.rows[0].count) === 0) {
        console.log(`🌱 Seeding empty individual table ${seed.table}...`);
        for (const val of seed.data) {
          await pool.query(`INSERT INTO ${seed.table} (name) VALUES ($1) ON CONFLICT DO NOTHING`, [val]);
        }
      }
    }

    // Seed db_project_stages with milestones
    const stagesCountRes = await pool.query(`SELECT COUNT(*) FROM db_project_stages;`);
    if (parseInt(stagesCountRes.rows[0].count) === 0) {
      console.log(`🌱 Seeding empty table db_project_stages with milestones...`);
      for (const item of INITIAL_PROJECT_STAGES) {
        const name = typeof item === 'string' ? item : (item.name || '');
        const milestones = typeof item === 'string' ? [] : (item.milestones || []);
        await pool.query(
          `INSERT INTO db_project_stages (name, milestones) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [name, JSON.stringify(milestones)]
        );
      }
    }

    // Seed db_processing_agencies
    const agencyCountRes = await pool.query("SELECT COUNT(*) FROM db_processing_agencies;");
    if (parseInt(agencyCountRes.rows[0].count) === 0) {
      console.log("🌱 Seeding db_processing_agencies...");
      for (const agency of INITIAL_AGENCIES) {
        await pool.query(
          `INSERT INTO db_processing_agencies (id, name, display_order, departments) 
           VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
          [agency.id, agency.name, agency.displayOrder, JSON.stringify(agency.departments)]
        );
      }
    }

    // Seed db_locations
    const locCountRes = await pool.query("SELECT COUNT(*) FROM db_locations;");
    if (parseInt(locCountRes.rows[0].count) === 0) {
      console.log("🌱 Seeding db_locations...");
      for (const loc of INITIAL_LOCATIONS) {
        await pool.query(
          `INSERT INTO db_locations (ward, old_area) VALUES ($1, $2)`,
          [loc.ward, loc.oldArea]
        );
      }
    }

    // Seed db_processes
    const procCountRes = await pool.query("SELECT COUNT(*) FROM db_processes;");
    if (parseInt(procCountRes.rows[0].count) === 0) {
      console.log("🌱 Seeding db_processes...");
      for (const proc of PROCESSES_WITH_MILESTONES) {
        await pool.query(
          `INSERT INTO db_processes (id, name, parent_steps) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
          [proc.id, proc.name, JSON.stringify(proc.parentSteps)]
        );
      }
    } else {
      // Ensure existing records are migrated to include explicit isMilestone fields if undefined
      const currentProcsRes = await pool.query("SELECT * FROM db_processes;");
      for (const row of currentProcsRes.rows) {
        let changed = false;
        const parentSteps = (row.parent_steps || []).map((parent: any) => {
          if (parent.isMilestone === undefined) {
            const name = (parent.shortName || parent.name || '').toLowerCase();
            const isM = name.includes('chủ trương') || 
                        name.includes('1/500') || 
                        name.includes('giao đất') || 
                        name.includes('báo cáo') || 
                        name.includes('nghiên cứu khả thi') || 
                        name.includes('hạ tầng') || 
                        name.includes('pccc') || 
                        name.includes('xây dựng') || 
                        name.includes('gpxd');
            changed = true;
            return {
              ...parent,
              isMilestone: isM
            };
          }
          return parent;
        });
        if (changed) {
          await pool.query(
            "UPDATE db_processes SET parent_steps = $1 WHERE id = $2",
            [JSON.stringify(parentSteps), row.id]
          );
        }
      }
    }

    // Check users count
    const usersCountRes = await pool.query("SELECT COUNT(*) FROM app_users;");
    const hasUsers = parseInt(usersCountRes.rows[0].count) > 0;

    if (!hasUsers) {
      console.log("🌱 Database app_users is empty. Seeding defaults...");
      for (const uRaw of INITIAL_USERS) {
        const u = uRaw as any;
        let uPass = u.password || getSeedUserPassword();
        uPass = toStoredPassword(uPass);
        await pool.query(`
          INSERT INTO app_users (id, email, password, full_name, role_id, user_type, agency_id, investor_id, avatar, username, phone, is_follower, department)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (id) DO NOTHING
        `, [
          u.id, u.email, uPass, u.fullName, u.roleId, u.userType, u.agencyId, u.investorId, u.avatar || "", u.username || "", u.phone || "", !!u.isFollower, u.department || ""
        ]);
      }
      console.log("🌱 Seeded app_users successfully.");
    }

    // Projects, actual progress, attachments and history are NEVER seeded: they only ever come from
    // real data entered in the system (no sample projects that could be mistaken for real ones).

    // Seed upload_config
    const uploadConfigCountRes = await pool.query("SELECT COUNT(*) FROM upload_config;");
    if (parseInt(uploadConfigCountRes.rows[0].count) === 0) {
      console.log("🌱 Database upload_config is empty. Seeding defaults...");
      await pool.query(
        "INSERT INTO upload_config (id, allowed_extensions, max_size_mb) VALUES ('default', $1, $2)",
        [memoryStore.uploadConfig.allowedExtensions, memoryStore.uploadConfig.maxSizeMb]
      );
      console.log("🌱 Seeded default upload_config successfully.");
    }

    // Seed password_policy
    const passwordPolicyCountRes = await pool.query("SELECT COUNT(*) FROM password_policy;");
    if (parseInt(passwordPolicyCountRes.rows[0].count) === 0) {
      console.log("🌱 Database password_policy is empty. Seeding defaults...");
      await pool.query(
        "INSERT INTO password_policy (id, min_length, require_uppercase, require_lowercase, require_numbers, require_special_chars) VALUES ('default', $1, $2, $3, $4, $5)",
        [memoryStore.passwordPolicy.minLength, memoryStore.passwordPolicy.requireUppercase, memoryStore.passwordPolicy.requireLowercase, memoryStore.passwordPolicy.requireNumbers, memoryStore.passwordPolicy.requireSpecialChars]
      );
      console.log("🌱 Seeded default password_policy successfully.");
    }

  } catch (error) {
    console.error("❌ Seeding database failed: ", error);
  }
}

// --- DB Operations: PROJECTS ---

export const PROJECT_EXTRA_FIELDS = [
  'implementationPlan',
  'stepStatuses',
  'totalInvestment',
  'landStatus',
  'fundingSource',
  'follower',
  'currentAgency',
  'currentStepId',
  'processSteps',
  'completion_date',
  'completionDate',
  'notes',
  'legalStatus',
  'planningStatus',
  'constructionStatus'
] as const;

// Parse a JSON text column into an array; invalid content is logged and treated as empty
function parseJsonArray(value: any, label: string): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(`⚠️ Invalid JSON in ${label}, ignored`);
    return [];
  }
}

// Parse a JSON(B) column value into an object; invalid content is logged and treated as empty
function parseJsonObject(value: any, label: string): Record<string, any> {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || value.trim() === '') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    console.error(`⚠️ Invalid JSON in ${label}, ignored`);
    return {};
  }
}

export function extractProjectExtra(p: any): Record<string, any> {
  const extra: Record<string, any> = {};
  if (!p || typeof p !== 'object') return extra;

  // p.extra is the stale copy the client got from GET; apply it first so the
  // top-level fields the user just edited win. Only whitelisted keys are kept.
  if (p.extra && typeof p.extra === 'object') {
    for (const field of PROJECT_EXTRA_FIELDS) {
      if (p.extra[field] !== undefined) {
        extra[field] = p.extra[field];
      }
    }
  }

  for (const field of PROJECT_EXTRA_FIELDS) {
    if (p[field] !== undefined) {
      extra[field] = p[field];
    }
  }

  return extra;
}

// A row of the projects table as the app reads it (also used by scripts/migrate-progress.ts)
export function projectFromRow(row: any, files: any[] = []): any {
  // One corrupted row must not take down the whole project list
  const extraData = parseJsonObject(row.extra, `projects.extra (${row.id})`);
  return {
    ...extraData,
    id: row.id,
    code: row.code,
    name: row.name,
    investor: row.investor,
    location: row.location,
    totalArea: row.total_area,
    height: row.height,
    apartmentCount: row.apartment_count,
    progress: row.progress,
    status: row.status,
    projectGroup: row.project_group,
    buildingGrade: row.building_grade,
    projectCategory: row.project_category,
    currentStep: row.current_step,
    parentStep: row.parent_step,
    childStep: row.child_step,
    startDate: row.start_date,
    endDate: row.end_date,
    deadline: row.deadline,
    stage: row.stage,
    isKeyProject: row.is_key_project,
    isPublicInvestment: row.is_public_investment,
    processId: row.process_id,
    chutruong_cdt_date: row.chutruong_cdt_date,
    chutruong_nn_date: row.chutruong_nn_date,
    qh1500_cdt_date: row.qh1500_cdt_date,
    qh1500_nn_date: row.qh1500_nn_date,
    qdgiaodat_cdt_date: row.qdgiaodat_cdt_date,
    qdgiaodat_nn_date: row.qdgiaodat_nn_date,
    pccc_cdt_date: row.pccc_cdt_date,
    pccc_nn_date: row.pccc_nn_date,
    htkt_dtm_cdt_date: row.htkt_dtm_cdt_date,
    htkt_dtm_nn_date: row.htkt_dtm_nn_date,
    baocaonckt_cdt_date: row.baocaonckt_cdt_date,
    baocaonckt_nn_date: row.baocaonckt_nn_date,
    gpxaydung_cdt_date: row.gpxaydung_cdt_date,
    gpxaydung_nn_date: row.gpxaydung_nn_date,
    progress_status_2026: row.progress_status_2026,
    milestones: row.milestones || {},
    files,
    extra: extraData
  };
}

export async function dbGetProjects(): Promise<any[]> {
  if (isDbConnected && pool) {
    const res = await pool.query("SELECT * FROM projects ORDER BY length(id), id");
    const attsRes = await pool.query("SELECT id, project_id as \"projectId\", name, size, file_type as \"fileType\", created_at as \"createdAt\" FROM project_attachments ORDER BY id DESC");
    
    const attachmentsMap: Record<string, any[]> = {};
    attsRes.rows.forEach((row: any) => {
      const pid = row.projectId;
      if (!attachmentsMap[pid]) {
        attachmentsMap[pid] = [];
      }
      attachmentsMap[pid].push({
        id: String(row.id),
        name: row.name,
        type: row.fileType,
        size: row.size,
        date: row.createdAt ? new Date(row.createdAt).toLocaleDateString('vi-VN') : ''
      });
    });

    return res.rows.map((row: any) => projectFromRow(row, attachmentsMap[row.id] || []));
  }

  return memoryStore.projects.map((p: any) => {
    const files = memoryStore.attachments
      .filter(att => att.projectId === p.id)
      .map(row => ({
        id: String(row.id),
        name: row.name,
        type: row.fileType,
        size: row.size,
        date: row.createdAt ? new Date(row.createdAt).toLocaleDateString('vi-VN') : ''
      }));
    return {
      ...p,
      files: files.length > 0 ? files : (p.files || [])
    };
  });
}

export function toNumOrNull(val: any, fieldName = "Giá trị số"): number | null {
  if (val === undefined || val === null || val === '') return null;
  const str = String(val).trim();
  if (str === '') return null;
  const num = Number(str);
  if (isNaN(num)) {
    const err: any = new Error(`${fieldName} phải là số (${val})`);
    err.statusCode = 400;
    throw err;
  }
  if (num < 0) {
    const err: any = new Error(`${fieldName} không được âm (${val})`);
    err.statusCode = 400;
    throw err;
  }
  return num;
}

export function toIntOrNull(val: any, fieldName = "Số nguyên"): number | null {
  if (val === undefined || val === null || val === '') return null;
  const str = String(val).trim();
  if (str === '') return null;
  const num = Number(str);
  if (isNaN(num)) {
    const err: any = new Error(`${fieldName} phải là số (${val})`);
    err.statusCode = 400;
    throw err;
  }
  if (num < 0) {
    const err: any = new Error(`${fieldName} không được âm (${val})`);
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isInteger(num)) {
    const err: any = new Error(`${fieldName} phải là số nguyên, không chấp nhận số thập phân (${val})`);
    err.statusCode = 400;
    throw err;
  }
  return num;
}

export async function dbCreateProject(p: any): Promise<any> {
  const newId = p.id || Math.random().toString(36).substr(2, 9);

  const totalAreaVal = toNumOrNull(p.totalArea ?? p.total_area, "Diện tích");
  const heightVal = toIntOrNull(p.height, "Tầng cao / Chiều cao");
  const apartmentCountVal = toIntOrNull(p.apartmentCount ?? p.apartment_count, "Số lượng căn hộ");
  const progressVal = toIntOrNull(p.progress, "Tiến độ") ?? 0;
  const extraVal = extractProjectExtra(p);

  const enrichedProject = { 
    ...p, 
    ...extraVal,
    id: newId,
    totalArea: totalAreaVal,
    height: heightVal,
    apartmentCount: apartmentCountVal,
    progress: progressVal,
    extra: extraVal
  };

  if (isDbConnected && pool) {
    await pool.query(`
      INSERT INTO projects (
        id, code, name, investor, location, total_area, height, apartment_count, 
        progress, status, project_group, building_grade, project_category, 
        current_step, parent_step, child_step, start_date, end_date, deadline, 
        stage, is_key_project, is_public_investment, process_id, 
        chutruong_cdt_date, chutruong_nn_date, qh1500_cdt_date, qh1500_nn_date, 
        qdgiaodat_cdt_date, qdgiaodat_nn_date, pccc_cdt_date, pccc_nn_date, 
        htkt_dtm_cdt_date, htkt_dtm_nn_date, baocaonckt_cdt_date, baocaonckt_nn_date, 
        gpxaydung_cdt_date, gpxaydung_nn_date, progress_status_2026, milestones, extra
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40)
    `, [
      newId, p.code || "", p.name || "", p.investor || "", p.location || "", totalAreaVal, heightVal, apartmentCountVal,
      progressVal, p.status || "", p.projectGroup || "", p.buildingGrade || "", p.projectCategory || "",
      p.currentStep || "", p.parentStep || "", p.childStep || "", p.startDate || "", p.endDate || "", p.deadline || "",
      p.stage || "", !!p.isKeyProject, !!p.isPublicInvestment, p.processId || "",
      p.chutruong_cdt_date || "", p.chutruong_nn_date || "", p.qh1500_cdt_date || "", p.qh1500_nn_date || "",
      p.qdgiaodat_cdt_date || "", p.qdgiaodat_nn_date || "", p.pccc_cdt_date || "", p.pccc_nn_date || "",
      p.htkt_dtm_cdt_date || "", p.htkt_dtm_nn_date || "", p.baocaonckt_cdt_date || "", p.baocaonckt_nn_date || "",
      p.gpxaydung_cdt_date || "", p.gpxaydung_nn_date || "", p.progress_status_2026 || "", JSON.stringify(p.milestones || {}),
      JSON.stringify(extraVal)
    ]);

    const pdata = {
      'chutruong': { cdtDate: '', nnDate: '' },
      'qh1500': { cdtDate: '', nnDate: '' },
      'giaodat': { cdtDate: '', nnDate: '' },
      'htkt': { cdtDate: '', nnDate: '' },
      'bcnckt': { cdtDate: '', nnDate: '' },
      'pccc': { cdtDate: '', nnDate: '' },
      'gpxd': { cdtDate: '', nnDate: '' }
    };
    await pool.query(
      `INSERT INTO project_actual_progress (project_id, data) VALUES ($1, $2) ON CONFLICT (project_id) DO NOTHING`,
      [newId, JSON.stringify(pdata)]
    );

    return enrichedProject;
  }

  memoryStore.projects.push(enrichedProject);
  return enrichedProject;
}

export async function dbUpdateProject(id: string, p: any): Promise<any> {
  const totalAreaVal = toNumOrNull(p.totalArea ?? p.total_area, "Diện tích");
  const heightVal = toIntOrNull(p.height, "Tầng cao / Chiều cao");
  const apartmentCountVal = toIntOrNull(p.apartmentCount ?? p.apartment_count, "Số lượng căn hộ");
  const progressVal = toIntOrNull(p.progress, "Tiến độ") ?? 0;
  const extraVal = extractProjectExtra(p);

  if (isDbConnected && pool) {
    await pool.query(`
      UPDATE projects SET 
        code = $1, name = $2, investor = $3, location = $4, total_area = $5, height = $6, apartment_count = $7, 
        progress = $8, status = $9, project_group = $10, building_grade = $11, project_category = $12, 
        current_step = $13, parent_step = $14, child_step = $15, start_date = $16, end_date = $17, deadline = $18, 
        stage = $19, is_key_project = $20, is_public_investment = $21, process_id = $22, 
        chutruong_cdt_date = $23, chutruong_nn_date = $24, qh1500_cdt_date = $25, qh1500_nn_date = $26, 
        qdgiaodat_cdt_date = $27, qdgiaodat_nn_date = $28, pccc_cdt_date = $29, pccc_nn_date = $30, 
        htkt_dtm_cdt_date = $31, htkt_dtm_nn_date = $32, baocaonckt_cdt_date = $33, baocaonckt_nn_date = $34, 
        gpxaydung_cdt_date = $35, gpxaydung_nn_date = $36, progress_status_2026 = $37, milestones = $38,
        extra = COALESCE(extra, '{}'::jsonb) || $39::jsonb
      WHERE id = $40
    `, [
      p.code, p.name, p.investor, p.location, totalAreaVal, heightVal, apartmentCountVal,
      progressVal, p.status, p.projectGroup, p.buildingGrade, p.projectCategory,
      p.currentStep, p.parentStep, p.childStep, p.startDate, p.endDate, p.deadline,
      p.stage, !!p.isKeyProject, !!p.isPublicInvestment, p.processId,
      p.chutruong_cdt_date, p.chutruong_nn_date, p.qh1500_cdt_date, p.qh1500_nn_date,
      p.qdgiaodat_cdt_date, p.qdgiaodat_nn_date, p.pccc_cdt_date, p.pccc_nn_date,
      p.htkt_dtm_cdt_date, p.htkt_dtm_nn_date, p.baocaonckt_cdt_date, p.baocaonckt_nn_date,
      p.gpxaydung_cdt_date, p.gpxaydung_nn_date, p.progress_status_2026, JSON.stringify(p.milestones || {}),
      JSON.stringify(extraVal),
      id
    ]);

    return { ...p, ...extraVal, id, totalArea: totalAreaVal, height: heightVal, apartmentCount: apartmentCountVal, progress: progressVal, extra: { ...(p.extra || {}), ...extraVal } };
  }

  memoryStore.projects = memoryStore.projects.map(item => item.id === id ? { ...item, ...p, ...extraVal, totalArea: totalAreaVal, height: heightVal, apartmentCount: apartmentCountVal, progress: progressVal, extra: { ...(item.extra || {}), ...extraVal } } : item);
  return { ...memoryStore.projects.find(item => item.id === id) };
}

export async function dbDeleteProject(id: string): Promise<boolean> {
  if (isDbConnected && pool) {
    await pool.query("DELETE FROM projects WHERE id = $1", [id]);
    return true;
  }
  const lengthBefore = memoryStore.projects.length;
  memoryStore.projects = memoryStore.projects.filter(item => item.id !== id);
  if (Array.isArray(memoryStore.attachments)) {
    memoryStore.attachments = memoryStore.attachments.filter(att => att.projectId !== id);
  }
  if (memoryStore.actualProgress && memoryStore.actualProgress[id]) {
    delete memoryStore.actualProgress[id];
  }
  if (memoryStore.stepProgress && memoryStore.stepProgress[id]) {
    delete memoryStore.stepProgress[id];
  }
  return memoryStore.projects.length < lengthBefore;
}

// --- DB Operations: METADATA ---

const metadataTableMap: Record<string, { table: string; parseRow: (row: any) => any }> = {
  investors: {
    table: "db_investors",
    parseRow: (r) => r.name,
  },
  projectGroups: {
    table: "db_project_groups",
    parseRow: (r) => r.name,
  },
  projectCategories: {
    table: "db_project_categories",
    parseRow: (r) => r.name,
  },
  buildingGrades: {
    table: "db_building_grades",
    parseRow: (r) => r.name,
  },
  projectStatuses: {
    table: "db_project_statuses",
    parseRow: (r) => r.name,
  },
  projectStages: {
    table: "db_project_stages",
    parseRow: (r) => r.name,
  },
  fundingSources: {
    table: "db_funding_sources",
    parseRow: (r) => r.name,
  },
  stepStatuses: {
    table: "db_step_statuses",
    parseRow: (r) => r.name,
  },
  roles: {
    table: "db_roles",
    parseRow: (r) => r.name,
  }
};

export async function dbGetMetadata(key: string): Promise<any[]> {
  if (isDbConnected && pool) {
    try {
      if (key === "processingAgencies") {
        const res = await pool.query("SELECT * FROM db_processing_agencies ORDER BY display_order ASC");
        return res.rows.map((row: any) => ({
          id: row.id,
          name: row.name,
          displayOrder: row.display_order,
          departments: row.departments
        }));
      }
      if (key === "locations") {
        const res = await pool.query("SELECT * FROM db_locations ORDER BY id ASC");
        return res.rows.map((row: any) => ({
          ward: row.ward,
          oldArea: row.old_area
        }));
      }
      if (key === "processes") {
        const res = await pool.query("SELECT * FROM db_processes ORDER BY id ASC");
        return res.rows.map((row: any) => ({
          id: row.id,
          name: row.name,
          parentSteps: row.parent_steps || []
        }));
      }
      
      if (key === "projectStages") {
        const res = await pool.query("SELECT * FROM db_project_stages ORDER BY display_order ASC");
        // The client orders stages by sortOrder, the table stores display_order: expose both
        return res.rows.map((row: any) => ({
          name: row.name,
          milestones: parseJsonArray(row.milestones, `db_project_stages.milestones (${row.name})`),
          displayOrder: row.display_order,
          sortOrder: row.display_order
        }));
      }
      
      const config = metadataTableMap[key];
      if (config) {
        const res = await pool.query(`SELECT * FROM ${config.table} ORDER BY name ASC`);
        return res.rows.map(config.parseRow);
      }
    } catch (err) {
      console.error(`Error querying key ${key} from separate tables`, err);
    }
  }
  if (key === "locations") {
    const agencies = memoryStore.metadata.processingAgencies || [];
    const list: any[] = [];
    for (const agency of agencies) {
      const depts = agency.departments || [];
      for (const dept of depts) {
        list.push({
          ward: dept,
          oldArea: agency.name
        });
      }
    }
    return list;
  }
  return memoryStore.metadata[key] || [];
}

export async function dbUpdateMetadata(key: string, rawList: any): Promise<any[]> {
  if (key === "users") {
    // Users must go through /api/users CRUD (per-field authorization); bulk replace is disabled.
    const err: any = new Error("Không hỗ trợ cập nhật danh sách người dùng qua metadata. Vui lòng dùng /api/users.");
    err.statusCode = 400;
    throw err;
  }

  let list: any[] = [];
  if (Array.isArray(rawList)) {
    list = rawList;
  } else if (rawList && typeof rawList === 'object') {
    const foundArray = Object.values(rawList).find(val => Array.isArray(val));
    if (foundArray) {
      list = foundArray as any[];
    } else {
      list = Object.keys(rawList).length > 0 ? [rawList] : [];
    }
  } else if (typeof rawList === 'string') {
    try {
      const parsed = JSON.parse(rawList);
      if (Array.isArray(parsed)) {
        list = parsed;
      } else if (parsed && typeof parsed === 'object') {
        const foundArray = Object.values(parsed).find(val => Array.isArray(val));
        if (foundArray) {
          list = foundArray as any[];
        } else {
          list = [parsed];
        }
      }
    } catch (e) {}
  }

  if (isDbConnected && pool) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      
      // Keep app_metadata in sync for backward compatibility
      await client.query(
        "INSERT INTO app_metadata (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [key, JSON.stringify(list)]
      );

      if (key === "processingAgencies") {
        await client.query("DELETE FROM db_processing_agencies");
        for (const agency of list) {
          await client.query(
            `INSERT INTO db_processing_agencies (id, name, display_order, departments) 
             VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order, departments = EXCLUDED.departments`,
            [agency.id || Math.random().toString(36).substr(2, 9), agency.name, agency.displayOrder || 0, JSON.stringify(agency.departments || [])]
          );
        }
      } else if (key === "locations") {
        await client.query("DELETE FROM db_locations");
        for (const loc of list) {
          await client.query(
            `INSERT INTO db_locations (ward, old_area) VALUES ($1, $2)`,
            [loc.ward, loc.oldArea]
          );
        }
      } else if (key === "processes") {
        await client.query("DELETE FROM db_processes");
        for (const proc of list) {
          await client.query(
            `INSERT INTO db_processes (id, name, parent_steps) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, parent_steps = EXCLUDED.parent_steps`,
            [proc.id || Math.random().toString(36).substr(2, 9), proc.name, JSON.stringify(proc.parentSteps || [])]
          );
        }
      } else if (key === "users") {
        console.log("🔄 Synchronizing users table with safe smart replication...");
        // 1. Fetch current users in the DB
        const existingUsersRes = await client.query("SELECT * FROM app_users");
        const liveUsers = existingUsersRes.rows.map((row: any) => ({
          id: row.id,
          email: row.email,
          password: row.password,
          fullName: row.full_name,
          phone: row.phone || "",
          roleId: row.role_id,
          userType: row.user_type,
          agencyId: row.agency_id,
          investorId: row.investor_id,
          avatar: row.avatar,
          username: row.username || row.email?.split('@')[0] || "",
          isFollower: !!row.is_follower
        }));

        const liveMap = new Map<string, any>();
        liveUsers.forEach(u => liveMap.set(u.id, u));

        const incomingUsers = list;
        for (const u of incomingUsers) {
          validateUserUniqueness(u, incomingUsers, u.id);
        }
        const incomingIds = new Set(incomingUsers.map((u: any) => u.id));

        // Detect created and updated users (Do not automatically delete unlisted users to avoid wiping users created concurrently)
        const createdUsers: any[] = [];
        const updatedUsers: any[] = [];

        for (const u of incomingUsers) {
          const live = liveMap.get(u.id);
          if (!live) {
            createdUsers.push(u);
          } else {
            const hasChanged = 
              (u.email || "").trim().toLowerCase() !== (live.email || "").trim().toLowerCase() ||
              (u.phone || "").trim() !== (live.phone || "").trim() ||
              (u.fullName || "") !== (live.fullName || "") ||
              (u.username || "").trim().toLowerCase() !== (live.username || "").trim().toLowerCase() ||
              (u.roleId || "") !== (live.roleId || "") ||
              (u.userType || "") !== (live.userType || "") ||
              (u.agencyId || "") !== (live.agencyId || "") ||
              (u.investorId || "") !== (live.investorId || "") ||
              (u.avatar || "") !== (live.avatar || "") ||
              !!u.isFollower !== !!live.isFollower;
            
            if (hasChanged) {
              updatedUsers.push({ incoming: u, live });
            }
          }
        }

        // Apply creates
        for (const u of createdUsers) {
          validateUserUniqueness(u, liveUsers);

          let uPass = u.password || "123456";
          const isStoredHashed = uPass.length === 64 && /^[0-9a-f]{64}$/i.test(uPass);
          if (!isStoredHashed) {
            uPass = hashPassword(uPass.trim());
          }
          await client.query(`
            INSERT INTO app_users (id, email, password, full_name, role_id, user_type, agency_id, investor_id, avatar, username, phone, is_follower, department)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `, [
            u.id, u.email, uPass, u.fullName || "", u.roleId || "", u.userType || "", u.agencyId || "", u.investorId || "", u.avatar || "", u.username || "", u.phone || "", !!u.isFollower, u.department || ""
          ]);
        }

        // Apply updates
        for (const { incoming: u, live } of updatedUsers) {
          validateUserUniqueness(u, liveUsers, u.id);

          let uPass = u.password || live.password || "123456";
          const isStoredHashed = uPass.length === 64 && /^[0-9a-f]{64}$/i.test(uPass);
          if (!isStoredHashed) {
            uPass = hashPassword(uPass.trim());
          }
          await client.query(`
            UPDATE app_users SET 
              email = $1, password = $2, full_name = $3, role_id = $4, user_type = $5, agency_id = $6, investor_id = $7, avatar = $8, username = $9, phone = $10, is_follower = $11
            WHERE id = $12
          `, [
            u.email, uPass, u.fullName || "", u.roleId || "", u.userType || "", u.agencyId || "", u.investorId || "", u.avatar || "", u.username || "", u.phone || "", !!u.isFollower, u.id
          ]);
        }
      } else if (key === "projectStages") {
        await client.query("DELETE FROM db_project_stages");
        for (const [idx, item] of list.entries()) {
          const name = typeof item === 'string' ? item : (item.name || '');
          const milestones = typeof item === 'string' ? [] : (item.milestones || []);
          // Accept the client's sortOrder (the stage screen edits that field) as well as displayOrder
          const rawOrder = typeof item === 'string' ? undefined : (item.sortOrder ?? item.displayOrder);
          const displayOrder = Number.isFinite(Number(rawOrder)) && rawOrder !== '' && rawOrder !== null ? Number(rawOrder) : idx + 1;
          await client.query(
            `INSERT INTO db_project_stages (name, milestones, display_order) VALUES ($1, $2, $3) ON CONFLICT (name) DO UPDATE SET milestones = EXCLUDED.milestones, display_order = EXCLUDED.display_order`,
            [name, JSON.stringify(milestones), displayOrder]
          );
        }
      } else {
        const config = metadataTableMap[key];
        if (config) {
          await client.query(`DELETE FROM ${config.table}`);
          for (const val of list) {
            await client.query(
              `INSERT INTO ${config.table} (name) VALUES ($1) ON CONFLICT DO NOTHING`,
              [val]
            );
          }
        }
      }
      
      await client.query("COMMIT");
      return list;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`Error updating key ${key} in separate tables`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  if (key === "users") {
    for (const u of list) {
      validateUserUniqueness(u, list, u.id);
    }

    const userMap = new Map<string, any>();
    memoryStore.users.forEach(u => userMap.set(u.id, u));
    list.forEach(u => {
      let uPass = u.password || userMap.get(u.id)?.password || "123456";
      const isStoredHashed = uPass.length === 64 && /^[0-9a-f]{64}$/i.test(uPass);
      if (!isStoredHashed) {
        uPass = hashPassword(uPass.trim());
      }
      userMap.set(u.id, { ...(userMap.get(u.id) || {}), ...u, password: uPass });
    });
    memoryStore.users = Array.from(userMap.values());
  }

  memoryStore.metadata[key] = list;
  return list;
}

export async function dbRenameInvestor(oldName: string, newName: string): Promise<void> {
  const trimmedOld = (oldName || '').trim();
  const trimmedNew = (newName || '').trim();
  if (!trimmedOld || !trimmedNew || trimmedOld === trimmedNew) return;

  if (isDbConnected && pool) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE projects SET investor = $1 WHERE investor = $2", [trimmedNew, trimmedOld]);
      await client.query("UPDATE app_users SET investor_id = $1 WHERE investor_id = $2", [trimmedNew, trimmedOld]);
      await client.query("UPDATE db_investors SET name = $1 WHERE name = $2", [trimmedNew, trimmedOld]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return;
  }

  // Memory fallback
  memoryStore.projects.forEach(p => {
    if (p.investor === trimmedOld) p.investor = trimmedNew;
  });
  memoryStore.users.forEach(u => {
    if (u.investorId === trimmedOld) u.investorId = trimmedNew;
  });
  const invs = memoryStore.metadata.investors || [];
  const idx = invs.indexOf(trimmedOld);
  if (idx !== -1) invs[idx] = trimmedNew;
}

// Catalogs whose values projects store as plain text: column in `projects`, or key inside `extra`
export const CATALOG_PROJECT_FIELDS: Record<string, { field: string; column?: string; extraKey?: string; label: string }> = {
  projectGroups: { field: 'projectGroup', column: 'project_group', label: 'Nhóm dự án' },
  projectCategories: { field: 'projectCategory', column: 'project_category', label: 'Phân loại dự án' },
  buildingGrades: { field: 'buildingGrade', column: 'building_grade', label: 'Cấp công trình' },
  fundingSources: { field: 'fundingSource', extraKey: 'fundingSource', label: 'Nguồn vốn' },
};

// Rename a catalog value and every project that uses it, so a rename never orphans projects
export async function dbRenameCatalogValue(key: string, oldName: string, newName: string): Promise<void> {
  const cfg = CATALOG_PROJECT_FIELDS[key];
  const trimmedOld = (oldName || '').trim();
  const trimmedNew = (newName || '').trim();
  if (!cfg || !trimmedOld || !trimmedNew || trimmedOld === trimmedNew) return;

  if (isDbConnected && pool) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (cfg.column) {
        await client.query(`UPDATE projects SET ${cfg.column} = $1 WHERE ${cfg.column} = $2`, [trimmedNew, trimmedOld]);
      } else if (cfg.extraKey) {
        await client.query(
          `UPDATE projects SET extra = jsonb_set(COALESCE(extra, '{}'::jsonb), $3::text[], to_jsonb($1::text)) WHERE extra->>$4 = $2`,
          [trimmedNew, trimmedOld, [cfg.extraKey], cfg.extraKey]
        );
      }
      const table = metadataTableMap[key]?.table;
      if (table) {
        await client.query(`UPDATE ${table} SET name = $1 WHERE name = $2`, [trimmedNew, trimmedOld]);
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return;
  }

  // Memory fallback
  memoryStore.projects.forEach((p: any) => {
    if (p[cfg.field] === trimmedOld) p[cfg.field] = trimmedNew;
    if (p.extra && p.extra[cfg.field] === trimmedOld) p.extra[cfg.field] = trimmedNew;
  });
  const list = memoryStore.metadata[key] || [];
  const idx = list.indexOf(trimmedOld);
  if (idx !== -1) list[idx] = trimmedNew;
}

export async function dbRenameAgency(oldName: string, newName: string, agencyId?: string): Promise<void> {
  const trimmedOld = (oldName || '').trim();
  const trimmedNew = (newName || '').trim();
  if (!trimmedOld || !trimmedNew || trimmedOld === trimmedNew) return;

  if (isDbConnected && pool) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (agencyId) {
        await client.query("UPDATE db_processing_agencies SET name = $1 WHERE id = $2", [trimmedNew, agencyId]);
      } else {
        await client.query("UPDATE db_processing_agencies SET name = $1 WHERE name = $2", [trimmedNew, trimmedOld]);
      }
      // Process steps and projects reference the agency by NAME: rename them too, otherwise the
      // agency's users stop seeing/editing their projects (server matches step agency by name)
      const procRes = await client.query("SELECT id, parent_steps FROM db_processes");
      for (const row of procRes.rows) {
        const { steps, changed } = renameAgencyInSteps(row.parent_steps || [], trimmedOld, trimmedNew);
        if (changed) {
          await client.query("UPDATE db_processes SET parent_steps = $1 WHERE id = $2", [JSON.stringify(steps), row.id]);
        }
      }
      await client.query(
        "UPDATE projects SET extra = jsonb_set(COALESCE(extra, '{}'::jsonb), '{currentAgency}', to_jsonb($1::text)) WHERE extra->>'currentAgency' = $2",
        [trimmedNew, trimmedOld]
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return;
  }

  // Memory fallback
  const agencies = memoryStore.metadata.processingAgencies || [];
  agencies.forEach((a: any) => {
    if (agencyId && a.id === agencyId) a.name = trimmedNew;
    else if (a.name === trimmedOld) a.name = trimmedNew;
  });
  memoryStore.metadata.processes = (memoryStore.metadata.processes || []).map((proc: any) => ({
    ...proc,
    parentSteps: renameAgencyInSteps(proc.parentSteps || [], trimmedOld, trimmedNew).steps
  }));
  memoryStore.projects.forEach((p: any) => {
    if (p.currentAgency === trimmedOld) p.currentAgency = trimmedNew;
    if (p.extra && p.extra.currentAgency === trimmedOld) p.extra.currentAgency = trimmedNew;
  });
}

// Replace an agency name wherever a process references it (parent step or child step)
export function renameAgencyInSteps(parentSteps: any[], oldName: string, newName: string): { steps: any[]; changed: boolean } {
  let changed = false;
  const rename = (step: any) => {
    if (step && step.agency === oldName) {
      changed = true;
      return { ...step, agency: newName };
    }
    return step;
  };
  const steps = (Array.isArray(parentSteps) ? parentSteps : []).map((ps: any) => {
    const renamedParent = rename(ps);
    return Array.isArray(renamedParent?.childSteps)
      ? { ...renamedParent, childSteps: renamedParent.childSteps.map(rename) }
      : renamedParent;
  });
  return { steps, changed };
}

export async function dbGetAllMetadata(): Promise<Record<string, any[]>> {
  if (isDbConnected && pool) {
    const result: Record<string, any[]> = {};
    const keys = Object.keys(memoryStore.metadata);
    for (const key of keys) {
      try {
        result[key] = await dbGetMetadata(key);
      } catch (e) {
        console.error(`Failed to get metadata for key ${key}, falling back to memory`, e);
        result[key] = memoryStore.metadata[key];
      }
    }
    return result;
  }
  return memoryStore.metadata;
}

// --- DB Operations: USERS ---

export async function dbGetUsers(): Promise<any[]> {
  if (isDbConnected && pool) {
    const res = await pool.query("SELECT * FROM app_users");
    const users = res.rows.map((row: any) => ({
      id: row.id,
      email: row.email || "",
      password: row.password,
      fullName: row.full_name || "",
      phone: row.phone || "",
      roleId: row.role_id,
      userType: row.user_type,
      agencyId: row.agency_id,
      investorId: row.investor_id,
      avatar: row.avatar,
      username: row.username || row.email?.split('@')[0] || "",
      isFollower: !!row.is_follower,
      mustChangePassword: !!row.must_change_password,
      // Ward/department of the account (UBND cấp xã, phường uses it for location scoping)
      department: row.department || ""
    }));

    // Auto-migrate plain text passwords to hashed passwords in db
    for (const u of users) {
      const uPass = u.password || '';
      const isStoredHashed = isLegacyHash(uPass) || isScryptHash(uPass);
      if (!isStoredHashed && uPass) {
        const hashedStr = hashNewPassword(uPass);
        try {
          await pool.query("UPDATE app_users SET password = $1 WHERE id = $2", [hashedStr, u.id]);
          u.password = hashedStr;
          console.log(`🔒 Auto-migrated plaintext password for user ${u.email} to a hash.`);
        } catch (err) {
          console.error(`Failed to auto-migrate password for user ${u.email}`, err);
        }
      }
    }
    return users;
  }
  // In-Memory mode: seed accounts get their password on first use
  memoryStore.users.forEach((u: any) => {
    if (!u.password) u.password = hashNewPassword(getSeedUserPassword());
  });
  return memoryStore.users;
}

export function validateUserUniqueness(user: any, list: any[], excludeId?: string) {
  const email = (user.email || "").trim().toLowerCase();
  const phone = (user.phone || "").trim();
  const username = (user.username || "").trim().toLowerCase();

  for (const u of list) {
    if (excludeId && u.id === excludeId) continue;

    if (email && u.email && u.email.trim().toLowerCase() === email) {
      const err = new Error(`Địa chỉ email '${user.email}' đã được sử dụng bởi một tài khoản khác trong hệ thống.`);
      (err as any).statusCode = 400;
      throw err;
    }
    if (phone && u.phone && u.phone.trim() === phone) {
      const err = new Error(`Số điện thoại '${user.phone}' đã được sử dụng bởi một tài khoản khác trong hệ thống.`);
      (err as any).statusCode = 400;
      throw err;
    }
    if (username && u.username && u.username.trim().toLowerCase() === username) {
      const err = new Error(`Tên đăng nhập '${user.username}' đã được sử dụng bởi một tài khoản khác trong hệ thống.`);
      (err as any).statusCode = 400;
      throw err;
    }
  }
}

export async function dbCreateUser(u: any): Promise<any> {
  const users = await dbGetUsers();
  validateUserUniqueness(u, users);

  const newId = u.id || Math.random().toString(36).substr(2, 9);
  
  // No default password: without one the account gets an unguessable password (Admin issues one via recover-password)
  let uPass = u.password || randomBytes(18).toString("base64url");
  uPass = toStoredPassword(uPass);
  
  const enrichedUser = { ...u, password: uPass, id: newId };

  if (isDbConnected && pool) {
    await pool.query(`
      INSERT INTO app_users (id, email, password, full_name, role_id, user_type, agency_id, investor_id, avatar, username, phone, is_follower, department)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      newId, u.email, uPass, u.fullName || "", u.roleId || "", u.userType || "", u.agencyId || "", u.investorId || "", u.avatar || "", u.username || "", u.phone || "", !!u.isFollower, u.department || ""
    ]);
    return enrichedUser;
  }

  memoryStore.users.push(enrichedUser);
  return enrichedUser;
}

export async function dbUpdateUser(id: string, u: any): Promise<any> {
  const users = await dbGetUsers();
  const existing = users.find(item => item.id === id);
  if (!existing) {
    const err: any = new Error("Không tìm thấy người dùng");
    err.statusCode = 404;
    throw err;
  }

  const merged = {
    email: u.email !== undefined ? u.email : existing.email,
    fullName: u.fullName !== undefined ? u.fullName : existing.fullName,
    roleId: u.roleId !== undefined ? u.roleId : existing.roleId,
    userType: u.userType !== undefined ? u.userType : existing.userType,
    agencyId: u.agencyId !== undefined ? u.agencyId : existing.agencyId,
    investorId: u.investorId !== undefined ? u.investorId : existing.investorId,
    avatar: u.avatar !== undefined ? u.avatar : existing.avatar,
    username: u.username !== undefined ? u.username : existing.username,
    phone: u.phone !== undefined ? u.phone : existing.phone,
    isFollower: u.isFollower !== undefined ? !!u.isFollower : existing.isFollower,
    department: u.department !== undefined ? u.department : existing.department,
    password: u.password ? toStoredPassword(u.password) : existing.password
  };

  validateUserUniqueness(merged, users, id);

  if (isDbConnected && pool) {
    await pool.query(`
      UPDATE app_users SET 
        email = $1, password = $2, full_name = $3, role_id = $4, user_type = $5, agency_id = $6, investor_id = $7, avatar = $8, username = $9, phone = $10, is_follower = $11, department = $12
      WHERE id = $13
    `, [
      merged.email, merged.password, merged.fullName, merged.roleId, merged.userType, merged.agencyId, merged.investorId, merged.avatar, merged.username || "", merged.phone || "", !!merged.isFollower, merged.department || "", id
    ]);
    return { ...merged, id };
  }

  memoryStore.users = memoryStore.users.map(item => item.id === id ? { ...item, ...merged, id } : item);
  return { ...memoryStore.users.find(item => item.id === id), id };
}

export async function dbDeleteUser(id: string): Promise<boolean> {
  const allUsers = await dbGetUsers();
  const targetUser = allUsers.find(u => u.id === id);
  if (!targetUser) {
    throw new Error("Không tìm thấy người dùng");
  }
  const isTargetAdmin = targetUser.roleId === 'Admin' || targetUser.roleId?.toLowerCase() === 'admin' || targetUser.username?.toLowerCase() === 'admin';
  if (isTargetAdmin) {
    const adminCount = allUsers.filter(u => u.roleId === 'Admin' || u.roleId?.toLowerCase() === 'admin' || u.username?.toLowerCase() === 'admin').length;
    if (adminCount <= 1) {
      const err: any = new Error("Không thể xóa tài khoản Quản trị viên (Admin) duy nhất còn lại của hệ thống!");
      err.statusCode = 400;
      throw err;
    }
  }

  if (isDbConnected && pool) {
    await pool.query("DELETE FROM app_users WHERE id = $1", [id]);
    return true;
  }
  const lengthBefore = memoryStore.users.length;
  memoryStore.users = memoryStore.users.filter(item => item.id !== id);
  return memoryStore.users.length < lengthBefore;
}

export async function dbGetEmailConfig(): Promise<any> {
  if (isDbConnected && pool) {
    try {
      const res = await pool.query("SELECT * FROM email_config WHERE id = 'default'");
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          host: row.host,
          port: row.port,
          secure: row.secure,
          username: row.username || "",
          password: row.password || "",
          fromEmail: row.from_email || "",
          fromName: row.from_name || ""
        };
      }
    } catch (e) {
      console.error("Error reading email_config:", e);
    }
  }
  return memoryStore.emailConfig;
}

export async function dbSaveEmailConfig(config: any): Promise<any> {
  if (isDbConnected && pool) {
    try {
      await pool.query(`
        INSERT INTO email_config (id, host, port, secure, username, password, from_email, from_name)
        VALUES ('default', $1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          host = EXCLUDED.host,
          port = EXCLUDED.port,
          secure = EXCLUDED.secure,
          username = EXCLUDED.username,
          password = EXCLUDED.password,
          from_email = EXCLUDED.from_email,
          from_name = EXCLUDED.from_name
      `, [
        config.host || "",
        config.port || 587,
        config.secure || false,
        config.username || "",
        config.password || "",
        config.fromEmail || "",
        config.fromName || ""
      ]);
      return config;
    } catch (e) {
      console.error("Error saving email_config:", e);
    }
  }
  memoryStore.emailConfig = { ...memoryStore.emailConfig, ...config };
  return memoryStore.emailConfig;
}

export async function dbGetUploadConfig(): Promise<any> {
  if (isDbConnected && pool) {
    try {
      const res = await pool.query("SELECT * FROM upload_config WHERE id = 'default'");
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          allowedExtensions: row.allowed_extensions || "JPG,JPEG,PNG,GIF,PDF,DOC,DOCX,XLS,XLSX,ZIP,RAR",
          maxSizeMb: row.max_size_mb || 20
        };
      }
    } catch (e) {
      console.error("Error reading upload_config:", e);
    }
  }
  return memoryStore.uploadConfig;
}

export async function dbSaveUploadConfig(config: any): Promise<any> {
  if (isDbConnected && pool) {
    try {
      await pool.query(`
        INSERT INTO upload_config (id, allowed_extensions, max_size_mb)
        VALUES ('default', $1, $2)
        ON CONFLICT (id) DO UPDATE SET
          allowed_extensions = EXCLUDED.allowed_extensions,
          max_size_mb = EXCLUDED.max_size_mb
      `, [
        config.allowedExtensions || "JPG,JPEG,PNG,GIF,PDF,DOC,DOCX,XLS,XLSX,ZIP,RAR",
        config.maxSizeMb || 20
      ]);
      return config;
    } catch (e) {
      console.error("Error saving upload_config:", e);
    }
  }
  memoryStore.uploadConfig = { ...memoryStore.uploadConfig, ...config };
  return memoryStore.uploadConfig;
}

export async function dbGetPasswordPolicy(): Promise<any> {
  if (isDbConnected && pool) {
    try {
      const res = await pool.query("SELECT * FROM password_policy WHERE id = 'default'");
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          minLength: row.min_length || 6,
          requireUppercase: !!row.require_uppercase,
          requireLowercase: !!row.require_lowercase,
          requireNumbers: !!row.require_numbers,
          requireSpecialChars: !!row.require_special_chars
        };
      }
    } catch (e) {
      console.error("Error reading password_policy:", e);
    }
  }
  return memoryStore.passwordPolicy;
}

export async function dbSavePasswordPolicy(policy: any): Promise<any> {
  if (isDbConnected && pool) {
    try {
      await pool.query(`
        INSERT INTO password_policy (id, min_length, require_uppercase, require_lowercase, require_numbers, require_special_chars)
        VALUES ('default', $1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          min_length = EXCLUDED.min_length,
          require_uppercase = EXCLUDED.require_uppercase,
          require_lowercase = EXCLUDED.require_lowercase,
          require_numbers = EXCLUDED.require_numbers,
          require_special_chars = EXCLUDED.require_special_chars
      `, [
        policy.minLength || 6,
        !!policy.requireUppercase,
        !!policy.requireLowercase,
        !!policy.requireNumbers,
        !!policy.requireSpecialChars
      ]);
      return policy;
    } catch (e) {
      console.error("Error saving password_policy:", e);
    }
  }
  memoryStore.passwordPolicy = { ...memoryStore.passwordPolicy, ...policy };
  return memoryStore.passwordPolicy;
}

export async function dbResetUserPassword(id: string, hashedPass: string, mustChangePassword = false): Promise<boolean> {
  let dbSuccess = false;
  if (isDbConnected && pool) {
    try {
      await pool.query("UPDATE app_users SET password = $1, must_change_password = $2 WHERE id = $3", [hashedPass, mustChangePassword, id]);
      dbSuccess = true;
    } catch (e) {
      console.error("Error updating user password in db:", e);
    }
  }
  
  let found = false;
  memoryStore.users = memoryStore.users.map(u => {
    if (u.id === id) {
      found = true;
      return { ...u, password: hashedPass, mustChangePassword };
    }
    return u;
  });

  if (memoryStore.metadata && memoryStore.metadata.users) {
    memoryStore.metadata.users = memoryStore.metadata.users.map((u: any) => {
      if (u.id === id) {
        return { ...u, password: hashedPass, mustChangePassword };
      }
      return u;
    });
  }
  
  return dbSuccess || found;
}

// --- DB Operations: PROJECT ACTUAL PROGRESS ---

export async function dbGetActualProgress(): Promise<Record<string, any>> {
  if (isDbConnected && pool) {
    try {
      const res = await pool.query("SELECT * FROM project_actual_progress");
      const actualProgressMap: Record<string, any> = {};
      res.rows.forEach((row: any) => {
        actualProgressMap[row.project_id] = row.data;
      });
      return actualProgressMap;
    } catch (err) {
      console.error("Error reading project_actual_progress", err);
    }
  }
  return memoryStore.actualProgress || {};
}

export async function dbUpdateActualProgress(projectId: string, data: any): Promise<any> {
  if (isDbConnected && pool) {
    try {
      await pool.query(
        `INSERT INTO project_actual_progress (project_id, data) 
         VALUES ($1, $2) 
         ON CONFLICT (project_id) DO UPDATE SET data = EXCLUDED.data`,
        [projectId, JSON.stringify(data)]
      );
      return data;
    } catch (err) {
      console.error("Error updating project_actual_progress", err);
    }
  }
  if (!memoryStore.actualProgress) {
    memoryStore.actualProgress = {};
  }
  memoryStore.actualProgress[projectId] = data;
  return data;
}

export async function dbResetActualProgress(): Promise<boolean> {
  if (isDbConnected && pool) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // ONLY delete records from project_actual_progress (preserve projects, users, attachments, history, categories)
      await client.query("DELETE FROM project_actual_progress");

      await client.query("COMMIT");
      console.log("✅ Cleared project actual progress (projects, users, files and history untouched).");
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("❌ Resetting project actual progress failed: ", err);
      throw err;
    } finally {
      client.release();
    }
  }

  // Memory fallback
  memoryStore.actualProgress = {};
  return true;
}

// --- DB Operations: PROGRESS PER STEP (project_progress) ---

const PROGRESS_SIDES: ProgressSide[] = ['cdt', 'nn'];

function progressRowToEntry(row: any): ProgressEntry {
  const entry: ProgressEntry = {};
  if (row.plan_date) entry.planDate = row.plan_date;
  if (row.plan_date && row.plan_source === 'auto') entry.planSource = 'auto';
  if (row.actual_date) entry.actualDate = row.actual_date;
  if (row.expected_date) entry.expectedDate = row.expected_date;
  if (row.status) entry.status = row.status;
  if (row.note) entry.note = row.note;
  const atts = Array.isArray(row.attachments) ? row.attachments : parseJsonArray(row.attachments, 'project_progress.attachments');
  if (atts.length > 0) entry.attachments = atts;
  const next = Array.isArray(row.next_step_ids) ? row.next_step_ids : parseJsonArray(row.next_step_ids, 'project_progress.next_step_ids');
  if (next.length > 0) entry.nextStepIds = next.map(String);
  if (row.source) entry.source = row.source;
  if (row.updated_by) entry.updatedBy = row.updated_by;
  if (row.updated_at) entry.updatedAt = new Date(row.updated_at).toISOString();
  return entry;
}

// Progress of every project (or one), as { projectId: { stepKey: { cdt, nn } } }
export async function dbGetStepProgress(projectId?: string): Promise<Record<string, ProjectStepProgress>> {
  if (isDbConnected && pool) {
    const res = projectId
      ? await pool.query("SELECT * FROM project_progress WHERE project_id = $1", [projectId])
      : await pool.query("SELECT * FROM project_progress");
    const map: Record<string, ProjectStepProgress> = {};
    res.rows.forEach((row: any) => {
      const pid = String(row.project_id);
      const side = row.side as ProgressSide;
      if (!PROGRESS_SIDES.includes(side)) return;
      if (!map[pid]) map[pid] = {};
      map[pid][row.step_key] = { ...(map[pid][row.step_key] || {}), [side]: progressRowToEntry(row) };
    });
    return map;
  }
  const all = memoryStore.stepProgress || {};
  if (projectId) return all[projectId] ? { [projectId]: JSON.parse(JSON.stringify(all[projectId])) } : {};
  return JSON.parse(JSON.stringify(all));
}

// Writes the entries that differ between `before` and `after` (other steps are left untouched, so two
// people updating different steps of a project at the same time do not overwrite each other).
// An entry emptied by the user is kept as an empty row: it must keep hiding what the project's former
// JSON fields still hold for that step (server/progressService.effectiveProgress).
export async function dbSaveStepProgress(projectId: string, before: ProjectStepProgress, after: ProjectStepProgress): Promise<void> {
  const changes: { key: string; side: ProgressSide; entry: ProgressEntry }[] = [];
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  keys.forEach(key => PROGRESS_SIDES.forEach(side => {
    const b = before?.[key]?.[side];
    const a = after?.[key]?.[side];
    if (JSON.stringify(b ?? null) === JSON.stringify(a ?? null)) return;
    changes.push({ key, side, entry: a || {} });
  }));
  if (changes.length === 0) return;

  if (isDbConnected && pool) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const c of changes) {
        const e = c.entry;
        await client.query(`
          INSERT INTO project_progress (project_id, step_key, side, plan_date, actual_date, expected_date, status, note, attachments, next_step_ids, source, updated_by, updated_at, plan_source)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13::timestamp, CURRENT_TIMESTAMP), $14)
          ON CONFLICT (project_id, step_key, side) DO UPDATE SET
            plan_date = EXCLUDED.plan_date, plan_source = EXCLUDED.plan_source, actual_date = EXCLUDED.actual_date, expected_date = EXCLUDED.expected_date,
            status = EXCLUDED.status, note = EXCLUDED.note, attachments = EXCLUDED.attachments,
            next_step_ids = EXCLUDED.next_step_ids, source = EXCLUDED.source, updated_by = EXCLUDED.updated_by,
            updated_at = EXCLUDED.updated_at
        `, [
          projectId, c.key, c.side, e.planDate || null, e.actualDate || null, e.expectedDate || null,
          e.status || null, e.note || null, JSON.stringify(e.attachments || []),
          e.nextStepIds ? JSON.stringify(e.nextStepIds) : null, e.source || null, e.updatedBy || null, e.updatedAt || null,
          e.planDate && e.planSource === 'auto' ? 'auto' : null
        ]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return;
  }

  if (!memoryStore.stepProgress) memoryStore.stepProgress = {};
  const store = memoryStore.stepProgress[projectId] || (memoryStore.stepProgress[projectId] = {});
  changes.forEach(c => {
    store[c.key] = { ...(store[c.key] || {}), [c.side]: JSON.parse(JSON.stringify(c.entry)) };
  });
}

// "Reset tiến độ thực tế": actual dates, statuses and notes are cleared, plans are kept
export async function dbResetStepProgressActuals(): Promise<void> {
  if (isDbConnected && pool) {
    // Plans computed from the actual dates (plan_source = 'auto') go with them; entered plans stay
    await pool.query(`
      UPDATE project_progress SET actual_date = NULL, expected_date = NULL, status = NULL, note = NULL,
        attachments = '[]'::jsonb, next_step_ids = NULL, updated_at = CURRENT_TIMESTAMP,
        plan_date = CASE WHEN plan_source = 'auto' THEN NULL ELSE plan_date END, plan_source = NULL
    `);
    return;
  }
  const store = memoryStore.stepProgress || {};
  Object.keys(store).forEach(pid => {
    Object.keys(store[pid]).forEach(key => {
      PROGRESS_SIDES.forEach(side => {
        const e = store[pid][key][side];
        if (e) store[pid][key][side] = e.planDate && e.planSource !== 'auto' ? { planDate: e.planDate } : {};
      });
    });
  });
}

// Full system wipe utility preserved for administrative factory resets if ever explicitly requested
export async function dbHardResetDatabase(): Promise<boolean> {
  if (isDbConnected && pool) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Delete all rows from tables
      await client.query("DELETE FROM project_attachments");
      await client.query("DELETE FROM project_history");
      await client.query("DELETE FROM project_actual_progress");
      await client.query("DELETE FROM project_progress");
      await client.query("DELETE FROM projects");
      await client.query("DELETE FROM app_users");

      const tables = [
        "db_investors",
        "db_project_groups",
        "db_project_categories",
        "db_building_grades",
        "db_project_statuses",
        "db_project_stages",
        "db_funding_sources",
        "db_step_statuses",
        "db_roles",
        "db_processing_agencies",
        "db_locations",
        "db_processes",
        "app_metadata"
      ];

      for (const table of tables) {
        await client.query(`DELETE FROM ${table}`);
      }

      // 2. Re-seed default metadata JSON compatibility table
      const metadataKeys = Object.keys(memoryStore.metadata);
      for (const key of metadataKeys) {
        await client.query(
          "INSERT INTO app_metadata (key, value) VALUES ($1, $2)",
          [key, JSON.stringify(memoryStore.metadata[key])]
        );
      }

      // 3. Re-seed simple name-only categories
      const simpleSeeds = [
        { table: "db_investors", data: INITIAL_INVESTORS },
        { table: "db_project_groups", data: INITIAL_PROJECT_GROUPS },
        { table: "db_project_categories", data: INITIAL_PROJECT_CATEGORIES },
        { table: "db_building_grades", data: INITIAL_BUILDING_GRADES },
        { table: "db_project_statuses", data: INITIAL_PROJECT_STATUSES },
        { table: "db_funding_sources", data: INITIAL_FUNDING_SOURCES },
        { table: "db_step_statuses", data: INITIAL_STEP_STATUSES },
        { table: "db_roles", data: INITIAL_ROLES }
      ];

      for (const seed of simpleSeeds) {
        for (const val of seed.data) {
          await client.query(`INSERT INTO ${seed.table} (name) VALUES ($1) ON CONFLICT DO NOTHING`, [val]);
        }
      }

      // Re-seed db_project_stages with milestones
      for (const item of INITIAL_PROJECT_STAGES) {
        const name = typeof item === 'string' ? item : (item.name || '');
        const milestones = typeof item === 'string' ? [] : (item.milestones || []);
        await client.query(
          `INSERT INTO db_project_stages (name, milestones) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET milestones = EXCLUDED.milestones`,
          [name, JSON.stringify(milestones)]
        );
      }

      // 4. Re-seed db_processing_agencies
      for (const agency of INITIAL_AGENCIES) {
        await client.query(
          `INSERT INTO db_processing_agencies (id, name, display_order, departments) VALUES ($1, $2, $3, $4)`,
          [agency.id, agency.name, agency.displayOrder, JSON.stringify(agency.departments)]
        );
      }

      // 5. Re-seed db_locations
      for (const loc of INITIAL_LOCATIONS) {
        await client.query(
          `INSERT INTO db_locations (ward, old_area) VALUES ($1, $2)`,
          [loc.ward, loc.oldArea]
        );
      }

      // 6. Re-seed db_processes
      for (const proc of PROCESSES_WITH_MILESTONES) {
        await client.query(
          `INSERT INTO db_processes (id, name, parent_steps) VALUES ($1, $2, $3)`,
          [proc.id, proc.name, JSON.stringify(proc.parentSteps)]
        );
      }

      // 7. Re-seed app_users
      for (const uRaw of INITIAL_USERS) {
        const u = uRaw as any;
        let uPass = u.password || getSeedUserPassword();
        uPass = toStoredPassword(uPass);
        await client.query(`
          INSERT INTO app_users (id, email, password, full_name, role_id, user_type, agency_id, investor_id, avatar, username, phone, is_follower, department)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
          u.id, u.email, uPass, u.fullName, u.roleId, u.userType, u.agencyId, u.investorId, u.avatar || "", u.username || "", u.phone || "", !!u.isFollower, u.department || ""
        ]);
      }

      await client.query("COMMIT");
      console.log("✅ Hard reset done: configuration and accounts re-created, no sample projects.");
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("❌ Hard resetting/seeding database to defaults failed: ", err);
      throw err;
    } finally {
      client.release();
    }
  }
  return true;
}

// --- DB Operations: PROJECT ATTACHMENTS & HISTORY LOGS ---

export async function dbGetProjectAttachments(projectId: string): Promise<any[]> {
  if (isDbConnected && pool) {
    try {
      const res = await pool.query(
        "SELECT id, project_id as \"projectId\", name, size, file_type as \"fileType\", created_at as \"createdAt\" FROM project_attachments WHERE project_id = $1 ORDER BY id DESC", 
        [projectId]
      );
      return res.rows;
    } catch (err) {
      console.error(`Error reading database attachments for project ${projectId}`, err);
    }
  }
  return memoryStore.attachments.filter(att => att.projectId === projectId);
}

export async function dbGetAttachmentById(id: number): Promise<any> {
  if (isDbConnected && pool) {
    try {
      const res = await pool.query(
        "SELECT id, project_id as \"projectId\", name, size, file_type as \"fileType\", created_at as \"createdAt\" FROM project_attachments WHERE id = $1", 
        [id]
      );
      if (res.rows.length > 0) {
        return res.rows[0];
      }
    } catch (err) {
      console.error(`Error reading database attachment by id ${id}`, err);
    }
  }
  return memoryStore.attachments.find(att => att.id === id);
}

export async function dbCreateProjectAttachment(projectId: string, name: string, size: string, fileType: string): Promise<any> {
  const newAttachment = {
    projectId,
    name,
    size,
    fileType,
    createdAt: new Date().toISOString()
  };

  if (isDbConnected && pool) {
    try {
      const res = await pool.query(
        "INSERT INTO project_attachments (project_id, name, size, file_type) VALUES ($1, $2, $3, $4) RETURNING id, project_id as \"projectId\", name, size, file_type as \"fileType\", created_at as \"createdAt\"",
        [projectId, name, size, fileType]
      );
      return res.rows[0];
    } catch (err) {
      console.error(`Error inserting attachment for project ${projectId}`, err);
    }
  }

    const inMem = { ...newAttachment, id: memoryStore.attachments.reduce((max: number, a: any) => Math.max(max, Number(a.id) || 0), 0) + 1 };
  memoryStore.attachments.unshift(inMem);
  return inMem;
}

export async function dbDeleteAttachment(id: number): Promise<boolean> {
  if (isDbConnected && pool) {
    try {
      await pool.query("DELETE FROM project_attachments WHERE id = $1", [id]);
      return true;
    } catch (err) {
      console.error(`Error deleting attachment ${id}`, err);
    }
  }
  memoryStore.attachments = memoryStore.attachments.filter(att => att.id !== id);
  return true;
}

export async function dbGetProjectHistory(projectId: string): Promise<any[]> {
  if (isDbConnected && pool) {
    try {
      const res = await pool.query(
        "SELECT id, project_id as \"projectId\", user_name as \"userName\", action_type as \"actionType\", description, created_at as \"createdAt\", old_status as \"oldStatus\", new_status as \"newStatus\" FROM project_history WHERE project_id = $1 ORDER BY id DESC", 
        [projectId]
      );
      return res.rows;
    } catch (err) {
      console.error(`Error reading database history for project ${projectId}`, err);
    }
  }
  return memoryStore.history.filter(h => h.projectId === projectId);
}

export async function dbCreateProjectHistory(
  projectId: string, 
  userName: string, 
  actionType: string, 
  description: string, 
  oldStatus?: string, 
  newStatus?: string
): Promise<any> {
  const newLog = {
    projectId,
    userName,
    actionType,
    description,
    createdAt: new Date().toISOString(),
    oldStatus: oldStatus || null,
    newStatus: newStatus || null
  };

  if (isDbConnected && pool) {
    try {
      const res = await pool.query(
        "INSERT INTO project_history (project_id, user_name, action_type, description, old_status, new_status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, project_id as \"projectId\", user_name as \"userName\", action_type as \"actionType\", description, created_at as \"createdAt\", old_status as \"oldStatus\", new_status as \"newStatus\"",
        [projectId, userName, actionType, description, oldStatus || null, newStatus || null]
      );
      return res.rows[0];
    } catch (err) {
      console.error(`Error inserting history log for project ${projectId}`, err);
    }
  }

  const inMem = { ...newLog, id: memoryStore.history.length + 1 };
  memoryStore.history.unshift(inMem);
  return inMem;
}

// Health status helper
export function getDbStatus() {
  const rawUrl = process.env.DATABASE_URL;
  let connectionString = rawUrl;
  if (connectionString) {
    connectionString = connectionString.replace(/[\r\n]/g, "").trim();
    const prefixRegex = /^DATABASE_URL\s*=\s*/i;
    if (prefixRegex.test(connectionString)) {
      connectionString = connectionString.replace(prefixRegex, "").trim();
    }
    if (connectionString.startsWith('"') && connectionString.endsWith('"')) {
      connectionString = connectionString.substring(1, connectionString.length - 1).trim();
    }
    if (connectionString.startsWith("'") && connectionString.endsWith("'")) {
      connectionString = connectionString.substring(1, connectionString.length - 1).trim();
    }
  }

  return {
    connected: isDbConnected,
    mode: isDbConnected ? "PostgreSQL Database" : "In-Memory Fallback",
    errorMessage: dbErrorMsg,
    rawUrlMasked: maskConnectionString(rawUrl),
    sanitizedUrlMasked: maskConnectionString(connectionString),
    setupGuide: "To connect your real PostgreSQL database, define DATABASE_URL in your Secrets Panel (AI Studio -> Settings -> Secrets) or set PGHOST, PGUSER, PGPASSWORD, PGDATABASE and PGPORT."
  };
}

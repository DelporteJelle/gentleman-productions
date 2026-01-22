/**
 * Utility script to generate a bcrypt password hash
 *
 * Usage:
 *   npx ts-node scripts/hash-password.ts <password>
 *
 * Or run directly with:
 *   npx tsx scripts/hash-password.ts <password>
 *
 * Then use the hash in your SQL INSERT:
 *
 * INSERT INTO users (uuid, username, password_hash, role)
 * VALUES (gen_random_uuid(), 'admin', '<paste-hash-here>', 'admin');
 */

import bcrypt from "bcrypt";

const password = process.argv[2];

if (!password) {
  console.error("Usage: npx tsx scripts/hash-password.ts <password>");
  process.exit(1);
}

const saltRounds = 10;

bcrypt.hash(password, saltRounds).then((hash) => {
  console.log("\nPassword hash generated successfully!\n");
  console.log("Hash:", hash);
  console.log("\n--- SQL Insert Example ---\n");
  console.log(`INSERT INTO users (uuid, username, password_hash, role)`);
  console.log(`VALUES (gen_random_uuid(), 'admin', '${hash}', 'admin');`);
  console.log("\n--- Create Table (if not exists) ---\n");
  console.log(`CREATE TABLE IF NOT EXISTS users (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);
});

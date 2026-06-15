/**
 * One-off CLI utility to create (or promote) an admin user.
 *
 * Usage:
 *   node scripts/create-admin.mjs <name> <email> <password>
 *
 * If a user with the given email already exists, it is promoted to the
 * "admin" role instead of being recreated.
 */
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const envPath = path.resolve(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const match = envContent.match(/^MONGODB_URI\s*=\s*"?([^"\n]+)"?$/m);
const MONGODB_URI = match?.[1];

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI not found in .env.local");
}

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      required: true,
      enum: ["admin", "student"],
      default: "student",
    },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);

const [, , name, email, password] = process.argv;

if (!name || !email || !password) {
  console.error("Usage: node scripts/create-admin.mjs <name> <email> <password>");
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGODB_URI);

  const normalizedEmail = email.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await User.findOne({ email: normalizedEmail });

  if (existing) {
    existing.name = name;
    existing.role = "admin";
    existing.passwordHash = passwordHash;
    await existing.save();
    console.log(`Updated existing user "${normalizedEmail}" -> role: admin`);
  } else {
    await User.create({
      name,
      email: normalizedEmail,
      passwordHash,
      role: "admin",
    });
    console.log(`Created admin user "${normalizedEmail}"`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

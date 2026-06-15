import mongoose from 'mongoose';

/**
 * @typedef {Object} User
 * @property {mongoose.Types.ObjectId} _id - The unique operational identifier for the user.
 * @property {string} name - The full name of the user actor.
 * @property {string} email - The unique login email address, stored in lowercase.
 * @property {string} passwordHash - The hashed authentication credential string.
 * @property {'admin'|'student'} role - The system authorization role governing access to specific dashboard loops.
 * @property {string|null} resetPasswordTokenHash - SHA-256 hash of an active password-reset token, or null.
 * @property {Date|null} resetPasswordExpires - Expiry timestamp for the active password-reset token, or null.
 * @property {Date} createdAt - Timestamp indicating when the user identity was provisioned.
 * @property {Date} updatedAt - Timestamp indicating the last modification date of the account.
 */

/**
 * Mongoose Schema blueprint governing global platform identity and authentication roles.
 * @type {mongoose.Schema<User>}
 */
const UserSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true 
  },
  passwordHash: { 
    type: String, 
    required: true 
  },
  role: {
    type: String,
    required: true,
    enum: ['admin', 'student'],
    default: 'student'
  },
  resetPasswordTokenHash: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  }
}, { timestamps: true });

/**
 * Data Access Object mapping to the 'users' collection.
 * @type {mongoose.Model<User>}
 */
export default mongoose.models.User || mongoose.model('User', UserSchema);
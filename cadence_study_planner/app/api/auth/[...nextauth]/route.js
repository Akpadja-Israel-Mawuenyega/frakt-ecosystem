import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';

import bcrypt from 'bcryptjs';

import connectDB from '@/lib/db';

import User from '@/models/User';
import StudentProfile from '@/models/StudentProfile';
import { logEvent } from '@/lib/audit/logEvent';

/**
 * ───────────────────────────── AUTH CONFIG ─────────────────────────────
 * Central authentication pipeline for:
 *
 * - Google OAuth
 * - Email/password login
 * - JWT session persistence
 * - Role-based authorization
 * - Automatic student profile provisioning
 *
 * Architecture:
 * User → identity/authentication
 * StudentProfile → academic + AI personalization
 */
export const authOptions = {

  /**
   * JWT sessions are ideal for:
   * - APIs
   * - AI systems
   * - distributed architectures
   * - scalable stateless auth
   */
  session: {
    strategy: 'jwt'
  },

  /**
   * ───────────────────────────── PROVIDERS ─────────────────────────────
   */
  providers: [

    /**
     * ───────────────────────── GOOGLE OAUTH ─────────────────────────
     */
    GoogleProvider({

      clientId: process.env.GOOGLE_CLIENT_ID,

      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    }),

    /**
     * ───────────────────── EMAIL/PASSWORD LOGIN ─────────────────────
     */
    CredentialsProvider({

      name: 'Credentials',

      credentials: {

        email: {
          label: 'Email',
          type: 'email'
        },

        password: {
          label: 'Password',
          type: 'password'
        }
      },

      /**
       * Custom login authorization pipeline.
       */
      async authorize(credentials) {

        await connectDB();

        /**
         * Locate user by email.
         */
        const user = await User.findOne({
          email: credentials.email.toLowerCase()
        });

        if (!user) {
          throw new Error('Invalid email or password.');
        }

        /**
         * OAuth accounts cannot login via password.
         */
        if (user.passwordHash === 'GOOGLE_OAUTH_ACCOUNT') {
          throw new Error(
            'This account uses Google Sign-In.'
          );
        }

        /**
         * Compare password hash.
         */
        const passwordValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!passwordValid) {
          throw new Error('Invalid email or password.');
        }

        /**
         * Return sanitized auth payload.
         */
        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role
        };
      }
    })
  ],

  /**
   * ───────────────────────────── CALLBACKS ─────────────────────────────
   */
  callbacks: {

    /**
     * Runs during successful sign-in.
     *
     * Handles:
     * - first-time Google provisioning
     * - automatic User creation
     * - automatic StudentProfile creation
     */
    async signIn({ user, account }) {

      await connectDB();

      /**
       * Handle Google OAuth accounts.
       */
      if (account.provider === 'google') {

        let existingUser = await User.findOne({
          email: user.email.toLowerCase()
        });

        /**
         * First OAuth login.
         */
        if (!existingUser) {

          /**
           * Create auth identity.
           */
          existingUser = await User.create({

            name: user.name,

            email: user.email.toLowerCase(),

            /**
             * OAuth accounts do not use passwords.
             */
            passwordHash: 'GOOGLE_OAUTH_ACCOUNT',

            role: 'student'
          });

          /**
           * Automatically create academic profile.
           *
           * Temporary values can later be updated
           * through onboarding/profile setup.
           */
          await StudentProfile.create({

            userId: existingUser._id,

            studentId: `TEMP-${Date.now()}`,

            name: user.name,

            cohort: 'UNASSIGNED',

            enrolledCourses: []
          });
        }

        /**
         * Propagate role + ID into JWT pipeline.
         */
        user.role = existingUser.role;

        user.id = existingUser._id.toString();
      }

      return true;
    },

    /**
     * Inject custom fields into JWT token.
     */
    async jwt({ token, user }) {

      if (user) {

        token.userId = user.id;

        token.role = user.role;
      }

      return token;
    },

    /**
     * Inject JWT fields into session object.
     */
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.userId;
        session.user.role = token.role;
      }

      return session;
    }
  },

  /**
   * ───────────────────────────── EVENTS ─────────────────────────────
   * Side-effect hooks that fire after the callbacks above resolve.
   * Used here to feed the native audit trail / traffic analytics.
   */
  events: {
    async signIn({ user }) {
      await logEvent({
        userId: user.id,
        action: 'USER_LOGIN',
        endpoint: '/api/auth/callback',
        statusCode: 200,
      });
    }
  },

  /**
   * Custom login page route.
   */
  pages: {
    signIn: '/login'
  },

  /**
   * JWT signing secret.
   */
  secret: process.env.NEXTAUTH_SECRET
};

/**
 * ───────────────────────────── HANDLER EXPORT ─────────────────────────────
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };


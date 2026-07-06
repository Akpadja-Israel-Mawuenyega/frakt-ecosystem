import NextAuth from 'next-auth';
import { encode as encodeJwt } from 'next-auth/jwt';
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
/**
 * Session lifetimes for the "Remember me" split:
 *
 * - Unchecked (and all OAuth logins): the JWT expires after 24 hours of
 *   inactivity — a security-first default that limits how long a stolen
 *   or abandoned session stays usable.
 * - Checked: the JWT lives for 30 days (NextAuth's standard persistence).
 *
 * Enforcement lives inside the token's own expiry (see `jwt.encode` below),
 * so it applies to every `getServerSession` check — clients cannot extend a
 * session beyond what the server signed.
 */
const REMEMBERED_SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days
const DEFAULT_SESSION_MAX_AGE = 24 * 60 * 60; // 24 hours

export const authOptions = {

  /**
   * JWT sessions are ideal for:
   * - APIs
   * - AI systems
   * - distributed architectures
   * - scalable stateless auth
   */
  session: {
    strategy: 'jwt',

    /**
     * Upper bound — remembered sessions. Non-remembered tokens are cut
     * shorter at encode time below.
     */
    maxAge: REMEMBERED_SESSION_MAX_AGE,

    /**
     * Re-issue the token every 4 hours of activity, so a non-remembered
     * session behaves as a 24h *idle* timeout (active users roll forward)
     * rather than a hard mid-work logout.
     */
    updateAge: 4 * 60 * 60
  },

  /**
   * Token lifetime is decided per login: the `rememberMe` flag carried in
   * the token picks the long or short expiry each time it is (re-)signed.
   */
  jwt: {
    maxAge: REMEMBERED_SESSION_MAX_AGE,

    async encode(params) {
      const remembered = params.token?.rememberMe === true;

      return encodeJwt({
        ...params,
        maxAge: remembered
          ? REMEMBERED_SESSION_MAX_AGE
          : DEFAULT_SESSION_MAX_AGE
      });
    }
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
        },

        /**
         * "Remember me" checkbox — "true" opts into the 30-day session;
         * anything else gets the 24-hour default. Both durations are
         * server-defined, so the flag can only choose between them.
         */
        remember: {
          label: 'Remember me',
          type: 'text'
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
          role: user.role,
          rememberMe: credentials.remember === 'true'
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

        /**
         * Persisted for the lifetime of the session so every re-encode
         * (rolling refresh) keeps the duration the user chose at login.
         * OAuth sign-ins have no checkbox and default to the short session.
         */
        token.rememberMe = user.rememberMe === true;
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


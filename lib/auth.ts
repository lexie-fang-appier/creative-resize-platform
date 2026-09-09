import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

// Mirrors ai-tool-hub's lib/auth.ts domain-restriction pattern (same company,
// same SSO requirement). Wired in via app/AuthGate.tsx (client-side redirect
// to /login) and lib/require-session.ts (server-side enforcement in every
// Server Action and the two file-serving API routes).
const ALLOWED_DOMAIN = "appier.com";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    /** Block any email that isn't @appier.com, same as ai-tool-hub. */
    async signIn({ user, profile }) {
      if (profile && "email_verified" in profile && profile.email_verified !== true) {
        return false;
      }
      return user.email?.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`) ?? false;
    },

    async jwt({ token, user }) {
      if (user?.email) token.email = user.email;
      return token;
    },

    async session({ session, token }) {
      if (session.user && token.email) {
        session.user.email = token.email as string;
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },
};

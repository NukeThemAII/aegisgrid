import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';

// Only use PrismaAdapter when database is configured
const hasDatabase = Boolean(process.env.DATABASE_URL);
let adapter: ReturnType<typeof import('@auth/prisma-adapter').PrismaAdapter> | undefined;

if (hasDatabase) {
  // Dynamic import to avoid crashing when no database
  try {
    const { PrismaAdapter: PA } = require('@auth/prisma-adapter');
    const { prisma } = require('@/lib/db');
    adapter = PA(prisma);
  } catch {
    // Database not available — use JWT-only sessions
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...(adapter ? { adapter } : {}),
  providers: [
    ...(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET
      ? [GitHub]
      : []),
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [Google]
      : []),
  ],
  callbacks: {
    authorized({ auth: _auth, request: { nextUrl: _nextUrl } }) {
      return true;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  session: { strategy: 'jwt' },
  // Use JWT-only when no database adapter
  ...(hasDatabase ? {} : {
    session: { strategy: 'jwt' as const },
  }),
});

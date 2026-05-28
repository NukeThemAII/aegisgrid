import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/db';

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHub,
    Google,
  ],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      // Basic role or auth guard logic could go here later.
      return true;
    },
    async session({ session, token }) {
      // Attach the user ID to the session object
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  session: { strategy: 'jwt' },
});

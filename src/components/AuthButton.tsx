import { signIn, signOut, auth } from '@/auth';
import { LogIn, LogOut } from 'lucide-react';

export async function AuthButton() {
  const session = await auth();

  if (session?.user) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400 hidden md:inline-block">
          {session.user.name || session.user.email}
        </span>
        <form
          action={async () => {
            'use server';
            await signOut();
          }}
        >
          <button
            type="submit"
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-red-900/40 text-red-400 hover:bg-red-800/60 rounded border border-red-900/50 transition-colors"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <form
        action={async () => {
          'use server';
          await signIn('github');
        }}
      >
        <button
          type="submit"
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-gray-800 text-gray-200 hover:bg-gray-700 rounded border border-gray-700 transition-colors"
        >
          <LogIn size={14} />
          GitHub
        </button>
      </form>
    </div>
  );
}

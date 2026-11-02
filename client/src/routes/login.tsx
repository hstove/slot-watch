import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const { data: session, isPending, error } = authClient.useSession();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const signIn = async () => {
    setActionError(null);
    setIsRedirecting(true);
    const { error: signInError } = await authClient.signIn.social({
      provider: 'google',
      // Absolute, so the API redirects back to this frontend after Google.
      callbackURL: window.location.href,
    });
    if (signInError) {
      setIsRedirecting(false);
      setActionError(signInError.message ?? 'sign in failed');
    }
  };

  const signOut = async () => {
    setActionError(null);
    const { error: signOutError } = await authClient.signOut();
    if (signOutError) {
      setActionError(signOutError.message ?? 'sign out failed');
    }
  };

  const errorMessage = actionError ?? error?.message;

  return (
    <div className="flex justify-center">
      <div className="w-full max-w-md border border-border bg-card">
        <div className="border-b border-border px-4 py-3 bg-muted/30">
          <h2 className="font-mono text-sm font-medium">account</h2>
        </div>
        <div className="p-4 space-y-4">
          <SessionBody
            isPending={isPending}
            isRedirecting={isRedirecting}
            onSignIn={signIn}
            onSignOut={signOut}
            session={session}
          />
          {errorMessage ? (
            <p className="font-mono text-xs text-destructive">
              × {errorMessage}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type Session = ReturnType<typeof authClient.useSession>['data'];

function SessionBody({
  isPending,
  isRedirecting,
  onSignIn,
  onSignOut,
  session,
}: {
  isPending: boolean;
  isRedirecting: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  session: Session;
}) {
  if (isPending) {
    return (
      <p className="font-mono text-xs text-blue-500 animate-pulse">
        ◌ checking session
      </p>
    );
  }

  if (!session) {
    return (
      <>
        <p className="text-sm text-muted-foreground">
          Sign in to access account-only features.
        </p>
        <Button
          className="rounded-none font-mono"
          disabled={isRedirecting}
          onClick={onSignIn}
        >
          {isRedirecting ? 'redirecting…' : 'sign in with google'}
        </Button>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        {session.user.image ? (
          <img
            alt=""
            className="h-10 w-10 border border-border"
            height={40}
            referrerPolicy="no-referrer"
            src={session.user.image}
            width={40}
          />
        ) : null}
        <div className="min-w-0">
          <p className="text-sm truncate">{session.user.name}</p>
          <p className="font-mono text-xs text-muted-foreground truncate">
            {session.user.email}
          </p>
        </div>
      </div>
      <p className="font-mono text-xs text-green-600 dark:text-green-500">
        ● signed in
      </p>
      <Button
        className="rounded-none font-mono"
        onClick={onSignOut}
        size="sm"
        variant="outline"
      >
        sign out
      </Button>
    </>
  );
}

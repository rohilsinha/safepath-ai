import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, CurrentUserResponse, getCurrentUser } from './api';
import { getAccessToken, removeAccessToken } from './session';

export type CurrentUser = CurrentUserResponse;
export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface UserContextValue {
  user: CurrentUser | null;
  status: SessionStatus;
  setUser: (user: CurrentUser) => void;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const setAuthenticatedUser = (nextUser: CurrentUser): void => {
    setUser(nextUser);
    setStatus('authenticated');
  };
  const logout = async (): Promise<void> => {
    await removeAccessToken();
    setUser(null);
    setStatus('unauthenticated');
  };

  useEffect(() => {
    let active = true;

    const restoreSession = async (): Promise<void> => {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        if (active) setStatus('unauthenticated');
        return;
      }

      try {
        const restoredUser = await getCurrentUser(accessToken);
        if (active) {
          setAuthenticatedUser(restoredUser);
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await removeAccessToken();
        }

        if (active) {
          setUser(null);
          setStatus('unauthenticated');
        }
      }
    };

    void restoreSession();

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(
    () => ({ user, status, setUser: setAuthenticatedUser, logout }),
    [user, status],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext);

  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }

  return context;
}

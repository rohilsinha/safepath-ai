import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { SignupResponse } from './api';

export type CurrentUser = Pick<SignupResponse, 'id' | 'name' | 'email'>;

interface UserContextValue {
  user: CurrentUser | null;
  setUser: (user: CurrentUser) => void;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const value = useMemo(() => ({ user, setUser }), [user]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext);

  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }

  return context;
}

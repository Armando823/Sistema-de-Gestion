import React, { createContext } from 'react';

export const AuthContext = createContext(null);

export function AuthProvider({ children }){
  const value = { user: null };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

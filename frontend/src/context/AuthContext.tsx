import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { LoginResponse, SetupStatusResponse, UserInfo } from '../types';

interface AuthContextType {
  user: UserInfo | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setupRequired: boolean;
  login: (data: LoginResponse) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  checkSetupStatus: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  setupRequired: false,
  login: () => {},
  logout: async () => {},
  refreshUser: async () => {},
  checkSetupStatus: async () => false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [user, setUser] = useState<UserInfo | null>(() => {
    const saved = localStorage.getItem('auth_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [setupRequired, setSetupRequired] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const checkSetupStatus = async (): Promise<boolean> => {
    try {
      const res = await apiClient.get<SetupStatusResponse>('/setup/status');
      const isReq = res.data.setup_required;
      setSetupRequired(isReq);
      return isReq;
    } catch (e) {
      console.error('Failed to check setup status', e);
      return false;
    }
  };

  const refreshUser = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await apiClient.get<UserInfo>('/auth/me');
      setUser(res.data);
      localStorage.setItem('auth_user', JSON.stringify(res.data));
    } catch (e) {
      console.error('Session expired or invalid', e);
      setToken(null);
      setUser(null);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      const isReq = await checkSetupStatus();
      if (!isReq && token) {
        await refreshUser();
      } else {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const login = (data: LoginResponse) => {
    setToken(data.token);
    setUser(data.user);
    setSetupRequired(false);
    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('auth_user', JSON.stringify(data.user));
  };

  const logout = async () => {
    try {
      if (token) {
        await apiClient.post('/auth/logout');
      }
    } catch (e) {
      console.error('Logout error', e);
    } finally {
      setToken(null);
      setUser(null);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        setupRequired,
        login,
        logout,
        refreshUser,
        checkSetupStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

/**
 * Authentication Context for STOMP Performance Scheduler
 * 
 * Provides authentication state management and auth operations for the entire app
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Types
interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

interface AuthSession {
  userId: string;
  sessionId: string;
  issuedAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

interface AuthState {
  user: User | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
}

interface RegisterData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

interface LoginData {
  email: string;
  password: string;
}

interface AuthContextValue extends AuthState {
  register: (data: RegisterData) => Promise<void>;
  login: (data: LoginData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

// Create context
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Token storage utilities
const TOKEN_KEY = 'stomp_auth_token';

const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
};

const setStoredToken = (token: string) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
};

const removeStoredToken = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
};

// API functions - Environment-aware backend URL
const API_BASE = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || 'https://stomp-performance-scheduler-hxdi.encr.app')
  : (import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000');

const apiCall = async (endpoint: string, options: RequestInit = {}) => {
  const token = getStoredToken();
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
};

const authAPI = {
  register: async (data: RegisterData) => {
    return apiCall('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  login: async (data: LoginData) => {
    return apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  me: async () => {
    return apiCall('/auth/me');
  },

  logout: async () => {
    return apiCall('/auth/logout', {
      method: 'POST',
    });
  },
};

// Auth Provider Component
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    isAuthenticated: false,
    isLoading: true,
    token: getStoredToken(),
  });

  const queryClient = useQueryClient();

  // Query to get current user info
  const { data: meData, isLoading: isMeLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authAPI.me,
    enabled: !!authState.token,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    meta: {
      errorMessage: 'Failed to get user information',
    },
  });

  // Register mutation
  const registerMutation = useMutation({
    mutationFn: authAPI.register,
    onSuccess: (data) => {
      setStoredToken(data.token);
      setAuthState(prev => ({
        ...prev,
        user: data.user,
        token: data.token,
        isAuthenticated: true,
      }));
      // Invalidate and refetch user data
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: (error) => {
      console.error('Registration failed:', error);
    },
  });

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: authAPI.login,
    onSuccess: (data) => {
      setStoredToken(data.token);
      setAuthState(prev => ({
        ...prev,
        user: data.user,
        token: data.token,
        isAuthenticated: true,
      }));
      // Invalidate and refetch user data
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: (error) => {
      console.error('Login failed:', error);
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: authAPI.logout,
    onSuccess: () => {
      removeStoredToken();
      setAuthState({
        user: null,
        session: null,
        isAuthenticated: false,
        isLoading: false,
        token: null,
      });
      // Clear all auth-related queries
      queryClient.removeQueries({ queryKey: ['auth'] });
    },
    onError: (error) => {
      console.error('Logout failed:', error);
      // Even if logout fails, clear local state
      removeStoredToken();
      setAuthState({
        user: null,
        session: null,
        isAuthenticated: false,
        isLoading: false,
        token: null,
      });
      queryClient.removeQueries({ queryKey: ['auth'] });
    },
  });

  // Update auth state when user data is fetched
  useEffect(() => {
    if (meData && authState.token) {
      setAuthState(prev => ({
        ...prev,
        user: meData.user,
        session: meData.session,
        isAuthenticated: true,
        isLoading: false,
      }));
    } else if (!authState.token) {
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
      }));
    }
  }, [meData, authState.token]);

  // Initial loading state management
  useEffect(() => {
    if (!isMeLoading && authState.token) {
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
      }));
    }
  }, [isMeLoading, authState.token]);

  const contextValue: AuthContextValue = {
    ...authState,
    register: registerMutation.mutateAsync,
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    refreshUser: async () => {
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
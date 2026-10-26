// src/lib/auth/auth-provider.tsx
"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { AuthUser, TokenPair, UserRole } from "./types";

// ─── API client ───

async function authFetch<T>(url: string, options: RequestInit = {}): Promise<{
  success: boolean;
  data: T | null;
  error: string | null;
}> {
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options,
    });
    return res.json();
  } catch {
    return { success: false, data: null, error: "Network error" };
  }
}

// ─── Token storage ───

const TOKEN_KEY = "propintel_tokens";

function saveTokens(tokens: TokenPair): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  }
}

function loadTokens(): TokenPair | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearTokens(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
  }
}

// ─── Context ───

interface AuthState {
  user: AuthUser | null;
  tokens: TokenPair | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: Record<string, string>) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  getAccessToken: () => string | null;
  hasRole: (role: UserRole) => boolean;
  hasMinRole: (role: UserRole) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// ─── Provider ───

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({
    user: null,
    tokens: null,
    isLoading: true,
    isAuthenticated: false,
  });
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Schedule token refresh 1 minute before expiry
  const scheduleRefresh = useCallback((tokens: TokenPair) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const refreshInMs = Math.max((tokens.expiresIn - 60) * 1000, 10_000);
    refreshTimerRef.current = setTimeout(async () => {
      const result = await authFetch<{ tokens: TokenPair }>("/api/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
      if (result.success && result.data) {
        saveTokens(result.data.tokens);
        setState((prev) => ({ ...prev, tokens: result.data!.tokens }));
        scheduleRefresh(result.data.tokens);
      } else {
        // Refresh failed — log out
        clearTokens();
        setState({ user: null, tokens: null, isLoading: false, isAuthenticated: false });
        router.push("/login");
      }
    }, refreshInMs);
  }, [router]);

  // Initialize auth state from stored tokens
  useEffect(() => {
    async function init() {
      const tokens = loadTokens();
      if (!tokens) {
        setState({ user: null, tokens: null, isLoading: false, isAuthenticated: false });
        return;
      }

      // Fetch current user
      const result = await authFetch<{ user: AuthUser }>("/api/auth/me", {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });

      if (result.success && result.data) {
        setState({
          user: result.data.user,
          tokens,
          isLoading: false,
          isAuthenticated: true,
        });
        scheduleRefresh(tokens);
      } else {
        // Token expired — try refresh
        const refreshResult = await authFetch<{ tokens: TokenPair }>("/api/auth/refresh", {
          method: "POST",
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });

        if (refreshResult.success && refreshResult.data) {
          const newTokens = refreshResult.data.tokens;
          saveTokens(newTokens);

          const meResult = await authFetch<{ user: AuthUser }>("/api/auth/me", {
            headers: { Authorization: `Bearer ${newTokens.accessToken}` },
          });

          if (meResult.success && meResult.data) {
            setState({
              user: meResult.data.user,
              tokens: newTokens,
              isLoading: false,
              isAuthenticated: true,
            });
            scheduleRefresh(newTokens);
            return;
          }
        }

        // All recovery attempts failed
        clearTokens();
        setState({ user: null, tokens: null, isLoading: false, isAuthenticated: false });
      }
    }

    init();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [scheduleRefresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authFetch<{ user: AuthUser; tokens: TokenPair }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (result.success && result.data) {
        saveTokens(result.data.tokens);
        setState({
          user: result.data.user,
          tokens: result.data.tokens,
          isLoading: false,
          isAuthenticated: true,
        });
        scheduleRefresh(result.data.tokens);
        return { success: true };
      }

      return { success: false, error: result.error || "Login failed" };
    },
    [scheduleRefresh],
  );

  const register = useCallback(
    async (data: Record<string, string>) => {
      const result = await authFetch<{ user: AuthUser; tokens: TokenPair }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      });

      if (result.success && result.data) {
        saveTokens(result.data.tokens);
        setState({
          user: result.data.user,
          tokens: result.data.tokens,
          isLoading: false,
          isAuthenticated: true,
        });
        scheduleRefresh(result.data.tokens);
        return { success: true };
      }

      return { success: false, error: result.error || "Registration failed" };
    },
    [scheduleRefresh],
  );

  const logout = useCallback(async () => {
    const tokens = loadTokens();
    if (tokens) {
      await authFetch("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
    }
    clearTokens();
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setState({ user: null, tokens: null, isLoading: false, isAuthenticated: false });
    router.push("/login");
  }, [router]);

  const refreshUser = useCallback(async () => {
    const tokens = loadTokens();
    if (!tokens) return;
    const result = await authFetch<{ user: AuthUser }>("/api/auth/me", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    if (result.success && result.data) {
      setState((prev) => ({ ...prev, user: result.data!.user }));
    }
  }, []);

  const getAccessToken = useCallback((): string | null => {
    return state.tokens?.accessToken || null;
  }, [state.tokens]);

  const HIERARCHY: Record<UserRole, number> = { admin: 1, agency_admin: 2, broker: 3, land_owner: 4 };

  const hasRole = useCallback(
    (role: UserRole): boolean => state.user?.role === role,
    [state.user],
  );

  const hasMinRole = useCallback(
    (role: UserRole): boolean => {
      if (!state.user) return false;
      return HIERARCHY[state.user.role] <= HIERARCHY[role];
    },
    [state.user],
  );

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        refreshUser,
        getAccessToken,
        hasRole,
        hasMinRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ───

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// src/app/(auth)/layout.tsx

import { AuthProvider } from "@/lib/auth/auth-provider";

export const metadata = {
  title: "PropIntel — Sign in",
  description: "AI-powered property intelligence platform",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  );
}

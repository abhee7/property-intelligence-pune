"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-provider";
import { loginSchema, type LoginInput } from "@/lib/validation/auth.schema";
import { Eye, EyeOff, Loader2, Sparkles, ArrowRight, AlertCircle, Mail, Lock, Check } from "lucide-react";
import StarConstellationBackground from "@/components/auth/star-constellation-background";

const NOISE_BG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-void" />}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();

  const [form, setForm] = useState<LoginInput>({ email: "", password: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof LoginInput, string>>>({});
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      const redirect = searchParams.get("redirect") || "/dashboard";
      router.push(redirect);
    }
  }, [authLoading, isAuthenticated, router, searchParams]);

  const demoAccounts = [
    { label: "Admin", email: "admin@sahyadri-demo.com" },
    { label: "Manager", email: "manager@sahyadri-demo.com" },
    { label: "Broker", email: "broker@sahyadri-demo.com" },
    { label: "Owner", email: "owner@sahyadri-demo.com" },
  ];

  function handleChange(field: keyof LoginInput, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setApiError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError("");

    const parsed = loginSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof LoginInput, string>> = {};
      parsed.error.errors.forEach((err) => {
        const field = err.path[0] as keyof LoginInput;
        if (!fieldErrors[field]) fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    const result = await login(form.email, form.password);
    setLoading(false);

    if (result.success) {
      const redirect = searchParams.get("redirect") || "/dashboard";
      router.push(redirect);
    } else {
      setApiError(result.error || "Login failed");
    }
  }

  function fillDemo(email: string) {
    setForm({ email, password: "Demo@12345" });
    setErrors({});
    setApiError("");
  }

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-void relative overflow-hidden font-inter">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: "radial-gradient(120% 90% at 50% -10%, #14161D, transparent 60%)" }}
      />
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.04] mix-blend-overlay"
        style={{ backgroundImage: NOISE_BG }}
      />

      <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* brand mark, top-left */}
        <div className="absolute top-[38px] left-[44px] flex items-center gap-3 z-10 pi-fade-up">
          <div className="w-[38px] h-[38px] rounded-[11px] flex items-center justify-center border border-platinum/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_6px_16px_-6px_rgba(0,0,0,0.8)]" style={{ background: "linear-gradient(145deg, #1A1C22, #0C0D11)" }}>
            <Sparkles className="w-[18px] h-[18px] text-platinum" strokeWidth={1.75} />
          </div>
          <div>
            <span className="font-sora font-extrabold text-lg text-platinum tracking-tight block leading-tight">
              PropIntel
            </span>
            <span className="text-[9px] font-mono text-platinum/35 uppercase tracking-[0.16em] block mt-0.5">
              Property Risk Intelligence
            </span>
          </div>
        </div>

        <StarConstellationBackground />

        <div className="relative z-[4] flex flex-col items-center">
          <div className="pi-glass w-[400px] max-w-[92vw] rounded-[22px] p-[38px_28px_32px] sm:p-[38px_34px_32px] pi-fade-up" style={{ animationDelay: "300ms" }}>
            <h1 className="font-sora text-[27px] font-extrabold tracking-tight text-platinum mb-1.5">Welcome back</h1>
            <p className="text-[13.5px] text-platinum/50 mb-6">Sign in to continue verifying properties.</p>

            {apiError && (
              <div className="p-3 rounded-xl bg-error-500/10 border border-error-500/25 text-error-400 text-xs flex items-center gap-2 mb-4">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{apiError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="mb-3.5">
                <label htmlFor="email" className="block text-[11.5px] font-medium text-platinum/50 mb-1.5">
                  Email address
                </label>
                <div
                  className={`pi-input rounded-xl flex items-center gap-2.5 px-3.5 py-3 ${
                    errors.email ? "!border-error-500/60" : ""
                  }`}
                >
                  <Mail className="w-4 h-4 text-platinum/35 flex-shrink-0" />
                  <input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="you@company.com"
                    className="w-full bg-transparent text-sm text-platinum placeholder-platinum/25 focus:outline-none"
                  />
                </div>
                {errors.email && (
                  <p className="text-[11px] text-error-400 flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3" /> {errors.email}
                  </p>
                )}
              </div>

              <div className="mb-3.5">
                <label htmlFor="password" className="block text-[11.5px] font-medium text-platinum/50 mb-1.5">
                  Password
                </label>
                <div
                  className={`pi-input rounded-xl flex items-center gap-2.5 px-3.5 py-3 ${
                    errors.password ? "!border-error-500/60" : ""
                  }`}
                >
                  <Lock className="w-4 h-4 text-platinum/35 flex-shrink-0" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => handleChange("password", e.target.value)}
                    placeholder="••••••••••"
                    className="w-full bg-transparent text-sm text-platinum placeholder-platinum/25 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-platinum/35 hover:text-platinum/60 transition-colors flex-shrink-0"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-[11px] text-error-400 flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3" /> {errors.password}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between mb-[22px] mt-4">
                <button
                  type="button"
                  onClick={() => setRemember((v) => !v)}
                  className={`pi-checkbox ${remember ? "on" : ""}`}
                >
                  <span className="box">
                    <Check />
                  </span>
                  <span className="label">Remember me</span>
                </button>
                <button
                  type="button"
                  className="text-[12.5px] hover:text-platinum hover:underline underline-offset-2 transition-colors"
                  style={{ color: "#C2C7D2" }}
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="pi-btn-primary w-full h-12 rounded-xl font-sora font-semibold text-[14.5px] flex items-center justify-center gap-2 mb-4"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Authenticating…
                  </>
                ) : (
                  <>
                    Sign in <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="flex items-center gap-3 my-[18px]">
              <span className="flex-1 h-px bg-white/10" />
              <span className="text-[11px] font-mono text-platinum/30">OR</span>
              <span className="flex-1 h-px bg-white/10" />
            </div>

            <span className="text-[10px] font-mono font-medium uppercase tracking-[0.14em] text-platinum/35 block text-center mb-2.5">
              Quick demo access
            </span>
            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => fillDemo(acc.email)}
                  className="pi-btn-ghost rounded-xl h-[42px] text-[13px] font-medium text-platinum/75 text-center"
                >
                  {acc.label}
                </button>
              ))}
            </div>

            <div className="text-center text-[11.5px] text-platinum/35 mt-[22px]">
              Protected by role-based access &amp; audit-logged sessions
            </div>
            <div className="text-center text-xs text-platinum/40 mt-2">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-platinum font-medium hover:underline underline-offset-2">
                Create account
              </Link>
            </div>
          </div>

          <div className="pi-glass mt-5 flex items-center gap-[9px] px-[18px] py-2.5 rounded-full font-mono text-[11px] text-platinum/55">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#35D6A0] pi-pulse-dot" />
            All systems operational · 5 sources connected
          </div>
        </div>
      </div>
    </div>
  );
}

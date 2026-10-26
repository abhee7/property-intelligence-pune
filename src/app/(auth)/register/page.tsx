"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-provider";
import { registerSchema } from "@/lib/validation/auth.schema";
import { checkPasswordStrength } from "@/lib/auth/password-strength";
import { Eye, EyeOff, Loader2, Sparkles, ArrowRight, AlertCircle, Building2, User, Mail, Lock } from "lucide-react";
import StarConstellationBackground from "@/components/auth/star-constellation-background";
import { CHART_STATUS } from "@/lib/chart-theme";

const NOISE_BG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export default function RegisterPage() {
  const router = useRouter();
  const { register, isAuthenticated, isLoading: authLoading } = useAuth();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    role: "" as "broker" | "land_owner" | "",
    tenantSlug: "sahyadri-demo",
    agencyName: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push("/dashboard");
    }
  }, [authLoading, isAuthenticated, router]);

  const pwStrength = form.password ? checkPasswordStrength(form.password) : null;
  const strengthColors: Record<string, string> = {
    weak: CHART_STATUS.critical,
    fair: CHART_STATUS.serious,
    good: CHART_STATUS.warning,
    strong: CHART_STATUS.good,
  };
  const strengthWidths: Record<string, string> = { weak: "25%", fair: "50%", good: "75%", strong: "100%" };

  function handleChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const n = { ...prev };
      delete n[field];
      return n;
    });
    setApiError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError("");

    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        const field = String(err.path[0]);
        if (!fieldErrors[field]) fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    const result = await register(form);
    setLoading(false);

    if (result.success) {
      router.push("/dashboard");
    } else {
      setApiError(result.error || "Registration failed");
    }
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

      <div className="relative min-h-screen flex items-center justify-center overflow-hidden py-10">
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
          <div className="pi-glass w-[440px] max-w-[92vw] rounded-[22px] p-[38px_28px_32px] sm:p-[38px_34px_32px] pi-fade-up" style={{ animationDelay: "300ms" }}>
            <h1 className="font-sora text-[27px] font-extrabold tracking-tight text-platinum mb-1.5">Create account</h1>
            <p className="text-[13.5px] text-platinum/50 mb-6">Join the property intelligence &amp; due-diligence platform.</p>

            {apiError && (
              <div className="p-3 rounded-xl bg-error-500/10 border border-error-500/25 text-error-400 text-xs flex items-center gap-2 mb-4">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{apiError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Role selector */}
              <div className="mb-3.5">
                <label className="block text-[11.5px] font-medium text-platinum/50 mb-1.5">I am registering as</label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleChange("role", "broker")}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      form.role === "broker"
                        ? "bg-white/[0.07] border-platinum/40"
                        : "bg-white/[0.02] border-white/[0.1] hover:border-white/[0.2]"
                    }`}
                  >
                    <Building2 className={`w-4 h-4 mb-1 ${form.role === "broker" ? "text-platinum" : "text-platinum/35"}`} />
                    <span className={`font-bold block text-xs ${form.role === "broker" ? "text-platinum" : "text-platinum/70"}`}>Broker / Agent</span>
                    <span className="text-[10px] text-platinum/40 block">List &amp; verify parcels</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleChange("role", "land_owner")}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      form.role === "land_owner"
                        ? "bg-white/[0.07] border-platinum/40"
                        : "bg-white/[0.02] border-white/[0.1] hover:border-white/[0.2]"
                    }`}
                  >
                    <User className={`w-4 h-4 mb-1 ${form.role === "land_owner" ? "text-platinum" : "text-platinum/35"}`} />
                    <span className={`font-bold block text-xs ${form.role === "land_owner" ? "text-platinum" : "text-platinum/70"}`}>Land Owner</span>
                    <span className="text-[10px] text-platinum/40 block">Protect property titles</span>
                  </button>
                </div>
                {errors.role && (
                  <p className="text-[11px] text-error-400 flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3" /> {errors.role}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5 mb-3.5">
                <div>
                  <label className="block text-[11.5px] font-medium text-platinum/50 mb-1.5">First Name</label>
                  <div className={`pi-input rounded-xl flex items-center px-3.5 py-3 ${errors.firstName ? "!border-error-500/60" : ""}`}>
                    <input
                      type="text"
                      value={form.firstName}
                      onChange={(e) => handleChange("firstName", e.target.value)}
                      placeholder="Rajesh"
                      className="w-full bg-transparent text-sm text-platinum placeholder-platinum/25 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11.5px] font-medium text-platinum/50 mb-1.5">Last Name</label>
                  <div className={`pi-input rounded-xl flex items-center px-3.5 py-3 ${errors.lastName ? "!border-error-500/60" : ""}`}>
                    <input
                      type="text"
                      value={form.lastName}
                      onChange={(e) => handleChange("lastName", e.target.value)}
                      placeholder="Patil"
                      className="w-full bg-transparent text-sm text-platinum placeholder-platinum/25 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="mb-3.5">
                <label className="block text-[11.5px] font-medium text-platinum/50 mb-1.5">Email address</label>
                <div className={`pi-input rounded-xl flex items-center gap-2.5 px-3.5 py-3 ${errors.email ? "!border-error-500/60" : ""}`}>
                  <Mail className="w-4 h-4 text-platinum/35 flex-shrink-0" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="rajesh@company.com"
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
                <label className="block text-[11.5px] font-medium text-platinum/50 mb-1.5">Password</label>
                <div className={`pi-input rounded-xl flex items-center gap-2.5 px-3.5 py-3 ${errors.password ? "!border-error-500/60" : ""}`}>
                  <Lock className="w-4 h-4 text-platinum/35 flex-shrink-0" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => handleChange("password", e.target.value)}
                    placeholder="••••••••"
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
                {pwStrength && (
                  <div className="mt-2">
                    <div className="h-1 w-full rounded-full bg-white/[0.08] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: strengthWidths[pwStrength.label], background: strengthColors[pwStrength.label] }}
                      />
                    </div>
                    <span className="text-[10.5px] font-mono uppercase tracking-wider mt-1 block" style={{ color: strengthColors[pwStrength.label] }}>
                      {pwStrength.label} password
                    </span>
                  </div>
                )}
                {errors.password && (
                  <p className="text-[11px] text-error-400 flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3" /> {errors.password}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="pi-btn-primary w-full h-12 rounded-xl font-sora font-semibold text-[14.5px] flex items-center justify-center gap-2 mb-4 mt-1"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Creating account…
                  </>
                ) : (
                  <>
                    Register account <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="text-center text-xs text-platinum/40">
              Already have an account?{" "}
              <Link href="/login" className="text-platinum font-medium hover:underline underline-offset-2">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

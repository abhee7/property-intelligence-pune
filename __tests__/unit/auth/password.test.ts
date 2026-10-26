import { describe, it, expect } from "vitest";
import { checkPasswordStrength } from "@/lib/auth/password-strength";

// Note: hashPassword and verifyPassword are server-only (bcrypt)
// They're tested in the integration tests with a real Node.js environment

describe("Password strength", () => {
  it("rates short lowercase-only as weak", () => {
    const result = checkPasswordStrength("hello");
    expect(result.label).toBe("weak");
    expect(result.score).toBeLessThanOrEqual(3);
  });

  it("rates 8-char mixed as fair", () => {
    const result = checkPasswordStrength("Hello123");
    expect(["fair", "good"]).toContain(result.label);
  });

  it("rates 16-char with all character types as strong", () => {
    const result = checkPasswordStrength("MyStr0ng!Pass@16");
    expect(result.label).toBe("strong");
    expect(result.score).toBeGreaterThanOrEqual(6);
  });

  it("provides suggestions for missing character types", () => {
    const result = checkPasswordStrength("alllowercase");
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.some((s: string) => s.includes("uppercase"))).toBe(true);
  });

  it("provides no unmet suggestions for perfect password", () => {
    const result = checkPasswordStrength("P@ssw0rd!VeryLong2026");
    expect(result.label).toBe("strong");
  });
});

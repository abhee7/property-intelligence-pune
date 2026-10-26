// Client-safe — no native dependencies
export function checkPasswordStrength(pw: string): { score: number; label: "weak" | "fair" | "good" | "strong"; suggestions: string[] } {
  let s = 0; const sug: string[] = [];
  if (pw.length >= 8) s++; if (pw.length >= 12) s++; if (pw.length >= 16) s++;
  if (/[a-z]/.test(pw)) s++; else sug.push("Add lowercase letters");
  if (/[A-Z]/.test(pw)) s++; else sug.push("Add uppercase letters");
  if (/[0-9]/.test(pw)) s++; else sug.push("Add numbers");
  if (/[^a-zA-Z0-9]/.test(pw)) s++; else sug.push("Add special characters");
  if (pw.length < 12) sug.push("Use at least 12 characters");
  return { score: Math.min(s, 7), label: s <= 2 ? "weak" : s <= 4 ? "fair" : s <= 5 ? "good" : "strong", suggestions: sug };
}

import "server-only";
import { hash, compare } from "bcryptjs";
export async function hashPassword(p: string): Promise<string> { return hash(p, 12); }
export async function verifyPassword(p: string, h: string): Promise<boolean> { return compare(p, h); }


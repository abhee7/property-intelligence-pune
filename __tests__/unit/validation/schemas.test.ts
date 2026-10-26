// __tests__/unit/validation/schemas.test.ts

import { describe, it, expect } from "vitest";
import { loginSchema, registerSchema } from "@/lib/validation/auth.schema";
import { createPropertySchema } from "@/lib/validation/property.schema";
import { validateFileType, validateFileSize } from "@/lib/validation/document.schema";

describe("Validation schemas", () => {
  describe("loginSchema", () => {
    it("accepts valid email and password", () => {
      const result = loginSchema.safeParse({ email: "test@example.com", password: "Password1" });
      expect(result.success).toBe(true);
    });

    it("rejects empty email", () => {
      const result = loginSchema.safeParse({ email: "", password: "Password1" });
      expect(result.success).toBe(false);
    });

    it("rejects invalid email format", () => {
      const result = loginSchema.safeParse({ email: "not-an-email", password: "Password1" });
      expect(result.success).toBe(false);
    });

    it("rejects password under 8 chars", () => {
      const result = loginSchema.safeParse({ email: "test@example.com", password: "Abc1" });
      expect(result.success).toBe(false);
    });
  });

  describe("registerSchema", () => {
    const validData = {
      firstName: "Rajesh",
      lastName: "Patil",
      email: "rajesh@example.com",
      password: "Secure@123",
      confirmPassword: "Secure@123",
      role: "broker" as const,
      tenantSlug: "test-org",
    };

    it("accepts valid registration data", () => {
      const result = registerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("rejects mismatched passwords", () => {
      const result = registerSchema.safeParse({ ...validData, confirmPassword: "Different@123" });
      expect(result.success).toBe(false);
    });

    it("rejects password without uppercase", () => {
      const result = registerSchema.safeParse({ ...validData, password: "nouppercase1", confirmPassword: "nouppercase1" });
      expect(result.success).toBe(false);
    });

    it("rejects password without number", () => {
      const result = registerSchema.safeParse({ ...validData, password: "NoNumbers!", confirmPassword: "NoNumbers!" });
      expect(result.success).toBe(false);
    });

    it("rejects invalid role", () => {
      const result = registerSchema.safeParse({ ...validData, role: "superadmin" });
      expect(result.success).toBe(false);
    });

    it("accepts valid Indian phone number", () => {
      const result = registerSchema.safeParse({ ...validData, phone: "+919876543210" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid phone number", () => {
      const result = registerSchema.safeParse({ ...validData, phone: "9876543210" });
      expect(result.success).toBe(false);
    });

    it("rejects tenant slug with spaces", () => {
      const result = registerSchema.safeParse({ ...validData, tenantSlug: "has spaces" });
      expect(result.success).toBe(false);
    });
  });

  describe("createPropertySchema", () => {
    const validProperty = {
      title: "Plot 42, Kharadi",
      propertyTypeId: "pt-residential-plot",
      address: {
        line1: "Near Eon IT Park",
        city: "Pune",
        district: "Pune",
        state: "Maharashtra",
        postalCode: "411014",
      },
    };

    it("accepts valid property data", () => {
      const result = createPropertySchema.safeParse(validProperty);
      expect(result.success).toBe(true);
    });

    it("rejects title under 3 characters", () => {
      const result = createPropertySchema.safeParse({ ...validProperty, title: "Hi" });
      expect(result.success).toBe(false);
    });

    it("rejects invalid PIN code", () => {
      const result = createPropertySchema.safeParse({
        ...validProperty,
        address: { ...validProperty.address, postalCode: "12345" }, // 5 digits
      });
      expect(result.success).toBe(false);
    });

    it("accepts optional fields", () => {
      const result = createPropertySchema.safeParse({
        ...validProperty,
        price: 4800000,
        areaSqft: 2400,
        surveyNumber: "118/2A",
      });
      expect(result.success).toBe(true);
      expect(result.data?.price).toBe(4800000);
    });

    it("rejects negative price", () => {
      const result = createPropertySchema.safeParse({ ...validProperty, price: -100 });
      expect(result.success).toBe(false);
    });
  });

  describe("Document validation", () => {
    it("accepts valid file types", () => {
      expect(validateFileType("application/pdf")).toBe(true);
      expect(validateFileType("image/jpeg")).toBe(true);
      expect(validateFileType("image/png")).toBe(true);
    });

    it("rejects invalid file types", () => {
      expect(validateFileType("application/zip")).toBe(false);
      expect(validateFileType("text/html")).toBe(false);
      expect(validateFileType("application/javascript")).toBe(false);
    });

    it("accepts files under 25MB", () => {
      expect(validateFileSize(1024)).toBe(true);
      expect(validateFileSize(24 * 1024 * 1024)).toBe(true);
    });

    it("rejects files over 25MB", () => {
      expect(validateFileSize(26 * 1024 * 1024)).toBe(false);
    });

    it("rejects zero-byte files", () => {
      expect(validateFileSize(0)).toBe(false);
    });
  });
});

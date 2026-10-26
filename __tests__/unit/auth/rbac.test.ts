// __tests__/unit/auth/rbac.test.ts

import { describe, it, expect } from "vitest";
import { hasRole, hasPermission } from "@/lib/auth/middleware";

describe("RBAC", () => {
  describe("hasRole (hierarchy check)", () => {
    it("admin has access to all roles", () => {
      expect(hasRole("admin", "admin")).toBe(true);
      expect(hasRole("admin", "agency_admin")).toBe(true);
      expect(hasRole("admin", "broker")).toBe(true);
      expect(hasRole("admin", "land_owner")).toBe(true);
    });

    it("agency_admin has access to broker and below", () => {
      expect(hasRole("agency_admin", "admin")).toBe(false);
      expect(hasRole("agency_admin", "agency_admin")).toBe(true);
      expect(hasRole("agency_admin", "broker")).toBe(true);
      expect(hasRole("agency_admin", "land_owner")).toBe(true);
    });

    it("broker has access to land_owner and self", () => {
      expect(hasRole("broker", "admin")).toBe(false);
      expect(hasRole("broker", "agency_admin")).toBe(false);
      expect(hasRole("broker", "broker")).toBe(true);
      expect(hasRole("broker", "land_owner")).toBe(true);
    });

    it("land_owner has access only to self", () => {
      expect(hasRole("land_owner", "admin")).toBe(false);
      expect(hasRole("land_owner", "agency_admin")).toBe(false);
      expect(hasRole("land_owner", "broker")).toBe(false);
      expect(hasRole("land_owner", "land_owner")).toBe(true);
    });
  });

  describe("hasPermission", () => {
    it("admin has all permissions", () => {
      expect(hasPermission("admin", { resource: "properties", action: "manage" })).toBe(true);
      expect(hasPermission("admin", { resource: "users", action: "delete" })).toBe(true);
      expect(hasPermission("admin", { resource: "anything", action: "create" })).toBe(true);
    });

    it("broker can create and read properties", () => {
      expect(hasPermission("broker", { resource: "properties", action: "create" })).toBe(true);
      expect(hasPermission("broker", { resource: "properties", action: "read" })).toBe(true);
      expect(hasPermission("broker", { resource: "properties", action: "update" })).toBe(true);
    });

    it("broker cannot delete properties", () => {
      expect(hasPermission("broker", { resource: "properties", action: "delete" })).toBe(false);
    });

    it("broker cannot manage users", () => {
      expect(hasPermission("broker", { resource: "users", action: "create" })).toBe(false);
      expect(hasPermission("broker", { resource: "users", action: "delete" })).toBe(false);
    });

    it("land_owner can only read", () => {
      expect(hasPermission("land_owner", { resource: "properties", action: "read" })).toBe(true);
      expect(hasPermission("land_owner", { resource: "properties", action: "create" })).toBe(false);
      expect(hasPermission("land_owner", { resource: "properties", action: "update" })).toBe(false);
      expect(hasPermission("land_owner", { resource: "documents", action: "read" })).toBe(true);
      expect(hasPermission("land_owner", { resource: "documents", action: "create" })).toBe(false);
    });

    it("agency_admin can manage properties and documents", () => {
      expect(hasPermission("agency_admin", { resource: "properties", action: "manage" })).toBe(true);
      expect(hasPermission("agency_admin", { resource: "documents", action: "manage" })).toBe(true);
      expect(hasPermission("agency_admin", { resource: "ai_agents", action: "manage" })).toBe(true);
    });
  });
});

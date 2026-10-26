// src/lib/validation/property.schema.ts

import { z } from "zod";

// ─── Property field schemas ───

const latLng = z.number().min(-90).max(90);

export const addressSchema = z.object({
  line1: z.string().min(1, "Address is required").max(255),
  line2: z.string().max(255).optional().or(z.literal("")),
  city: z.string().min(1, "City is required").max(100),
  district: z.string().min(1, "District is required").max(100),
  state: z.string().min(1, "State is required").max(100),
  postalCode: z.string().regex(/^\d{6}$/, "Must be a valid 6-digit PIN code"),
  country: z.string().default("IN"),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const createPropertySchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(300),
  description: z.string().max(5000).optional().or(z.literal("")),
  propertyTypeId: z.string().min(1, "Property type is required"),
  price: z.number().positive("Price must be positive").optional(),
  areaSqft: z.number().positive("Area must be positive").optional(),
  surveyNumber: z.string().max(50).optional().or(z.literal("")),
  gutNumber: z.string().max(50).optional().or(z.literal("")),
  ctsNumber: z.string().max(50).optional().or(z.literal("")),
  khasraNumber: z.string().max(50).optional().or(z.literal("")),
  yearBuilt: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  ownerId: z.string().optional(),
  address: addressSchema,
  metadata: z.object({
    taluka: z.string().max(100).optional(),
    village: z.string().max(100).optional(),
    zone: z.string().optional(),
    facing: z.string().optional(),
    roadWidth: z.string().optional(),
    waterSupply: z.string().optional(),
    electricity: z.string().optional(),
  }).optional(),
});

export const updatePropertySchema = createPropertySchema.partial().extend({
  status: z.enum(["DRAFT", "LISTED", "UNDER_VERIFICATION", "VERIFIED", "FLAGGED", "ARCHIVED", "REJECTED"]).optional(),
});

export const propertySearchSchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  propertyType: z.string().optional(),
  riskLevel: z.string().optional(),
  district: z.string().optional(),
  taluka: z.string().optional(),
  priceMin: z.coerce.number().optional(),
  priceMax: z.coerce.number().optional(),
  areaMin: z.coerce.number().optional(),
  areaMax: z.coerce.number().optional(),
  brokerId: z.string().optional(),
  ownerId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.enum(["created_at", "updated_at", "price", "area_sqft", "title"]).default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
export type PropertySearchInput = z.infer<typeof propertySearchSchema>;

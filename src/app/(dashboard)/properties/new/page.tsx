// src/app/(dashboard)/properties/new/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, MapPin, Save, Loader2, AlertCircle, ChevronDown, FileText } from "lucide-react";

const TYPES = [
  { id: "pt-residential-plot", name: "Residential plot" },
  { id: "pt-commercial-plot", name: "Commercial plot" },
  { id: "pt-agricultural-land", name: "Agricultural land" },
  { id: "pt-flat-apartment", name: "Flat / Apartment" },
  { id: "pt-row-house", name: "Row house" },
  { id: "pt-bungalow", name: "Bungalow" },
  { id: "pt-industrial-gala", name: "Industrial gala" },
  { id: "pt-farm-house", name: "Farm house" },
];

const TALUKAS = ["Haveli", "Mulshi", "Maval", "Bhor", "Velhe", "Purandar", "Baramati", "Indapur", "Shirur", "Khed", "Junnar", "Ambegaon", "Daund"];

export default function NewPropertyPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    title: "", description: "", propertyTypeId: "", price: "", areaSqft: "",
    surveyNumber: "", gutNumber: "", ctsNumber: "", khasraNumber: "", yearBuilt: "",
    line1: "", line2: "", city: "Pune", district: "Pune", state: "Maharashtra", postalCode: "",
    latitude: "", longitude: "",
    taluka: "", village: "", zone: "", facing: "", roadWidth: "", waterSupply: "", electricity: "",
  });

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = "Title is required";
    if (!form.propertyTypeId) errs.propertyTypeId = "Select a property type";
    if (!form.line1.trim()) errs.line1 = "Address is required";
    if (!form.postalCode.match(/^\d{6}$/)) errs.postalCode = "Enter a valid 6-digit PIN";
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSaving(true);
    // Production: POST /api/properties with auth token
    await new Promise((r) => setTimeout(r, 1500));
    setSaving(false);
    setSaved(true);
    setTimeout(() => router.push("/properties"), 1200);
  }

  const fieldClass = (field: string) =>
    `pi-input rounded-xl flex items-center px-3.5 ${errors[field] ? "!border-error-500/60" : ""}`;

  const inputTextClass = "w-full bg-transparent text-sm text-platinum placeholder-platinum/25 focus:outline-none py-2.5";
  const labelClass = "block text-[11.5px] font-medium text-platinum/50 mb-1.5";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button
        onClick={() => router.push("/properties")}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-platinum/50 hover:text-platinum transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to properties
      </button>

      <div>
        <h1 className="font-sora text-2xl md:text-3xl font-extrabold text-platinum tracking-tight">
          Add New Property
        </h1>
        <p className="text-sm text-platinum/45 mt-1">
          Fill in the details below. Fields marked with * are required.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Basic info */}
        <div className="pi-card p-6 space-y-5">
          <div>
            <h2 className="font-sora text-base font-bold text-platinum flex items-center gap-2">
              <Building2 className="w-4 h-4 text-platinum/70" /> Property information
            </h2>
            <p className="text-xs text-platinum/40 mt-1">Basic details about the property</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Title *</label>
              <div className={fieldClass("title")}>
                <input
                  className={inputTextClass}
                  placeholder="e.g. Plot 42, Kharadi"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                />
              </div>
              {errors.title && (
                <p className="text-[11px] text-error-400 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" /> {errors.title}
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>Property type *</label>
              <div className={`${fieldClass("propertyTypeId")} relative`}>
                <select
                  className={`${inputTextClass} appearance-none pr-6`}
                  value={form.propertyTypeId}
                  onChange={(e) => set("propertyTypeId", e.target.value)}
                >
                  <option value="" className="bg-[#0c0d11] text-platinum">Select type</option>
                  {TYPES.map((t) => (
                    <option key={t.id} value={t.id} className="bg-[#0c0d11] text-platinum">{t.name}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-platinum/35 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              {errors.propertyTypeId && (
                <p className="text-[11px] text-error-400 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" /> {errors.propertyTypeId}
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>Expected price (₹)</label>
              <div className={fieldClass("price")}>
                <input
                  type="number"
                  className={inputTextClass}
                  placeholder="e.g. 4800000"
                  value={form.price}
                  onChange={(e) => set("price", e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Area (sq ft)</label>
              <div className={fieldClass("areaSqft")}>
                <input
                  type="number"
                  className={inputTextClass}
                  placeholder="e.g. 2400"
                  value={form.areaSqft}
                  onChange={(e) => set("areaSqft", e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Year built</label>
              <div className={fieldClass("yearBuilt")}>
                <input
                  type="number"
                  className={inputTextClass}
                  placeholder="e.g. 2020"
                  value={form.yearBuilt}
                  onChange={(e) => set("yearBuilt", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <div className="pi-input rounded-xl px-3.5 py-2.5">
              <textarea
                className="w-full bg-transparent text-sm text-platinum placeholder-platinum/25 focus:outline-none resize-y min-h-[90px]"
                placeholder="Describe the property..."
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Survey identifiers */}
        <div className="pi-card p-6 space-y-5">
          <div>
            <h2 className="font-sora text-base font-bold text-platinum flex items-center gap-2">
              <FileText className="w-4 h-4 text-platinum/70" /> Survey identifiers
            </h2>
            <p className="text-xs text-platinum/40 mt-1">Official survey and registration numbers</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Survey number</label>
              <div className={fieldClass("surveyNumber")}>
                <input
                  className={inputTextClass}
                  placeholder="e.g. 118/2A"
                  value={form.surveyNumber}
                  onChange={(e) => set("surveyNumber", e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Gut number</label>
              <div className={fieldClass("gutNumber")}>
                <input
                  className={inputTextClass}
                  placeholder="e.g. 4521"
                  value={form.gutNumber}
                  onChange={(e) => set("gutNumber", e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>CTS number</label>
              <div className={fieldClass("ctsNumber")}>
                <input
                  className={inputTextClass}
                  placeholder="e.g. CTS 4821"
                  value={form.ctsNumber}
                  onChange={(e) => set("ctsNumber", e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Khasra number</label>
              <div className={fieldClass("khasraNumber")}>
                <input
                  className={inputTextClass}
                  placeholder="e.g. 4521/87"
                  value={form.khasraNumber}
                  onChange={(e) => set("khasraNumber", e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Address */}
        <div className="pi-card p-6 space-y-5">
          <div>
            <h2 className="font-sora text-base font-bold text-platinum flex items-center gap-2">
              <MapPin className="w-4 h-4 text-platinum/70" /> Address
            </h2>
            <p className="text-xs text-platinum/40 mt-1">Property location and coordinates</p>
          </div>

          <div>
            <label className={labelClass}>Address line 1 *</label>
            <div className={fieldClass("line1")}>
              <input
                className={inputTextClass}
                placeholder="Plot number, street, landmark"
                value={form.line1}
                onChange={(e) => set("line1", e.target.value)}
              />
            </div>
            {errors.line1 && (
              <p className="text-[11px] text-error-400 flex items-center gap-1 mt-1">
                <AlertCircle className="w-3 h-3" /> {errors.line1}
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Address line 2</label>
            <div className={fieldClass("line2")}>
              <input
                className={inputTextClass}
                placeholder="Near, opposite, behind..."
                value={form.line2}
                onChange={(e) => set("line2", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>City</label>
              <div className={fieldClass("city")}>
                <input className={inputTextClass} value={form.city} onChange={(e) => set("city", e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelClass}>District</label>
              <div className={fieldClass("district")}>
                <input className={inputTextClass} value={form.district} onChange={(e) => set("district", e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelClass}>State</label>
              <div className={fieldClass("state")}>
                <input className={inputTextClass} value={form.state} onChange={(e) => set("state", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>PIN code *</label>
              <div className={fieldClass("postalCode")}>
                <input
                  className={inputTextClass}
                  placeholder="411057"
                  maxLength={6}
                  value={form.postalCode}
                  onChange={(e) => set("postalCode", e.target.value)}
                />
              </div>
              {errors.postalCode && (
                <p className="text-[11px] text-error-400 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" /> {errors.postalCode}
                </p>
              )}
            </div>
            <div>
              <label className={labelClass}>Taluka</label>
              <div className={`${fieldClass("taluka")} relative`}>
                <select
                  className={`${inputTextClass} appearance-none pr-6`}
                  value={form.taluka}
                  onChange={(e) => set("taluka", e.target.value)}
                >
                  <option value="" className="bg-[#0c0d11] text-platinum">Select</option>
                  {TALUKAS.map((t) => (
                    <option key={t} value={t} className="bg-[#0c0d11] text-platinum">{t}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-platinum/35 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className={labelClass}>Village</label>
              <div className={fieldClass("village")}>
                <input
                  className={inputTextClass}
                  placeholder="e.g. Kharadi"
                  value={form.village}
                  onChange={(e) => set("village", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Latitude</label>
              <div className={fieldClass("latitude")}>
                <input
                  type="number"
                  step="0.000001"
                  className={inputTextClass}
                  placeholder="18.5562"
                  value={form.latitude}
                  onChange={(e) => set("latitude", e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Longitude</label>
              <div className={fieldClass("longitude")}>
                <input
                  type="number"
                  step="0.000001"
                  className={inputTextClass}
                  placeholder="73.9404"
                  value={form.longitude}
                  onChange={(e) => set("longitude", e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/properties")}
            className="pi-btn-ghost px-5 py-2.5 rounded-xl text-platinum/75 font-bold text-xs uppercase tracking-wider"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="pi-btn-primary flex items-center gap-2 px-6 py-2.5 rounded-xl font-sora font-bold text-xs uppercase tracking-wider"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" /> Save property
              </>
            )}
          </button>
        </div>
      </form>

      {/* Success overlay */}
      {saved && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="pi-glass rounded-[22px] p-10 text-center pi-fade-up">
            <div className="pi-icon-tile w-14 h-14 mx-auto mb-4 text-emerald-400">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="font-sora text-lg font-bold text-platinum mb-1">Property created</div>
            <div className="text-sm text-platinum/45">Redirecting to properties list...</div>
          </div>
        </div>
      )}
    </div>
  );
}

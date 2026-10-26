"use client";

import React, { useState } from "react";
import { useAuth } from "@/lib/auth/auth-provider";
import { Settings, Shield, User, Globe, Bell, Save, CheckCircle2 } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);

  const [settings, setSettings] = useState({
    defaultCurrency: "INR (₹)",
    timezone: "Asia/Kolkata (IST)",
    litigationWeight: 35,
    revenue712Weight: 25,
    encumbranceWeight: 20,
    zoningWeight: 20,
    emailAlerts: true,
    courtAlerts: true,
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="pi-icon-tile w-11 h-11 text-platinum/80">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-sora text-2xl font-extrabold text-platinum tracking-tight">
              Platform &amp; Risk Model Settings
            </h1>
            <p className="text-xs text-platinum/45">
              Configure tenant parameters, AI risk weights, and notification channels
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* User Account Info */}
        <div className="pi-card p-6 space-y-4">
          <h3 className="font-sora text-base font-bold text-platinum flex items-center gap-2">
            <User className="w-4 h-4 text-platinum/60" />
            Authenticated User Profile
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-platinum/40 font-medium block mb-1.5">First Name</label>
              <input
                type="text"
                disabled
                value={user?.firstName || "Admin"}
                className="pi-input w-full px-3.5 py-2.5 rounded-xl text-platinum font-semibold bg-transparent disabled:opacity-70"
              />
            </div>
            <div>
              <label className="text-platinum/40 font-medium block mb-1.5">Last Name</label>
              <input
                type="text"
                disabled
                value={user?.lastName || "User"}
                className="pi-input w-full px-3.5 py-2.5 rounded-xl text-platinum font-semibold bg-transparent disabled:opacity-70"
              />
            </div>
            <div>
              <label className="text-platinum/40 font-medium block mb-1.5">Email Address</label>
              <input
                type="text"
                disabled
                value={user?.email || "admin@sahyadri-demo.com"}
                className="pi-input w-full px-3.5 py-2.5 rounded-xl text-platinum font-semibold bg-transparent disabled:opacity-70 font-mono"
              />
            </div>
            <div>
              <label className="text-platinum/40 font-medium block mb-1.5">Role Permission Level</label>
              <input
                type="text"
                disabled
                value={user?.role?.toUpperCase().replace("_", " ") || "ADMIN"}
                className="pi-input w-full px-3.5 py-2.5 rounded-xl text-platinum font-bold bg-transparent disabled:opacity-70"
              />
            </div>
          </div>
        </div>

        {/* AI Risk Score Model Weights */}
        <div className="pi-card p-6 space-y-4">
          <h3 className="font-sora text-base font-bold text-platinum flex items-center gap-2">
            <Shield className="w-4 h-4 text-rose-400" />
            AI Risk Model Scoring Weights (%)
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-platinum/40 font-medium block mb-1.5">Litigation &amp; Court Disputes (%)</label>
              <input
                type="number"
                value={settings.litigationWeight}
                onChange={(e) => setSettings({ ...settings, litigationWeight: Number(e.target.value) })}
                className="pi-input w-full px-3.5 py-2.5 rounded-xl text-platinum font-semibold bg-transparent focus:outline-none"
              />
            </div>

            <div>
              <label className="text-platinum/40 font-medium block mb-1.5">7/12 Mutation Mismatch (%)</label>
              <input
                type="number"
                value={settings.revenue712Weight}
                onChange={(e) => setSettings({ ...settings, revenue712Weight: Number(e.target.value) })}
                className="pi-input w-full px-3.5 py-2.5 rounded-xl text-platinum font-semibold bg-transparent focus:outline-none"
              />
            </div>

            <div>
              <label className="text-platinum/40 font-medium block mb-1.5">Encumbrance Clearance (%)</label>
              <input
                type="number"
                value={settings.encumbranceWeight}
                onChange={(e) => setSettings({ ...settings, encumbranceWeight: Number(e.target.value) })}
                className="pi-input w-full px-3.5 py-2.5 rounded-xl text-platinum font-semibold bg-transparent focus:outline-none"
              />
            </div>

            <div>
              <label className="text-platinum/40 font-medium block mb-1.5">Zoning &amp; Regulations (%)</label>
              <input
                type="number"
                value={settings.zoningWeight}
                onChange={(e) => setSettings({ ...settings, zoningWeight: Number(e.target.value) })}
                className="pi-input w-full px-3.5 py-2.5 rounded-xl text-platinum font-semibold bg-transparent focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="pi-btn-primary inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-sora font-bold text-xs uppercase tracking-wider"
          >
            <Save className="w-4 h-4" /> Save Configuration
          </button>
          {saved && (
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Settings updated!
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

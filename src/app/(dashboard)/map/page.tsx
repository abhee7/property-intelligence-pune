"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-provider";
import { RiskBadge } from "@/components/ui/risk-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Map, MapPin, Search, ShieldAlert, Eye, Loader2 } from "lucide-react";

// Dynamic import for Leaflet map component
const PropertyMap = dynamic(() => import("@/components/shared/property-map"), {
  ssr: false,
  loading: () => (
    <div className="h-[600px] flex flex-col items-center justify-center gap-3 text-platinum/35 text-xs">
      <Loader2 className="w-5 h-5 animate-spin text-platinum/50" />
      Loading interactive property map...
    </div>
  ),
});

export default function PropertyMapPage() {
  const { getAccessToken } = useAuth();
  const [properties, setProperties] = useState<any[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("All");

  useEffect(() => {
    async function fetchProperties() {
      try {
        const token = getAccessToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        // the API returns at most 100 per page, so walk through all of them
        const all: any[] = [];
        let page = 1;
        let totalPages = 1;
        do {
          const res = await fetch(`/api/properties?limit=100&page=${page}`, { headers });
          const data = await res.json();
          if (!data.success) break;
          all.push(...(data.data?.properties ?? []));
          totalPages = data.data?.pagination?.totalPages ?? 1;
          page++;
        } while (page <= totalPages && page <= 50);
        setProperties(all);
        setSelectedProperty(all[0] ?? null);
      } catch (err) {
        console.error("Map properties load error:", err);
      }
    }

    fetchProperties();
  }, [getAccessToken]);

  const filteredProperties = properties.filter((p) => {
    if (search && !p.title?.toLowerCase().includes(search.toLowerCase()) && !p.surveyNumber?.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (riskFilter !== "All" && p.riskScore?.riskLevel !== riskFilter) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-sora text-2xl font-extrabold text-platinum tracking-tight flex items-center gap-2.5">
            <span className="pi-icon-tile w-9 h-9 text-platinum/80">
              <Map className="w-5 h-5" />
            </span>
            Interactive Property GIS Map
          </h1>
          <p className="text-xs text-platinum/45 mt-1">
            Geospatial intelligence and risk overlay across Pune district
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="pi-card p-4 flex flex-col sm:flex-row items-center gap-3">
        <div className="pi-input relative flex-1 w-full flex items-center rounded-xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-platinum/35 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search map by title or survey #..."
            className="w-full pl-10 pr-4 py-2.5 text-xs bg-transparent text-platinum placeholder-platinum/30 focus:outline-none"
          />
        </div>
        <div className="pi-input relative w-full sm:w-56 flex items-center rounded-xl">
          <ShieldAlert className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-platinum/35 pointer-events-none" />
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="w-full appearance-none pl-10 pr-4 py-2.5 text-xs bg-transparent text-platinum focus:outline-none"
          >
            <option className="bg-[#14151b]" value="All">All Risk Levels</option>
            <option className="bg-[#14151b]" value="MINIMAL">Minimal Risk</option>
            <option className="bg-[#14151b]" value="LOW">Low Risk</option>
            <option className="bg-[#14151b]" value="MODERATE">Moderate Risk</option>
            <option className="bg-[#14151b]" value="HIGH">High Risk</option>
            <option className="bg-[#14151b]" value="CRITICAL">Critical Risk</option>
          </select>
        </div>
      </div>

      {/* Map + Sidebar Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leaflet Map */}
        <div className="pi-card lg:col-span-2 overflow-hidden p-0">
          <PropertyMap
            properties={filteredProperties}
            onSelectProperty={(p: any) => setSelectedProperty(p)}
          />
        </div>

        {/* Selected Property Preview Sidebar */}
        <div className="pi-card p-6 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-platinum/40 mb-3">
              Selected Parcel Preview
            </h3>

            {selectedProperty ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <StatusBadge status={selectedProperty.status} size="sm" />
                  <RiskBadge
                    level={selectedProperty.riskScore?.riskLevel}
                    score={selectedProperty.riskScore?.overallScore}
                    size="sm"
                  />
                </div>

                <div>
                  <h2 className="font-sora text-lg font-bold text-platinum tracking-tight">
                    {selectedProperty.title}
                  </h2>
                  <p className="text-xs text-platinum/45 flex items-center gap-1 mt-1">
                    <MapPin className="w-3.5 h-3.5 text-platinum/35" />
                    {selectedProperty.metadata?.village || selectedProperty.address?.city || "Pune"},{" "}
                    {selectedProperty.metadata?.taluka || "Haveli"}
                  </p>
                </div>

                <div className="pi-surface space-y-2 p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-platinum/40">Survey #:</span>
                    <span className="font-mono font-bold text-platinum">
                      {selectedProperty.surveyNumber || "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-platinum/40">Type:</span>
                    <span className="font-bold text-platinum">
                      {selectedProperty.propertyType?.name || "Plot"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-platinum/40">Price:</span>
                    <span className="font-bold text-emerald-400">
                      ₹{selectedProperty.price ? (selectedProperty.price / 100000).toFixed(1) + " L" : "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-platinum/40">Select a property pin on the map to inspect details.</p>
            )}
          </div>

          {selectedProperty && (
            <Link
              href={`/properties/${selectedProperty.id}`}
              className="pi-btn-primary w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-sora font-bold text-xs uppercase tracking-wider"
            >
              <Eye className="w-4 h-4" /> Open Full Intelligence Report
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

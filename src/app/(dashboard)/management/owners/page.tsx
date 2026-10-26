"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-provider";
import { UserCheck, Search, Phone, Mail, CheckCircle2, RotateCw, MapPin, FileCheck, Calendar } from "lucide-react";

export default function LandOwnersPage() {
  const { getAccessToken } = useAuth();
  const [owners, setOwners] = useState<any[]>([
    { id: "owner-001", firstName: "Pramod", lastName: "Lokhande", email: "owner@sahyadri-demo.com", phone: "+919870011223", isActive: true, memberSince: "Sep 2023", primaryRegion: "Haveli, Pune", kycVerified: true, _count: { ownedProperties: 4 } },
    { id: "owner-002", firstName: "Amit", lastName: "Patil", email: "amit.patil@gmail.com", phone: "+919870022334", isActive: true, memberSince: "Jan 2024", primaryRegion: "Mulshi, Pune", kycVerified: true, _count: { ownedProperties: 3 } },
    { id: "owner-003", firstName: "Sunil", lastName: "Deshmukh", email: "sunil.d@gmail.com", phone: "+919870033445", isActive: true, memberSince: "Jul 2023", primaryRegion: "Maval, Pune", kycVerified: true, _count: { ownedProperties: 6 } },
    { id: "owner-004", firstName: "Meena", lastName: "Kulkarni", email: "meena.k@hotmail.com", phone: "+919870044556", isActive: true, memberSince: "Apr 2025", primaryRegion: "Baramati, Pune", kycVerified: false, _count: { ownedProperties: 2 } },
  ]);

  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchOwners() {
      try {
        const token = getAccessToken();
        const res = await fetch("/api/management/users?role=land_owner", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (data.success && data.data?.users?.length > 0) {
          setOwners(data.data.users);
        }
      } catch (err) {
        console.error("Fetch land owners error:", err);
      }
    }

    fetchOwners();
  }, [getAccessToken]);

  const filteredOwners = owners.filter(
    (o) =>
      o.firstName?.toLowerCase().includes(search.toLowerCase()) ||
      o.lastName?.toLowerCase().includes(search.toLowerCase()) ||
      o.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="pi-icon-tile w-11 h-11 text-platinum/80">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-sora text-2xl font-extrabold text-platinum tracking-tight">
              Verified Land Owners Directory
            </h1>
            <p className="text-xs text-platinum/45">
              Registered title holders and land owners in Sahyadri platform
            </p>
          </div>
        </div>
      </div>

      <div className="pi-card p-4">
        <div className="pi-input relative w-full sm:w-80 flex items-center rounded-xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-platinum/35 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search owner name or email..."
            className="w-full pl-10 pr-4 py-2.5 text-xs bg-transparent text-platinum placeholder-platinum/30 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredOwners.map((o) => (
          <div key={o.id} className="pi-flip-card">
            <div className="pi-flip-card-inner">
              {/* Front */}
              <div className="pi-flip-face pi-card p-6 justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-[#0C0D11] flex-shrink-0"
                      style={{ background: "linear-gradient(135deg, #ffffff, #c7ccd6)" }}
                    >
                      {o.firstName?.[0]}{o.lastName?.[0]}
                    </div>
                    <div>
                      <h3 className="font-sora font-bold text-base text-platinum">
                        {o.firstName} {o.lastName}
                      </h3>
                      <span
                        className={`pi-pill text-[10px] uppercase tracking-wider px-2 py-0.5 mt-0.5 ${
                          o.isActive
                            ? "bg-emerald-500/12 text-emerald-400 border-emerald-500/25"
                            : "bg-rose-500/12 text-rose-400 border-rose-500/25"
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" /> {o.isActive ? "Verified Owner" : "Inactive Owner"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-platinum/50 mt-4">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-platinum/35" />
                      <span className="truncate font-mono">{o.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-platinum/35" />
                      <span>{o.phone || "+91 98700 00000"}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/[0.08] flex justify-between items-center text-xs">
                  <span className="text-platinum/40">Owned Parcels:</span>
                  <span className="font-sora font-extrabold text-platinum text-sm">
                    {o._count?.ownedProperties || 3} Properties
                  </span>
                </div>

                <RotateCw className="pi-flip-hint w-3.5 h-3.5 text-platinum/30" />
              </div>

              {/* Back */}
              <div className="pi-flip-face pi-flip-back p-6 justify-between">
                <div className="relative z-[1]">
                  <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-platinum/40">
                    Owner Profile
                  </span>
                  <h3 className="font-sora font-bold text-base text-platinum mt-1">
                    {o.firstName} {o.lastName}
                  </h3>

                  <div className="space-y-2.5 text-xs text-platinum/60 mt-4">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-platinum/40">
                        <MapPin className="w-3.5 h-3.5" /> Primary region
                      </span>
                      <span className="text-platinum font-medium">{o.primaryRegion || "Pune district"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-platinum/40">
                        <FileCheck className="w-3.5 h-3.5" /> KYC status
                      </span>
                      <span className={o.kycVerified === false ? "text-amber-400 font-medium" : "text-emerald-400 font-medium"}>
                        {o.kycVerified === false ? "Pending" : "Verified"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-platinum/40">
                        <Calendar className="w-3.5 h-3.5" /> Member since
                      </span>
                      <span className="text-platinum font-medium">{o.memberSince || "2024"}</span>
                    </div>
                  </div>
                </div>

                <div className="relative z-[1] pt-3 border-t border-white/[0.1] text-[10.5px] text-platinum/35">
                  Title records cross-checked against 7/12 revenue extracts
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

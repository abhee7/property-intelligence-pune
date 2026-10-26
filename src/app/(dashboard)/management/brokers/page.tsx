"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-provider";
import { Briefcase, Search, Phone, Mail, Shield, RotateCw, Star, Clock, Building } from "lucide-react";

export default function BrokersPage() {
  const { getAccessToken } = useAuth();
  const [brokers, setBrokers] = useState<any[]>([
    { id: "broker-001", firstName: "Vinod", lastName: "Deshmukh", email: "broker@sahyadri-demo.com", phone: "+919822100200", isActive: true, agency: "Deshmukh Realty", memberSince: "Feb 2024", rating: 4.8, responseTime: "~2 hrs", _count: { brokedProperties: 12 } },
    { id: "broker-002", firstName: "Rahul", lastName: "Joshi", email: "rahul.j@gmail.com", phone: "+919822300400", isActive: true, agency: "Independent", memberSince: "Jun 2024", rating: 4.5, responseTime: "~4 hrs", _count: { brokedProperties: 8 } },
    { id: "broker-003", firstName: "Priya", lastName: "Joshi", email: "priya.j@gmail.com", phone: "+919822500600", isActive: true, agency: "Joshi & Associates", memberSince: "Nov 2023", rating: 4.9, responseTime: "~1 hr", _count: { brokedProperties: 15 } },
    { id: "broker-004", firstName: "Sachin", lastName: "More", email: "sachin.m@yahoo.co.in", phone: "+919822700800", isActive: true, agency: "More Properties", memberSince: "Mar 2025", rating: 4.3, responseTime: "~6 hrs", _count: { brokedProperties: 6 } },
  ]);

  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchBrokers() {
      try {
        const token = getAccessToken();
        const res = await fetch("/api/management/users?role=broker", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (data.success && data.data?.users?.length > 0) {
          setBrokers(data.data.users);
        }
      } catch (err) {
        console.error("Fetch brokers error:", err);
      }
    }

    fetchBrokers();
  }, [getAccessToken]);

  const filteredBrokers = brokers.filter(
    (b) =>
      b.firstName?.toLowerCase().includes(search.toLowerCase()) ||
      b.lastName?.toLowerCase().includes(search.toLowerCase()) ||
      b.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="pi-icon-tile w-11 h-11 text-platinum/80">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-sora text-2xl font-extrabold text-platinum tracking-tight">
              Registered Real Estate Brokers
            </h1>
            <p className="text-xs text-platinum/45">
              Agency brokers authorized to list and broker properties in Pune
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
            placeholder="Search broker name or email..."
            className="w-full pl-10 pr-4 py-2.5 text-xs bg-transparent text-platinum placeholder-platinum/30 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredBrokers.map((b) => (
          <div key={b.id} className="pi-flip-card">
            <div className="pi-flip-card-inner">
              {/* Front */}
              <div className="pi-flip-face pi-card p-6 justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-[#0C0D11] flex-shrink-0"
                      style={{ background: "linear-gradient(135deg, #ffffff, #c7ccd6)" }}
                    >
                      {b.firstName?.[0]}{b.lastName?.[0]}
                    </div>
                    <div>
                      <h3 className="font-sora font-bold text-base text-platinum">
                        {b.firstName} {b.lastName}
                      </h3>
                      <span
                        className={`pi-pill text-[10px] uppercase tracking-wider px-2 py-0.5 mt-0.5 ${
                          b.isActive
                            ? "bg-emerald-500/12 text-emerald-400 border-emerald-500/25"
                            : "bg-rose-500/12 text-rose-400 border-rose-500/25"
                        }`}
                      >
                        <Shield className="w-3 h-3" /> {b.isActive ? "Active Broker" : "Inactive Broker"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-platinum/50 mt-4">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-platinum/35" />
                      <span className="truncate font-mono">{b.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-platinum/35" />
                      <span>{b.phone || "+91 98220 00000"}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/[0.08] flex justify-between items-center text-xs">
                  <span className="text-platinum/40">Brokered Listings:</span>
                  <span className="font-sora font-extrabold text-platinum text-sm">
                    {b._count?.brokedProperties || 8} Properties
                  </span>
                </div>

                <RotateCw className="pi-flip-hint w-3.5 h-3.5 text-platinum/30" />
              </div>

              {/* Back */}
              <div className="pi-flip-face pi-flip-back p-6 justify-between">
                <div className="relative z-[1]">
                  <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-platinum/40">
                    Broker Profile
                  </span>
                  <h3 className="font-sora font-bold text-base text-platinum mt-1">
                    {b.firstName} {b.lastName}
                  </h3>

                  <div className="space-y-2.5 text-xs text-platinum/60 mt-4">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-platinum/40">
                        <Building className="w-3.5 h-3.5" /> Agency
                      </span>
                      <span className="text-platinum font-medium">{b.agency || "Independent"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-platinum/40">
                        <Star className="w-3.5 h-3.5" /> Rating
                      </span>
                      <span className="text-platinum font-medium">{b.rating || "4.5"} / 5</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-platinum/40">
                        <Clock className="w-3.5 h-3.5" /> Avg. response
                      </span>
                      <span className="text-platinum font-medium">{b.responseTime || "~3 hrs"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-platinum/40">Member since</span>
                      <span className="text-platinum font-medium">{b.memberSince || "2024"}</span>
                    </div>
                  </div>
                </div>

                <div className="relative z-[1] pt-3 border-t border-white/[0.1] text-[10.5px] text-platinum/35">
                  Verified via PropIntel agency onboarding
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

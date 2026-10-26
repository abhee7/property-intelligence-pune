"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-provider";
import { Users, Search, Shield, Mail, Phone, Calendar } from "lucide-react";

export default function SystemUsersPage() {
  const { getAccessToken } = useAuth();
  const [users, setUsers] = useState<any[]>([
    { id: "user-admin", firstName: "System", lastName: "Admin", email: "admin@sahyadri-demo.com", role: { name: "admin", displayName: "Platform Admin" }, isActive: true, createdAt: "2025-08-01" },
    { id: "user-agency", firstName: "Prashant", lastName: "Kulkarni", email: "manager@sahyadri-demo.com", role: { name: "agency_admin", displayName: "Agency Admin" }, isActive: true, createdAt: "2025-08-10" },
    { id: "broker-001", firstName: "Vinod", lastName: "Deshmukh", email: "broker@sahyadri-demo.com", role: { name: "broker", displayName: "Broker" }, isActive: true, createdAt: "2025-09-01" },
    { id: "owner-001", firstName: "Pramod", lastName: "Lokhande", email: "owner@sahyadri-demo.com", role: { name: "land_owner", displayName: "Land Owner" }, isActive: true, createdAt: "2025-09-15" },
  ]);

  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchUsers() {
      try {
        const token = getAccessToken();
        const res = await fetch("/api/management/users", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (data.success && data.data?.users?.length > 0) {
          setUsers(data.data.users);
        }
      } catch (err) {
        console.error("Fetch users error:", err);
      }
    }

    fetchUsers();
  }, [getAccessToken]);

  const filteredUsers = users.filter(
    (u) =>
      u.firstName?.toLowerCase().includes(search.toLowerCase()) ||
      u.lastName?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="pi-icon-tile w-11 h-11 text-platinum/80">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-sora text-2xl font-extrabold text-platinum tracking-tight">
              System Users &amp; Role Management
            </h1>
            <p className="text-xs text-platinum/45">
              Platform administrators, agency managers, brokers, and land owners
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
            placeholder="Search user name or email..."
            className="w-full pl-10 pr-4 py-2.5 text-xs bg-transparent text-platinum placeholder-platinum/30 focus:outline-none"
          />
        </div>
      </div>

      <div className="pi-card p-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="pi-table w-full text-left text-xs">
            <thead>
              <tr>
                <th>User Name</th>
                <th>Email Address</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td className="font-bold text-platinum">
                    <span className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-[#0C0D11] flex-shrink-0"
                        style={{ background: "linear-gradient(135deg, #ffffff, #c7ccd6)" }}
                      >
                        {u.firstName?.[0]}{u.lastName?.[0]}
                      </div>
                      {u.firstName} {u.lastName}
                    </span>
                  </td>
                  <td className="text-platinum/60 font-mono">
                    {u.email}
                  </td>
                  <td>
                    <span className="pi-pill bg-white/[0.08] text-platinum/75 border-white/[0.14] text-[10px] uppercase tracking-wider">
                      <Shield className="w-3 h-3" />
                      {u.role?.displayName || u.role?.name || "User"}
                    </span>
                  </td>
                  <td>
                    <span className="pi-pill bg-emerald-500/12 text-emerald-400 border-emerald-500/25 text-[10px] uppercase tracking-wider">
                      Active
                    </span>
                  </td>
                  <td className="text-platinum/40 font-mono">
                    {u.createdAt?.split("T")[0] || "2025-08-01"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

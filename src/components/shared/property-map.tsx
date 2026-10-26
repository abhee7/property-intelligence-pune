"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLngTuple } from "leaflet";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  color?: string;
  riskLevel?: string;
  price?: string;
  onClick?: () => void;
}

interface PropertyMapProps {
  markers?: MapMarker[];
  properties?: any[];
  center?: LatLngTuple;
  zoom?: number;
  height?: number | string;
  onMarkerClick?: (id: string) => void;
  onSelectProperty?: (property: any) => void;
  selectedId?: string;
  showSearch?: boolean;
}

const RISK_COLORS: Record<string, string> = {
  MINIMAL: "#10b981",
  LOW: "#6366f1",
  MODERATE: "#f59e0b",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};

export default function PropertyMap({
  markers: explicitMarkers,
  properties,
  center,
  zoom = 12,
  height = 500,
  onMarkerClick,
  onSelectProperty,
  selectedId,
}: PropertyMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);

  // Convert properties to markers if passed
  const markers: MapMarker[] = explicitMarkers || (properties || []).map((p) => ({
    id: p.id,
    lat: p.address?.latitude || 18.52 + (Math.random() - 0.5) * 0.1,
    lng: p.address?.longitude || 73.85 + (Math.random() - 0.5) * 0.1,
    title: p.title,
    subtitle: `${p.metadata?.village || p.address?.city || "Pune"} | S.# ${p.surveyNumber || "N/A"}`,
    riskLevel: p.riskScore?.riskLevel || "LOW",
    price: p.price ? `₹${(p.price / 100000).toFixed(1)} L` : "",
  }));

  const mapCenter: LatLngTuple = center || (() => {
    if (markers.length === 0) return [18.52, 73.85] as LatLngTuple;
    const avgLat = markers.reduce((s, m) => s + m.lat, 0) / markers.length;
    const avgLng = markers.reduce((s, m) => s + m.lng, 0) / markers.length;
    return [avgLat, avgLng] as LatLngTuple;
  })();

  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;

      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current, {
        center: mapCenter,
        zoom,
        zoomControl: true,
        attributionControl: true,
      });

      // Standard OpenStreetMap tiles (no API key). CARTO's dark tiles started requiring one;
      // the dark look comes from the .leaflet-tile-pane filter below instead.
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
      markersLayerRef.current = L.layerGroup().addTo(map);
      setLoaded(true);
    });

    // Registered on the effect itself (not inside the async .then()) so
    // StrictMode's mount→cleanup→mount dev cycle actually tears the map
    // down between passes instead of racing two L.map() calls on one node.
    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersLayerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!loaded || !markersLayerRef.current) return;

    import("leaflet").then((L) => {
      const layer = markersLayerRef.current;
      layer.clearLayers();

      markers.forEach((m) => {
        const color = m.color || RISK_COLORS[m.riskLevel || ""] || "#6366f1";
        const isSelected = m.id === selectedId;
        const size = isSelected ? 14 : 10;

        const circleMarker = L.circleMarker([m.lat, m.lng], {
          radius: size,
          fillColor: color,
          fillOpacity: isSelected ? 0.9 : 0.7,
          color: isSelected ? "#ffffff" : color,
          weight: isSelected ? 3 : 1.5,
          opacity: 1,
        });

        const popupHtml = `
          <div style="font-family:system-ui,-apple-system,sans-serif;min-width:180px;">
            <div style="font-weight:600;font-size:14px;margin-bottom:4px;color:#1a1a1a;">${m.title}</div>
            ${m.subtitle ? `<div style="font-size:12px;color:#666;margin-bottom:6px;">${m.subtitle}</div>` : ""}
            <div style="display:flex;gap:8px;align-items:center;">
              ${m.riskLevel ? `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${color}20;color:${color};font-weight:500;">${m.riskLevel}</span>` : ""}
              ${m.price ? `<span style="font-size:12px;font-weight:600;color:#1a1a1a;">${m.price}</span>` : ""}
            </div>
          </div>
        `;

        circleMarker.bindPopup(popupHtml, {
          className: "propintel-popup",
          closeButton: true,
          maxWidth: 250,
        });

        circleMarker.on("click", () => {
          if (onMarkerClick) onMarkerClick(m.id);
          if (onSelectProperty && properties) {
            const rawProp = properties.find((p) => p.id === m.id);
            if (rawProp) onSelectProperty(rawProp);
          }
        });

        circleMarker.bindTooltip(m.title, {
          direction: "top",
          offset: [0, -size],
          className: "propintel-tooltip",
        });

        layer.addLayer(circleMarker);
      });

      if (markers.length > 1 && mapInstanceRef.current) {
        const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as LatLngTuple));
        mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      }
    });
  }, [markers, loaded, selectedId, onMarkerClick, onSelectProperty, properties]);

  return (
    <div style={{ position: "relative", borderRadius: 14, overflow: "hidden" }}>
      <style>{`
        .propintel-popup .leaflet-popup-content-wrapper {
          background: #ffffff;
          border-radius: 10px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          border: 1px solid #e5e7eb;
        }
        .propintel-popup .leaflet-popup-tip {
          background: #ffffff;
          border: 1px solid #e5e7eb;
        }
        .propintel-tooltip {
          background: rgba(17,17,19,0.9) !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          color: #fafafa !important;
          font-size: 12px !important;
          font-weight: 500 !important;
          padding: 4px 10px !important;
          border-radius: 6px !important;
          backdrop-filter: blur(8px);
        }
        .propintel-tooltip::before {
          border-top-color: rgba(17,17,19,0.9) !important;
        }
        .leaflet-control-zoom a {
          background: #111113 !important;
          color: #a1a1aa !important;
          border-color: rgba(255,255,255,0.08) !important;
        }
        .leaflet-control-zoom a:hover {
          background: #1a1a1d !important;
          color: #fafafa !important;
        }
        .leaflet-tile-pane {
          filter: invert(1) hue-rotate(180deg) brightness(0.8) contrast(0.95) saturate(0.6);
        }
        .leaflet-control-attribution {
          background: rgba(17,17,19,0.8) !important;
          color: #52525b !important;
          font-size: 10px !important;
        }
        .leaflet-control-attribution a {
          color: #6366f1 !important;
        }
      `}</style>

      <div
        ref={mapRef}
        style={{ height, width: "100%", background: "#0d1117" }}
      />

      {!loaded && (
        <div style={{
          position: "absolute", inset: 0, background: "#0d1117",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 8,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            border: "2px solid rgba(99,102,241,0.2)",
            borderTopColor: "#6366f1",
            animation: "spin 0.8s linear infinite",
          }} />
          <span style={{ fontSize: 12, color: "#52525b" }}>Loading map...</span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {loaded && markers.length > 0 && (
        <div style={{
          position: "absolute", bottom: 30, left: 10, zIndex: 1000,
          background: "rgba(17,17,19,0.9)", backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
          padding: "8px 12px", display: "flex", gap: 10,
        }}>
          {Object.entries(RISK_COLORS).map(([level, color]) => (
            <div key={level} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#a1a1aa" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
              {level}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

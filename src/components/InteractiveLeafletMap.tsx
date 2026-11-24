import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  ApartmentRecord,
  ListingCategory,
} from '../lib/validation';

export interface InteractiveLeafletMapProps {
  apartments: ApartmentRecord[];
  selectedPinId: string | null;
  onSelectPin: (aptId: string) => void;
  onSelectApartment: (apt: ApartmentRecord) => void;
  cameraTarget: { lat: number; lng: number; zoom: number; nonce: number } | null;
  heatmapEnabled?: boolean;
  heatmapPoints?: Array<{ lat: number; lng: number; weight: number }>;
  lang: 'ar' | 'en';
}

const CATEGORY_COLORS: Record<ListingCategory, string> = {
  family_apartment: '#2563eb', // blue
  whole_house: '#0d9488', // teal
  hotel_room: '#d97706', // amber
  industrial_factory: '#475569', // slate
  student_housing: '#059669', // emerald
};

function formatCompactPrice(price: number, lang: 'ar' | 'en'): string {
  if (price >= 1_000_000) {
    const val = (price / 1_000_000).toFixed(1);
    return lang === 'ar' ? `${val}م` : `${val}M`;
  }
  if (price >= 1_000) {
    const val = (price / 1_000).toFixed(0);
    return lang === 'ar' ? `${val} ألف` : `${val}k`;
  }
  return String(price);
}

export const InteractiveLeafletMap: React.FC<InteractiveLeafletMapProps> = ({
  apartments,
  selectedPinId,
  onSelectPin,
  onSelectApartment,
  cameraTarget,
  heatmapEnabled = false,
  heatmapPoints = [],
  lang,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const heatmapLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current || mapInstanceRef.current) return;

    const map = L.map(containerRef.current, {
      center: [28.8, 31.0], // Egypt Overview
      zoom: 6,
      minZoom: 5,
      maxZoom: 18,
      zoomControl: true,
      attributionControl: false,
    });

    // High quality, 100% free OpenStreetMap tiles with zero API key requirement & zero watermark
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    heatmapLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    // Ensure map tiles recalculate bounds properly on initial layout
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle Camera FlyTo Target
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !cameraTarget) return;
    map.flyTo([cameraTarget.lat, cameraTarget.lng], cameraTarget.zoom, {
      duration: 1.2,
      easeLinearity: 0.25,
    });
  }, [cameraTarget]);

  // Render Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    apartments.forEach((apt) => {
      const isSelected = selectedPinId === apt.id;
      const color = CATEGORY_COLORS[apt.category] || '#2563eb';
      const priceText = formatCompactPrice(
        apt.billingMode === 'daily_or_monthly' && apt.dailyRateEgp > 0
          ? apt.dailyRateEgp
          : apt.monthlyRentEgp,
        lang
      );

      const pinHtml = `
        <div style="
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          transform: ${isSelected ? 'scale(1.18)' : 'scale(1)'};
          transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: ${isSelected ? 999 : 10};
        ">
          <div style="
            background: ${isSelected ? '#1d4ed8' : '#ffffff'};
            color: ${isSelected ? '#ffffff' : '#0f172a'};
            border: 2px solid ${isSelected ? '#ffffff' : color};
            padding: 2px 7px;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 700;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2), 0 2px 4px -2px rgba(0,0,0,0.1);
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 4px;
            line-height: 1.2;
          ">
            <span style="
              width: 6px;
              height: 6px;
              border-radius: 9999px;
              background-color: ${isSelected ? '#fbbf24' : color};
              display: inline-block;
            "></span>
            <span>${priceText}</span>
          </div>
          <div style="
            width: 0;
            height: 0;
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-top: 6px solid ${isSelected ? '#1d4ed8' : color};
            margin-top: -1px;
          "></div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: pinHtml,
        className: 'custom-leaflet-pin',
        iconSize: [60, 28],
        iconAnchor: [30, 28],
      });

      const marker = L.marker([apt.lat, apt.lng], { icon: customIcon });

      marker.on('click', () => {
        onSelectPin(apt.id);
      });

      marker.on('dblclick', () => {
        onSelectApartment(apt);
      });

      layer.addLayer(marker);
    });
  }, [apartments, selectedPinId, lang, onSelectPin, onSelectApartment]);

  // Render Heatmap Circles when enabled
  useEffect(() => {
    const layer = heatmapLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    if (!heatmapEnabled || heatmapPoints.length === 0) return;

    heatmapPoints.forEach((pt) => {
      const circle = L.circle([pt.lat, pt.lng], {
        color: '#e11d48',
        fillColor: '#f43f5e',
        fillOpacity: Math.min(0.65, Math.max(0.2, (pt.weight || 1) * 0.15)),
        radius: 12000,
        weight: 1,
      });
      layer.addLayer(circle);
    });
  }, [heatmapEnabled, heatmapPoints]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{
        zIndex: 0,
        borderRadius: '0.75rem',
        overflow: 'hidden',
        minHeight: '260px',
      }}
    />
  );
};

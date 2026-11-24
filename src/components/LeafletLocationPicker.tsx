import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

export interface LeafletLocationPickerProps {
  lat: number;
  lng: number;
  onLocationChange: (lat: number, lng: number) => void;
  cameraTarget: { lat: number; lng: number; zoom: number; nonce: number } | null;
}

export const LeafletLocationPicker: React.FC<LeafletLocationPickerProps> = ({
  lat,
  lng,
  onLocationChange,
  cameraTarget,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 12,
      minZoom: 5,
      maxZoom: 18,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    // Draggable marker
    const pinIcon = L.divIcon({
      html: `<div style="
        display: flex;
        flex-direction: column;
        align-items: center;
      ">
        <div style="
          width: 32px;
          height: 32px;
          background: #2563eb;
          border: 3px solid #ffffff;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        "></div>
      </div>`,
      className: 'wizard-location-pin',
      iconSize: [32, 42],
      iconAnchor: [16, 42],
    });

    const marker = L.marker([lat, lng], {
      icon: pinIcon,
      draggable: true,
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      const newLat = Number(pos.lat.toFixed(5));
      const newLng = Number(pos.lng.toFixed(5));
      onLocationChangeRef.current(newLat, newLng);
    });

    // Click on map to move pin
    map.on('click', (e: L.LeafletMouseEvent) => {
      const newLat = Number(e.latlng.lat.toFixed(5));
      const newLng = Number(e.latlng.lng.toFixed(5));
      marker.setLatLng([newLat, newLng]);
      onLocationChangeRef.current(newLat, newLng);
    });

    markerRef.current = marker;
    mapRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Update marker position when lat/lng change externally
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    const current = marker.getLatLng();
    if (Math.abs(current.lat - lat) > 0.0001 || Math.abs(current.lng - lng) > 0.0001) {
      marker.setLatLng([lat, lng]);
    }
  }, [lat, lng]);

  // Handle camera target (fly to)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cameraTarget) return;
    map.flyTo([cameraTarget.lat, cameraTarget.lng], cameraTarget.zoom, {
      duration: 1.0,
      easeLinearity: 0.25,
    });
  }, [cameraTarget]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{
        zIndex: 0,
        borderRadius: '0.75rem',
        overflow: 'hidden',
        minHeight: '224px',
      }}
    />
  );
};

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Search, Loader2, MapPin, X } from 'lucide-react';
import { useI18n } from '../lib/i18n';

export interface LeafletLocationPickerProps {
  lat: number;
  lng: number;
  onLocationChange: (lat: number, lng: number) => void;
  cameraTarget: { lat: number; lng: number; zoom: number; nonce: number } | null;
}

interface SearchHit {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export const LeafletLocationPicker: React.FC<LeafletLocationPickerProps> = ({
  lat,
  lng,
  onLocationChange,
  cameraTarget,
}) => {
  const { lang, t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

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

    const pinIcon = L.divIcon({
      html: `<div style="display:flex;flex-direction:column;align-items:center;">
        <div style="width:30px;height:30px;background:#1d4ed8;border:3px solid #ffffff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 4px 12px rgba(0,0,0,0.35);"></div>
      </div>`,
      className: 'wizard-location-pin',
      iconSize: [30, 40],
      iconAnchor: [15, 40],
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
      duration: 0.9,
      easeLinearity: 0.25,
    });
  }, [cameraTarget]);

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=eg&limit=5&accept-language=${lang}&q=${encodeURIComponent(
        q
      )}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Search failed');
      const data: SearchHit[] = await res.json();
      setResults(Array.isArray(data) ? data : []);
      if (!data || data.length === 0) {
        setSearchError(
          t(
            'لم يتم العثور على نتائج مطابقة. جرب كتابة اسم الحي أو المحافظة بوضوح.',
            'No matching locations found. Try entering the district or governorate name.'
          )
        );
      }
    } catch {
      setSearchError(
        t('تعذر البحث حالياً، يمكنك الضغط مباشرة على الخريطة لتحديد الموقع.', 'Search unavailable right now, click directly on the map.')
      );
    } finally {
      setSearching(false);
    }
  };

  const handleSelectHit = (hit: SearchHit) => {
    const newLat = Number(parseFloat(hit.lat).toFixed(5));
    const newLng = Number(parseFloat(hit.lon).toFixed(5));
    if (Number.isNaN(newLat) || Number.isNaN(newLng)) return;

    onLocationChangeRef.current(newLat, newLng);
    if (markerRef.current) {
      markerRef.current.setLatLng([newLat, newLng]);
    }
    if (mapRef.current) {
      mapRef.current.flyTo([newLat, newLng], 15, { duration: 0.9 });
    }
    setResults([]);
    setSearchError(null);
    setSearchQuery(hit.display_name.split(',')[0].trim());
  };

  return (
    <div className="space-y-2.5">
      {/* Location Search Input inside Map Picker */}
      <div className="relative">
        <div className="flex items-center gap-2 bg-white border border-slate-300 focus-within:border-blue-600 rounded-xl px-3 py-1.5 shadow-2xs">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!e.target.value.trim()) {
                setResults([]);
                setSearchError(null);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleSearch();
              }
            }}
            placeholder={t(
              'ابحث عن اسم الشارع، الحي، أو المدينة (مثال: التجمع الخامس، سموحة، المعادي)...',
              'Search street, district, or city (e.g. Fifth Settlement, Maadi)...'
            )}
            className="w-full min-w-0 py-1 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 bg-transparent focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setResults([]);
                setSearchError(null);
              }}
              className="p-1 text-slate-400 hover:text-slate-700"
              aria-label="Clear"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            disabled={searching || searchQuery.trim().length < 2}
            onClick={() => void handleSearch()}
            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
          >
            {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            <span>{t('بحث', 'Search')}</span>
          </button>
        </div>

        {/* Search Dropdown Results */}
        {results.length > 0 && (
          <div className="absolute z-[1000] inset-x-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto divide-y divide-slate-100">
            {results.map((hit) => (
              <button
                key={hit.place_id}
                type="button"
                onClick={() => handleSelectHit(hit)}
                className="w-full px-3.5 py-2.5 text-start hover:bg-blue-50 flex items-start gap-2 text-xs transition-colors"
              >
                <MapPin className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                <span className="text-slate-800 font-medium leading-relaxed">{hit.display_name}</span>
              </button>
            ))}
          </div>
        )}

        {searchError && (
          <p className="text-[11px] text-amber-700 mt-1 px-1">{searchError}</p>
        )}
      </div>

      {/* Map Canvas */}
      <div
        ref={containerRef}
        className="w-full relative border border-slate-200 rounded-xl overflow-hidden"
        style={{
          zIndex: 0,
          height: '260px',
        }}
      />
    </div>
  );
};

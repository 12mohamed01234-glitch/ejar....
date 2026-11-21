import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Map as GoogleMap,
  AdvancedMarker,
  useMap,
  MapCameraChangedEvent,
} from '@vis.gl/react-google-maps';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import {
  Heart,
  Bell,
  BellRing,
  SlidersHorizontal,
  RotateCcw,
  PlusCircle,
  Star,
  MapPin,
  X,
  Compass,
  LayoutGrid,
  Grid3x3,
  Map as MapIcon,
  ZoomIn,
  ZoomOut,
  Columns2,
  RefreshCw,
  Check,
  ArrowDown,
  Flame,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Car,
  Trees,
  Clock,
  Building,
  Home,
  Hotel,
  GraduationCap,
  Factory,
  Sparkles,
  Filter,
} from 'lucide-react';
import {
  ApartmentRecord,
  BookingDemandSignalRecord,
  EGYPT_GOVERNORATES,
  FurnishingType,
  ListingCategory,
  PlatformSettingsRecord,
  ReviewRecord,
  calculateDistanceKm,
  computeLandlordReputation,
  formatCurrencyValue,
  getCategoryCommissionPct,
  getPrimaryDisplayPrice,
  isResidentialCategory,
  normalizeNumericInput,
} from '../lib/validation';
import { useI18n } from '../lib/i18n';
import { ApartmentImage } from './ApartmentImage';
import { InteractiveLeafletMap } from './InteractiveLeafletMap';
import {
  EgyptLocationSearchBar,
  SelectedMapDestination,
} from './EgyptLocationSearchBar';

interface EgyptMapExplorerProps {
  apartments: ApartmentRecord[];
  reviews: ReviewRecord[];
  completedDemandSignals?: BookingDemandSignalRecord[];
  commissionRatePct: number;
  platformSettings?: PlatformSettingsRecord;
  favoriteApartmentIds: Set<string>;
  priceAlertApartmentIds: Set<string>;
  togglingFavoriteId: string | null;
  lastRefreshedAtMs?: number;
  onRefreshData?: () => Promise<void>;
  onToggleFavorite: (apt: ApartmentRecord) => void;
  onTogglePriceAlert: (apt: ApartmentRecord) => void;
  onSelectApartment: (apt: ApartmentRecord) => void;
  onRentApartment: (apt: ApartmentRecord) => void;
  onOpenListingWizard: () => void;
}

type BedroomFilterOption = 'all' | '1' | '2' | '3' | '4plus';
type BathroomFilterOption = 'all' | '2plus' | '3plus';
type FurnishingFilterOption = 'all' | FurnishingType;
type PriceFilterBasis = 'monthly' | 'daily';
type ExplorerViewMode = 'auto' | 'compact_grid' | 'split_map';
type PullRefreshPhase = 'idle' | 'pulling' | 'armed' | 'refreshing' | 'done';
type HeatmapSectorScope =
  | 'all_residential'
  | 'family_apartment'
  | 'whole_house'
  | 'student_housing'
  | 'hotel_room'
  | 'all_sectors';
type HeatmapRadiusMode = 'focused' | 'wide';

interface HeatmapDemandPoint {
  id: string;
  lat: number;
  lng: number;
  weight: number;
  governorate: string;
  district: string;
}

interface GovernorateDemandRow {
  name: string;
  lat: number;
  lng: number;
  zoom: number;
  completedCount: number;
  totalRentEgp: number;
  sharePct: number;
  intensityRatio: number;
  demandLevel: 'peak' | 'high' | 'moderate' | 'none';
}

interface MapViewportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface SpatialUnitCluster {
  key: string;
  lat: number;
  lng: number;
  label: string;
  minPriceEgp: number;
  items: ApartmentRecord[];
}

const CATEGORY_TABS: Array<'all' | ListingCategory> = [
  'all',
  'family_apartment',
  'whole_house',
  'hotel_room',
  'industrial_factory',
  'student_housing',
];

const CATEGORY_PIN_ACCENTS: Record<
  ListingCategory,
  { dotClass: string; borderClass: string }
> = {
  family_apartment: {
    dotClass: 'bg-blue-600',
    borderClass: 'border-blue-300 group-hover:border-blue-600',
  },
  whole_house: {
    dotClass: 'bg-teal-600',
    borderClass: 'border-teal-300 group-hover:border-teal-600',
  },
  hotel_room: {
    dotClass: 'bg-amber-500',
    borderClass: 'border-amber-300 group-hover:border-amber-600',
  },
  industrial_factory: {
    dotClass: 'bg-indigo-600',
    borderClass: 'border-indigo-300 group-hover:border-indigo-600',
  },
  student_housing: {
    dotClass: 'bg-emerald-600',
    borderClass: 'border-emerald-300 group-hover:border-emerald-600',
  },
};

const ZOOMED_OUT_THRESHOLD = 10;
const PULL_ARM_THRESHOLD_PX = 54;
const MAX_PULL_OFFSET_PX = 88;

function formatCompactPinPrice(amountEgp: number, lang: 'ar' | 'en'): string {
  const numFmt = new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
    maximumFractionDigits: 1,
  });
  if (amountEgp >= 1_000_000) {
    const val = numFmt.format(Math.round((amountEgp / 1_000_000) * 10) / 10);
    return lang === 'ar' ? `${val}م` : `${val}M`;
  }
  if (amountEgp >= 1_000) {
    const roundedK =
      amountEgp >= 10_000
        ? Math.round(amountEgp / 1_000)
        : Math.round((amountEgp / 1_000) * 10) / 10;
    const val = numFmt.format(roundedK);
    return lang === 'ar' ? `${val} ألف` : `${val}k`;
  }
  return numFmt.format(amountEgp);
}

function detectWebGL2Support(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

function getDemandBarWidthClass(ratio: number): string {
  if (ratio <= 0) return 'w-0';
  if (ratio < 0.12) return 'w-1/12';
  if (ratio < 0.2) return 'w-2/12';
  if (ratio < 0.3) return 'w-3/12';
  if (ratio < 0.38) return 'w-4/12';
  if (ratio < 0.46) return 'w-5/12';
  if (ratio < 0.55) return 'w-6/12';
  if (ratio < 0.64) return 'w-7/12';
  if (ratio < 0.73) return 'w-8/12';
  if (ratio < 0.82) return 'w-9/12';
  if (ratio < 0.91) return 'w-10/12';
  if (ratio < 0.98) return 'w-11/12';
  return 'w-full';
}

const MapCameraController: React.FC<{
  target: { lat: number; lng: number; zoom: number; nonce: number } | null;
}> = ({ target }) => {
  const map = useMap('egypt-explorer-map');
  useEffect(() => {
    if (!map || !target) return;
    map.panTo({ lat: target.lat, lng: target.lng });
    map.setZoom(target.zoom);
  }, [map, target]);
  return null;
};

/**
 * Modern Deck.gl HeatmapLayer + GoogleMapsOverlay replacing deprecated google.maps.visualization.HeatmapLayer
 * Docs: https://developers.google.com/maps/documentation/javascript/examples/deckgl-tripslayer?utm_campaign=gmp_mcp_codeassist_v1_aistudio
 */
const DeckGlDemandHeatmapOverlay: React.FC<{
  points: HeatmapDemandPoint[];
  visible: boolean;
  radiusPixels: number;
  onWebGLStatusChange?: (ready: boolean) => void;
}> = ({ points, visible, radiusPixels, onWebGLStatusChange }) => {
  const map = useMap('egypt-explorer-map');
  const overlayRef = useRef<GoogleMapsOverlay | null>(null);

  useEffect(() => {
    if (!map || !visible) return;
    if (!detectWebGL2Support()) {
      onWebGLStatusChange?.(false);
      return;
    }

    let overlay: GoogleMapsOverlay | null = null;
    try {
      overlay = new GoogleMapsOverlay({ interleaved: false });
      overlay.setMap(map);
      overlayRef.current = overlay;
      onWebGLStatusChange?.(true);
    } catch (err) {
      console.warn('Deck.gl Heatmap overlay unavailable in current GPU environment:', err);
      onWebGLStatusChange?.(false);
    }

    return () => {
      if (overlay) {
        try {
          overlay.setMap(null);
          overlay.finalize();
        } catch {
          // Ignore WebGL context cleanup errors
        }
      }
      overlayRef.current = null;
    };
  }, [map, visible, onWebGLStatusChange]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    try {
      if (!visible || points.length === 0) {
        overlay.setProps({ layers: [] });
        return;
      }

      const heatmapLayer = new HeatmapLayer<HeatmapDemandPoint>({
        id: 'egypt-residential-demand-heatmap',
        data: points,
        visible: true,
        getPosition: (d) => [d.lng, d.lat],
        getWeight: (d) => d.weight,
        radiusPixels,
        intensity: 1.4,
        threshold: 0.03,
        aggregation: 'SUM',
        colorRange: [
          [20, 184, 166, 95],
          [14, 165, 233, 145],
          [250, 204, 21, 185],
          [249, 115, 22, 220],
          [225, 29, 72, 245],
          [159, 18, 57, 255],
        ],
      });

      overlay.setProps({ layers: [heatmapLayer] });
    } catch (err) {
      console.warn('Deck.gl Heatmap layer update skipped:', err);
    }
  }, [points, visible, radiusPixels]);

  return null;
};

export const EgyptMapExplorer: React.FC<EgyptMapExplorerProps> = ({
  apartments,
  reviews,
  completedDemandSignals = [],
  commissionRatePct,
  platformSettings,
  favoriteApartmentIds,
  priceAlertApartmentIds,
  togglingFavoriteId,
  lastRefreshedAtMs,
  onRefreshData,
  onToggleFavorite,
  onTogglePriceAlert,
  onSelectApartment,
  onRentApartment,
  onOpenListingWizard,
}) => {
  const {
    lang,
    t,
    formatNumber,
    govLabel,
    categoryLabel,
    categorySingularLabel,
    furnishingLabel,
  } = useI18n();

  const [selectedCategory, setSelectedCategory] = useState<'all' | ListingCategory>('all');
  const [selectedGovernorate, setSelectedGovernorate] = useState<string>('all');
  const [priceBasis, setPriceBasis] = useState<PriceFilterBasis>('monthly');
  const [minPriceInput, setMinPriceInput] = useState<string>('');
  const [maxPriceInput, setMaxPriceInput] = useState<string>('');
  const [selectedBedrooms, setSelectedBedrooms] = useState<BedroomFilterOption>('all');
  const [selectedFurnishing, setSelectedFurnishing] = useState<FurnishingFilterOption>('all');
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(false);
  const [requirePrivateGarage, setRequirePrivateGarage] = useState<boolean>(false);
  const [requireGardenOrRoof, setRequireGardenOrRoof] = useState<boolean>(false);
  const [requireVirtualTour, setRequireVirtualTour] = useState<boolean>(false);
  const [requireDailyBooking, setRequireDailyBooking] = useState<boolean>(false);
  const [minBathrooms, setMinBathrooms] = useState<BathroomFilterOption>('all');
  const [minAreaSqmInput, setMinAreaSqmInput] = useState<string>('');
  const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState<boolean>(false);
  const [isMapFilterPopoverOpen, setIsMapFilterPopoverOpen] = useState<boolean>(false);

  const [activeDestination, setActiveDestination] =
    useState<SelectedMapDestination | null>(null);
  const [cameraTarget, setCameraTarget] = useState<{
    lat: number;
    lng: number;
    zoom: number;
    nonce: number;
  } | null>(null);

  const [mapZoom, setMapZoom] = useState<number>(7);
  const [mapBounds, setMapBounds] = useState<MapViewportBounds | null>(null);
  const [filterByMapBounds, setFilterByMapBounds] = useState<boolean>(false);

  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [activeClusterKey, setActiveClusterKey] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });

  const [viewMode, setViewMode] = useState<ExplorerViewMode>('auto');
  const [mobileCols, setMobileCols] = useState<2 | 3>(() => {
    try {
      return window.localStorage.getItem('ejar_mobile_cols') === '3' ? 3 : 2;
    } catch {
      return 2;
    }
  });

  // Residential Demand Heatmap state (driven strictly by completed Firestore bookings)
  const [heatmapEnabled, setHeatmapEnabled] = useState<boolean>(false);
  const [heatmapScope, setHeatmapScope] =
    useState<HeatmapSectorScope>('all_residential');
  const [heatmapRadiusMode, setHeatmapRadiusMode] =
    useState<HeatmapRadiusMode>('wide');
  const [showMapPinsInHeatmap, setShowMapPinsInHeatmap] = useState<boolean>(true);
  const [showAll27Governorates, setShowAll27Governorates] = useState<boolean>(false);
  const [webglHeatmapReady, setWebglHeatmapReady] = useState<boolean>(() =>
    detectWebGL2Support()
  );

  // Pull-to-refresh state (supports both Unit List and Map pull-zone on mobile)
  const [pullPhase, setPullPhase] = useState<PullRefreshPhase>('idle');
  const [pullOffsetPx, setPullOffsetPx] = useState<number>(0);
  const [isDraggingPull, setIsDraggingPull] = useState<boolean>(false);

  const pullSessionRef = useRef<{
    active: boolean;
    engaged: boolean;
    fromMapPullZone: boolean;
    startX: number;
    startY: number;
  }>({
    active: false,
    engaged: false,
    fromMapPullZone: false,
    startX: 0,
    startY: 0,
  });
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 767px)');
    const handleChange = (e: MediaQueryListEvent) => setIsMobileViewport(e.matches);
    setIsMobileViewport(mql.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const onQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  const executeImmediateRefresh = useCallback(async () => {
    if (pullPhase === 'refreshing') return;
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    setIsDraggingPull(false);
    setPullPhase('refreshing');
    setPullOffsetPx(42);

    try {
      await Promise.all([
        onRefreshData ? onRefreshData() : Promise.resolve(),
        new Promise((resolve) => window.setTimeout(resolve, 350)),
      ]);
    } finally {
      setPullPhase('done');
      setPullOffsetPx(38);
      resetTimerRef.current = window.setTimeout(() => {
        setPullOffsetPx(0);
        setPullPhase('idle');
      }, 550);
    }
  }, [onRefreshData, pullPhase]);

  const beginPullGesture = useCallback(
    (clientX: number, clientY: number, target: EventTarget | null) => {
      if (pullPhase === 'refreshing') return;
      const el = target as HTMLElement | null;
      if (!el) return;

      // Never interfere with form typing, dropdowns, or horizontal filter scrollers
      if (
        el.closest(
          'input, textarea, select, [contenteditable="true"], [data-no-pull="true"]'
        )
      ) {
        return;
      }

      const inMapPullZone = Boolean(el.closest('[data-map-pull-zone="true"]'));
      const inMapInnerCanvas = Boolean(el.closest('[data-map-canvas-inner="true"]'));

      // Preserve unobstructed Google Maps pan/pinch inside map tiles unless pulling from the Map Pull Strip
      if (inMapInnerCanvas && !inMapPullZone) {
        return;
      }

      // Ignore if scrolling inside an internal overflow drawer that is scrolled down
      const innerScrollable = el.closest('[data-internal-scroll="true"]') as HTMLElement | null;
      if (innerScrollable && innerScrollable.scrollTop > 0) {
        return;
      }

      // On the main unit list, only start pull-to-refresh when near top of page;
      // on the Map Pull Strip, allow pulling down directly on the map at any scroll offset
      if (!inMapPullZone && window.scrollY > 8) {
        return;
      }

      pullSessionRef.current = {
        active: true,
        engaged: false,
        fromMapPullZone: inMapPullZone,
        startX: clientX,
        startY: clientY,
      };
    },
    [pullPhase]
  );

  const updatePullGesture = useCallback(
    (clientX: number, clientY: number, cancelableEvent?: { preventDefault: () => void; cancelable?: boolean }) => {
      const session = pullSessionRef.current;
      if (!session.active || pullPhase === 'refreshing') return;

      const dy = clientY - session.startY;
      const dx = clientX - session.startX;

      if (!session.engaged) {
        // Cancel pull session if user scrolls upward or swipes horizontally
        if (dy < -6 || Math.abs(dx) > Math.abs(dy) * 1.1) {
          session.active = false;
          return;
        }
        if (dy < 10) return;
        if (!session.fromMapPullZone && window.scrollY > 8) {
          session.active = false;
          return;
        }
        session.engaged = true;
        setIsDraggingPull(true);
      }

      if (dy <= 0) {
        setPullOffsetPx(0);
        setPullPhase('pulling');
        return;
      }

      if (cancelableEvent && cancelableEvent.cancelable !== false) {
        cancelableEvent.preventDefault();
      }

      const damped = Math.min(
        MAX_PULL_OFFSET_PX,
        Math.round(Math.pow(Math.max(0, dy - 8), 0.86) * 0.65)
      );
      setPullOffsetPx(damped);
      setPullPhase(damped >= PULL_ARM_THRESHOLD_PX ? 'armed' : 'pulling');
    },
    [pullPhase]
  );

  const finishPullGesture = useCallback(() => {
    const session = pullSessionRef.current;
    if (!session.active) return;
    const wasEngaged = session.engaged;
    session.active = false;
    session.engaged = false;

    if (!wasEngaged) return;
    setIsDraggingPull(false);

    if (pullPhase === 'armed' || pullOffsetPx >= PULL_ARM_THRESHOLD_PX) {
      void executeImmediateRefresh();
    } else {
      setPullOffsetPx(0);
      setPullPhase('idle');
    }
  }, [executeImmediateRefresh, pullOffsetPx, pullPhase]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      beginPullGesture(touch.clientX, touch.clientY, e.target);
    },
    [beginPullGesture]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      updatePullGesture(touch.clientX, touch.clientY, e);
    },
    [updatePullGesture]
  );

  const handleSetMobileCols = (cols: 2 | 3) => {
    setMobileCols(cols);
    try {
      window.localStorage.setItem('ejar_mobile_cols', String(cols));
    } catch {
      // Ignore storage restrictions
    }
  };

  const flyToCamera = useCallback((lat: number, lng: number, zoom: number) => {
    setMapZoom(zoom);
    setCameraTarget({ lat, lng, zoom, nonce: Date.now() });
  }, []);

  const handleCameraChanged = useCallback((ev: MapCameraChangedEvent) => {
    const nextZoom = Math.round(ev.detail.zoom * 10) / 10;
    setMapZoom((prev) => (Math.abs(prev - nextZoom) >= 0.2 ? nextZoom : prev));
    if (ev.detail.bounds) {
      setMapBounds(ev.detail.bounds);
    }
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<'all' | ListingCategory, number> = {
      all: apartments.length,
      family_apartment: 0,
      whole_house: 0,
      hotel_room: 0,
      industrial_factory: 0,
      student_housing: 0,
    };
    for (const apt of apartments) {
      counts[apt.category] = (counts[apt.category] ?? 0) + 1;
    }
    return counts;
  }, [apartments]);

  const handleCategorySelect = useCallback((cat: 'all' | ListingCategory) => {
    setSelectedCategory(cat);
    setSelectedPinId(null);
    setActiveClusterKey(null);
  }, []);

  const handleGovernorateSelect = (govName: string) => {
    setSelectedGovernorate(govName);
    setSelectedPinId(null);
    setActiveClusterKey(null);
    if (govName === 'all') {
      flyToCamera(28.8, 31.0, 6);
      return;
    }
    const found = EGYPT_GOVERNORATES.find((g) => g.name === govName);
    if (found) {
      flyToCamera(found.lat, found.lng, found.zoom);
    }
  };

  const handleSelectDestination = useCallback(
    (dest: SelectedMapDestination) => {
      setActiveDestination(dest);
      setSelectedPinId(null);
      setActiveClusterKey(null);
      if (dest.governorateName) {
        setSelectedGovernorate(dest.governorateName);
      } else {
        setSelectedGovernorate('all');
      }
      flyToCamera(dest.lat, dest.lng, dest.zoom ?? 13);
    },
    [flyToCamera]
  );

  const handleClearDestination = useCallback(() => {
    setActiveDestination(null);
    setSelectedGovernorate('all');
    setSelectedPinId(null);
    setActiveClusterKey(null);
    flyToCamera(30.0444, 31.2357, 7);
  }, [flyToCamera]);

  const advancedFilterActiveCount = useMemo(() => {
    let count = 0;
    if (verifiedOnly) count += 1;
    if (requirePrivateGarage) count += 1;
    if (requireGardenOrRoof) count += 1;
    if (requireVirtualTour) count += 1;
    if (requireDailyBooking) count += 1;
    if (minBathrooms !== 'all') count += 1;
    if (minAreaSqmInput.trim() !== '') count += 1;
    if (selectedBedrooms !== 'all') count += 1;
    if (selectedFurnishing !== 'all') count += 1;
    if (minPriceInput.trim() !== '' || maxPriceInput.trim() !== '') count += 1;
    return count;
  }, [
    verifiedOnly,
    requirePrivateGarage,
    requireGardenOrRoof,
    requireVirtualTour,
    requireDailyBooking,
    minBathrooms,
    minAreaSqmInput,
    selectedBedrooms,
    selectedFurnishing,
    minPriceInput,
    maxPriceInput,
  ]);

  const priceSliderConfig = useMemo(() => {
    if (priceBasis === 'daily') {
      const dailyValues = apartments
        .map((apt) => apt.dailyRateEgp)
        .filter((rate) => rate > 0);
      if (dailyValues.length === 0) {
        return {
          min: 300,
          max: 10000,
          step: 100,
          eligibleCount: 0,
        };
      }
      const rawMin = Math.min(...dailyValues);
      const rawMax = Math.max(...dailyValues);
      const step = rawMax - rawMin > 25000 ? 250 : 100;
      const minBound = Math.max(100, Math.floor(rawMin / 100) * 100);
      const maxBound = Math.max(minBound + step * 4, Math.ceil(rawMax / 500) * 500);
      return {
        min: minBound,
        max: maxBound,
        step,
        eligibleCount: dailyValues.length,
      };
    }

    const monthlyValues = apartments
      .map((apt) => apt.monthlyRentEgp)
      .filter((rent) => rent > 0);
    if (monthlyValues.length === 0) {
      return {
        min: 1000,
        max: 150000,
        step: 1000,
        eligibleCount: 0,
      };
    }
    const rawMin = Math.min(...monthlyValues);
    const rawMax = Math.max(...monthlyValues);
    const step = rawMax - rawMin > 150000 ? 5000 : 1000;
    const minBound = Math.max(1000, Math.floor(rawMin / 1000) * 1000);
    const maxBound = Math.max(minBound + step * 4, Math.ceil(rawMax / 5000) * 5000);
    return {
      min: minBound,
      max: maxBound,
      step,
      eligibleCount: monthlyValues.length,
    };
  }, [apartments, priceBasis]);

  const effectiveSliderMin = useMemo(() => {
    const parsed = minPriceInput.trim() !== '' ? Number(minPriceInput) : priceSliderConfig.min;
    if (Number.isNaN(parsed)) return priceSliderConfig.min;
    return Math.max(
      priceSliderConfig.min,
      Math.min(parsed, priceSliderConfig.max - priceSliderConfig.step)
    );
  }, [minPriceInput, priceSliderConfig]);

  const effectiveSliderMax = useMemo(() => {
    const parsed = maxPriceInput.trim() !== '' ? Number(maxPriceInput) : priceSliderConfig.max;
    if (Number.isNaN(parsed)) return priceSliderConfig.max;
    return Math.min(
      priceSliderConfig.max,
      Math.max(parsed, effectiveSliderMin + priceSliderConfig.step)
    );
  }, [maxPriceInput, priceSliderConfig, effectiveSliderMin]);

  const sliderSpanPct = useMemo(() => {
    const totalSpan = Math.max(1, priceSliderConfig.max - priceSliderConfig.min);
    const minPct = Math.max(
      0,
      Math.min(100, ((effectiveSliderMin - priceSliderConfig.min) / totalSpan) * 100)
    );
    const maxPct = Math.max(
      minPct,
      Math.min(100, ((effectiveSliderMax - priceSliderConfig.min) / totalSpan) * 100)
    );
    return { minPct, maxPct };
  }, [priceSliderConfig, effectiveSliderMin, effectiveSliderMax]);

  const hasCustomPriceBounds =
    minPriceInput.trim() !== '' || maxPriceInput.trim() !== '';

  const handlePriceBasisChange = useCallback(
    (nextBasis: PriceFilterBasis) => {
      if (nextBasis === priceBasis) return;
      setPriceBasis(nextBasis);
      setMinPriceInput('');
      setMaxPriceInput('');
      setSelectedPinId(null);
      setActiveClusterKey(null);
    },
    [priceBasis]
  );

  const handleSliderMinChange = useCallback(
    (rawValue: number) => {
      const clamped = Math.max(
        priceSliderConfig.min,
        Math.min(rawValue, effectiveSliderMax - priceSliderConfig.step)
      );
      setMinPriceInput(clamped <= priceSliderConfig.min ? '' : String(clamped));
      setSelectedPinId(null);
      setActiveClusterKey(null);
    },
    [priceSliderConfig, effectiveSliderMax]
  );

  const handleSliderMaxChange = useCallback(
    (rawValue: number) => {
      const clamped = Math.min(
        priceSliderConfig.max,
        Math.max(rawValue, effectiveSliderMin + priceSliderConfig.step)
      );
      setMaxPriceInput(clamped >= priceSliderConfig.max ? '' : String(clamped));
      setSelectedPinId(null);
      setActiveClusterKey(null);
    },
    [priceSliderConfig, effectiveSliderMin]
  );

  const getDisplayedUnitPrice = useCallback(
    (apt: ApartmentRecord) => {
      if (priceBasis === 'daily' && apt.dailyRateEgp > 0) {
        return {
          amountEgp: apt.dailyRateEgp,
          pinSuffix: lang === 'ar' ? 'ج.م / يوم' : 'EGP/d',
        };
      }
      if (priceBasis === 'monthly' && hasCustomPriceBounds) {
        return {
          amountEgp: apt.monthlyRentEgp,
          pinSuffix: lang === 'ar' ? 'ج.م / شهر' : 'EGP/mo',
        };
      }
      return getPrimaryDisplayPrice(apt, lang);
    },
    [priceBasis, hasCustomPriceBounds, lang]
  );

  const activeFilterCount = useMemo(() => {
    let count = advancedFilterActiveCount;
    if (selectedCategory !== 'all') count += 1;
    if (selectedGovernorate !== 'all') count += 1;
    if (priceBasis === 'daily' || minPriceInput.trim() !== '' || maxPriceInput.trim() !== '') {
      count += 1;
    }
    if (selectedBedrooms !== 'all') count += 1;
    if (selectedFurnishing !== 'all') count += 1;
    if (activeDestination !== null) count += 1;
    if (filterByMapBounds) count += 1;
    return count;
  }, [
    advancedFilterActiveCount,
    selectedCategory,
    selectedGovernorate,
    priceBasis,
    minPriceInput,
    maxPriceInput,
    selectedBedrooms,
    selectedFurnishing,
    activeDestination,
    filterByMapBounds,
  ]);

  const hasActiveAdvancedFilters = activeFilterCount > 0;

  const handleResetAllFilters = () => {
    setSelectedCategory('all');
    setSelectedGovernorate('all');
    setPriceBasis('monthly');
    setMinPriceInput('');
    setMaxPriceInput('');
    setSelectedBedrooms('all');
    setSelectedFurnishing('all');
    setVerifiedOnly(false);
    setRequirePrivateGarage(false);
    setRequireGardenOrRoof(false);
    setRequireVirtualTour(false);
    setRequireDailyBooking(false);
    setMinBathrooms('all');
    setMinAreaSqmInput('');
    setActiveDestination(null);
    setFilterByMapBounds(false);
    setSelectedPinId(null);
    setActiveClusterKey(null);
    flyToCamera(30.0444, 31.2357, 7);
  };

  const baseFilteredWithoutAdvanced = useMemo(() => {
    const rawMin = minPriceInput.trim() !== '' ? Number(minPriceInput) : null;
    const rawMax = maxPriceInput.trim() !== '' ? Number(maxPriceInput) : null;
    const hasMin = rawMin !== null && !Number.isNaN(rawMin);
    const hasMax = rawMax !== null && !Number.isNaN(rawMax);
    const minVal = hasMin && hasMax ? Math.min(rawMin, rawMax) : rawMin;
    const maxVal = hasMin && hasMax ? Math.max(rawMin, rawMax) : rawMax;

    return apartments.filter((apt) => {
      if (selectedCategory !== 'all' && apt.category !== selectedCategory) {
        return false;
      }
      if (selectedGovernorate !== 'all' && apt.governorate !== selectedGovernorate) {
        return false;
      }

      if (priceBasis === 'daily') {
        if (apt.dailyRateEgp <= 0) return false;
        if (minVal !== null && !Number.isNaN(minVal) && apt.dailyRateEgp < minVal) {
          return false;
        }
        if (maxVal !== null && !Number.isNaN(maxVal) && apt.dailyRateEgp > maxVal) {
          return false;
        }
      } else if (minVal !== null || maxVal !== null) {
        if (minVal !== null && !Number.isNaN(minVal) && apt.monthlyRentEgp < minVal) {
          return false;
        }
        if (maxVal !== null && !Number.isNaN(maxVal) && apt.monthlyRentEgp > maxVal) {
          return false;
        }
      }

      if (selectedBedrooms !== 'all') {
        if (selectedBedrooms === '4plus') {
          if (apt.bedrooms < 4) return false;
        } else {
          if (apt.bedrooms !== Number(selectedBedrooms)) return false;
        }
      }

      if (selectedFurnishing !== 'all' && apt.furnishing !== selectedFurnishing) {
        return false;
      }

      return true;
    });
  }, [
    apartments,
    selectedCategory,
    selectedGovernorate,
    priceBasis,
    minPriceInput,
    maxPriceInput,
    selectedBedrooms,
    selectedFurnishing,
  ]);

  const advancedFacetCounts = useMemo(() => {
    let verifiedCount = 0;
    let privateGarageCount = 0;
    let gardenOrRoofCount = 0;
    let virtualTourCount = 0;
    let dailyStayCount = 0;

    for (const apt of baseFilteredWithoutAdvanced) {
      if (apt.verificationStatus === 'verified') verifiedCount += 1;
      if (apt.houseHasPrivateGarage === true) privateGarageCount += 1;
      if (apt.houseHasGardenOrRoof === true) gardenOrRoofCount += 1;
      if (apt.hasVirtualTour) virtualTourCount += 1;
      if (apt.billingMode === 'daily_or_monthly' && apt.dailyRateEgp > 0) {
        dailyStayCount += 1;
      }
    }

    return {
      verifiedCount,
      privateGarageCount,
      gardenOrRoofCount,
      virtualTourCount,
      dailyStayCount,
    };
  }, [baseFilteredWithoutAdvanced]);

  const filteredApartments = useMemo(() => {
    const minAreaVal = minAreaSqmInput.trim() !== '' ? Number(minAreaSqmInput) : null;

    const list = baseFilteredWithoutAdvanced.filter((apt) => {
      if (verifiedOnly && apt.verificationStatus !== 'verified') {
        return false;
      }
      if (requirePrivateGarage && apt.houseHasPrivateGarage !== true) {
        return false;
      }
      if (requireGardenOrRoof && apt.houseHasGardenOrRoof !== true) {
        return false;
      }
      if (requireVirtualTour && !apt.hasVirtualTour) {
        return false;
      }
      if (
        requireDailyBooking &&
        !(apt.billingMode === 'daily_or_monthly' && apt.dailyRateEgp > 0)
      ) {
        return false;
      }
      if (minBathrooms === '2plus' && apt.bathrooms < 2) {
        return false;
      }
      if (minBathrooms === '3plus' && apt.bathrooms < 3) {
        return false;
      }
      if (minAreaVal !== null && !Number.isNaN(minAreaVal) && apt.areaSqm < minAreaVal) {
        return false;
      }

      return true;
    });

    if (activeDestination) {
      return [...list].sort(
        (a, b) =>
          calculateDistanceKm(
            activeDestination.lat,
            activeDestination.lng,
            a.lat,
            a.lng
          ) -
          calculateDistanceKm(
            activeDestination.lat,
            activeDestination.lng,
            b.lat,
            b.lng
          )
      );
    }

    return list;
  }, [
    baseFilteredWithoutAdvanced,
    verifiedOnly,
    requirePrivateGarage,
    requireGardenOrRoof,
    requireVirtualTour,
    requireDailyBooking,
    minBathrooms,
    minAreaSqmInput,
    activeDestination,
  ]);

  const inMapViewportApartments = useMemo(() => {
    if (!mapBounds) return filteredApartments;
    return filteredApartments.filter(
      (apt) =>
        apt.lat >= mapBounds.south &&
        apt.lat <= mapBounds.north &&
        apt.lng >= mapBounds.west &&
        apt.lng <= mapBounds.east
    );
  }, [filteredApartments, mapBounds]);

  const isZoomedOut = mapZoom <= ZOOMED_OUT_THRESHOLD;
  const showMapPanel = viewMode !== 'compact_grid';
  const isFullWidthGrid = !showMapPanel;
  const isCompactCardMode =
    isMobileViewport || isZoomedOut || viewMode === 'compact_grid';

  const displayedApartments = useMemo(() => {
    if (filterByMapBounds && showMapPanel && mapBounds) {
      return inMapViewportApartments;
    }
    return filteredApartments;
  }, [
    filterByMapBounds,
    showMapPanel,
    mapBounds,
    inMapViewportApartments,
    filteredApartments,
  ]);

  // Interactive Category Status Bar Counts (reflects ALL active non-category filters + map bounds if enabled)
  const filteredCategoryStatusCounts = useMemo(() => {
    const rawMin = minPriceInput.trim() !== '' ? Number(minPriceInput) : null;
    const rawMax = maxPriceInput.trim() !== '' ? Number(maxPriceInput) : null;
    const hasMin = rawMin !== null && !Number.isNaN(rawMin);
    const hasMax = rawMax !== null && !Number.isNaN(rawMax);
    const minVal = hasMin && hasMax ? Math.min(rawMin, rawMax) : rawMin;
    const maxVal = hasMin && hasMax ? Math.max(rawMin, rawMax) : rawMax;
    const minAreaVal = minAreaSqmInput.trim() !== '' ? Number(minAreaSqmInput) : null;
    const applyBounds = Boolean(filterByMapBounds && showMapPanel && mapBounds);

    const counts: Record<'all' | ListingCategory, number> = {
      all: 0,
      family_apartment: 0,
      whole_house: 0,
      hotel_room: 0,
      industrial_factory: 0,
      student_housing: 0,
    };

    for (const apt of apartments) {
      if (selectedGovernorate !== 'all' && apt.governorate !== selectedGovernorate) continue;

      if (priceBasis === 'daily') {
        if (apt.dailyRateEgp <= 0) continue;
        if (minVal !== null && !Number.isNaN(minVal) && apt.dailyRateEgp < minVal) continue;
        if (maxVal !== null && !Number.isNaN(maxVal) && apt.dailyRateEgp > maxVal) continue;
      } else if (minVal !== null || maxVal !== null) {
        if (minVal !== null && !Number.isNaN(minVal) && apt.monthlyRentEgp < minVal) continue;
        if (maxVal !== null && !Number.isNaN(maxVal) && apt.monthlyRentEgp > maxVal) continue;
      }

      if (selectedBedrooms !== 'all') {
        if (selectedBedrooms === '4plus') {
          if (apt.bedrooms < 4) continue;
        } else if (apt.bedrooms !== Number(selectedBedrooms)) {
          continue;
        }
      }

      if (selectedFurnishing !== 'all' && apt.furnishing !== selectedFurnishing) continue;
      if (verifiedOnly && apt.verificationStatus !== 'verified') continue;
      if (requirePrivateGarage && apt.houseHasPrivateGarage !== true) continue;
      if (requireGardenOrRoof && apt.houseHasGardenOrRoof !== true) continue;
      if (requireVirtualTour && !apt.hasVirtualTour) continue;
      if (
        requireDailyBooking &&
        !(apt.billingMode === 'daily_or_monthly' && apt.dailyRateEgp > 0)
      ) {
        continue;
      }
      if (minBathrooms === '2plus' && apt.bathrooms < 2) continue;
      if (minBathrooms === '3plus' && apt.bathrooms < 3) continue;
      if (minAreaVal !== null && !Number.isNaN(minAreaVal) && apt.areaSqm < minAreaVal) continue;

      if (
        applyBounds &&
        mapBounds &&
        !(
          apt.lat >= mapBounds.south &&
          apt.lat <= mapBounds.north &&
          apt.lng >= mapBounds.west &&
          apt.lng <= mapBounds.east
        )
      ) {
        continue;
      }

      counts.all += 1;
      counts[apt.category] = (counts[apt.category] ?? 0) + 1;
    }

    return counts;
  }, [
    apartments,
    selectedGovernorate,
    priceBasis,
    minPriceInput,
    maxPriceInput,
    selectedBedrooms,
    selectedFurnishing,
    verifiedOnly,
    requirePrivateGarage,
    requireGardenOrRoof,
    requireVirtualTour,
    requireDailyBooking,
    minBathrooms,
    minAreaSqmInput,
    filterByMapBounds,
    showMapPanel,
    mapBounds,
  ]);

  const spatialClusters = useMemo<SpatialUnitCluster[]>(() => {
    const groups = new Map<string, ApartmentRecord[]>();

    for (const apt of filteredApartments) {
      let key: string;
      if (mapZoom <= 8) {
        key = `gov_${apt.governorate}`;
      } else {
        const cellDeg = 0.14;
        const rLat = Math.round(apt.lat / cellDeg);
        const rLng = Math.round(apt.lng / cellDeg);
        key = `cell_${rLat}_${rLng}`;
      }
      const existing = groups.get(key);
      if (existing) {
        existing.push(apt);
      } else {
        groups.set(key, [apt]);
      }
    }

    const clusters: SpatialUnitCluster[] = [];
    groups.forEach((items, key) => {
      const avgLat = items.reduce((sum, a) => sum + a.lat, 0) / items.length;
      const avgLng = items.reduce((sum, a) => sum + a.lng, 0) / items.length;
      const minPriceEgp = Math.min(
        ...items.map((a) => getDisplayedUnitPrice(a).amountEgp)
      );
      const first = items[0];
      const label =
        mapZoom <= 8
          ? govLabel(first.governorate)
          : `${govLabel(first.governorate)} · ${first.district}`;
      clusters.push({
        key,
        lat: avgLat,
        lng: avgLng,
        label,
        minPriceEgp,
        items,
      });
    });

    return clusters;
  }, [filteredApartments, mapZoom, govLabel, getDisplayedUnitPrice]);

  const activePinApartment = useMemo(
    () => filteredApartments.find((a) => a.id === selectedPinId) || null,
    [filteredApartments, selectedPinId]
  );

  const activeCluster = useMemo(
    () => spatialClusters.find((c) => c.key === activeClusterKey) || null,
    [spatialClusters, activeClusterKey]
  );

  const applyQuickPriceRange = (min: string, max: string) => {
    setMinPriceInput(min);
    setMaxPriceInput(max);
    setSelectedPinId(null);
    setActiveClusterKey(null);
  };

  const selectedPricePreset = useMemo(() => {
    if (minPriceInput === '' && maxPriceInput === '') return 'any';
    if (priceBasis === 'daily') {
      if (minPriceInput === '' && maxPriceInput === '2500') return 'd_le2500';
      if (minPriceInput === '2500' && maxPriceInput === '4500') return 'd_2500_4500';
      if (minPriceInput === '4500' && maxPriceInput === '7000') return 'd_4500_7000';
      if (minPriceInput === '7000' && maxPriceInput === '') return 'd_7000_plus';
      return 'custom';
    }
    if (minPriceInput === '' && maxPriceInput === '15000') return 'le15k';
    if (minPriceInput === '15000' && maxPriceInput === '35000') return '15k_35k';
    if (minPriceInput === '35000' && maxPriceInput === '70000') return '35k_70k';
    if (minPriceInput === '70000' && maxPriceInput === '') return '70k_plus';
    return 'custom';
  }, [priceBasis, minPriceInput, maxPriceInput]);

  const handlePricePresetSelect = (preset: string) => {
    switch (preset) {
      case 'any':
        applyQuickPriceRange('', '');
        break;
      case 'd_le2500':
        applyQuickPriceRange('', '2500');
        break;
      case 'd_2500_4500':
        applyQuickPriceRange('2500', '4500');
        break;
      case 'd_4500_7000':
        applyQuickPriceRange('4500', '7000');
        break;
      case 'd_7000_plus':
        applyQuickPriceRange('7000', '');
        break;
      case 'le15k':
        applyQuickPriceRange('', '15000');
        break;
      case '15k_35k':
        applyQuickPriceRange('15000', '35000');
        break;
      case '35k_70k':
        applyQuickPriceRange('35000', '70000');
        break;
      case '70k_plus':
        applyQuickPriceRange('70000', '');
        break;
      default:
        break;
    }
  };

  const renderPriceRangeSlider = (compact = false) => {
    const unitSuffix =
      priceBasis === 'daily'
        ? t('ج.م / يوم', 'EGP / day')
        : t('ج.م / شهر', 'EGP / mo');
    const midThreshold =
      priceSliderConfig.min + (priceSliderConfig.max - priceSliderConfig.min) * 0.5;
    const minThumbOnTop = effectiveSliderMin > midThreshold;

    return (
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className={`${
          compact ? 'bg-slate-50/90 border border-slate-200 rounded-lg p-2 space-y-1.5' : 'space-y-1.5'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap">
              {t('شريط نطاق السعر:', 'Price Slider:')}
            </span>
            <div
              role="group"
              aria-label={t('نوع تسعير الفلتر', 'Filter Pricing Basis')}
              className="inline-flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-lg border border-slate-200"
            >
              <button
                type="button"
                onClick={() => handlePriceBasisChange('monthly')}
                aria-pressed={priceBasis === 'monthly'}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${
                  priceBasis === 'monthly'
                    ? 'bg-blue-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('شهري', 'Monthly')}
              </button>
              <button
                type="button"
                onClick={() => handlePriceBasisChange('daily')}
                aria-pressed={priceBasis === 'daily'}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${
                  priceBasis === 'daily'
                    ? 'bg-blue-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('يومي', 'Daily')}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono tabular-nums text-[11px] font-bold text-blue-800 whitespace-nowrap">
              {formatNumber(effectiveSliderMin)} — {formatNumber(effectiveSliderMax)}{' '}
              <span className="font-sans font-semibold text-slate-600">{unitSuffix}</span>
            </span>
            {hasCustomPriceBounds && (
              <button
                type="button"
                onClick={() => applyQuickPriceRange('', '')}
                className="text-[10px] font-bold text-slate-600 hover:text-blue-700 underline whitespace-nowrap"
              >
                {t('الكل', 'All')}
              </button>
            )}
          </div>
        </div>

        <div
          dir="ltr"
          className="relative h-8 flex items-center select-none touch-none"
        >
          <svg
            viewBox="0 0 1000 8"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="w-full h-2 rounded-full pointer-events-none"
          >
            <rect x="0" y="0" width="1000" height="8" rx="4" className="fill-slate-200" />
            <rect
              x={sliderSpanPct.minPct * 10}
              y="0"
              width={Math.max(12, (sliderSpanPct.maxPct - sliderSpanPct.minPct) * 10)}
              height="8"
              rx="4"
              className="fill-blue-700"
            />
          </svg>

          <input
            type="range"
            min={priceSliderConfig.min}
            max={priceSliderConfig.max}
            step={priceSliderConfig.step}
            value={effectiveSliderMin}
            aria-label={
              priceBasis === 'daily'
                ? t('الحد الأدنى للإيجار اليومي', 'Minimum Daily Rent')
                : t('الحد الأدنى للإيجار الشهري', 'Minimum Monthly Rent')
            }
            onChange={(e) => handleSliderMinChange(Number(e.target.value))}
            className={`dual-range-input absolute inset-x-0 w-full h-8 m-0 ${
              minThumbOnTop ? 'z-30' : 'z-10'
            }`}
          />

          <input
            type="range"
            min={priceSliderConfig.min}
            max={priceSliderConfig.max}
            step={priceSliderConfig.step}
            value={effectiveSliderMax}
            aria-label={
              priceBasis === 'daily'
                ? t('الحد الأقصى للإيجار اليومي', 'Maximum Daily Rent')
                : t('الحد الأقصى للإيجار الشهري', 'Maximum Monthly Rent')
            }
            onChange={(e) => handleSliderMaxChange(Number(e.target.value))}
            className="dual-range-input absolute inset-x-0 w-full h-8 m-0 z-20"
          />
        </div>

        <div className="flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums text-slate-500">
          <span>
            {formatNumber(priceSliderConfig.min)} {t('ج.م', 'EGP')}
          </span>
          {priceBasis === 'daily' && (
            <span className="font-sans font-semibold text-amber-700 truncate">
              {t(
                `${formatNumber(priceSliderConfig.eligibleCount)} وحدة متاحة بالإيجار اليومي`,
                `${formatNumber(priceSliderConfig.eligibleCount)} daily-eligible units`
              )}
            </span>
          )}
          <span>
            {formatNumber(priceSliderConfig.max)} {t('ج.م', 'EGP')}
          </span>
        </div>
      </div>
    );
  };

  // Tightened Grid Spacing: minimal gutters (`gap-1` / `gap-1.5` / `gap-2`) to eliminate excess whitespace
  const gridContainerClasses = useMemo(() => {
    const mobileGrid =
      mobileCols === 3 ? 'grid-cols-3 gap-1' : 'grid-cols-2 gap-1.5';

    if (isFullWidthGrid) {
      return `grid ${mobileGrid} sm:grid-cols-3 sm:gap-1.5 md:grid-cols-4 md:gap-2 lg:grid-cols-4 xl:grid-cols-5 xl:gap-2`;
    }

    if (isZoomedOut) {
      return `grid ${mobileGrid} sm:grid-cols-3 sm:gap-1.5 md:grid-cols-3 md:gap-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-2`;
    }

    return `grid ${mobileGrid} sm:grid-cols-3 sm:gap-2 md:grid-cols-3 md:gap-2 lg:grid-cols-3 xl:grid-cols-3 xl:gap-2`;
  }, [mobileCols, isFullWidthGrid, isZoomedOut]);

  const formattedLastRefreshTime = useMemo(() => {
    if (!lastRefreshedAtMs) return '';
    try {
      return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(lastRefreshedAtMs));
    } catch {
      return '';
    }
  }, [lastRefreshedAtMs, lang]);

  // Scoped completed bookings strictly from real Firestore records (status === 'completed')
  const scopedDemandSignals = useMemo<BookingDemandSignalRecord[]>(() => {
    return completedDemandSignals.filter((sig) => {
      if (sig.status !== 'completed') return false;
      if (heatmapScope === 'all_residential') {
        return isResidentialCategory(sig.category);
      }
      if (heatmapScope === 'all_sectors') {
        return true;
      }
      return sig.category === heatmapScope;
    });
  }, [completedDemandSignals, heatmapScope]);

  const heatmapPoints = useMemo<HeatmapDemandPoint[]>(() => {
    return scopedDemandSignals.map((sig) => ({
      id: sig.id,
      lat: sig.lat,
      lng: sig.lng,
      governorate: sig.governorate,
      district: sig.district,
      weight: Number(
        (1 + Math.min(1.5, Math.max(0, (sig.unitsCount - 1) * 0.12))).toFixed(2)
      ),
    }));
  }, [scopedDemandSignals]);

  const governorateDemandRows = useMemo<GovernorateDemandRow[]>(() => {
    const byGov = new Map<string, { count: number; totalRentEgp: number }>();
    for (const sig of scopedDemandSignals) {
      const prev = byGov.get(sig.governorate) || { count: 0, totalRentEgp: 0 };
      prev.count += 1;
      prev.totalRentEgp += sig.totalRentEgp;
      byGov.set(sig.governorate, prev);
    }

    let maxCount = 0;
    byGov.forEach((v) => {
      if (v.count > maxCount) maxCount = v.count;
    });

    const totalSignals = scopedDemandSignals.length;

    const rows: GovernorateDemandRow[] = EGYPT_GOVERNORATES.map((gov) => {
      const stat = byGov.get(gov.name) || { count: 0, totalRentEgp: 0 };
      const intensityRatio = maxCount > 0 ? stat.count / maxCount : 0;
      const sharePct =
        totalSignals > 0 ? Math.round((stat.count / totalSignals) * 100) : 0;

      let demandLevel: GovernorateDemandRow['demandLevel'] = 'none';
      if (stat.count > 0) {
        if (intensityRatio >= 0.75) {
          demandLevel = 'peak';
        } else if (intensityRatio >= 0.4) {
          demandLevel = 'high';
        } else {
          demandLevel = 'moderate';
        }
      }

      return {
        name: gov.name,
        lat: gov.lat,
        lng: gov.lng,
        zoom: gov.zoom,
        completedCount: stat.count,
        totalRentEgp: stat.totalRentEgp,
        sharePct,
        intensityRatio,
        demandLevel,
      };
    });

    return rows.sort((a, b) => {
      if (b.completedCount !== a.completedCount) {
        return b.completedCount - a.completedCount;
      }
      return b.totalRentEgp - a.totalRentEgp;
    });
  }, [scopedDemandSignals]);

  const activeDemandGovernoratesCount = useMemo(
    () => governorateDemandRows.filter((r) => r.completedCount > 0).length,
    [governorateDemandRows]
  );

  const totalScopedDemandVolumeEgp = useMemo(
    () => scopedDemandSignals.reduce((acc, s) => acc + s.totalRentEgp, 0),
    [scopedDemandSignals]
  );

  const topDemandDistricts = useMemo(() => {
    const map = new Map<
      string,
      { governorate: string; district: string; count: number; lat: number; lng: number }
    >();
    for (const sig of scopedDemandSignals) {
      const key = `${sig.governorate}__${sig.district}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, {
          governorate: sig.governorate,
          district: sig.district,
          count: 1,
          lat: sig.lat,
          lng: sig.lng,
        });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [scopedDemandSignals]);

  const visibleGovernorateRows = useMemo(
    () =>
      showAll27Governorates
        ? governorateDemandRows
        : governorateDemandRows.slice(0, 9),
    [governorateDemandRows, showAll27Governorates]
  );

  const handleToggleHeatmap = useCallback(() => {
    setHeatmapEnabled((prev) => {
      const next = !prev;
      if (next) {
        setSelectedPinId(null);
        setActiveClusterKey(null);
        if (viewMode === 'compact_grid') {
          setViewMode('split_map');
        }
        if (selectedGovernorate === 'all' && !activeDestination) {
          flyToCamera(27.4, 30.9, 6);
        }
      }
      return next;
    });
  }, [viewMode, selectedGovernorate, activeDestination, flyToCamera]);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={finishPullGesture}
      onTouchCancel={finishPullGesture}
      onPointerDown={(e) => {
        if (isMobileViewport && e.pointerType === 'mouse' && e.button === 0) {
          beginPullGesture(e.clientX, e.clientY, e.target);
        }
      }}
      onPointerMove={(e) => {
        if (isMobileViewport && e.pointerType === 'mouse') {
          updatePullGesture(e.clientX, e.clientY);
        }
      }}
      onPointerUp={(e) => {
        if (isMobileViewport && e.pointerType === 'mouse') {
          finishPullGesture();
        }
      }}
      className="max-w-[1440px] mx-auto px-2 sm:px-4 py-2 sm:py-3.5 space-y-2 sm:space-y-2.5"
    >
      {/* Mobile Pull-to-Refresh Spring Indicator */}
      <div
        aria-live="polite"
        style={{ height: `${pullOffsetPx}px` }}
        className={`overflow-hidden flex items-center justify-center ${
          isDraggingPull ? 'transition-none' : 'transition-[height] duration-200 ease-out'
        }`}
      >
        {pullPhase !== 'idle' && (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-white border border-slate-200 shadow-xs text-xs font-semibold text-slate-800 whitespace-nowrap">
            {pullPhase === 'done' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-emerald-700">
                  {t('تم تحديث الخريطة والوحدات فورياً', 'Map & units updated instantly')}
                </span>
              </>
            ) : pullPhase === 'refreshing' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-blue-700 animate-spin shrink-0" />
                <span className="text-blue-700">
                  {t('جاري تحديث البيانات من السحابة...', 'Refreshing live data...')}
                </span>
              </>
            ) : pullPhase === 'armed' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-blue-700 rotate-180 transition-transform shrink-0" />
                <span className="text-blue-700">
                  {t('أفلت للتحديث الفوري', 'Release to refresh immediately')}
                </span>
              </>
            ) : (
              <>
                <ArrowDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>
                  {t(
                    'اسحب للأسفل لتحديث الخريطة والوحدات',
                    'Pull down to refresh map & units'
                  )}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* 1. Clean & Minimalist Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <span>{t('عقارات موثقة للإيجار', 'Verified Rental Properties')}</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>{t('ضمان 27 محافظة', '27 Govs Escrow')}</span>
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {t('تصفح واحجز مباشرة مع عقود رسمية وضمان الإسكرو المالي', 'Browse and book verified properties with escrow guarantee')}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenListingWizard}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs whitespace-nowrap self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>{t('اعرض عقارك', 'List Unit')}</span>
        </button>
      </div>

      {/* 2. Unified Search & Filters Bar (Minimalist Single Row) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-2 sm:p-2.5 shadow-2xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Location Search Bar */}
          <div className="flex-1 min-w-0">
            <EgyptLocationSearchBar
              onSelectDestination={handleSelectDestination}
              activeDestinationLabel={activeDestination?.label || null}
              onClearDestination={handleClearDestination}
            />
          </div>

          {/* Quick Governorate Selector */}
          <div className="sm:w-44 shrink-0 relative">
            <select
              aria-label={t('اختر المحافظة', 'Select Governorate')}
              value={selectedGovernorate}
              onChange={(e) => handleGovernorateSelect(e.target.value)}
              className="w-full h-10 px-3 py-2 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors"
            >
              <option value="all">{t('جميع المحافظات (27)', 'All Governorates')}</option>
              {EGYPT_GOVERNORATES.map((g) => (
                <option key={g.name} value={g.name}>
                  {govLabel(g.name)}
                </option>
              ))}
            </select>
          </div>

          {/* Advanced Filters Button */}
          <button
            type="button"
            onClick={() => setIsAdvancedFilterOpen(true)}
            className={`h-10 px-4 rounded-xl border text-xs font-bold transition-all inline-flex items-center justify-center gap-2 shrink-0 ${
              advancedFilterActiveCount > 0
                ? 'bg-blue-50 text-blue-800 border-blue-300 shadow-2xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4 text-blue-700 shrink-0" />
            <span>{t('فلترة متقدمة', 'Filters')}</span>
            {advancedFilterActiveCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-blue-700 text-white text-[10px] font-mono font-bold flex items-center justify-center">
                {advancedFilterActiveCount}
              </span>
            )}
          </button>

          {/* 1-Click Reset Button */}
          {hasActiveAdvancedFilters && (
            <button
              type="button"
              onClick={handleResetAllFilters}
              title={t('إعادة ضبط كافة الفلاتر', 'Reset all filters')}
              className="h-10 px-3 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-xs font-bold transition-colors inline-flex items-center justify-center gap-1 shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{t('إعادة ضبط', 'Reset')}</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Category Quick-Chips (Single Clean Row with Expressive Icons) */}
      <div
        data-no-pull="true"
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5"
      >
        {CATEGORY_TABS.map((cat) => {
          const count = categoryCounts[cat];
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => handleCategorySelect(cat)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap shrink-0 shadow-2xs ${
                isActive
                  ? 'bg-blue-700 text-white border-blue-700 shadow-xs'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              <span className={isActive ? 'text-white' : 'text-blue-700'}>
                {cat === 'all' && <Sparkles className="w-3.5 h-3.5" />}
                {cat === 'family_apartment' && <Building className="w-3.5 h-3.5" />}
                {cat === 'whole_house' && <Home className="w-3.5 h-3.5" />}
                {cat === 'hotel_room' && <Hotel className="w-3.5 h-3.5" />}
                {cat === 'industrial_factory' && <Factory className="w-3.5 h-3.5" />}
                {cat === 'student_housing' && <GraduationCap className="w-3.5 h-3.5" />}
              </span>
              <span>{cat === 'all' ? t('كل التصنيفات', 'All') : categoryLabel(cat)}</span>
              <span
                className={`text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded-full ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {formatNumber(count)}
              </span>
            </button>
          );
        })}
      </div>

      {/* 4. Slim View Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 sm:px-3 py-1.5 shadow-2xs">
        <div className="flex items-center gap-1.5 text-xs text-slate-700 font-semibold">
          <span className="font-bold text-blue-700 font-mono tabular-nums">
            {formatNumber(displayedApartments.length)}
          </span>
          <span className="text-slate-500">{t('وحدة متوفرة', 'units available')}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* View mode switcher */}
          <div
            data-no-pull="true"
            className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg overflow-x-auto no-scrollbar"
          >
            <button
              type="button"
              onClick={() => setViewMode('auto')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'auto'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{t('عرض ذكي', 'Smart View')}</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('split_map')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'split_map'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>{t('خريطة + شبكة', 'Map + Grid')}</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('compact_grid')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'compact_grid'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Grid3x3 className="w-3.5 h-3.5" />
              <span>{t('شبكة متراصة', 'Grid')}</span>
            </button>
          </div>

          {/* Demand Heatmap Toggle */}
          <button
            type="button"
            onClick={handleToggleHeatmap}
            aria-pressed={heatmapEnabled}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors whitespace-nowrap shrink-0 ${
              heatmapEnabled
                ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('الخريطة الحرارية', 'Heatmap')}</span>
          </button>

          {/* In-Map Bounds toggle (when map bounds exist) */}
          {showMapPanel && mapBounds && (
            <button
              type="button"
              onClick={() => setFilterByMapBounds((prev) => !prev)}
              className={`hidden sm:inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                filterByMapBounds
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {t(`داخل الخريطة (${formatNumber(inMapViewportApartments.length)})`, `In Bounds (${formatNumber(inMapViewportApartments.length)})`)}
            </button>
          )}

          {/* Refresh button */}
          <button
            type="button"
            disabled={pullPhase === 'refreshing'}
            onClick={() => void executeImmediateRefresh()}
            title={t('تحديث فوري للبيانات', 'Refresh data now')}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-700 ${pullPhase === 'refreshing' ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 5. Advanced Filters Modal (Opens cleanly on demand) */}
      {isAdvancedFilterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col my-auto">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    {t('فلترة وبحث متقدم', 'Advanced Search & Filters')}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {t('حدد خياراتك بدقة لتخصيص نتائج البحث', 'Fine-tune search parameters')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAdvancedFilterOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 space-y-5 overflow-y-auto no-scrollbar">
              {/* Section 1: Price Range */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-blue-700" />
                    <span>{t('نطاق السعر المطلوب', 'Price Range')}</span>
                  </span>
                  <div
                    role="group"
                    className="inline-flex items-center gap-0.5 p-0.5 bg-white border border-slate-200 rounded-lg"
                  >
                    <button
                      type="button"
                      onClick={() => handlePriceBasisChange('monthly')}
                      className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-colors ${
                        priceBasis === 'monthly' ? 'bg-blue-700 text-white' : 'text-slate-600'
                      }`}
                    >
                      {t('شهري', 'Monthly')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePriceBasisChange('daily')}
                      className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-colors ${
                        priceBasis === 'daily' ? 'bg-blue-700 text-white' : 'text-slate-600'
                      }`}
                    >
                      {t('يومي', 'Daily')}
                    </button>
                  </div>
                </div>

                {/* Min / Max Inputs */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      {t('الحد الأدنى (ج.م)', 'Min (EGP)')}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      placeholder="0"
                      value={minPriceInput}
                      onChange={(e) => {
                        setMinPriceInput(normalizeNumericInput(e.target.value));
                        setSelectedPinId(null);
                        setActiveClusterKey(null);
                      }}
                      className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs font-mono tabular-nums text-start focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      {t('الحد الأقصى (ج.م)', 'Max (EGP)')}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      placeholder="100,000"
                      value={maxPriceInput}
                      onChange={(e) => {
                        setMaxPriceInput(normalizeNumericInput(e.target.value));
                        setSelectedPinId(null);
                        setActiveClusterKey(null);
                      }}
                      className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs font-mono tabular-nums text-start focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Interactive Slider */}
                <div className="pt-2">
                  {renderPriceRangeSlider(false)}
                </div>
              </div>

              {/* Section 2: Number of Rooms */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-900 block">
                  {t('عدد الغرف:', 'Bedrooms:')}
                </span>
                <div className="grid grid-cols-5 gap-1.5">
                  {(
                    [
                      { val: 'all', label: t('الكل', 'All') },
                      { val: '1', label: '1' },
                      { val: '2', label: '2' },
                      { val: '3', label: '3' },
                      { val: '4plus', label: '+4' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => {
                        setSelectedBedrooms(opt.val);
                        setSelectedPinId(null);
                        setActiveClusterKey(null);
                      }}
                      className={`h-9 rounded-xl text-xs font-semibold font-mono border transition-all ${
                        selectedBedrooms === opt.val
                          ? 'bg-blue-700 text-white border-blue-700 shadow-2xs'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 3: Furnishing */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-900 block">
                  {t('نوع الفرش والتجهيز:', 'Furnishing:')}
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      { val: 'all', label: t('الكل', 'All') },
                      { val: 'furnished', label: t('مفروش', 'Furnished') },
                      { val: 'semi_furnished', label: t('نصف مفروش', 'Semi') },
                      { val: 'unfurnished', label: t('بدون فرش', 'Unfurnished') },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => {
                        setSelectedFurnishing(opt.val);
                        setSelectedPinId(null);
                        setActiveClusterKey(null);
                      }}
                      className={`h-9 px-1 rounded-xl text-[11px] font-semibold border transition-all ${
                        selectedFurnishing === opt.val
                          ? 'bg-blue-700 text-white border-blue-700 shadow-2xs'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 4: Bathrooms & Area */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-900 block">
                    {t('الحمامات:', 'Bathrooms:')}
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        { val: 'all', label: t('الكل', 'All') },
                        { val: '2plus', label: '+2' },
                        { val: '3plus', label: '+3' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => {
                          setMinBathrooms(opt.val);
                          setSelectedPinId(null);
                          setActiveClusterKey(null);
                        }}
                        className={`h-9 rounded-xl text-xs font-semibold font-mono border transition-all ${
                          minBathrooms === opt.val
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-900 block">
                    {t('أدنى مساحة (م²):', 'Min Area (m²):')}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    placeholder="100"
                    value={minAreaSqmInput}
                    onChange={(e) => {
                      setMinAreaSqmInput(normalizeNumericInput(e.target.value).slice(0, 5));
                      setSelectedPinId(null);
                      setActiveClusterKey(null);
                    }}
                    className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs font-mono tabular-nums text-start focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Section 5: Amenities & Verification Toggles */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-900 block">
                  {t('المرافق والتوثيق المطلوب:', 'Amenities & Verification:')}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setVerifiedOnly((prev) => !prev);
                      setSelectedPinId(null);
                      setActiveClusterKey(null);
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                      verifiedOnly
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-500/20'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <ShieldCheck className={`w-4 h-4 ${verifiedOnly ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span>{t('موثق الملكية فقط', 'Verified Only')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRequirePrivateGarage((prev) => !prev);
                      setSelectedPinId(null);
                      setActiveClusterKey(null);
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                      requirePrivateGarage
                        ? 'bg-blue-50 border-blue-400 text-blue-900 ring-2 ring-blue-500/20'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <Car className={`w-4 h-4 ${requirePrivateGarage ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span>{t('جراج خاص', 'Garage')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRequireGardenOrRoof((prev) => !prev);
                      setSelectedPinId(null);
                      setActiveClusterKey(null);
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                      requireGardenOrRoof
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-500/20'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <Trees className={`w-4 h-4 ${requireGardenOrRoof ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span>{t('حديقة أو روف', 'Garden/Roof')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRequireVirtualTour((prev) => !prev);
                      setSelectedPinId(null);
                      setActiveClusterKey(null);
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                      requireVirtualTour
                        ? 'bg-purple-50 border-purple-400 text-purple-900 ring-2 ring-purple-500/20'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <Compass className={`w-4 h-4 ${requireVirtualTour ? 'text-purple-600' : 'text-slate-400'}`} />
                    <span>{t('جولة 360°', '360° Tour')}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t('إعادة ضبط الكل', 'Reset All')}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAdvancedFilterOpen(false)}
                className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
              >
                {t(`عرض النتائج (${formatNumber(displayedApartments.length)} وحدة)`, `Show Results (${formatNumber(displayedApartments.length)} units)`)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESIDENTIAL HIGH-DEMAND HEATMAP & ALL-27-GOVERNORATES INDEX PANEL */}
      {heatmapEnabled && (
        <section
          aria-label={t(
            'الخريطة الحرارية لمناطق الطلب المرتفع على الوحدات السكنية في جميع محافظات مصر',
            'Residential High-Demand Heatmap Across All 27 Egyptian Governorates'
          )}
          data-no-pull="true"
          className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 space-y-3 shadow-2xs"
        >
          {/* Panel Header + Live Firestore Completed Bookings KPIs */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-100">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-900">
                <Flame className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  {t(
                    'الخريطة الحرارية لمناطق الطلب السكني المرتفع — جميع محافظات مصر الـ 27',
                    'Residential High-Demand Heatmap — All 27 Egyptian Governorates'
                  )}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500">
                {t(
                  'تُحتسب الكثافة الحرارية حصرياً وبشكل لحظي من سجلات العقود المكتملة فعلياً في قاعدة البيانات.',
                  'Thermal intensity is computed strictly in real time from verified completed booking records in the database.'
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
              <div>
                <span className="text-slate-500">
                  {t('العقود المكتملة:', 'Completed Bookings:')}{' '}
                </span>
                <span className="font-mono tabular-nums font-bold text-slate-900">
                  {formatNumber(scopedDemandSignals.length)}
                </span>
              </div>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <div>
                <span className="text-slate-500">
                  {t('محافظات نشطة:', 'Active Governorates:')}{' '}
                </span>
                <span className="font-mono tabular-nums font-bold text-slate-900">
                  {formatNumber(activeDemandGovernoratesCount)} / {formatNumber(27)}
                </span>
              </div>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <div>
                <span className="text-slate-500">
                  {t('الأعلى طلباً:', 'Top Demand:')}{' '}
                </span>
                <span className="font-bold text-rose-700">
                  {governorateDemandRows[0]?.completedCount > 0
                    ? `${govLabel(governorateDemandRows[0].name)} (${formatNumber(
                        governorateDemandRows[0].completedCount
                      )})`
                    : t('بانتظار أول عقد مكتمل', 'Awaiting 1st completion')}
                </span>
              </div>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <div>
                <span className="text-slate-500">
                  {t('إجمالي التعاقدات المكتملة:', 'Settled Volume:')}{' '}
                </span>
                <span className="font-mono tabular-nums font-bold text-blue-700">
                  {formatNumber(totalScopedDemandVolumeEgp)} {t('ج.م', 'EGP')}
                </span>
              </div>
            </div>
          </div>

          {/* Sub-Sector Filter + Spread Radius + Map Pins Visibility + Nationwide Framing */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
              {(
                [
                  {
                    id: 'all_residential',
                    label: t('كل الوحدات السكنية', 'All Residential'),
                  },
                  {
                    id: 'family_apartment',
                    label: categoryLabel('family_apartment'),
                  },
                  {
                    id: 'whole_house',
                    label: categoryLabel('whole_house'),
                  },
                  {
                    id: 'student_housing',
                    label: categoryLabel('student_housing'),
                  },
                  {
                    id: 'hotel_room',
                    label: categoryLabel('hotel_room'),
                  },
                  {
                    id: 'all_sectors',
                    label: t('كل القطاعات (شامل المصانع)', 'All Sectors (+Industrial)'),
                  },
                ] as const
              ).map((tab) => {
                const active = heatmapScope === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setHeatmapScope(tab.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="inline-flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setHeatmapRadiusMode('focused')}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    heatmapRadiusMode === 'focused'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('نطاق أحياء دقيق', 'District Focus')}
                </button>
                <button
                  type="button"
                  onClick={() => setHeatmapRadiusMode('wide')}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    heatmapRadiusMode === 'wide'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('انتشار محافظات واسع', 'Wide Spread')}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowMapPinsInHeatmap((prev) => !prev)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                  showMapPinsInHeatmap
                    ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    : 'bg-slate-900 text-white border-slate-900'
                }`}
              >
                {showMapPinsInHeatmap ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>{t('إخفاء دبابيس الإعلانات', 'Hide Listing Pins')}</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <span>{t('إظهار دبابيس الإعلانات', 'Show Listing Pins')}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedGovernorate('all');
                  setActiveDestination(null);
                  flyToCamera(27.4, 30.9, 6);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <MapIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{t('عرض كل مصر (27 محافظة)', 'Frame All 27 Govs')}</span>
              </button>
            </div>
          </div>

          {/* Top Residential Districts Quick Jump */}
          {topDemandDistricts.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-xs text-slate-600 bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2">
              <span className="font-bold text-slate-800">
                {t('أعلى الأحياء السكنية طلباً:', 'Top High-Demand Districts:')}
              </span>
              {topDemandDistricts.map((dist, idx) => (
                <React.Fragment key={`${dist.governorate}_${dist.district}`}>
                  {idx > 0 && <span aria-hidden="true">·</span>}
                  <button
                    type="button"
                    onClick={() => flyToCamera(dist.lat, dist.lng, 13)}
                    className="hover:text-blue-700 font-medium transition-colors whitespace-nowrap"
                  >
                    <span>
                      {govLabel(dist.governorate)} — {dist.district}
                    </span>{' '}
                    <span className="font-mono tabular-nums font-bold text-rose-700">
                      ({formatNumber(dist.count)})
                    </span>
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Honest Zero-Completed-Bookings Notice (Strictly Zero Mock Data) */}
          {scopedDemandSignals.length === 0 && (
            <div className="bg-amber-50/80 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span>
                {t(
                  'لا توجد حجوزات سكنية بحالة «مكتمل» مسجلة حتى هذه اللحظة ضمن هذا التصنيف في قاعدة البيانات — ستتوهج بؤر الطلب تلقائياً فور تأكيد تسليم أي عقد.',
                  'No residential bookings with status "completed" are recorded yet for this scope in Firestore — thermal hotspots illuminate automatically as soon as a contract handover completes.'
                )}
              </span>
              <span className="font-mono tabular-nums text-[11px] text-amber-800 shrink-0">
                0 {t('عقد مكتمل', 'completed')}
              </span>
            </div>
          )}

          {/* All 27 Governorates Interactive Demand Ranking */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">
                {t(
                  'مؤشر الطلب السكني حسب المحافظة (اضغط على أي محافظة للانتقال إليها على الخريطة)',
                  'Residential Demand Index by Governorate (Click any governorate to fly on map)'
                )}
              </span>
              <button
                type="button"
                onClick={() => setShowAll27Governorates((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0"
              >
                <span>
                  {showAll27Governorates
                    ? t('عرض المحافظات الأعلى فقط (9)', 'Show Top 9 Governorates')
                    : t('عرض جميع المحافظات الـ 27', 'Show All 27 Governorates')}
                </span>
                {showAll27Governorates ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {visibleGovernorateRows.map((row, idx) => {
                const isSelectedGov = selectedGovernorate === row.name;
                const dotColorClass =
                  row.demandLevel === 'peak'
                    ? 'bg-rose-600'
                    : row.demandLevel === 'high'
                      ? 'bg-amber-500'
                      : row.demandLevel === 'moderate'
                        ? 'bg-teal-500'
                        : 'bg-slate-300';
                const barColorClass =
                  row.demandLevel === 'peak'
                    ? 'bg-rose-600'
                    : row.demandLevel === 'high'
                      ? 'bg-amber-500'
                      : row.demandLevel === 'moderate'
                        ? 'bg-teal-500'
                        : 'bg-slate-200';
                const levelText =
                  row.demandLevel === 'peak'
                    ? t('ذروة الطلب', 'Peak')
                    : row.demandLevel === 'high'
                      ? t('طلب مرتفع', 'High')
                      : row.demandLevel === 'moderate'
                        ? t('طلب نشط', 'Active')
                        : t('بدون عقود مكتملة', '0 completed');

                return (
                  <button
                    key={row.name}
                    type="button"
                    onClick={() => handleGovernorateSelect(row.name)}
                    className={`p-2 rounded-lg border text-start transition-colors space-y-1.5 ${
                      isSelectedGov
                        ? 'border-blue-600 bg-blue-50/40'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0 truncate">
                        <span className="font-mono tabular-nums text-[11px] text-slate-400 shrink-0">
                          #{formatNumber(idx + 1)}
                        </span>
                        <span
                          aria-hidden="true"
                          className={`w-2 h-2 rounded-full shrink-0 ${dotColorClass}`}
                        />
                        <span className="font-bold text-slate-900 truncate">
                          {govLabel(row.name)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] shrink-0">
                        <span className="text-slate-500">{levelText}</span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="font-mono tabular-nums font-bold text-slate-900">
                          {formatNumber(row.completedCount)}
                        </span>
                        {row.completedCount > 0 && (
                          <span className="font-mono tabular-nums text-slate-500">
                            ({formatNumber(row.sharePct)}%)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColorClass} ${getDemandBarWidthClass(
                          row.intensityRatio
                        )}`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* MAIN EXPLORER WORKSPACE: TIGHT COMPACT GRID + CLUSTERED GOOGLE MAP */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-2.5 items-start">
        {/* Interactive Map Panel */}
        {showMapPanel && (
          <div
            className={`${
              isZoomedOut ? 'lg:col-span-4' : 'lg:col-span-5'
            } lg:sticky lg:top-20 transition-all`}
          >
            <div
              data-map-canvas-inner="true"
              className="relative h-[205px] sm:h-[300px] lg:h-[580px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100"
            >
              {/* Mobile Top Pull-to-Refresh Strip Directly on the Map */}
              <div
                data-map-pull-zone="true"
                className="md:hidden absolute top-0 inset-x-0 z-20 h-7 flex items-center justify-center bg-gradient-to-b from-slate-950/35 to-transparent touch-pan-x select-none"
              >
                <button
                  type="button"
                  onClick={() => void executeImmediateRefresh()}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-white/90 hover:bg-white backdrop-blur-xs border border-slate-200/80 text-[10px] font-semibold text-slate-700 shadow-2xs whitespace-nowrap"
                >
                  <RefreshCw
                    className={`w-2.5 h-2.5 text-blue-700 ${
                      pullPhase === 'refreshing' ? 'animate-spin' : ''
                    }`}
                  />
                  <span>
                    {t('اسحب الخريطة للأسفل للتحديث', 'Pull down map to refresh')}
                  </span>
                </button>
              </div>

              <InteractiveLeafletMap
                apartments={filteredApartments}
                selectedPinId={selectedPinId}
                onSelectPin={(aptId) => {
                  setSelectedPinId(aptId);
                  setActiveClusterKey(null);
                }}
                onSelectApartment={onSelectApartment}
                cameraTarget={cameraTarget}
                heatmapEnabled={heatmapEnabled}
                heatmapPoints={heatmapPoints}
                lang={lang}
              />

              {/* Map Top Overlay: Quick Zoom + Heatmap + In-Map Advanced Filter Popover + Classification Strip */}
              <div className="absolute top-8 md:top-2.5 inset-x-2 z-10 flex flex-col gap-1.5 pointer-events-none">
                  <div className="flex items-center justify-between gap-1.5">
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      className="pointer-events-auto flex items-center gap-1 shrink-0"
                    >
                      {isZoomedOut ? (
                        <button
                          type="button"
                          onClick={() => flyToCamera(30.0444, 31.2357, 12)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/95 hover:bg-white border border-slate-200 shadow-xs text-[11px] font-semibold text-slate-800 whitespace-nowrap"
                        >
                          <ZoomIn className="w-3.5 h-3.5 text-blue-700" />
                          <span>{t('تكبير الأحياء', 'Zoom Neighborhoods')}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPinId(null);
                            flyToCamera(28.8, 31.0, 6);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/95 hover:bg-white border border-slate-200 shadow-xs text-[11px] font-semibold text-slate-800 whitespace-nowrap"
                        >
                          <ZoomOut className="w-3.5 h-3.5 text-blue-700" />
                          <span>{t('تصغير لعرض الشبكة', 'Zoom Out to Grid')}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setIsMapFilterPopoverOpen((prev) => !prev)}
                        aria-expanded={isMapFilterPopoverOpen}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border shadow-xs text-[11px] font-bold transition-colors whitespace-nowrap shrink-0 ${
                          isMapFilterPopoverOpen || advancedFilterActiveCount > 0
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-white/95 hover:bg-white text-slate-800 border-slate-200'
                        }`}
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('تصفية المرافق', 'Filters')}</span>
                        {advancedFilterActiveCount > 0 && (
                          <span className="font-mono tabular-nums">
                            ({formatNumber(advancedFilterActiveCount)})
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleToggleHeatmap}
                        aria-pressed={heatmapEnabled}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border shadow-xs text-[11px] font-bold transition-colors whitespace-nowrap shrink-0 ${
                          heatmapEnabled
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-white/95 hover:bg-white text-rose-700 border-slate-200'
                        }`}
                      >
                        <Flame
                          className={`w-3.5 h-3.5 shrink-0 ${
                            heatmapEnabled ? 'text-amber-200' : 'text-rose-600'
                          }`}
                        />
                        <span>{t('حرارية الطلب', 'Heatmap')}</span>
                      </button>
                    </div>

                    {/* Direct On-Map Classification Filter Strip (شقة عائلية · غرفة فندقية · مصنع · سكن طلاب) */}
                    <div
                      role="group"
                      aria-label={t(
                        'تصفية الخريطة حسب تصنيف الوحدة',
                        'Filter Map by Unit Classification'
                      )}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="pointer-events-auto flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full bg-white/95 backdrop-blur-xs border border-slate-200/90 rounded-lg p-0.5 shadow-xs"
                    >
                      {CATEGORY_TABS.map((cat) => {
                        const active = selectedCategory === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => handleCategorySelect(cat)}
                            className={`px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                              active
                                ? 'bg-blue-700 text-white'
                                : 'text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {cat === 'all' ? t('الكل', 'All') : categoryLabel(cat)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* On-Map Compact Quick Amenity & Verification Filter Popover */}
                  {isMapFilterPopoverOpen && (
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      className="pointer-events-auto bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-2.5 shadow-lg max-w-sm space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-100">
                        <span className="text-xs font-bold text-slate-900">
                          {t(
                            'تصفية السعر والتوثيق والمرافق على الخريطة',
                            'On-Map Price, Verification & Amenity Filters'
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsMapFilterPopoverOpen(false)}
                          aria-label={t('إغلاق', 'Close')}
                          className="p-0.5 text-slate-400 hover:text-slate-700"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {renderPriceRangeSlider(true)}

                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={verifiedOnly}
                          onClick={() => {
                            setVerifiedOnly((prev) => !prev);
                            setSelectedPinId(null);
                            setActiveClusterKey(null);
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors whitespace-nowrap ${
                            verifiedOnly
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          <ShieldCheck className="w-3 h-3 shrink-0" />
                          <span>{t('موثق فقط', 'Verified Only')}</span>
                        </button>

                        <button
                          type="button"
                          aria-pressed={requirePrivateGarage}
                          onClick={() => {
                            setRequirePrivateGarage((prev) => !prev);
                            setSelectedPinId(null);
                            setActiveClusterKey(null);
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                            requirePrivateGarage
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Car className="w-3 h-3 shrink-0" />
                          <span>{t('جراج خاص', 'Private Garage')}</span>
                        </button>

                        <button
                          type="button"
                          aria-pressed={requireGardenOrRoof}
                          onClick={() => {
                            setRequireGardenOrRoof((prev) => !prev);
                            setSelectedPinId(null);
                            setActiveClusterKey(null);
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                            requireGardenOrRoof
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Trees className="w-3 h-3 shrink-0" />
                          <span>{t('حديقة / روف', 'Garden / Roof')}</span>
                        </button>

                        <button
                          type="button"
                          aria-pressed={requireVirtualTour}
                          onClick={() => {
                            setRequireVirtualTour((prev) => !prev);
                            setSelectedPinId(null);
                            setActiveClusterKey(null);
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                            requireVirtualTour
                              ? 'bg-blue-700 text-white border-blue-700'
                              : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Compass className="w-3 h-3 shrink-0" />
                          <span>{t('جولة 360°', '360° Tour')}</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 text-[11px]">
                        <span className="font-mono tabular-nums font-bold text-blue-700">
                          {t(
                            `${formatNumber(filteredApartments.length)} وحدة مطابقة`,
                            `${formatNumber(filteredApartments.length)} matching units`
                          )}
                        </span>
                        {advancedFilterActiveCount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setVerifiedOnly(false);
                              setRequirePrivateGarage(false);
                              setRequireGardenOrRoof(false);
                              setRequireVirtualTour(false);
                              setRequireDailyBooking(false);
                              setMinBathrooms('all');
                              setMinAreaSqmInput('');
                            }}
                            className="font-semibold text-slate-600 hover:text-slate-900 underline"
                          >
                            {t('مسح فلاتر المرافق', 'Clear Amenity Filters')}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

              {/* Floating Thermal Intensity Scale Legend inside Map */}
              {heatmapEnabled &&
                !activeCluster &&
                !activePinApartment && (
                  <div
                    onPointerDown={(e) => e.stopPropagation()}
                    className="absolute bottom-2.5 start-2.5 z-10 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl px-2.5 py-2 shadow-xs space-y-1 max-w-[230px]"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-slate-800">
                      <span>{t('كثافة الطلب السكني', 'Residential Demand')}</span>
                      <span className="font-mono tabular-nums text-rose-700">
                        {formatNumber(scopedDemandSignals.length)}{' '}
                        {t('عقد', 'contracts')}
                      </span>
                    </div>
                    <div
                      aria-hidden="true"
                      className="h-2 w-full rounded-full bg-gradient-to-r from-teal-500 via-sky-500 via-amber-400 to-rose-600"
                    />
                    <div className="flex items-center justify-between text-[9px] font-semibold text-slate-500">
                      <span>{t('منخفض', 'Low')}</span>
                      <span>{t('متوسط', 'Medium')}</span>
                      <span>{t('ذروة الطلب', 'Peak')}</span>
                    </div>
                  </div>
                )}

              {/* Selected Cluster Compact Mini-Grid Drawer inside Map */}
              {activeCluster && (
                <div className="absolute bottom-2 inset-x-2 z-20 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-2 shadow-lg space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      {activeCluster.label} ·{' '}
                      <span className="font-mono tabular-nums text-blue-700">
                        {formatNumber(activeCluster.items.length)}{' '}
                        {t('وحدات', 'units')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          flyToCamera(activeCluster.lat, activeCluster.lng, 12);
                          setActiveClusterKey(null);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-700 text-white text-[11px] font-semibold whitespace-nowrap"
                      >
                        <ZoomIn className="w-3 h-3" />
                        <span>{t('تكبير المنطقة', 'Zoom Area')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveClusterKey(null)}
                        aria-label={t('إغلاق', 'Close')}
                        className="p-1 text-slate-400 hover:text-slate-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div
                    data-internal-scroll="true"
                    className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto"
                  >
                    {activeCluster.items.map((item) => {
                      const p = getDisplayedUnitPrice(item);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onSelectApartment(item)}
                          className="flex items-center gap-1.5 p-1 rounded-lg border border-slate-200 bg-white hover:border-blue-500 text-start min-w-0"
                        >
                          <div className="w-9 h-9 rounded-md overflow-hidden shrink-0 bg-slate-100">
                            <ApartmentImage
                              imageKey={item.imageKey}
                              alt={item.title}
                              className="w-full h-full"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-bold text-slate-900 truncate">
                              {item.title}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {categorySingularLabel(item.category)} ·{' '}
                              <span className="font-mono tabular-nums font-semibold text-blue-700">
                                {formatNumber(p.amountEgp)} {p.pinSuffix}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Selected Individual Micro-Pin Compact Preview Card */}
              {activePinApartment && !activeCluster && (
                <div className="absolute bottom-2 inset-x-2 z-20 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-2 shadow-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-slate-100">
                      <ApartmentImage
                        imageKey={activePinApartment.imageKey}
                        alt={activePinApartment.title}
                        className="w-full h-full"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectApartment(activePinApartment)}
                          className="text-xs font-bold text-slate-900 hover:text-blue-700 text-start truncate"
                        >
                          {activePinApartment.title}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedPinId(null)}
                          aria-label={t('إغلاق', 'Close')}
                          className="text-slate-400 hover:text-slate-700 shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        <span className="font-semibold text-blue-700">
                          {categorySingularLabel(activePinApartment.category)}
                        </span>
                        {' · '}
                        {govLabel(activePinApartment.governorate)} ·{' '}
                        {activePinApartment.district}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="font-mono tabular-nums text-xs font-bold text-blue-700">
                          {formatNumber(
                            getDisplayedUnitPrice(activePinApartment).amountEgp
                          )}{' '}
                          <span className="text-[10px] font-normal text-slate-500">
                            {getDisplayedUnitPrice(activePinApartment).pinSuffix}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => onSelectApartment(activePinApartment)}
                          className="px-2 py-0.5 bg-slate-900 text-white text-[11px] font-semibold rounded-md whitespace-nowrap"
                        >
                          {t('التفاصيل', 'Details')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PROPERTY UNITS TIGHT COMPACT GRID VIEWPORT */}
        <div
          className={
            isFullWidthGrid
              ? 'lg:col-span-12'
              : isZoomedOut
                ? 'lg:col-span-8'
                : 'lg:col-span-7'
          }
        >
          {displayedApartments.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 text-center space-y-2.5">
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                {t(
                  'لا توجد وحدات مطابقة في مساحة العرض أو الفلاتر الحالية',
                  'No Verified Units Match Your Active Viewport or Filters'
                )}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {t(
                  'جرّب توسيع نطاق السعر أو إلغاء حصر الخريطة لإظهار جميع الوحدات الموثقة في الشبكة.',
                  'Try widening the price range or resetting the map viewport filter to view all verified units.'
                )}
              </p>
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-700 text-white text-xs font-semibold rounded-lg whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t('إعادة ضبط الفلاتر', 'Reset All Filters')}</span>
              </button>
            </div>
          ) : (
            <div className={gridContainerClasses}>
              {displayedApartments.map((apt) => {
                const priceInfo = getDisplayedUnitPrice(apt);
                const rep = computeLandlordReputation(reviews, apt);
                const isFav = favoriteApartmentIds.has(apt.id);
                const isAlertOn = priceAlertApartmentIds.has(apt.id);
                const isBusy = togglingFavoriteId === apt.id;
                const isHighlighted = selectedPinId === apt.id;
                const isUltraDenseMobile = isMobileViewport && mobileCols === 3;
                const distanceKm = activeDestination
                  ? calculateDistanceKm(
                      activeDestination.lat,
                      activeDestination.lng,
                      apt.lat,
                      apt.lng
                    )
                  : null;

                return (
                  <article
                    key={apt.id}
                    className={`bg-white border rounded-2xl overflow-hidden flex flex-col justify-between transition-all duration-300 min-w-0 group hover:-translate-y-0.5 ${
                      isHighlighted
                        ? 'border-blue-600 ring-2 ring-blue-600/20 shadow-md'
                        : 'border-slate-200/90 hover:border-slate-300 hover:shadow-md'
                    }`}
                  >
                    {/* Modern Image Container with Frosted Floating Controls */}
                    <div className="relative aspect-[16/10] bg-slate-100 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => onSelectApartment(apt)}
                        className="w-full h-full block focus:outline-none"
                      >
                        <ApartmentImage
                          imageKey={apt.imageKey}
                          alt={apt.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      </button>

                      {/* Floating Verification & Category Badges (Start-Top) */}
                      <div className="absolute top-2.5 start-2.5 flex items-center gap-1.5">
                        {apt.verificationStatus === 'verified' && (
                          <span
                            title={t('وحدة موثقة الملكية والهوية رسمياً', 'Officially Verified Property')}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-600/95 text-white text-[10px] font-bold backdrop-blur-xs shadow-xs"
                          >
                            <ShieldCheck className="w-3 h-3" />
                            <span>{t('موثق', 'Verified')}</span>
                          </span>
                        )}
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-900/80 text-white text-[10px] font-medium backdrop-blur-xs">
                          {categorySingularLabel(apt.category)}
                        </span>
                      </div>

                      {/* Floating Favorite & Price Alert (End-Top) */}
                      <div className="absolute top-2.5 end-2.5 flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={(e) => {
                            e.stopPropagation();
                            onTogglePriceAlert(apt);
                          }}
                          aria-label={t('تنبيه انخفاض السعر', 'Price Drop Alert')}
                          title={t('تنبيه انخفاض السعر', 'Price Drop Alert')}
                          className={`w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-md border shadow-xs transition-colors ${
                            isAlertOn
                              ? 'bg-amber-500 text-white border-amber-400'
                              : 'bg-white/90 hover:bg-white border-white/80 text-slate-700'
                          }`}
                        >
                          {isAlertOn ? (
                            <BellRing className="w-3.5 h-3.5" />
                          ) : (
                            <Bell className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(apt);
                          }}
                          aria-label={t('حفظ في المفضلة', 'Save to Favorites')}
                          className={`w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-md border shadow-xs transition-colors ${
                            isFav
                              ? 'bg-rose-500 text-white border-rose-400'
                              : 'bg-white/90 hover:bg-white border-white/80 text-slate-700'
                          }`}
                        >
                          <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-white' : ''}`} />
                        </button>
                      </div>

                      {/* 360° Tour Badge (Start-Bottom) */}
                      {apt.hasVirtualTour && (
                        <button
                          type="button"
                          onClick={() => onSelectApartment(apt)}
                          className="absolute bottom-2.5 start-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-950/80 text-white text-[10px] font-mono font-bold backdrop-blur-xs hover:bg-slate-900 transition-colors"
                        >
                          <Compass className="w-3 h-3 text-blue-400" />
                          <span>360° {t('جولة', 'Tour')}</span>
                        </button>
                      )}
                    </div>

                    {/* Card Content with Generous White Space */}
                    <div className="p-3.5 sm:p-4 flex flex-col justify-between flex-1 gap-2.5">
                      <div className="space-y-1.5 min-w-0">
                        {/* Price & Rating Header */}
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="flex items-baseline gap-1 truncate">
                            <span className="text-base sm:text-lg font-extrabold font-mono text-slate-900">
                              {formatNumber(priceInfo.amountEgp)}
                            </span>
                            <span className="text-xs font-semibold text-slate-500">
                              ج.م {priceInfo.pinSuffix}
                            </span>
                          </div>

                          {rep.reviewCount > 0 && (
                            <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-200 shrink-0">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              <span>{rep.combinedAverageRating.toFixed(1)}</span>
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <h3 className="font-bold text-xs sm:text-sm text-slate-900 group-hover:text-blue-700 transition-colors line-clamp-1 leading-snug">
                          <button
                            type="button"
                            onClick={() => onSelectApartment(apt)}
                            className="text-start w-full hover:underline"
                          >
                            {apt.title}
                          </button>
                        </h3>

                        {/* Location */}
                        <div className="flex items-center gap-1 text-xs text-slate-500 truncate">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{govLabel(apt.governorate)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{apt.district}</span>
                          {distanceKm !== null && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono text-slate-600">{distanceKm.toFixed(1)} {t('كم', 'km')}</span>
                            </>
                          )}
                        </div>

                        {/* Clean Spec Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-600">
                          <span className="px-2 py-0.5 bg-slate-100 rounded-md font-mono font-semibold">
                            {formatNumber(apt.bedrooms)} {t('غرف', 'Rooms')}
                          </span>
                          <span className="px-2 py-0.5 bg-slate-100 rounded-md font-mono font-semibold">
                            {formatNumber(apt.areaSqm)} {t('م²', 'm²')}
                          </span>
                          <span className="px-2 py-0.5 bg-slate-100 rounded-md">
                            {furnishingLabel(apt.furnishing)}
                          </span>
                          {apt.houseHasPrivateGarage && (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md font-semibold">
                              {t('جراج', 'Garage')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons with comfortable click area */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 mt-1">
                        <button
                          type="button"
                          onClick={() => onSelectApartment(apt)}
                          className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors text-center"
                        >
                          {t('التفاصيل', 'Details')}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRentApartment(apt)}
                          className="py-1.5 px-3 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl transition-all text-center shadow-xs"
                        >
                          {t('احجز الآن', 'Rent Now')}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

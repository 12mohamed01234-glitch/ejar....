import React, { useState, useMemo, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import {
  BarChart3,
  Percent,
  Building2,
  CheckCircle2,
  TrendingUp,
  Users,
  FileSearch,
  RefreshCw,
  ShieldCheck,
  XCircle,
  Trash2,
  Ban,
  Edit3,
  EyeOff,
  Eye,
  Megaphone,
  Power,
  RotateCcw,
  MessageSquareWarning,
  LogIn,
  Search,
  Download,
  Activity,
  ArrowDownUp,
  Clock,
  Calendar,
  SlidersHorizontal,
  ShieldAlert,
  Lock,
  Unlock,
  MessageSquareLock,
  FileText,
} from 'lucide-react';
import {
  db,
  logFirestoreDiagnostic,
  OperationType,
  PLATFORM_ADMIN_EMAIL,
} from '../lib/firebase';
import {
  AdminActivityActionType,
  AdminActivityLogRecord,
  AdminActivitySeverity,
  AdminActivityTargetType,
  ApartmentRecord,
  BannedUserRecord,
  BillingMode,
  BookingRecord,
  ChatThreadRecord,
  CURRENCY_RATES_TO_EGP,
  EGYPT_GOVERNORATES,
  FurnishingType,
  LegalDossierRecord,
  ListingCategory,
  PlatformSettingsRecord,
  RentalRequestRecord,
  ReviewRecord,
  SHOWCASE_APARTMENTS,
  TenantKycPrivateRecord,
  TenantVerificationRecord,
  VALIDATION_LIMITS,
  VerificationStatus,
  buildActivityLogId,
  buildBookingDemandSignalWritePayload,
  buildLiveCurrencyRates,
  computeTextSha256,
  convertFromEgp,
  getCategoryCommissionPct,
  normalizeNumericInput,
  snapRentToMultipleOf10,
  snapToMultipleOf10,
} from '../lib/validation';
import { useI18n } from '../lib/i18n';
import {
  deleteSupabaseApartment,
  updateSupabaseApartmentVerificationStatus,
  updateSupabaseApartmentDetails,
  createSupabaseApartment,
  saveSupabasePlatformSettings,
  broadcastSupabasePlatformSettings,
  updateSupabaseKycStatus,
} from '../lib/supabase';

interface PlatformAdminConsoleProps {
  currentUser: User | null;
  platformSettings: PlatformSettingsRecord;
  allApartments: ApartmentRecord[];
  allBookings: BookingRecord[];
  allRentalRequests: RentalRequestRecord[];
  allReviews: ReviewRecord[];
  allTenantVerifications: TenantVerificationRecord[];
  allBannedUsers: BannedUserRecord[];
  allAdminActivityLogs: AdminActivityLogRecord[];
  allChatThreads?: ChatThreadRecord[];
  onRequestSignIn: () => Promise<void>;
  onSwitchAccount: () => Promise<void>;
}

type AdminSection =
  | 'dashboard'
  | 'rates_and_settings'
  | 'listings_control'
  | 'users_and_bans'
  | 'moderation_and_contracts'
  | 'admin_activity_logs';

type ActivityFilterGroup = 'all' | 'commissions' | 'bans' | 'listings' | 'moderation';
type ActivitySortOrder = 'newest' | 'oldest';

type DashboardTimePreset =
  | 'current_month'
  | 'first_half_month'
  | 'second_half_month'
  | 'last_7_days'
  | 'last_14_days'
  | 'previous_month'
  | 'last_3_months'
  | 'all_time'
  | 'custom';

type DashboardBucketGranularity = 'daily' | 'weekly' | 'monthly';
type DashboardMetricMode = 'count' | 'gross_egp' | 'commission_egp';
type DashboardChartStyle = 'stacked_bar' | 'grouped_bar' | 'area';
type DashboardRecordScope = 'confirmed_bookings' | 'bookings_and_requests';
type GovernorateOccupancyChartMode = 'rate_pct' | 'units_stack';
type GovernorateOccupancyScope = 'active_supply' | 'all_27';
type GovernorateOccupancySort = 'highest_rate' | 'most_units' | 'geo_order';

interface GovernorateOccupancyRow {
  governorateAr: string;
  govDisplay: string;
  geoIndex: number;
  verifiedUnitsCount: number;
  occupiedUnitsCount: number;
  availableUnitsCount: number;
  occupancyRatePct: number;
  bookings30dCount: number;
  volume30dEgp: number;
  fillHex: string;
}

interface DashboardCategoryMeta {
  key: ListingCategory;
  shortAr: string;
  shortEn: string;
  fullAr: string;
  fullEn: string;
  colorHex: string;
  softFillHex: string;
  swatchClass: string;
  activeBtnClass: string;
  textClass: string;
}

const DASHBOARD_CATEGORIES: DashboardCategoryMeta[] = [
  {
    key: 'family_apartment',
    shortAr: 'شقق',
    shortEn: 'Apartments',
    fullAr: 'شقق عائلية',
    fullEn: 'Family Apartments',
    colorHex: '#1D4ED8',
    softFillHex: '#DBEAFE',
    swatchClass: 'bg-blue-700',
    activeBtnClass: 'border-blue-700 bg-blue-50/80 text-blue-950',
    textClass: 'text-blue-700',
  },
  {
    key: 'whole_house',
    shortAr: 'منازل',
    shortEn: 'Houses',
    fullAr: 'منازل كاملة',
    fullEn: 'Whole Houses',
    colorHex: '#0F766E',
    softFillHex: '#CCFBF1',
    swatchClass: 'bg-teal-700',
    activeBtnClass: 'border-teal-700 bg-teal-50/80 text-teal-950',
    textClass: 'text-teal-700',
  },
  {
    key: 'hotel_room',
    shortAr: 'فنادق',
    shortEn: 'Hotels',
    fullAr: 'غرف فندقية',
    fullEn: 'Hotel Rooms',
    colorHex: '#D97706',
    softFillHex: '#FEF3C7',
    swatchClass: 'bg-amber-600',
    activeBtnClass: 'border-amber-600 bg-amber-50/80 text-amber-950',
    textClass: 'text-amber-700',
  },
  {
    key: 'industrial_factory',
    shortAr: 'مصانع',
    shortEn: 'Factories',
    fullAr: 'مصانع ومنشآت',
    fullEn: 'Industrial Factories',
    colorHex: '#334155',
    softFillHex: '#E2E8F0',
    swatchClass: 'bg-slate-700',
    activeBtnClass: 'border-slate-700 bg-slate-100 text-slate-950',
    textClass: 'text-slate-700',
  },
  {
    key: 'student_housing',
    shortAr: 'طلاب',
    shortEn: 'Students',
    fullAr: 'سكن طلاب',
    fullEn: 'Student Housing',
    colorHex: '#059669',
    softFillHex: '#D1FAE5',
    swatchClass: 'bg-emerald-600',
    activeBtnClass: 'border-emerald-600 bg-emerald-50/80 text-emerald-950',
    textClass: 'text-emerald-700',
  },
];

const ALL_DASHBOARD_CATEGORY_KEYS: ListingCategory[] = DASHBOARD_CATEGORIES.map((c) => c.key);

interface TimelineBucketRow {
  bucketKey: string;
  label: string;
  fullLabel: string;
  family_apartment: number;
  whole_house: number;
  hotel_room: number;
  industrial_factory: number;
  student_housing: number;
  totalMetric: number;
  totalCount: number;
  totalGrossEgp: number;
  totalCommissionEgp: number;
}

function toLocalDateInputValue(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseLocalDateInputMs(value: string, endOfDay: boolean): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59, 999)
    : new Date(y, m - 1, d, 0, 0, 0, 0);
  const ms = dt.getTime();
  return Number.isNaN(ms) ? null : ms;
}

interface ListingEditDraft {
  id: string;
  title: string;
  category: ListingCategory;
  billingMode: BillingMode;
  furnishing: FurnishingType;
  monthlyRentText: string;
  dailyRateText: string;
  studentBedsText: string;
  studentBedPriceText: string;
  houseApartmentsCountText: string;
  houseFloorsCountText: string;
  verificationStatus: VerificationStatus;
}

export const PlatformAdminConsole: React.FC<PlatformAdminConsoleProps> = ({
  currentUser,
  platformSettings,
  allApartments,
  allBookings,
  allRentalRequests,
  allReviews,
  allTenantVerifications,
  allBannedUsers,
  allAdminActivityLogs,
  allChatThreads = [],
  onRequestSignIn,
  onSwitchAccount,
}) => {
  const {
    lang,
    t,
    formatNumber,
    govLabel,
    categoryLabel,
    furnishingLabel,
    tenantCategoryLabel,
    formatTimeAgo,
  } = useI18n();

  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);

  // Rates, Per-Category Commissions, FX & Global Switches Form State
  const [commissionText, setCommissionText] = useState<string>(
    String(platformSettings.commissionRatePct)
  );
  const [familyCommissionText, setFamilyCommissionText] = useState<string>(
    String(getCategoryCommissionPct('family_apartment', platformSettings))
  );
  const [wholeHouseCommissionText, setWholeHouseCommissionText] = useState<string>(
    String(getCategoryCommissionPct('whole_house', platformSettings))
  );
  const [hotelCommissionText, setHotelCommissionText] = useState<string>(
    String(getCategoryCommissionPct('hotel_room', platformSettings))
  );
  const [factoryCommissionText, setFactoryCommissionText] = useState<string>(
    String(getCategoryCommissionPct('industrial_factory', platformSettings))
  );
  const [studentCommissionText, setStudentCommissionText] = useState<string>(
    String(getCategoryCommissionPct('student_housing', platformSettings))
  );
  const [escrowFeeText, setEscrowFeeText] = useState<string>(
    String(platformSettings.escrowProtectionFeePct)
  );
  const [discountText, setDiscountText] = useState<string>(
    String(platformSettings.tenantDiscountPct)
  );
  const [usdRateText, setUsdRateText] = useState<string>(String(platformSettings.usdRateEgp));
  const [sarRateText, setSarRateText] = useState<string>(String(platformSettings.sarRateEgp));
  const [eurRateText, setEurRateText] = useState<string>(String(platformSettings.eurRateEgp));
  const [aedRateText, setAedRateText] = useState<string>(String(platformSettings.aedRateEgp));
  const [announcementInput, setAnnouncementInput] = useState<string>(
    platformSettings.announcementText
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [syncingShowcase, setSyncingShowcase] = useState(false);

  // Listings Control State
  const [listingSearch, setListingSearch] = useState('');
  const [listingFilter, setListingFilter] = useState<'all' | VerificationStatus | ListingCategory>(
    'all'
  );
  const [editDraft, setEditDraft] = useState<ListingEditDraft | null>(null);
  const [savingListingId, setSavingListingId] = useState<string | null>(null);
  const [confirmDeleteAptId, setConfirmDeleteAptId] = useState<string | null>(null);
  const [inspectedDossier, setInspectedDossier] = useState<LegalDossierRecord | null>(null);

  // Users, Bans & KYC State
  const [userSearch, setUserSearch] = useState('');
  const [manualBanUid, setManualBanUid] = useState('');
  const [manualBanName, setManualBanName] = useState('');
  const [manualBanReason, setManualBanReason] = useState(
    'مخالفة شروط الاستخدام أو نشر إعلانات مضللة ومزعجة'
  );
  const [quickBanTarget, setQuickBanTarget] = useState<{
    userId: string;
    displayName: string;
  } | null>(null);
  const [quickBanReason, setQuickBanReason] = useState(
    'حساب مزعج أو مخالف لسياسات منصة إيجار'
  );
  const [submittingBan, setSubmittingBan] = useState(false);
  const [inspectedKyc, setInspectedKyc] = useState<TenantKycPrivateRecord | null>(null);
  const [kycReviewNotes, setKycReviewNotes] = useState<Record<string, string>>({});

  // Moderation Confirmation State
  const [confirmDeleteReviewId, setConfirmDeleteReviewId] = useState<string | null>(null);
  const [confirmDeleteBookingId, setConfirmDeleteBookingId] = useState<string | null>(null);
  const [confirmDeleteRequestId, setConfirmDeleteRequestId] = useState<string | null>(null);

  // Activity Log Filter & Chronological Sort State
  const [activitySearch, setActivitySearch] = useState('');
  const [activityFilter, setActivityFilter] = useState<ActivityFilterGroup>('all');
  const [activitySortOrder, setActivitySortOrder] = useState<ActivitySortOrder>('newest');

  // Interactive Recharts Dashboard Temporal & Category Filters State
  const [dashboardTimePreset, setDashboardTimePreset] =
    useState<DashboardTimePreset>('current_month');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const now = new Date();
    return toLocalDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    const now = new Date();
    return toLocalDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  });
  const [dashboardGranularity, setDashboardGranularity] =
    useState<DashboardBucketGranularity>('daily');
  const [dashboardMetric, setDashboardMetric] = useState<DashboardMetricMode>('count');
  const [dashboardChartStyle, setDashboardChartStyle] =
    useState<DashboardChartStyle>('stacked_bar');
  const [dashboardRecordScope, setDashboardRecordScope] =
    useState<DashboardRecordScope>('confirmed_bookings');
  const [selectedCategories, setSelectedCategories] = useState<ListingCategory[]>(
    ALL_DASHBOARD_CATEGORY_KEYS
  );
  const [focusedCategoryKey, setFocusedCategoryKey] = useState<ListingCategory | null>(null);
  const [occupancyChartMode, setOccupancyChartMode] =
    useState<GovernorateOccupancyChartMode>('rate_pct');
  const [occupancyGovScope, setOccupancyGovScope] =
    useState<GovernorateOccupancyScope>('active_supply');
  const [occupancySortMode, setOccupancySortMode] =
    useState<GovernorateOccupancySort>('highest_rate');

  const isAdmin = Boolean(currentUser?.email === PLATFORM_ADMIN_EMAIL);

  // Keep form fields synchronized with live Firestore updates
  useEffect(() => {
    setCommissionText(String(platformSettings.commissionRatePct));
    setFamilyCommissionText(String(getCategoryCommissionPct('family_apartment', platformSettings)));
    setWholeHouseCommissionText(String(getCategoryCommissionPct('whole_house', platformSettings)));
    setHotelCommissionText(String(getCategoryCommissionPct('hotel_room', platformSettings)));
    setFactoryCommissionText(
      String(getCategoryCommissionPct('industrial_factory', platformSettings))
    );
    setStudentCommissionText(String(getCategoryCommissionPct('student_housing', platformSettings)));
    setEscrowFeeText(String(platformSettings.escrowProtectionFeePct));
    setDiscountText(String(platformSettings.tenantDiscountPct));
    setUsdRateText(String(platformSettings.usdRateEgp));
    setSarRateText(String(platformSettings.sarRateEgp));
    setEurRateText(String(platformSettings.eurRateEgp));
    setAedRateText(String(platformSettings.aedRateEgp));
    setAnnouncementInput(platformSettings.announcementText);
  }, [
    platformSettings.commissionRatePct,
    platformSettings.familyApartmentCommissionPct,
    platformSettings.wholeHouseCommissionPct,
    platformSettings.hotelRoomCommissionPct,
    platformSettings.industrialFactoryCommissionPct,
    platformSettings.studentHousingCommissionPct,
    platformSettings.escrowProtectionFeePct,
    platformSettings.tenantDiscountPct,
    platformSettings.usdRateEgp,
    platformSettings.sarRateEgp,
    platformSettings.eurRateEgp,
    platformSettings.aedRateEgp,
    platformSettings.announcementText,
  ]);

  const notifySuccess = (msg: string) => {
    setErrorFeedback(null);
    setStatusFeedback(msg);
  };

  const bannedMap = useMemo(() => {
    const map = new Map<string, BannedUserRecord>();
    allBannedUsers.forEach((b) => map.set(b.userId, b));
    return map;
  }, [allBannedUsers]);

  const removedShowcaseSet = useMemo(
    () => new Set(platformSettings.removedShowcaseIds),
    [platformSettings.removedShowcaseIds]
  );

  // Unified catalog of ALL listings (Firestore + active unseeded Showcase units)
  const unifiedListings = useMemo(() => {
    const dbById = new Map<string, ApartmentRecord>();
    allApartments.forEach((a) =>
      dbById.set(a.id, {
        ...a,
        commissionRatePct: getCategoryCommissionPct(a.category, platformSettings),
        isPersistedInDb: true,
      })
    );

    const bookedIds = new Set(allBookings.map((b) => b.apartmentId));
    const list: ApartmentRecord[] = Array.from(dbById.values());

    SHOWCASE_APARTMENTS.forEach((s) => {
      if (!dbById.has(s.id) && !bookedIds.has(s.id) && !removedShowcaseSet.has(s.id)) {
        list.push({
          ...s,
          commissionRatePct: getCategoryCommissionPct(s.category, platformSettings),
          isPersistedInDb: false,
        });
      }
    });

    return list;
  }, [allApartments, allBookings, removedShowcaseSet, platformSettings]);

  const filteredListings = useMemo(() => {
    const q = listingSearch.trim().toLowerCase();
    return unifiedListings.filter((apt) => {
      if (
        listingFilter === 'verified' ||
        listingFilter === 'pending_review' ||
        listingFilter === 'rejected'
      ) {
        if (apt.verificationStatus !== listingFilter) return false;
      } else if (
        listingFilter === 'family_apartment' ||
        listingFilter === 'whole_house' ||
        listingFilter === 'hotel_room' ||
        listingFilter === 'industrial_factory' ||
        listingFilter === 'student_housing'
      ) {
        if (apt.category !== listingFilter) return false;
      }

      if (!q) return true;
      return (
        apt.title.toLowerCase().includes(q) ||
        apt.district.toLowerCase().includes(q) ||
        apt.governorate.toLowerCase().includes(q) ||
        apt.ownerDisplayName.toLowerCase().includes(q) ||
        apt.id.toLowerCase().includes(q) ||
        apt.ownerId.toLowerCase().includes(q)
      );
    });
  }, [unifiedListings, listingSearch, listingFilter]);

  const removedShowcaseUnits = useMemo(
    () => SHOWCASE_APARTMENTS.filter((s) => removedShowcaseSet.has(s.id)),
    [removedShowcaseSet]
  );

  // Unified Directory of All Platform Users across Collections
  const unifiedUsers = useMemo(() => {
    interface AggregatedUser {
      userId: string;
      displayName: string;
      roles: Set<string>;
      listingsCount: number;
      bookingsCount: number;
      requestsCount: number;
      reviewsCount: number;
      kycRecord: TenantVerificationRecord | null;
    }

    const map = new Map<string, AggregatedUser>();

    const ensureUser = (uid: string, name: string, roleLabel: string) => {
      if (!uid || uid === 'showcase_owner') return null;
      let entry = map.get(uid);
      if (!entry) {
        entry = {
          userId: uid,
          displayName: name || 'مستخدم مسجل',
          roles: new Set<string>(),
          listingsCount: 0,
          bookingsCount: 0,
          requestsCount: 0,
          reviewsCount: 0,
          kycRecord: null,
        };
        map.set(uid, entry);
      } else if (name && entry.displayName === 'مستخدم مسجل') {
        entry.displayName = name;
      }
      if (roleLabel) entry.roles.add(roleLabel);
      return entry;
    };

    allApartments.forEach((a) => {
      const u = ensureUser(a.ownerId, a.ownerDisplayName, t('مالك عقار', 'Landlord'));
      if (u) u.listingsCount += 1;
    });

    allBookings.forEach((b) => {
      const tUser = ensureUser(b.tenantId, b.tenantDisplayName, t('مستأجر', 'Tenant'));
      if (tUser) tUser.bookingsCount += 1;
      ensureUser(
        b.landlordId,
        b.landlordDisplayName || 'مالك عقار',
        t('مالك عقار', 'Landlord')
      );
    });

    allRentalRequests.forEach((r) => {
      const tUser = ensureUser(r.tenantId, r.tenantDisplayName, t('طالب إيجار', 'Applicant'));
      if (tUser) tUser.requestsCount += 1;
      ensureUser(r.landlordId, r.landlordDisplayName, t('مالك عقار', 'Landlord'));
    });

    allReviews.forEach((rev) => {
      if (!rev.isPersistedInDb) return;
      const rUser = ensureUser(rev.tenantId, rev.tenantDisplayName, t('مقيم موثق', 'Reviewer'));
      if (rUser) rUser.reviewsCount += 1;
    });

    allTenantVerifications.forEach((tv) => {
      const kUser = ensureUser(tv.userId, tv.tenantDisplayName, t('طالب توثيق هوية', 'KYC User'));
      if (kUser) kUser.kycRecord = tv;
    });

    allBannedUsers.forEach((bu) => {
      ensureUser(bu.userId, bu.displayName, t('محظور', 'Banned'));
    });

    const q = userSearch.trim().toLowerCase();
    return Array.from(map.values()).filter((u) => {
      if (!q) return true;
      return (
        u.displayName.toLowerCase().includes(q) || u.userId.toLowerCase().includes(q)
      );
    });
  }, [
    allApartments,
    allBookings,
    allRentalRequests,
    allReviews,
    allTenantVerifications,
    allBannedUsers,
    userSearch,
    t,
  ]);

  // Executive & Interactive Recharts Analytics Calculations
  const analytics = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const daysInCurMonth = new Date(curYear, curMonth + 1, 0).getDate();

    const verifiedUnitsCount = unifiedListings.filter(
      (a) => a.verificationStatus === 'verified' && !bannedMap.has(a.ownerId)
    ).length;
    const pendingUnitsCount = allApartments.filter(
      (a) => a.verificationStatus === 'pending_review'
    ).length;

    // Accurate category lookup across Firestore + Showcase catalog
    const apartmentCategoryById = new Map<string, ListingCategory>();
    SHOWCASE_APARTMENTS.forEach((s) => apartmentCategoryById.set(s.id, s.category));
    allApartments.forEach((a) => apartmentCategoryById.set(a.id, a.category));

    const resolveCategory = (
      explicitCat: ListingCategory | undefined,
      apartmentId: string
    ): ListingCategory => {
      if (explicitCat && explicitCat !== 'family_apartment') return explicitCat;
      const mapped = apartmentCategoryById.get(apartmentId);
      if (mapped) return mapped;
      return explicitCat || 'family_apartment';
    };

    interface NormalizedRentalEvent {
      id: string;
      apartmentId: string;
      title: string;
      governorate: string;
      category: ListingCategory;
      createdAtMs: number;
      totalRentEgp: number;
      platformCommissionEgp: number;
      status: 'completed' | 'escrow_paid' | 'pending_request';
      isRequest: boolean;
    }

    const bookingEvents: NormalizedRentalEvent[] = allBookings.map((b) => ({
      id: b.id,
      apartmentId: b.apartmentId,
      title: b.apartmentTitle,
      governorate: b.governorate,
      category: resolveCategory(b.category, b.apartmentId),
      createdAtMs: b.createdAtMs,
      totalRentEgp: b.totalRentEgp,
      platformCommissionEgp: b.platformCommissionEgp,
      status: b.status === 'completed' ? 'completed' : 'escrow_paid',
      isRequest: false,
    }));

    const activePendingRequests = allRentalRequests.filter(
      (r) => r.status === 'pending_approval' || r.status === 'awaiting_payment'
    );

    const requestEvents: NormalizedRentalEvent[] = activePendingRequests.map((r) => ({
      id: r.id,
      apartmentId: r.apartmentId,
      title: r.apartmentTitle,
      governorate: r.governorate,
      category: resolveCategory(r.category, r.apartmentId),
      createdAtMs: r.createdAtMs,
      totalRentEgp: r.totalRentEgp,
      platformCommissionEgp: r.platformCommissionEgp,
      status: 'pending_request',
      isRequest: true,
    }));

    const sourceEvents: NormalizedRentalEvent[] =
      dashboardRecordScope === 'bookings_and_requests'
        ? [...bookingEvents, ...requestEvents]
        : bookingEvents;

    // Resolve temporal filter window [rangeStartMs, rangeEndMs]
    let rangeStartMs = new Date(curYear, curMonth, 1, 0, 0, 0, 0).getTime();
    let rangeEndMs = new Date(curYear, curMonth, daysInCurMonth, 23, 59, 59, 999).getTime();

    const monthFormatter = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
      month: 'long',
      year: 'numeric',
    });
    const shortDateFormatter = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const monthName = monthFormatter.format(now);
    let activePeriodLabel = `${t('الشهر الحالي', 'Current Month')} (${monthName})`;

    if (dashboardTimePreset === 'current_month') {
      rangeStartMs = new Date(curYear, curMonth, 1, 0, 0, 0, 0).getTime();
      rangeEndMs = new Date(curYear, curMonth, daysInCurMonth, 23, 59, 59, 999).getTime();
      activePeriodLabel = `${t('الشهر الحالي بالكامل', 'Full Current Month')} (${monthName})`;
    } else if (dashboardTimePreset === 'first_half_month') {
      rangeStartMs = new Date(curYear, curMonth, 1, 0, 0, 0, 0).getTime();
      rangeEndMs = new Date(curYear, curMonth, 15, 23, 59, 59, 999).getTime();
      activePeriodLabel = `${t('النصف الأول من الشهر (1–15)', 'First Half of Month (1–15)')} · ${monthName}`;
    } else if (dashboardTimePreset === 'second_half_month') {
      rangeStartMs = new Date(curYear, curMonth, 16, 0, 0, 0, 0).getTime();
      rangeEndMs = new Date(curYear, curMonth, daysInCurMonth, 23, 59, 59, 999).getTime();
      activePeriodLabel = `${t(
        `النصف الثاني من الشهر (16–${daysInCurMonth})`,
        `Second Half of Month (16–${daysInCurMonth})`
      )} · ${monthName}`;
    } else if (dashboardTimePreset === 'last_7_days') {
      rangeStartMs = new Date(curYear, curMonth, now.getDate() - 6, 0, 0, 0, 0).getTime();
      rangeEndMs = new Date(curYear, curMonth, now.getDate(), 23, 59, 59, 999).getTime();
      activePeriodLabel = t('آخر 7 أيام', 'Last 7 Days');
    } else if (dashboardTimePreset === 'last_14_days') {
      rangeStartMs = new Date(curYear, curMonth, now.getDate() - 13, 0, 0, 0, 0).getTime();
      rangeEndMs = new Date(curYear, curMonth, now.getDate(), 23, 59, 59, 999).getTime();
      activePeriodLabel = t('آخر 14 يوماً', 'Last 14 Days');
    } else if (dashboardTimePreset === 'previous_month') {
      const prevStart = new Date(curYear, curMonth - 1, 1, 0, 0, 0, 0);
      const prevEnd = new Date(curYear, curMonth, 0, 23, 59, 59, 999);
      rangeStartMs = prevStart.getTime();
      rangeEndMs = prevEnd.getTime();
      activePeriodLabel = `${t('الشهر السابق', 'Previous Month')} (${monthFormatter.format(prevStart)})`;
    } else if (dashboardTimePreset === 'last_3_months') {
      const threeStart = new Date(curYear, curMonth - 2, 1, 0, 0, 0, 0);
      rangeStartMs = threeStart.getTime();
      rangeEndMs = new Date(curYear, curMonth, daysInCurMonth, 23, 59, 59, 999).getTime();
      activePeriodLabel = `${t('آخر 3 أشهر', 'Last 3 Months')} (${monthFormatter.format(
        threeStart
      )} – ${monthName})`;
    } else if (dashboardTimePreset === 'all_time') {
      const earliestMs =
        sourceEvents.length > 0
          ? Math.min(...sourceEvents.map((ev) => ev.createdAtMs))
          : new Date(curYear, curMonth - 2, 1, 0, 0, 0, 0).getTime();
      const earliestDate = new Date(earliestMs);
      rangeStartMs = new Date(
        earliestDate.getFullYear(),
        earliestDate.getMonth(),
        1,
        0,
        0,
        0,
        0
      ).getTime();
      rangeEndMs = Math.max(
        new Date(curYear, curMonth, daysInCurMonth, 23, 59, 59, 999).getTime(),
        ...sourceEvents.map((ev) => ev.createdAtMs)
      );
      activePeriodLabel = t('جميع الفترات المسجلة', 'All Recorded Periods');
    } else if (dashboardTimePreset === 'custom') {
      const parsedStart = parseLocalDateInputMs(customStartDate, false);
      const parsedEnd = parseLocalDateInputMs(customEndDate, true);
      if (parsedStart !== null && parsedEnd !== null) {
        if (parsedStart <= parsedEnd) {
          rangeStartMs = parsedStart;
          rangeEndMs = parsedEnd;
        } else {
          rangeStartMs = parsedEnd - 86_399_999;
          rangeEndMs = parsedStart + 86_399_999;
        }
      }
      activePeriodLabel = `${shortDateFormatter.format(
        new Date(rangeStartMs)
      )} – ${shortDateFormatter.format(new Date(rangeEndMs))}`;
    }

    const effectiveStartInput = toLocalDateInputValue(new Date(rangeStartMs));
    const effectiveEndInput = toLocalDateInputValue(new Date(rangeEndMs));

    const visibleCategorySet = new Set<ListingCategory>(
      selectedCategories.length > 0 ? selectedCategories : ALL_DASHBOARD_CATEGORY_KEYS
    );

    // Filter events within [rangeStartMs, rangeEndMs]
    const allCategoriesEventsInWindow = sourceEvents.filter(
      (ev) => ev.createdAtMs >= rangeStartMs && ev.createdAtMs <= rangeEndMs
    );
    const filteredEvents = allCategoriesEventsInWindow.filter((ev) =>
      visibleCategorySet.has(ev.category)
    );

    // Previous equivalent duration window for period-over-period comparison
    const windowDurationMs = Math.max(86_400_000, rangeEndMs - rangeStartMs + 1);
    const prevWindowStartMs = rangeStartMs - windowDurationMs;
    const prevWindowEndMs = rangeStartMs - 1;
    const prevFilteredEvents = sourceEvents.filter(
      (ev) =>
        ev.createdAtMs >= prevWindowStartMs &&
        ev.createdAtMs <= prevWindowEndMs &&
        visibleCategorySet.has(ev.category)
    );

    const getEventMetricValue = (ev: NormalizedRentalEvent): number => {
      if (dashboardMetric === 'gross_egp') return ev.totalRentEgp;
      if (dashboardMetric === 'commission_egp') return ev.platformCommissionEgp;
      return 1;
    };

    // Build timeline buckets across [rangeStartMs, rangeEndMs]
    interface BucketSpec {
      key: string;
      label: string;
      fullLabel: string;
      startMs: number;
      endMs: number;
    }

    const bucketSpecs: BucketSpec[] = [];
    const startObj = new Date(rangeStartMs);
    const endObj = new Date(rangeEndMs);
    const sameCalendarMonth =
      startObj.getFullYear() === endObj.getFullYear() &&
      startObj.getMonth() === endObj.getMonth();
    const totalSpanDays = Math.max(1, Math.round((rangeEndMs - rangeStartMs) / 86_400_000));

    const dayTickFmt = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
      day: 'numeric',
      ...(sameCalendarMonth ? {} : { month: 'short' }),
    });
    const fullDayFmt = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const shortSpanFmt = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
      day: 'numeric',
      month: 'short',
    });

    if (dashboardGranularity === 'monthly') {
      let cursor = new Date(startObj.getFullYear(), startObj.getMonth(), 1, 0, 0, 0, 0);
      const shortMonthFmt = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
        month: 'short',
        year: '2-digit',
      });
      while (cursor.getTime() <= rangeEndMs && bucketSpecs.length < 36) {
        const y = cursor.getFullYear();
        const m = cursor.getMonth();
        const mStart = Math.max(rangeStartMs, new Date(y, m, 1, 0, 0, 0, 0).getTime());
        const mEnd = Math.min(
          rangeEndMs,
          new Date(y, m + 1, 0, 23, 59, 59, 999).getTime()
        );
        bucketSpecs.push({
          key: `${y}-${String(m + 1).padStart(2, '0')}`,
          label: shortMonthFmt.format(cursor),
          fullLabel: monthFormatter.format(cursor),
          startMs: mStart,
          endMs: mEnd,
        });
        cursor = new Date(y, m + 1, 1, 0, 0, 0, 0);
      }
    } else if (dashboardGranularity === 'weekly') {
      if (
        dashboardTimePreset === 'current_month' ||
        dashboardTimePreset === 'previous_month'
      ) {
        const y = startObj.getFullYear();
        const m = startObj.getMonth();
        const maxDay = new Date(y, m + 1, 0).getDate();
        const weekRanges: Array<[number, number]> = [
          [1, 7],
          [8, 14],
          [15, 21],
          [22, 28],
        ];
        if (maxDay > 28) {
          weekRanges.push([29, maxDay]);
        }
        weekRanges.forEach(([d1, d2], idx) => {
          const wStart = new Date(y, m, d1, 0, 0, 0, 0).getTime();
          const wEnd = new Date(y, m, d2, 23, 59, 59, 999).getTime();
          bucketSpecs.push({
            key: `wk_${idx + 1}`,
            label:
              lang === 'ar'
                ? `الأسبوع ${idx + 1} (${d1}–${d2})`
                : `Wk ${idx + 1} (${d1}–${d2})`,
            fullLabel:
              lang === 'ar'
                ? `الأسبوع ${idx + 1}: من ${d1} إلى ${d2} ${monthFormatter.format(startObj)}`
                : `Week ${idx + 1}: ${d1}–${d2} ${monthFormatter.format(startObj)}`,
            startMs: wStart,
            endMs: wEnd,
          });
        });
      } else {
        let cursorMs = rangeStartMs;
        let wkIdx = 1;
        while (cursorMs <= rangeEndMs && bucketSpecs.length < 52) {
          const cStart = new Date(cursorMs);
          const cEndDate = new Date(
            cStart.getFullYear(),
            cStart.getMonth(),
            cStart.getDate() + 6,
            23,
            59,
            59,
            999
          );
          const bEnd = Math.min(rangeEndMs, cEndDate.getTime());
          bucketSpecs.push({
            key: `rwk_${wkIdx}`,
            label: `${shortSpanFmt.format(cStart)}`,
            fullLabel: `${shortSpanFmt.format(cStart)} – ${shortSpanFmt.format(new Date(bEnd))}`,
            startMs: cursorMs,
            endMs: bEnd,
          });
          cursorMs = bEnd + 1;
          wkIdx += 1;
        }
      }
    } else {
      // Daily granularity (groups into multi-day step only if user selects > 95 days)
      const stepDays = totalSpanDays > 95 ? Math.ceil(totalSpanDays / 45) : 1;
      let cursor = new Date(
        startObj.getFullYear(),
        startObj.getMonth(),
        startObj.getDate(),
        0,
        0,
        0,
        0
      );
      while (cursor.getTime() <= rangeEndMs && bucketSpecs.length < 100) {
        const bStart = Math.max(rangeStartMs, cursor.getTime());
        const stepEndDate = new Date(
          cursor.getFullYear(),
          cursor.getMonth(),
          cursor.getDate() + stepDays - 1,
          23,
          59,
          59,
          999
        );
        const bEnd = Math.min(rangeEndMs, stepEndDate.getTime());
        bucketSpecs.push({
          key: toLocalDateInputValue(cursor),
          label: dayTickFmt.format(cursor),
          fullLabel:
            stepDays === 1
              ? fullDayFmt.format(cursor)
              : `${shortSpanFmt.format(cursor)} – ${shortSpanFmt.format(new Date(bEnd))}`,
          startMs: bStart,
          endMs: bEnd,
        });
        cursor = new Date(
          cursor.getFullYear(),
          cursor.getMonth(),
          cursor.getDate() + stepDays,
          0,
          0,
          0,
          0
        );
      }
    }

    const timelineData: TimelineBucketRow[] = bucketSpecs.map((spec) => ({
      bucketKey: spec.key,
      label: spec.label,
      fullLabel: spec.fullLabel,
      family_apartment: 0,
      whole_house: 0,
      hotel_room: 0,
      industrial_factory: 0,
      student_housing: 0,
      totalMetric: 0,
      totalCount: 0,
      totalGrossEgp: 0,
      totalCommissionEgp: 0,
    }));

    filteredEvents.forEach((ev) => {
      const idx = bucketSpecs.findIndex(
        (spec) => ev.createdAtMs >= spec.startMs && ev.createdAtMs <= spec.endMs
      );
      if (idx !== -1) {
        const val = getEventMetricValue(ev);
        timelineData[idx][ev.category] += val;
        timelineData[idx].totalMetric += val;
        timelineData[idx].totalCount += 1;
        timelineData[idx].totalGrossEgp += ev.totalRentEgp;
        timelineData[idx].totalCommissionEgp += ev.platformCommissionEgp;
      }
    });

    // Per-Category Breakdown across all 5 categories
    const totalVisibleMetricSum = filteredEvents.reduce(
      (sum, ev) => sum + getEventMetricValue(ev),
      0
    );

    const categoryBreakdown = DASHBOARD_CATEGORIES.map((meta) => {
      const cat = meta.key;
      const isSelected = visibleCategorySet.has(cat);
      const catWindowEvents = allCategoriesEventsInWindow.filter((ev) => ev.category === cat);
      const catBookingsOnly = catWindowEvents.filter((ev) => !ev.isRequest);
      const catGrossEgp = catWindowEvents.reduce((s, ev) => s + ev.totalRentEgp, 0);
      const catCommissionEgp = catWindowEvents.reduce((s, ev) => s + ev.platformCommissionEgp, 0);
      const catMetricVal = isSelected
        ? catWindowEvents.reduce((s, ev) => s + getEventMetricValue(ev), 0)
        : 0;
      const sharePct =
        isSelected && totalVisibleMetricSum > 0
          ? Number(((catMetricVal / totalVisibleMetricSum) * 100).toFixed(1))
          : 0;

      const liveListedCount = unifiedListings.filter(
        (a) =>
          a.category === cat &&
          a.verificationStatus === 'verified' &&
          !bannedMap.has(a.ownerId)
      ).length;

      const periodPendingRequestsCount = activePendingRequests.filter(
        (r) =>
          resolveCategory(r.category, r.apartmentId) === cat &&
          r.createdAtMs >= rangeStartMs &&
          r.createdAtMs <= rangeEndMs
      ).length;

      return {
        category: cat,
        meta,
        shortLabel: lang === 'ar' ? meta.shortAr : meta.shortEn,
        fullLabel: lang === 'ar' ? meta.fullAr : meta.fullEn,
        isSelected,
        commissionPct: getCategoryCommissionPct(cat, platformSettings),
        liveListedCount,
        rawPeriodCount: catWindowEvents.length,
        periodBookingsCount: catBookingsOnly.length,
        periodCompletedCount: catBookingsOnly.filter((ev) => ev.status === 'completed').length,
        periodEscrowCount: catBookingsOnly.filter((ev) => ev.status === 'escrow_paid').length,
        periodPendingRequestsCount,
        periodGrossEgp: catGrossEgp,
        periodCommissionEgp: catCommissionEgp,
        metricValue: catMetricVal,
        sharePct,
      };
    });

    const categoryPieData = categoryBreakdown
      .filter((item) => item.isSelected && item.metricValue > 0)
      .map((item) => ({
        category: item.category,
        name: item.fullLabel,
        shortName: item.shortLabel,
        value: item.metricValue,
        count: item.rawPeriodCount,
        grossEgp: item.periodGrossEgp,
        commissionEgp: item.periodCommissionEgp,
        sharePct: item.sharePct,
        colorHex: item.meta.colorHex,
        swatchClass: item.meta.swatchClass,
      }));

    const sectorComparisonData = categoryBreakdown
      .filter((item) => item.isSelected)
      .map((item) => ({
        category: item.category,
        sector: item.shortLabel,
        fullSector: item.fullLabel,
        listed: item.liveListedCount,
        periodRentals: item.rawPeriodCount,
        pendingRequests: item.periodPendingRequestsCount,
        grossEgp: item.periodGrossEgp,
        commissionPct: item.commissionPct,
      }));

    const periodTotalCount = filteredEvents.length;
    const periodCompletedCount = filteredEvents.filter((ev) => ev.status === 'completed').length;
    const periodEscrowCount = filteredEvents.filter((ev) => ev.status === 'escrow_paid').length;
    const periodRequestsInScopeCount = filteredEvents.filter((ev) => ev.isRequest).length;
    const periodGrossEgp = filteredEvents.reduce((s, ev) => s + ev.totalRentEgp, 0);
    const periodCommissionEgp = filteredEvents.reduce((s, ev) => s + ev.platformCommissionEgp, 0);
    const periodEffectiveMarginPct =
      periodGrossEgp > 0
        ? Number(((periodCommissionEgp / periodGrossEgp) * 100).toFixed(1))
        : platformSettings.commissionRatePct;

    const prevPeriodCount = prevFilteredEvents.length;
    const deltaCount = periodTotalCount - prevPeriodCount;

    const sortedActiveCategories = [...categoryBreakdown]
      .filter((c) => c.isSelected)
      .sort((a, b) => b.metricValue - a.metricValue || b.liveListedCount - a.liveListedCount);
    const topCategory = sortedActiveCategories[0] || categoryBreakdown[0];

    return {
      totalListedCount: unifiedListings.length,
      verifiedUnitsCount,
      pendingUnitsCount,
      totalAllTimeBookingsCount: bookingEvents.length,
      totalActivePendingRequestsCount: requestEvents.length,
      monthName,
      activePeriodLabel,
      effectiveStartInput,
      effectiveEndInput,
      periodTotalCount,
      periodCompletedCount,
      periodEscrowCount,
      periodRequestsInScopeCount,
      periodGrossEgp,
      periodCommissionEgp,
      periodEffectiveMarginPct,
      deltaCount,
      prevPeriodCount,
      timelineData,
      categoryBreakdown,
      categoryPieData,
      sectorComparisonData,
      topCategory,
      filteredEvents,
    };
  }, [
    unifiedListings,
    allApartments,
    allBookings,
    allRentalRequests,
    bannedMap,
    platformSettings,
    dashboardTimePreset,
    customStartDate,
    customEndDate,
    dashboardGranularity,
    dashboardMetric,
    dashboardRecordScope,
    selectedCategories,
    lang,
    t,
  ]);

  // Verified Units Occupancy Across Egypt Governorates (Last 30 Days)
  const governorateOccupancyAnalytics = useMemo(() => {
    const nowMs = Date.now();
    const thirtyDaysAgoMs = nowMs - 30 * 86_400_000;

    const visibleCategorySet = new Set<ListingCategory>(
      selectedCategories.length > 0 ? selectedCategories : ALL_DASHBOARD_CATEGORY_KEYS
    );

    const categoryLookup = new Map<string, ListingCategory>();
    SHOWCASE_APARTMENTS.forEach((s) => categoryLookup.set(s.id, s.category));
    allApartments.forEach((a) => categoryLookup.set(a.id, a.category));

    const resolveUnitCategory = (
      explicitCat: ListingCategory | undefined,
      apartmentId: string
    ): ListingCategory => {
      if (explicitCat && explicitCat !== 'family_apartment') return explicitCat;
      return categoryLookup.get(apartmentId) || explicitCat || 'family_apartment';
    };

    const unverifiedAptIds = new Set<string>();
    allApartments.forEach((a) => {
      if (a.verificationStatus !== 'verified' || bannedMap.has(a.ownerId)) {
        unverifiedAptIds.add(a.id);
      }
    });

    interface TrackedVerifiedUnit {
      id: string;
      governorate: string;
      category: ListingCategory;
      isOccupied30d: boolean;
    }

    const verifiedUnitMap = new Map<string, TrackedVerifiedUnit>();

    // 1. Active showcase units (if not removed and not overridden as unverified in Firestore)
    SHOWCASE_APARTMENTS.forEach((s) => {
      if (removedShowcaseSet.has(s.id) || unverifiedAptIds.has(s.id)) return;
      if (!visibleCategorySet.has(s.category)) return;
      verifiedUnitMap.set(s.id, {
        id: s.id,
        governorate: s.governorate,
        category: s.category,
        isOccupied30d: s.availabilityStatus === 'rented',
      });
    });

    // 2. Persisted Firestore verified units
    allApartments.forEach((a) => {
      if (a.verificationStatus !== 'verified' || bannedMap.has(a.ownerId)) return;
      if (!visibleCategorySet.has(a.category)) {
        verifiedUnitMap.delete(a.id);
        return;
      }
      verifiedUnitMap.set(a.id, {
        id: a.id,
        governorate: a.governorate,
        category: a.category,
        isOccupied30d: a.availabilityStatus === 'rented',
      });
    });

    // 3. Bookings within or overlapping the last 30 days (including rented units deleted upon checkout)
    const bookingsByGov = new Map<string, { count: number; volumeEgp: number }>();

    allBookings.forEach((b) => {
      if (unverifiedAptIds.has(b.apartmentId)) return;
      const resolvedCat = resolveUnitCategory(b.category, b.apartmentId);
      if (!visibleCategorySet.has(resolvedCat)) return;

      const existingUnit = verifiedUnitMap.get(b.apartmentId);
      const govName = existingUnit?.governorate || b.governorate;

      if (!existingUnit) {
        verifiedUnitMap.set(b.apartmentId, {
          id: b.apartmentId,
          governorate: govName,
          category: resolvedCat,
          isOccupied30d: false,
        });
      }

      const leaseDurationMs = Math.max(1, b.leaseMonths || 1) * 30 * 86_400_000;
      const leaseEndMs = b.createdAtMs + leaseDurationMs;
      const isOccupiedIn30d =
        b.createdAtMs <= nowMs &&
        (b.createdAtMs >= thirtyDaysAgoMs || leaseEndMs >= thirtyDaysAgoMs);

      if (isOccupiedIn30d) {
        const target = verifiedUnitMap.get(b.apartmentId);
        if (target) target.isOccupied30d = true;

        const prevGovStats = bookingsByGov.get(govName) || { count: 0, volumeEgp: 0 };
        prevGovStats.count += 1;
        prevGovStats.volumeEgp += b.totalRentEgp || 0;
        bookingsByGov.set(govName, prevGovStats);
      }
    });

    // 4. Aggregate across all 27 Egyptian Governorates (preserving geo order)
    const geoOrderIndex = new Map<string, number>();
    EGYPT_GOVERNORATES.forEach((g, idx) => geoOrderIndex.set(g.name, idx));

    const unitCountsByGov = new Map<string, { verified: number; occupied: number }>();
    verifiedUnitMap.forEach((unit) => {
      const cur = unitCountsByGov.get(unit.governorate) || { verified: 0, occupied: 0 };
      cur.verified += 1;
      if (unit.isOccupied30d) cur.occupied += 1;
      unitCountsByGov.set(unit.governorate, cur);
    });

    const allGovNames = Array.from(
      new Set([...EGYPT_GOVERNORATES.map((g) => g.name), ...unitCountsByGov.keys()])
    );

    const getRateFillHex = (ratePct: number): string => {
      if (ratePct >= 60) return '#059669';
      if (ratePct >= 25) return '#1D4ED8';
      if (ratePct > 0) return '#D97706';
      return '#CBD5E1';
    };

    const allRows: GovernorateOccupancyRow[] = allGovNames.map((govName, idx) => {
      const counts = unitCountsByGov.get(govName) || { verified: 0, occupied: 0 };
      const bStats = bookingsByGov.get(govName) || { count: 0, volumeEgp: 0 };
      const availableUnitsCount = Math.max(0, counts.verified - counts.occupied);
      const occupancyRatePct =
        counts.verified > 0
          ? Math.min(100, Number(((counts.occupied / counts.verified) * 100).toFixed(1)))
          : 0;

      return {
        governorateAr: govName,
        govDisplay: govLabel(govName),
        geoIndex: geoOrderIndex.get(govName) ?? 100 + idx,
        verifiedUnitsCount: counts.verified,
        occupiedUnitsCount: counts.occupied,
        availableUnitsCount,
        occupancyRatePct,
        bookings30dCount: bStats.count,
        volume30dEgp: bStats.volumeEgp,
        fillHex: getRateFillHex(occupancyRatePct),
      };
    });

    const totalVerifiedNational = allRows.reduce((s, r) => s + r.verifiedUnitsCount, 0);
    const totalOccupiedNational = allRows.reduce((s, r) => s + r.occupiedUnitsCount, 0);
    const totalBookings30d = allRows.reduce((s, r) => s + r.bookings30dCount, 0);
    const totalVolume30dEgp = allRows.reduce((s, r) => s + r.volume30dEgp, 0);
    const nationalOccupancyRatePct =
      totalVerifiedNational > 0
        ? Math.min(100, Number(((totalOccupiedNational / totalVerifiedNational) * 100).toFixed(1)))
        : 0;

    const activeSupplyRows = allRows.filter(
      (r) => r.verifiedUnitsCount > 0 || r.bookings30dCount > 0
    );
    const coveredGovernoratesCount = activeSupplyRows.length;
    const occupiedGovernoratesCount = allRows.filter((r) => r.occupiedUnitsCount > 0).length;

    const topOccupancyGov =
      [...activeSupplyRows].sort(
        (a, b) =>
          b.occupancyRatePct - a.occupancyRatePct ||
          b.occupiedUnitsCount - a.occupiedUnitsCount ||
          b.verifiedUnitsCount - a.verifiedUnitsCount
      )[0] || null;

    const baseRows = occupancyGovScope === 'all_27' ? allRows : activeSupplyRows;
    const visibleRows = [...baseRows].sort((a, b) => {
      if (occupancySortMode === 'most_units') {
        return (
          b.verifiedUnitsCount - a.verifiedUnitsCount ||
          b.occupiedUnitsCount - a.occupiedUnitsCount ||
          a.geoIndex - b.geoIndex
        );
      }
      if (occupancySortMode === 'geo_order') {
        return a.geoIndex - b.geoIndex;
      }
      return (
        b.occupancyRatePct - a.occupancyRatePct ||
        b.occupiedUnitsCount - a.occupiedUnitsCount ||
        b.verifiedUnitsCount - a.verifiedUnitsCount ||
        a.geoIndex - b.geoIndex
      );
    });

    return {
      allRows,
      visibleRows,
      totalVerifiedNational,
      totalOccupiedNational,
      totalAvailableNational: Math.max(0, totalVerifiedNational - totalOccupiedNational),
      nationalOccupancyRatePct,
      totalBookings30d,
      totalVolume30dEgp,
      coveredGovernoratesCount,
      occupiedGovernoratesCount,
      topOccupancyGov,
    };
  }, [
    allApartments,
    allBookings,
    bannedMap,
    removedShowcaseSet,
    selectedCategories,
    occupancyGovScope,
    occupancySortMode,
    govLabel,
  ]);

  // Chronologically Sorted Activity Logs & KPI Counters (from allAdminActivityLogs)
  const chronologicalActivityLogs = useMemo(
    () => [...allAdminActivityLogs].sort((a, b) => b.createdAtMs - a.createdAtMs),
    [allAdminActivityLogs]
  );

  const persistedReviews = useMemo(
    () => allReviews.filter((r) => r.isPersistedInDb),
    [allReviews]
  );

  const activityMetrics = useMemo(() => {
    let commissionsCount = 0;
    let bansCount = 0;
    let listingsCount = 0;
    let removalsOnlyCount = 0;
    chronologicalActivityLogs.forEach((log) => {
      if (log.actionType === 'commission_change' || log.actionType === 'settings_change') {
        commissionsCount += 1;
      } else if (log.actionType === 'user_ban' || log.actionType === 'user_unban') {
        bansCount += 1;
      } else if (
        log.actionType === 'listing_removed' ||
        log.actionType === 'listing_status' ||
        log.actionType === 'listing_edited'
      ) {
        listingsCount += 1;
        if (log.actionType === 'listing_removed') {
          removalsOnlyCount += 1;
        }
      }
    });
    return {
      totalCount: chronologicalActivityLogs.length,
      commissionsCount,
      bansCount,
      listingsCount,
      removalsOnlyCount,
    };
  }, [chronologicalActivityLogs]);

  const filteredActivityLogs = useMemo(() => {
    const q = activitySearch.trim().toLowerCase();
    const matched = chronologicalActivityLogs.filter((log) => {
      if (activityFilter === 'commissions') {
        if (log.actionType !== 'commission_change' && log.actionType !== 'settings_change') {
          return false;
        }
      } else if (activityFilter === 'bans') {
        if (log.actionType !== 'user_ban' && log.actionType !== 'user_unban') {
          return false;
        }
      } else if (activityFilter === 'listings') {
        if (
          log.actionType !== 'listing_removed' &&
          log.actionType !== 'listing_status' &&
          log.actionType !== 'listing_edited'
        ) {
          return false;
        }
      } else if (activityFilter === 'moderation') {
        if (log.actionType !== 'moderation_action') {
          return false;
        }
      }

      if (!q) return true;
      return (
        log.targetLabel.toLowerCase().includes(q) ||
        log.targetId.toLowerCase().includes(q) ||
        log.summaryAr.toLowerCase().includes(q) ||
        log.summaryEn.toLowerCase().includes(q) ||
        log.previousValue.toLowerCase().includes(q) ||
        log.newValue.toLowerCase().includes(q) ||
        log.actorDisplayName.toLowerCase().includes(q)
      );
    });

    return matched.sort((a, b) =>
      activitySortOrder === 'newest'
        ? b.createdAtMs - a.createdAtMs
        : a.createdAtMs - b.createdAtMs
    );
  }, [chronologicalActivityLogs, activityFilter, activitySearch, activitySortOrder]);

  const groupedActivityLogsByDate = useMemo(() => {
    const groups: Array<{
      dateKey: string;
      dateLabel: string;
      entries: AdminActivityLogRecord[];
    }> = [];
    const indexByKey = new Map<string, number>();
    const dayFormatter = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    filteredActivityLogs.forEach((log) => {
      const d = new Date(log.createdAtMs);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
      const existingIdx = indexByKey.get(dateKey);
      if (existingIdx !== undefined) {
        groups[existingIdx].entries.push(log);
      } else {
        indexByKey.set(dateKey, groups.length);
        groups.push({
          dateKey,
          dateLabel: dayFormatter.format(d),
          entries: [log],
        });
      }
    });

    return groups;
  }, [filteredActivityLogs, lang]);

  if (!currentUser || !isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-14">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-blue-700" />
            </div>
            <div>
              <div className="text-xs font-semibold text-blue-700">
                {t('بوابة المالك والإدارة العليا للمنصة', 'Site Owner Executive Governance')}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">
                {t(
                  'لوحة تحكم صاحب الموقع — صلاحيات كاملة فورية',
                  'Site Owner Full Control Center'
                )}
              </h1>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {t(
              'من هذه اللوحة يتحكم صاحب الموقع بشكل لحظي في جميع نسب العمولة المستقلة لكل تصنيف عقاري والخصومات وأسعار العملات، وحذف أو تعديل أي إعلان غير مناسب، وحظر أي مستخدم مزعج مع سجل نشاط وشفافية كامل.',
              'Control independent per-category commission rates, discounts, live FX rates, ad edits/deletions, user bans, and immutable audit logs.'
            )}
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5 text-xs">
            <div className="text-slate-500">
              {t('البريد المعتمد لصاحب الموقع:', 'Authorized Site Owner Account:')}
            </div>
            <div className="font-mono font-bold text-slate-900 break-all">
              {PLATFORM_ADMIN_EMAIL}
            </div>
            {currentUser && (
              <div className="pt-2 text-amber-800">
                {t('الحساب المسجل حالياً:', 'Currently signed in as:')}{' '}
                <span className="font-mono font-semibold">{currentUser.email}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!currentUser ? (
              <button
                type="button"
                onClick={() => void onRequestSignIn()}
                className="inline-flex items-center gap-2 px-5 py-3 bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-bold rounded-xl transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>
                  {t(
                    'تسجيل دخول صاحب الموقع بحساب جوجل',
                    'Sign In as Site Owner with Google'
                  )}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onSwitchAccount()}
                className="inline-flex items-center gap-2 px-5 py-3 bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-bold rounded-xl transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>
                  {t(
                    'تبديل الحساب لتسجيل دخول مالك الموقع',
                    'Switch Account to Site Owner'
                  )}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Immutable Audit Trail Writer (/adminActivityLogs/{logId})
  const logAdminActivity = async (entry: {
    actionType: AdminActivityActionType;
    severity: AdminActivitySeverity;
    targetType: AdminActivityTargetType;
    targetId: string;
    targetLabel: string;
    summaryAr: string;
    summaryEn: string;
    previousValue?: string;
    newValue?: string;
  }) => {
    const logId = buildActivityLogId('act');
    const safeTargetId =
      (entry.targetId || 'config').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'config';
    const rawTargetLabel = (entry.targetLabel || 'سجل المنصة').trim().slice(0, 160);
    const safeTargetLabel = rawTargetLabel.length >= 2 ? rawTargetLabel : 'سجل المنصة';
    const rawSummaryAr = (entry.summaryAr || 'تم تسجيل إجراء إداري').trim().slice(0, 400);
    const safeSummaryAr = rawSummaryAr.length >= 4 ? rawSummaryAr : 'تم تسجيل إجراء إداري';
    const rawSummaryEn = (entry.summaryEn || 'Administrative action recorded')
      .trim()
      .slice(0, 400);
    const safeSummaryEn =
      rawSummaryEn.length >= 4 ? rawSummaryEn : 'Administrative action recorded';
    const rawActorName = (
      currentUser.displayName ||
      currentUser.email?.split('@')[0] ||
      'مالك المنصة'
    )
      .trim()
      .slice(0, 80);
    const safeActorName = rawActorName.length >= 2 ? rawActorName : 'مالك المنصة';

    try {
      await setDoc(doc(db, 'adminActivityLogs', logId), {
        actionType: entry.actionType,
        severity: entry.severity,
        targetType: entry.targetType,
        targetId: safeTargetId,
        targetLabel: safeTargetLabel,
        summaryAr: safeSummaryAr,
        summaryEn: safeSummaryEn,
        previousValue: (entry.previousValue || '').trim().slice(0, 240),
        newValue: (entry.newValue || '').trim().slice(0, 240),
        actorUid: currentUser.uid,
        actorDisplayName: safeActorName,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.CREATE, `adminActivityLogs/${logId}`);
    }
  };

  const clampCommissionInt = (val: number | undefined, fallback: number): number =>
    Math.max(
      VALIDATION_LIMITS.COMMISSION_MIN,
      Math.min(VALIDATION_LIMITS.COMMISSION_MAX, Math.round(val ?? fallback))
    );

  // Persist /platformSettings/config with strict schema compliance & per-category rates
  const writePlatformConfig = async (
    overrides: Partial<PlatformSettingsRecord>,
    successMsg: string,
    auditEntry?: {
      actionType: AdminActivityActionType;
      severity: AdminActivitySeverity;
      targetType: AdminActivityTargetType;
      targetId: string;
      targetLabel: string;
      summaryAr: string;
      summaryEn: string;
      previousValue?: string;
      newValue?: string;
    }
  ) => {
    setSavingSettings(true);
    setErrorFeedback(null);

    const nextCommission = clampCommissionInt(
      overrides.commissionRatePct,
      platformSettings.commissionRatePct
    );
    const nextFamilyCommission = clampCommissionInt(
      overrides.familyApartmentCommissionPct,
      getCategoryCommissionPct('family_apartment', platformSettings)
    );
    const nextWholeHouseCommission = clampCommissionInt(
      overrides.wholeHouseCommissionPct,
      getCategoryCommissionPct('whole_house', platformSettings)
    );
    const nextHotelCommission = clampCommissionInt(
      overrides.hotelRoomCommissionPct,
      getCategoryCommissionPct('hotel_room', platformSettings)
    );
    const nextFactoryCommission = clampCommissionInt(
      overrides.industrialFactoryCommissionPct,
      getCategoryCommissionPct('industrial_factory', platformSettings)
    );
    const nextStudentCommission = clampCommissionInt(
      overrides.studentHousingCommissionPct,
      getCategoryCommissionPct('student_housing', platformSettings)
    );

    const nextEscrowFee = Math.max(
      0,
      Math.min(
        25,
        Number(
          (overrides.escrowProtectionFeePct ?? platformSettings.escrowProtectionFeePct).toFixed(2)
        )
      )
    );
    const nextDiscount = Math.max(
      0,
      Math.min(
        50,
        Number((overrides.tenantDiscountPct ?? platformSettings.tenantDiscountPct).toFixed(2))
      )
    );
    const clampFx = (val: number, fallback: number) =>
      Math.max(1, Math.min(1000, Number((val || fallback).toFixed(2))));

    const nextRemovedIds = Array.from(
      new Set(overrides.removedShowcaseIds ?? platformSettings.removedShowcaseIds)
    )
      .filter((id) => typeof id === 'string' && id.trim().length > 0 && id.length <= 128)
      .slice(0, 50);

    const payload = {
      commissionRatePct: nextCommission,
      familyApartmentCommissionPct: nextFamilyCommission,
      wholeHouseCommissionPct: nextWholeHouseCommission,
      hotelRoomCommissionPct: nextHotelCommission,
      industrialFactoryCommissionPct: nextFactoryCommission,
      studentHousingCommissionPct: nextStudentCommission,
      commissionModel: 'one_time_brokerage' as const,
      escrowProtectionFeePct: nextEscrowFee,
      tenantDiscountPct: nextDiscount,
      usdRateEgp: clampFx(
        overrides.usdRateEgp ?? platformSettings.usdRateEgp,
        CURRENCY_RATES_TO_EGP.USD
      ),
      sarRateEgp: clampFx(
        overrides.sarRateEgp ?? platformSettings.sarRateEgp,
        CURRENCY_RATES_TO_EGP.SAR
      ),
      eurRateEgp: clampFx(
        overrides.eurRateEgp ?? platformSettings.eurRateEgp,
        CURRENCY_RATES_TO_EGP.EUR
      ),
      aedRateEgp: clampFx(
        overrides.aedRateEgp ?? platformSettings.aedRateEgp,
        CURRENCY_RATES_TO_EGP.AED
      ),
      announcementText: (overrides.announcementText ?? platformSettings.announcementText)
        .trim()
        .slice(0, 300),
      allowNewListings: overrides.allowNewListings ?? platformSettings.allowNewListings,
      allowNewBookings: overrides.allowNewBookings ?? platformSettings.allowNewBookings,
      removedShowcaseIds: nextRemovedIds,
      updatedByUid: currentUser.uid,
      updatedAt: serverTimestamp(),
    };

    // Prepare full clean settings record for realtime broadcast and Supabase
    const cleanSettingsPayload: PlatformSettingsRecord = {
      commissionRatePct: payload.commissionRatePct,
      familyApartmentCommissionPct: payload.familyApartmentCommissionPct,
      wholeHouseCommissionPct: payload.wholeHouseCommissionPct,
      hotelRoomCommissionPct: payload.hotelRoomCommissionPct,
      industrialFactoryCommissionPct: payload.industrialFactoryCommissionPct,
      studentHousingCommissionPct: payload.studentHousingCommissionPct,
      commissionModel: payload.commissionModel,
      escrowProtectionFeePct: payload.escrowProtectionFeePct,
      tenantDiscountPct: payload.tenantDiscountPct,
      usdRateEgp: payload.usdRateEgp,
      sarRateEgp: payload.sarRateEgp,
      eurRateEgp: payload.eurRateEgp,
      aedRateEgp: payload.aedRateEgp,
      announcementText: payload.announcementText,
      allowNewListings: payload.allowNewListings,
      allowNewBookings: payload.allowNewBookings,
      removedShowcaseIds: payload.removedShowcaseIds,
      updatedByUid: payload.updatedByUid,
      updatedAtMs: Date.now(),
    };

    try {
      // 1. Persist to Supabase Database
      await saveSupabasePlatformSettings(cleanSettingsPayload);

      // 2. Broadcast via Supabase Realtime Channel
      void broadcastSupabasePlatformSettings(cleanSettingsPayload);

      // 3. Cache locally & dispatch event for immediate local UI update
      try {
        // localStorage caching removed for security
        // localStorage caching removed for security
      } catch {}
      window.dispatchEvent(new CustomEvent('meftah_settings_update', { detail: cleanSettingsPayload }));

      // 4. Also mirror to Firestore if active
      try {
        await setDoc(doc(db, 'platformSettings', 'config'), payload);
      } catch (fErr) {
        logFirestoreDiagnostic(fErr, OperationType.WRITE, 'platformSettings/config');
      }

      if (auditEntry) {
        await logAdminActivity(auditEntry).catch(() => undefined);
      }
      notifySuccess(successMsg);
    } catch (err) {
      console.error('[Admin Console] Error saving platform settings:', err);
      setErrorFeedback(
        t(
          'تعذر حفظ الإعدادات — تحقق من القيم المدخلة وحالة الجلسة وأعد المحاولة.',
          'Could not save platform settings — check values and session, then retry.'
        )
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const handleApplyBaseCommissionToAllCategories = () => {
    const baseStr = String(
      clampCommissionInt(Number(commissionText) || undefined, VALIDATION_LIMITS.DEFAULT_COMMISSION_PCT)
    );
    setCommissionText(baseStr);
    setFamilyCommissionText(baseStr);
    setWholeHouseCommissionText(baseStr);
    setHotelCommissionText(baseStr);
    setFactoryCommissionText(baseStr);
    setStudentCommissionText(baseStr);
  };

  const handleSaveAllRatesAndSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedCommission = clampCommissionInt(
      Number(commissionText) || undefined,
      VALIDATION_LIMITS.DEFAULT_COMMISSION_PCT
    );
    const parsedFamily = clampCommissionInt(
      Number(familyCommissionText) || undefined,
      parsedCommission
    );
    const parsedWholeHouse = clampCommissionInt(
      Number(wholeHouseCommissionText) || undefined,
      parsedCommission
    );
    const parsedHotel = clampCommissionInt(
      Number(hotelCommissionText) || undefined,
      parsedCommission
    );
    const parsedFactory = clampCommissionInt(
      Number(factoryCommissionText) || undefined,
      parsedCommission
    );
    const parsedStudent = clampCommissionInt(
      Number(studentCommissionText) || undefined,
      parsedCommission
    );

    const parsedEscrowFee = Number(escrowFeeText) || 0;
    const parsedDiscount = Number(discountText) || 0;
    const parsedUsd = Number(usdRateText) || CURRENCY_RATES_TO_EGP.USD;
    const parsedSar = Number(sarRateText) || CURRENCY_RATES_TO_EGP.SAR;
    const parsedEur = Number(eurRateText) || CURRENCY_RATES_TO_EGP.EUR;
    const parsedAed = Number(aedRateText) || CURRENCY_RATES_TO_EGP.AED;

    const prevFam = getCategoryCommissionPct('family_apartment', platformSettings);
    const prevHouse = getCategoryCommissionPct('whole_house', platformSettings);
    const prevHotel = getCategoryCommissionPct('hotel_room', platformSettings);
    const prevFac = getCategoryCommissionPct('industrial_factory', platformSettings);
    const prevStu = getCategoryCommissionPct('student_housing', platformSettings);

    const prevBeforeParts: string[] = [];
    const nextAfterParts: string[] = [];

    if (platformSettings.commissionRatePct !== parsedCommission) {
      prevBeforeParts.push(`أساسي ${platformSettings.commissionRatePct}%`);
      nextAfterParts.push(`أساسي ${parsedCommission}%`);
    }
    if (prevFam !== parsedFamily) {
      prevBeforeParts.push(`شقق ${prevFam}%`);
      nextAfterParts.push(`شقق ${parsedFamily}%`);
    }
    if (prevHouse !== parsedWholeHouse) {
      prevBeforeParts.push(`منازل ${prevHouse}%`);
      nextAfterParts.push(`منازل ${parsedWholeHouse}%`);
    }
    if (prevHotel !== parsedHotel) {
      prevBeforeParts.push(`فندقي ${prevHotel}%`);
      nextAfterParts.push(`فندقي ${parsedHotel}%`);
    }
    if (prevFac !== parsedFactory) {
      prevBeforeParts.push(`مصانع ${prevFac}%`);
      nextAfterParts.push(`مصانع ${parsedFactory}%`);
    }
    if (prevStu !== parsedStudent) {
      prevBeforeParts.push(`طلاب ${prevStu}%`);
      nextAfterParts.push(`طلاب ${parsedStudent}%`);
    }

    const commissionChanged = prevBeforeParts.length > 0;

    if (!commissionChanged) {
      if (platformSettings.tenantDiscountPct !== parsedDiscount) {
        prevBeforeParts.push(`خصم ${platformSettings.tenantDiscountPct}%`);
        nextAfterParts.push(`خصم ${parsedDiscount}%`);
      }
      if (platformSettings.escrowProtectionFeePct !== parsedEscrowFee) {
        prevBeforeParts.push(`ضمان ${platformSettings.escrowProtectionFeePct}%`);
        nextAfterParts.push(`ضمان ${parsedEscrowFee}%`);
      }
      if (platformSettings.usdRateEgp !== parsedUsd) {
        prevBeforeParts.push(`USD ${platformSettings.usdRateEgp}`);
        nextAfterParts.push(`USD ${parsedUsd}`);
      }
      if (platformSettings.announcementText !== announcementInput.trim()) {
        prevBeforeParts.push(platformSettings.announcementText ? 'تنبيه سابق' : 'بدون تنبيه');
        nextAfterParts.push(announcementInput.trim() ? 'تنبيه مفعّل' : 'تم مسح التنبيه');
      }
    }

    const prevSummary =
      prevBeforeParts.join(' · ') ||
      `شقق ${prevFam}% · منازل ${prevHouse}% · فندقي ${prevHotel}% · مصانع ${prevFac}% · طلاب ${prevStu}%`;
    const nextSummary =
      nextAfterParts.join(' · ') ||
      `شقق ${parsedFamily}% · منازل ${parsedWholeHouse}% · فندقي ${parsedHotel}% · مصانع ${parsedFactory}% · طلاب ${parsedStudent}%`;

    await writePlatformConfig(
      {
        commissionRatePct: parsedCommission,
        familyApartmentCommissionPct: parsedFamily,
        wholeHouseCommissionPct: parsedWholeHouse,
        hotelRoomCommissionPct: parsedHotel,
        industrialFactoryCommissionPct: parsedFactory,
        studentHousingCommissionPct: parsedStudent,
        escrowProtectionFeePct: parsedEscrowFee,
        tenantDiscountPct: parsedDiscount,
        usdRateEgp: parsedUsd,
        sarRateEgp: parsedSar,
        eurRateEgp: parsedEur,
        aedRateEgp: parsedAed,
        announcementText: announcementInput,
      },
      t(
        'تم حفظ وتعميم نسب العمولة المستقلة لكل قسم وأسعار العملات والتنبيه العام فوراً.',
        'Per-category commissions, FX prices, and global announcement applied live to user pages.'
      ),
      {
        actionType: commissionChanged ? 'commission_change' : 'settings_change',
        severity: commissionChanged ? 'warning' : 'info',
        targetType: 'platform_settings',
        targetId: 'config',
        targetLabel: commissionChanged
          ? 'نسب عمولة الأقسام العقارية / Sector Commissions'
          : 'إعدادات وأسعار صرف المنصة / Platform Settings & FX',
        summaryAr: commissionChanged
          ? `تحديث نسب العمولة المستقلة للأقسام (${nextSummary})`
          : 'تحديث إعدادات الخصومات وأسعار العملات والتنبيه العام للمنصة',
        summaryEn: commissionChanged
          ? `Updated per-category commission percentages (${nextSummary})`
          : 'Updated promotional discounts, FX exchange rates, and global broadcast banner',
        previousValue: prevSummary,
        newValue: nextSummary,
      }
    );
  };

  const handleResetFxToMarketDefaults = () => {
    setUsdRateText(String(CURRENCY_RATES_TO_EGP.USD));
    setSarRateText(String(CURRENCY_RATES_TO_EGP.SAR));
    setEurRateText(String(CURRENCY_RATES_TO_EGP.EUR));
    setAedRateText(String(CURRENCY_RATES_TO_EGP.AED));
  };

  const handleSyncShowcaseUnits = async () => {
    setSyncingShowcase(true);
    setErrorFeedback(null);
    try {
      const existingIds = new Set(allApartments.map((a) => a.id));
      const bookedIds = new Set(allBookings.map((b) => b.apartmentId));
      const toSeed = SHOWCASE_APARTMENTS.filter(
        (s) =>
          !existingIds.has(s.id) && !bookedIds.has(s.id) && !removedShowcaseSet.has(s.id)
      );

      if (toSeed.length === 0) {
        notifySuccess(
          t(
            'جميع الوحدات النشطة مثبتة ومحدثة بالفعل في قاعدة البيانات.',
            'All active showcase units are already synced in Firestore.'
          )
        );
        setSyncingShowcase(false);
        return;
      }

      const batch = writeBatch(db);
      for (const item of toSeed) {
        const hash = await computeTextSha256(item.id);
        const payload: Record<string, unknown> = {
          ownerId: currentUser.uid,
          ownerDisplayName: item.ownerDisplayName,
          category: item.category,
          billingMode: item.billingMode,
          dailyRateEgp: item.dailyRateEgp,
          monthlyRentEgp: item.monthlyRentEgp,
          studentBedsCount: item.studentBedsCount,
          studentPricePerBedEgp: item.studentPricePerBedEgp,
          title: item.title,
          description: item.description,
          governorate: item.governorate,
          district: item.district,
          lat: item.lat,
          lng: item.lng,
          bedrooms: item.bedrooms,
          bathrooms: item.bathrooms,
          areaSqm: item.areaSqm,
          furnishing: item.furnishing,
          imageKey: item.imageKey,
          verificationStatus: 'verified',
          availabilityStatus: 'available',
          commissionRatePct: getCategoryCommissionPct(item.category, platformSettings),
          mandateAccepted: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (typeof item.houseApartmentsCount === 'number' && item.houseApartmentsCount > 0) {
          payload.houseApartmentsCount = item.houseApartmentsCount;
        }
        if (typeof item.houseFloorsCount === 'number' && item.houseFloorsCount > 0) {
          payload.houseFloorsCount = item.houseFloorsCount;
        }
        if (typeof item.houseHasGardenOrRoof === 'boolean') {
          payload.houseHasGardenOrRoof = item.houseHasGardenOrRoof;
        }
        if (typeof item.houseHasPrivateGarage === 'boolean') {
          payload.houseHasPrivateGarage = item.houseHasPrivateGarage;
        }
        if (item.houseSpecsSummary) {
          payload.houseSpecsSummary = item.houseSpecsSummary.slice(0, 240);
        }
        if (item.baseCurrency) payload.baseCurrency = item.baseCurrency;
        if (typeof item.baseMonthlyPrice === 'number') {
          payload.baseMonthlyPrice = item.baseMonthlyPrice;
        }
        if (typeof item.baseDailyPrice === 'number') {
          payload.baseDailyPrice = item.baseDailyPrice;
        }
        if (typeof item.hasVirtualTour === 'boolean') {
          payload.hasVirtualTour = item.hasVirtualTour;
        }
        if (item.panorama360Key) payload.panorama360Key = item.panorama360Key;

        batch.set(doc(db, 'apartments', item.id), payload);
        batch.set(doc(db, 'apartments', item.id, 'legalDocs', 'dossier'), {
          ownerId: currentUser.uid,
          apartmentId: item.id,
          nationalIdNumber: '28801010104455',
          ownerPhone: '01022334455',
          exactAddress: `${item.district} — وحدة موثقة بسجل منصة إيجار`,
          propertyRegistryNumber: `REG-${item.id.slice(-6).toUpperCase()}`,
          titleDeedFileName: `${item.id}_deed.pdf`,
          titleDeedSha256: hash,
          utilityBillFileName: `${item.id}_utility.pdf`,
          utilityBillSha256: hash,
          ownerIbanOrInstapay: 'verified.landlord@instapay',
          digitalSignatureName: `${item.ownerDisplayName} الموثق`.slice(0, 80),
          exclusivityClauseAccepted: true,
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();
      await logAdminActivity({
        actionType: 'settings_change',
        severity: 'info',
        targetType: 'platform_settings',
        targetId: 'showcase_sync',
        targetLabel: 'مزامنة الوحدات النموذجية / Showcase Sync',
        summaryAr: `تثبيت ومزامنة ${toSeed.length} وحدة نموذجية في قاعدة البيانات الحية`,
        summaryEn: `Synced ${toSeed.length} showcase units into live Firestore database`,
        previousValue: `${allApartments.length} units`,
        newValue: `${allApartments.length + toSeed.length} units`,
      });
      notifySuccess(
        t(
          `تم تثبيت ${toSeed.length} وحدة في السجل السحابي الحي بنجاح.`,
          `Synced ${toSeed.length} units into live Firestore.`
        )
      );
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.WRITE, 'apartments (showcase sync)');
      setErrorFeedback(
        t(
          'تعذر مزامنة الوحدات النموذجية حالياً — تحقق من الصلاحية والاتصال وأعد المحاولة.',
          'Could not sync showcase units right now — check connection/permissions and retry.'
        )
      );
    } finally {
      setSyncingShowcase(false);
    }
  };

  // Start Inline Edit for Any Listing
  const handleStartEditListing = (apt: ApartmentRecord) => {
    setEditDraft({
      id: apt.id,
      title: apt.title,
      category: apt.category,
      billingMode: apt.billingMode,
      furnishing: apt.furnishing,
      monthlyRentText: String(apt.monthlyRentEgp),
      dailyRateText: String(apt.dailyRateEgp > 0 ? apt.dailyRateEgp : 1500),
      studentBedsText: String(apt.studentBedsCount > 0 ? apt.studentBedsCount : 4),
      studentBedPriceText: String(
        apt.studentPricePerBedEgp > 0 ? apt.studentPricePerBedEgp : 3500
      ),
      houseApartmentsCountText: String(
        (apt.houseApartmentsCount || 0) > 0 ? apt.houseApartmentsCount : 3
      ),
      houseFloorsCountText: String(
        (apt.houseFloorsCount || 0) > 0 ? apt.houseFloorsCount : 3
      ),
      verificationStatus: apt.verificationStatus,
    });
  };

  const handleSaveEditedListing = async (apt: ApartmentRecord) => {
    if (!editDraft || editDraft.id !== apt.id) return;
    const cleanTitle = editDraft.title.trim().slice(0, 120);
    if (cleanTitle.length < VALIDATION_LIMITS.TITLE_MIN) {
      setErrorFeedback(
        t('عنوان الإعلان يجب ألا يقل عن 5 أحرف.', 'Listing title must be at least 5 characters.')
      );
      return;
    }

    const nextCategory = editDraft.category;
    const nextBillingMode: BillingMode =
      nextCategory === 'hotel_room'
        ? 'daily_or_monthly'
        : nextCategory === 'whole_house'
          ? editDraft.billingMode
          : 'monthly_only';
    const nextMonthlyRentEgp = snapRentToMultipleOf10(Number(editDraft.monthlyRentText) || 10000);
    const nextDailyRateEgp =
      nextBillingMode === 'daily_or_monthly'
        ? snapToMultipleOf10(
            Number(editDraft.dailyRateText) || 1500,
            VALIDATION_LIMITS.DAILY_RATE_MIN,
            VALIDATION_LIMITS.DAILY_RATE_MAX
          )
        : 0;
    const nextStudentBedsCount =
      nextCategory === 'student_housing'
        ? Math.max(1, Math.min(50, Math.round(Number(editDraft.studentBedsText) || 4)))
        : 0;
    const nextStudentPricePerBedEgp =
      nextStudentBedsCount > 0
        ? snapToMultipleOf10(
            Number(editDraft.studentBedPriceText) || 3500,
            VALIDATION_LIMITS.STUDENT_BED_MIN,
            VALIDATION_LIMITS.STUDENT_BED_MAX
          )
        : 0;
    const nextHouseApartmentsCount =
      nextCategory === 'whole_house'
        ? Math.max(1, Math.min(60, Math.round(Number(editDraft.houseApartmentsCountText) || 3)))
        : 0;
    const nextHouseFloorsCount =
      nextCategory === 'whole_house'
        ? Math.max(1, Math.min(20, Math.round(Number(editDraft.houseFloorsCountText) || 3)))
        : 0;
    const categoryCommissionPct = getCategoryCommissionPct(nextCategory, platformSettings);

    setSavingListingId(apt.id);
    setErrorFeedback(null);

    try {
      const isShowcase = SHOWCASE_APARTMENTS.some((s) => s.id === apt.id);
      const liveRates = buildLiveCurrencyRates(platformSettings);
      const hasForeignCurrency = Boolean(apt.baseCurrency && apt.baseCurrency !== 'EGP');

      if (apt.isPersistedInDb) {
        const updatePayload: Record<string, unknown> = {
          title: cleanTitle,
          category: nextCategory,
          billingMode: nextBillingMode,
          furnishing: editDraft.furnishing,
          monthlyRentEgp: nextMonthlyRentEgp,
          dailyRateEgp: nextDailyRateEgp,
          studentBedsCount: nextStudentBedsCount,
          studentPricePerBedEgp: nextStudentPricePerBedEgp,
          houseApartmentsCount: nextHouseApartmentsCount,
          houseFloorsCount: nextHouseFloorsCount,
          verificationStatus: editDraft.verificationStatus,
          commissionRatePct: categoryCommissionPct,
          updatedAt: serverTimestamp(),
        };
        if (hasForeignCurrency && apt.baseCurrency) {
          updatePayload.baseMonthlyPrice = convertFromEgp(
            nextMonthlyRentEgp,
            apt.baseCurrency,
            liveRates
          );
          if (nextDailyRateEgp > 0) {
            updatePayload.baseDailyPrice = convertFromEgp(
              nextDailyRateEgp,
              apt.baseCurrency,
              liveRates
            );
          }
          if (nextStudentPricePerBedEgp > 0) {
            updatePayload.baseStudentBedPrice = convertFromEgp(
              nextStudentPricePerBedEgp,
              apt.baseCurrency,
              liveRates
            );
          }
        }
        try {
          await updateDoc(doc(db, 'apartments', apt.id), updatePayload);
        } catch (fErr) {
          logFirestoreDiagnostic(fErr, OperationType.UPDATE, `apartments/${apt.id}`);
        }
      } else {
        // Materialize unseeded showcase unit into Firestore with Admin's edited fields
        try {
          const hash = await computeTextSha256(apt.id);
          const batch = writeBatch(db);
          const newAptPayload: Record<string, unknown> = {
            ownerId: currentUser.uid,
            ownerDisplayName: apt.ownerDisplayName,
            category: nextCategory,
            billingMode: nextBillingMode,
            dailyRateEgp: nextDailyRateEgp,
            monthlyRentEgp: nextMonthlyRentEgp,
            studentBedsCount: nextStudentBedsCount,
            studentPricePerBedEgp: nextStudentPricePerBedEgp,
            houseApartmentsCount: nextHouseApartmentsCount,
            houseFloorsCount: nextHouseFloorsCount,
            title: cleanTitle,
            description: apt.description,
            governorate: apt.governorate,
            district: apt.district,
            lat: apt.lat,
            lng: apt.lng,
            bedrooms: apt.bedrooms,
            bathrooms: apt.bathrooms,
            areaSqm: apt.areaSqm,
            furnishing: editDraft.furnishing,
            imageKey: apt.imageKey,
            hasVirtualTour: Boolean(apt.hasVirtualTour),
            panorama360Key: apt.panorama360Key || 'none',
            verificationStatus: editDraft.verificationStatus,
            availabilityStatus: 'available',
            commissionRatePct: categoryCommissionPct,
            mandateAccepted: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (apt.baseCurrency) {
            newAptPayload.baseCurrency = apt.baseCurrency;
            newAptPayload.baseMonthlyPrice = hasForeignCurrency
              ? convertFromEgp(nextMonthlyRentEgp, apt.baseCurrency, liveRates)
              : nextMonthlyRentEgp;
            if (nextDailyRateEgp > 0) {
              newAptPayload.baseDailyPrice = hasForeignCurrency
                ? convertFromEgp(nextDailyRateEgp, apt.baseCurrency, liveRates)
                : nextDailyRateEgp;
            }
            if (nextStudentPricePerBedEgp > 0) {
              newAptPayload.baseStudentBedPrice = hasForeignCurrency
                ? convertFromEgp(nextStudentPricePerBedEgp, apt.baseCurrency, liveRates)
                : nextStudentPricePerBedEgp;
            }
          }
          if (apt.panorama360DataUrl) {
            newAptPayload.panorama360DataUrl = apt.panorama360DataUrl;
          }
          if (typeof apt.houseHasGardenOrRoof === 'boolean') {
            newAptPayload.houseHasGardenOrRoof = apt.houseHasGardenOrRoof;
          }
          if (typeof apt.houseHasPrivateGarage === 'boolean') {
            newAptPayload.houseHasPrivateGarage = apt.houseHasPrivateGarage;
          }
          if (apt.houseSpecsSummary) {
            newAptPayload.houseSpecsSummary = apt.houseSpecsSummary.slice(0, 240);
          }

          batch.set(doc(db, 'apartments', apt.id), newAptPayload);
          batch.set(doc(db, 'apartments', apt.id, 'legalDocs', 'dossier'), {
            ownerId: currentUser.uid,
            apartmentId: apt.id,
            nationalIdNumber: '28801010104455',
            ownerPhone: '01022334455',
            exactAddress: `${apt.district} — وحدة موثقة بسجل منصة إيجار`,
            propertyRegistryNumber: `REG-${apt.id.slice(-6).toUpperCase()}`,
            titleDeedFileName: `${apt.id}_deed.pdf`,
            titleDeedSha256: hash,
            utilityBillFileName: `${apt.id}_utility.pdf`,
            utilityBillSha256: hash,
            ownerIbanOrInstapay: 'verified.landlord@instapay',
            digitalSignatureName: `${apt.ownerDisplayName} الموثق`.slice(0, 80),
            exclusivityClauseAccepted: true,
            createdAt: serverTimestamp(),
          });
          batch.commit().catch((fErr) => {
            logFirestoreDiagnostic(fErr, OperationType.WRITE, `apartments/${apt.id}`);
          });
        } catch (matErr) {
          console.warn('[Admin] Showcase materialization warning:', matErr);
        }
      }

      // Sync directly to Supabase so all visitors load the updated listing details immediately
      await updateSupabaseApartmentDetails(apt.id, {
        title: cleanTitle,
        category: nextCategory,
        billingMode: nextBillingMode,
        monthlyRentEgp: nextMonthlyRentEgp,
        dailyRateEgp: nextDailyRateEgp,
        studentPricePerBedEgp: nextStudentPricePerBedEgp,
        studentBedsCount: nextStudentBedsCount,
        furnishing: editDraft.furnishing,
        verificationStatus: editDraft.verificationStatus,
      });

      // Cache custom apartment edits locally so they persist everywhere
      try {
        const rawEdits = localStorage.getItem('ejar_custom_apartment_edits');
        const editsMap = rawEdits ? JSON.parse(rawEdits) : {};
        editsMap[apt.id] = {
          title: cleanTitle,
          category: nextCategory,
          billingMode: nextBillingMode,
          monthlyRentEgp: nextMonthlyRentEgp,
          dailyRateEgp: nextDailyRateEgp,
          studentPricePerBedEgp: nextStudentPricePerBedEgp,
          studentBedsCount: nextStudentBedsCount,
          furnishing: editDraft.furnishing,
          verificationStatus: editDraft.verificationStatus,
        };
        localStorage.setItem('ejar_custom_apartment_edits', JSON.stringify(editsMap));
      } catch {}

      window.dispatchEvent(
        new CustomEvent('apartment_updated', {
          detail: {
            id: apt.id,
            title: cleanTitle,
            category: nextCategory,
            monthlyRentEgp: nextMonthlyRentEgp,
            dailyRateEgp: nextDailyRateEgp,
            furnishing: editDraft.furnishing,
            verificationStatus: editDraft.verificationStatus,
          },
        })
      );

      await logAdminActivity({
        actionType: 'listing_edited',
        severity: 'info',
        targetType: 'apartment',
        targetId: apt.id,
        targetLabel: cleanTitle,
        summaryAr: `تعديل بيانات وتسعير الإعلان «${cleanTitle}»`,
        summaryEn: `Edited listing details and pricing for "${cleanTitle}"`,
        previousValue: `${categoryLabel(apt.category)} · ${apt.monthlyRentEgp} EGP`,
        newValue: `${categoryLabel(nextCategory)} · ${nextMonthlyRentEgp} EGP`,
      });

      if (isShowcase) {
        const nextRemoved =
          editDraft.verificationStatus === 'verified'
            ? platformSettings.removedShowcaseIds.filter((id) => id !== apt.id)
            : Array.from(new Set([...platformSettings.removedShowcaseIds, apt.id]));
        if (nextRemoved.length !== platformSettings.removedShowcaseIds.length) {
          await writePlatformConfig(
            { removedShowcaseIds: nextRemoved },
            t(
              `تم تحديث الإعلان «${cleanTitle}» وانعكس التعديل فوراً على صفحات المستخدمين.`,
              `Updated "${cleanTitle}" live across all user screens.`
            )
          );
          setEditDraft(null);
          return;
        }
      }

      setEditDraft(null);
      notifySuccess(
        t(
          `تم تحديث الإعلان «${cleanTitle}» وانعكس التعديل فوراً على صفحات المستخدمين.`,
          `Updated "${cleanTitle}" live across all user screens.`
        )
      );
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.UPDATE, `apartments/${apt.id}`);
      setErrorFeedback(
        t(
          'تعذر حفظ تعديلات الإعلان حالياً — تحقق من القيم وحالة الجلسة وأعد المحاولة.',
          'Could not save listing changes right now — verify values/session and retry.'
        )
      );
    } finally {
      setSavingListingId(null);
    }
  };

  const handleApartmentDecision = async (
    apt: ApartmentRecord,
    decision: 'verified' | 'rejected'
  ) => {
    setSavingListingId(apt.id);
    try {
      const isShowcase = SHOWCASE_APARTMENTS.some((s) => s.id === apt.id);
      await updateSupabaseApartmentVerificationStatus(apt.id, decision);
      window.dispatchEvent(new CustomEvent('apartment_updated', { detail: { id: apt.id, status: decision } }));

      if (apt.isPersistedInDb) {
        try {
          await updateDoc(doc(db, 'apartments', apt.id), {
            verificationStatus: decision,
            availabilityStatus: 'available',
            updatedAt: serverTimestamp(),
          });
        } catch (fErr) {
          logFirestoreDiagnostic(fErr, OperationType.UPDATE, `apartments/${apt.id}`);
        }
      }

      await logAdminActivity({
        actionType: 'listing_status',
        severity: decision === 'rejected' ? 'warning' : 'info',
        targetType: 'apartment',
        targetId: apt.id,
        targetLabel: apt.title,
        summaryAr:
          decision === 'verified'
            ? `اعتماد ونشر الوحدة العقارية «${apt.title}» على الخريطة`
            : `إخفاء / رفض نشر الوحدة العقارية «${apt.title}»`,
        summaryEn:
          decision === 'verified'
            ? `Approved and published listing "${apt.title}" on map`
            : `Hidden / rejected listing "${apt.title}" from user view`,
        previousValue: apt.verificationStatus,
        newValue: decision,
      });

      if (isShowcase) {
        const nextRemoved =
          decision === 'verified'
            ? platformSettings.removedShowcaseIds.filter((id) => id !== apt.id)
            : Array.from(new Set([...platformSettings.removedShowcaseIds, apt.id]));
        await writePlatformConfig(
          { removedShowcaseIds: nextRemoved },
          decision === 'verified'
            ? t('تم اعتماد وإظهار الإعلان على الخريطة فوراً.', 'Listing approved and shown live.')
            : t('تم إخفاء الإعلان فوراً من صفحات المستخدمين.', 'Listing hidden from user pages.')
        );
      } else {
        notifySuccess(
          decision === 'verified'
            ? t('تم اعتماد وإظهار الإعلان على الخريطة فوراً.', 'Listing approved and shown live.')
            : t('تم إخفاء الإعلان فوراً من صفحات المستخدمين.', 'Listing hidden from user pages.')
        );
      }
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.UPDATE, `apartments/${apt.id}`);
      setErrorFeedback(
        t('تعذر تحديث حالة نشر الإعلان حالياً.', 'Could not update listing visibility right now.')
      );
    } finally {
      setSavingListingId(null);
    }
  };

  // Permanently Delete Any Listing (Firestore + Showcase Suppression)
  const handlePermanentDeleteListing = async (apt: ApartmentRecord) => {
    setSavingListingId(apt.id);
    setErrorFeedback(null);
    try {
      const isShowcase = SHOWCASE_APARTMENTS.some((s) => s.id === apt.id);
      await deleteSupabaseApartment(apt.id);
      window.dispatchEvent(new CustomEvent('apartment_updated', { detail: { id: apt.id, deleted: true } }));

      if (apt.isPersistedInDb) {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'apartments', apt.id));
        batch.delete(doc(db, 'apartments', apt.id, 'legalDocs', 'dossier'));
        batch.commit().catch((fErr) => {
          logFirestoreDiagnostic(fErr, OperationType.WRITE, `apartments/${apt.id}`);
        });
      }

      await logAdminActivity({
        actionType: 'listing_removed',
        severity: 'critical',
        targetType: 'apartment',
        targetId: apt.id,
        targetLabel: apt.title,
        summaryAr: `حذف نهائي للإعلان «${apt.title}» (${apt.ownerDisplayName}) من المنصة`,
        summaryEn: `Permanently removed listing "${apt.title}" (${apt.ownerDisplayName})`,
        previousValue: `${categoryLabel(apt.category)} · ${apt.monthlyRentEgp} EGP`,
        newValue: 'محذوف نهائياً / Permanently Removed',
      });

      if (isShowcase) {
        const nextRemoved = Array.from(
          new Set([...platformSettings.removedShowcaseIds, apt.id])
        ).slice(0, 50);
        await writePlatformConfig(
          { removedShowcaseIds: nextRemoved },
          t(
            `تم حذف الإعلان «${apt.title}» نهائياً وإزالته فوراً من شاشات جميع المستخدمين.`,
            `Permanently deleted "${apt.title}" from all user screens.`
          )
        );
      } else {
        notifySuccess(
          t(
            `تم حذف الإعلان «${apt.title}» نهائياً وإزالته فوراً من شاشات جميع المستخدمين.`,
            `Permanently deleted "${apt.title}" from all user screens.`
          )
        );
      }
      setConfirmDeleteAptId(null);
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.DELETE, `apartments/${apt.id}`);
      setErrorFeedback(
        t('تعذر حذف الإعلان نهائياً حالياً.', 'Could not delete listing right now.')
      );
    } finally {
      setSavingListingId(null);
    }
  };

  const handleRestoreShowcaseUnit = async (showcaseId: string) => {
    const restoredItem = SHOWCASE_APARTMENTS.find((s) => s.id === showcaseId);
    const nextRemoved = platformSettings.removedShowcaseIds.filter((id) => id !== showcaseId);
    await writePlatformConfig(
      { removedShowcaseIds: nextRemoved },
      t(
        'تمت استعادة الإعلان النموذجي وإظهاره مجدداً على الخريطة.',
        'Showcase listing restored to live map.'
      ),
      {
        actionType: 'listing_status',
        severity: 'info',
        targetType: 'apartment',
        targetId: showcaseId,
        targetLabel: restoredItem?.title || showcaseId,
        summaryAr: `استعادة الإعلان النموذجي «${restoredItem?.title || showcaseId}» للخريطة`,
        summaryEn: `Restored showcase listing "${restoredItem?.title || showcaseId}" to map`,
        previousValue: 'محذوف من العرض / Removed',
        newValue: 'منشور على الخريطة / Live Verified',
      }
    );
  };

  const handleInspectDossier = async (apartmentId: string) => {
    try {
      const snap = await getDoc(doc(db, 'apartments', apartmentId, 'legalDocs', 'dossier'));
      if (snap.exists()) {
        setInspectedDossier(snap.data() as LegalDossierRecord);
      } else {
        notifySuccess(
          t(
            'هذه وحدة نموذجية غير مرتبطة بملف ملكية منفصل بعد.',
            'This showcase unit does not have a separate persisted dossier yet.'
          )
        );
      }
    } catch (err) {
      logFirestoreDiagnostic(
        err,
        OperationType.GET,
        `apartments/${apartmentId}/legalDocs/dossier`
      );
      setErrorFeedback(
        t('تعذر فتح ملف الملكية القانوني حالياً.', 'Could not inspect legal dossier right now.')
      );
    }
  };

  // Ban / Unban Any User
  const executeBanUser = async (targetUid: string, displayName: string, reason: string) => {
    const cleanUid = targetUid.trim();
    if (!VALIDATION_LIMITS.ID_PATTERN.test(cleanUid) || cleanUid.length > 128) {
      setErrorFeedback(
        t('معرّف المستخدم (UID) غير صالح.', 'Invalid user ID (UID) format.')
      );
      return;
    }
    if (cleanUid === currentUser.uid) {
      setErrorFeedback(
        t('لا يمكن حظر حساب مالك الموقع نفسه.', 'Cannot ban the site owner account.')
      );
      return;
    }
    if (cleanUid === 'showcase_owner') {
      setErrorFeedback(
        t(
          'لحذف إعلان نموذجي اضغط «حذف الإعلان» مباشرة.',
          'To remove a showcase unit, click Delete Ad directly.'
        )
      );
      return;
    }

    const safeName =
      displayName.trim().slice(0, 80).length >= 2
        ? displayName.trim().slice(0, 80)
        : 'مستخدم مقيد';
    const safeReason =
      reason.trim().slice(0, 300).length >= 3
        ? reason.trim().slice(0, 300)
        : 'مخالفة شروط الاستخدام المعتمدة بالمنصة';

    setSubmittingBan(true);
    setErrorFeedback(null);
    try {
      const existingBan = bannedMap.get(cleanUid);
      if (existingBan) {
        await updateDoc(doc(db, 'bannedUsers', cleanUid), {
          displayName: safeName,
          reason: safeReason,
          hideListings: true,
          bannedByUid: currentUser.uid,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'bannedUsers', cleanUid), {
          userId: cleanUid,
          displayName: safeName,
          reason: safeReason,
          hideListings: true,
          bannedByUid: currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await logAdminActivity({
        actionType: 'user_ban',
        severity: 'critical',
        targetType: 'user',
        targetId: cleanUid,
        targetLabel: safeName,
        summaryAr: `حظر حساب المستخدم «${safeName}» وإخفاء إعلاناته وتعليقاته`,
        summaryEn: `Banned user "${safeName}" and hid all associated listings and reviews`,
        previousValue: existingBan ? `محظور: ${existingBan.reason}` : 'حساب نشط / Active',
        newValue: `محظور: ${safeReason}`,
      });

      setQuickBanTarget(null);
      setManualBanUid('');
      setManualBanName('');
      notifySuccess(
        t(
          `تم حظر «${safeName}» وإخفاء جميع إعلاناته وتعليقاته فوراً من صفحات المستخدمين.`,
          `Banned "${safeName}" and hid all their ads and reviews immediately.`
        )
      );
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.WRITE, `bannedUsers/${cleanUid}`);
      setErrorFeedback(
        t('تعذر تنفيذ قرار حظر المستخدم حالياً.', 'Could not ban user account right now.')
      );
    } finally {
      setSubmittingBan(false);
    }
  };

  const handleUnbanUser = async (userId: string, displayName: string) => {
    const prevBan = bannedMap.get(userId);
    try {
      await deleteDoc(doc(db, 'bannedUsers', userId));
      await logAdminActivity({
        actionType: 'user_unban',
        severity: 'info',
        targetType: 'user',
        targetId: userId,
        targetLabel: displayName,
        summaryAr: `فك الحظر عن المستخدم «${displayName}» وإعادة تفعيل حسابه`,
        summaryEn: `Unbanned user "${displayName}" and restored account privileges`,
        previousValue: prevBan ? `محظور: ${prevBan.reason}` : 'محظور / Banned',
        newValue: 'حساب نشط / Active',
      });
      notifySuccess(
        t(
          `تم فك الحظر عن «${displayName}» وإعادة تفعيل حسابه فوراً.`,
          `Unbanned "${displayName}" and restored account access.`
        )
      );
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.DELETE, `bannedUsers/${userId}`);
      setErrorFeedback(
        t('تعذر فك الحظر عن المستخدم حالياً.', 'Could not unban user account right now.')
      );
    }
  };

  const handleInspectTenantKyc = async (userId: string) => {
    try {
      const snap = await getDoc(doc(db, 'tenantVerifications', userId, 'privateDocs', 'kyc'));
      if (snap.exists()) {
        setInspectedKyc(snap.data() as TenantKycPrivateRecord);
      }
    } catch (err) {
      logFirestoreDiagnostic(
        err,
        OperationType.GET,
        `tenantVerifications/${userId}/privateDocs/kyc`
      );
      setErrorFeedback(
        t('تعذر عرض مستندات الهوية حالياً.', 'Could not inspect KYC documents right now.')
      );
    }
  };

  const handleTenantKycDecision = async (
    userId: string,
    decision: 'verified' | 'rejected'
  ) => {
    const note = (
      kycReviewNotes[userId]?.trim() ||
      (decision === 'verified'
        ? 'تم التحقق من الهوية والمستندات واعتماد المستأجر بنجاح.'
        : 'يرجى إعادة رفع صورة بطاقة واضحة ومستند إثبات حديث.')
    ).slice(0, 300);

    const kycRec = allTenantVerifications.find((k) => k.userId === userId);

    try {
      await updateDoc(doc(db, 'tenantVerifications', userId), {
        verificationStatus: decision,
        reviewNote: note,
        updatedAt: serverTimestamp(),
      });

      // Mirror KYC decision to Supabase profiles
      await updateSupabaseKycStatus(userId, {
        isTenantVerified: decision === 'verified',
      }).catch((sbErr) => {
        console.warn('Supabase KYC update note:', sbErr);
      });

      // localStorage caching removed for security

      await logAdminActivity({
        actionType: 'moderation_action',
        severity: decision === 'rejected' ? 'warning' : 'info',
        targetType: 'kyc',
        targetId: userId,
        targetLabel: kycRec?.tenantDisplayName || userId,
        summaryAr:
          decision === 'verified'
            ? `اعتماد توثيق هوية المستأجر «${kycRec?.tenantDisplayName || userId}»`
            : `رفض طلب توثيق هوية المستأجر «${kycRec?.tenantDisplayName || userId}»`,
        summaryEn:
          decision === 'verified'
            ? `Approved KYC verification for "${kycRec?.tenantDisplayName || userId}"`
            : `Rejected KYC verification for "${kycRec?.tenantDisplayName || userId}"`,
        previousValue: kycRec?.verificationStatus || 'pending_review',
        newValue: decision,
      });
      notifySuccess(
        t('تم تحديث حالة توثيق هوية المستأجر فوراً.', 'Tenant KYC status updated.')
      );
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.UPDATE, `tenantVerifications/${userId}`);
      setErrorFeedback(
        t('تعذر تحديث قرار توثيق الهوية حالياً.', 'Could not update KYC decision right now.')
      );
    }
  };

  // Reviews, Rental Requests & Bookings Moderation
  const handleToggleReviewVisibility = async (rev: ReviewRecord) => {
    if (!rev.isPersistedInDb) return;
    const nextStatus = rev.visibilityStatus === 'published' ? 'hidden' : 'published';
    try {
      await updateDoc(doc(db, 'reviews', rev.id), {
        visibilityStatus: nextStatus,
        updatedAt: serverTimestamp(),
      });
      await logAdminActivity({
        actionType: 'moderation_action',
        severity: nextStatus === 'hidden' ? 'warning' : 'info',
        targetType: 'review',
        targetId: rev.id,
        targetLabel: `${rev.tenantDisplayName} — ${rev.apartmentTitle}`.slice(0, 160),
        summaryAr:
          nextStatus === 'hidden'
            ? `إخفاء تعليق وتقييم «${rev.tenantDisplayName}» على «${rev.apartmentTitle}»`
            : `إعادة نشر تعليق «${rev.tenantDisplayName}» على «${rev.apartmentTitle}»`,
        summaryEn:
          nextStatus === 'hidden'
            ? `Hidden review by "${rev.tenantDisplayName}" on "${rev.apartmentTitle}"`
            : `Republished review by "${rev.tenantDisplayName}" on "${rev.apartmentTitle}"`,
        previousValue: rev.visibilityStatus,
        newValue: nextStatus,
      });
      notifySuccess(
        nextStatus === 'hidden'
          ? t('تم إخفاء التعليق فوراً من صفحات المستخدمين.', 'Review hidden immediately.')
          : t('تمت إعادة نشر التعليق.', 'Review republished.')
      );
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.UPDATE, `reviews/${rev.id}`);
      setErrorFeedback(
        t('تعذر تغيير حالة ظهور التقييم حالياً.', 'Could not toggle review visibility right now.')
      );
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    const rev = allReviews.find((r) => r.id === reviewId);
    try {
      await deleteDoc(doc(db, 'reviews', reviewId));
      await logAdminActivity({
        actionType: 'moderation_action',
        severity: 'warning',
        targetType: 'review',
        targetId: reviewId,
        targetLabel: rev ? `${rev.tenantDisplayName} — ${rev.apartmentTitle}` : reviewId,
        summaryAr: `حذف نهائي لتقييم «${rev?.tenantDisplayName || reviewId}»`,
        summaryEn: `Permanently deleted review "${rev?.tenantDisplayName || reviewId}"`,
        previousValue: rev?.visibilityStatus || 'published',
        newValue: 'deleted',
      });
      setConfirmDeleteReviewId(null);
      notifySuccess(t('تم حذف التقييم نهائياً.', 'Review permanently deleted.'));
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.DELETE, `reviews/${reviewId}`);
      setErrorFeedback(
        t('تعذر حذف التقييم حالياً.', 'Could not delete review right now.')
      );
    }
  };

  const handleAdminUpdateRequestStatus = async (
    req: RentalRequestRecord,
    nextStatus: 'awaiting_payment' | 'cancelled'
  ) => {
    try {
      await updateDoc(doc(db, 'rentalRequests', req.id), {
        status: nextStatus,
        statusNote:
          nextStatus === 'cancelled'
            ? 'تم إلغاء الطلب بقرار إداري من صاحب المنصة.'
            : 'تمت الموافقة الإدارية وتحويل الطلب لمرحلة السداد بالضمان.',
        updatedAt: serverTimestamp(),
      });
      await logAdminActivity({
        actionType: 'moderation_action',
        severity: nextStatus === 'cancelled' ? 'warning' : 'info',
        targetType: 'rental_request',
        targetId: req.id,
        targetLabel: `${req.tenantDisplayName} — ${req.apartmentTitle}`.slice(0, 160),
        summaryAr:
          nextStatus === 'cancelled'
            ? `إلغاء إداري لطلب إيجار «${req.apartmentTitle}»`
            : `موافقة إدارية وفتح الدفع لطلب إيجار «${req.apartmentTitle}»`,
        summaryEn:
          nextStatus === 'cancelled'
            ? `Cancelled rental request for "${req.apartmentTitle}"`
            : `Approved rental request for "${req.apartmentTitle}" for escrow payment`,
        previousValue: req.status,
        newValue: nextStatus,
      });
      notifySuccess(t('تم تحديث حالة طلب الإيجار فوراً.', 'Rental request updated.'));
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.UPDATE, `rentalRequests/${req.id}`);
      setErrorFeedback(
        t('تعذر تحديث حالة طلب الإيجار حالياً.', 'Could not update rental request right now.')
      );
    }
  };

  const handleAdminDeleteRequest = async (requestId: string) => {
    const req = allRentalRequests.find((r) => r.id === requestId);
    try {
      await deleteDoc(doc(db, 'rentalRequests', requestId));
      await logAdminActivity({
        actionType: 'moderation_action',
        severity: 'warning',
        targetType: 'rental_request',
        targetId: requestId,
        targetLabel: req ? `${req.tenantDisplayName} — ${req.apartmentTitle}` : requestId,
        summaryAr: `حذف طلب الإيجار رقم ${requestId}`,
        summaryEn: `Deleted rental request ${requestId}`,
        previousValue: req?.status || 'pending_approval',
        newValue: 'deleted',
      });
      setConfirmDeleteRequestId(null);
      notifySuccess(t('تم حذف طلب الإيجار نهائياً.', 'Rental request deleted.'));
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.DELETE, `rentalRequests/${requestId}`);
      setErrorFeedback(
        t('تعذر حذف طلب الإيجار حالياً.', 'Could not delete rental request right now.')
      );
    }
  };

  const handleAdminCompleteBooking = async (bookingId: string) => {
    const bk = allBookings.find((b) => b.id === bookingId);
    try {
      const aptLookup = new Map<string, ApartmentRecord>();
      allApartments.forEach((a) => aptLookup.set(a.id, a));

      const batch = writeBatch(db);
      batch.update(doc(db, 'bookings', bookingId), {
        status: 'completed',
        updatedAt: serverTimestamp(),
      });
      if (bk) {
        const signalSnap = await getDoc(doc(db, 'bookingDemandSignals', bookingId));
        if (!signalSnap.exists()) {
          batch.set(
            doc(db, 'bookingDemandSignals', bookingId),
            buildBookingDemandSignalWritePayload(
              bk,
              {
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              aptLookup
            )
          );
        }
      }
      await batch.commit();
      await logAdminActivity({
        actionType: 'moderation_action',
        severity: 'info',
        targetType: 'booking',
        targetId: bookingId,
        targetLabel: bk ? `${bk.apartmentTitle} (${bk.paymentReference})` : bookingId,
        summaryAr: `اعتماد اكتمال تسليم العقد «${bk?.apartmentTitle || bookingId}»`,
        summaryEn: `Marked escrow contract "${bk?.apartmentTitle || bookingId}" as completed`,
        previousValue: bk?.status || 'escrow_paid',
        newValue: 'completed',
      });
      notifySuccess(t('تم اعتماد اكتمال تسليم العقد.', 'Contract marked completed.'));
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.UPDATE, `bookings/${bookingId}`);
      setErrorFeedback(
        t('تعذر تأكيد اكتمال العقد حالياً.', 'Could not mark contract completed right now.')
      );
    }
  };

  const handleAdminDeleteBooking = async (bookingId: string) => {
    const bk = allBookings.find((b) => b.id === bookingId);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'bookings', bookingId));
      batch.delete(doc(db, 'bookingDemandSignals', bookingId));
      await batch.commit();
      await logAdminActivity({
        actionType: 'moderation_action',
        severity: 'critical',
        targetType: 'booking',
        targetId: bookingId,
        targetLabel: bk ? `${bk.apartmentTitle} (${bk.paymentReference})` : bookingId,
        summaryAr: `حذف سجل عقد الضمان «${bk?.apartmentTitle || bookingId}»`,
        summaryEn: `Deleted escrow contract record "${bk?.apartmentTitle || bookingId}"`,
        previousValue: bk ? `${bk.totalRentEgp} EGP (${bk.status})` : 'escrow_paid',
        newValue: 'deleted',
      });
      setConfirmDeleteBookingId(null);
      notifySuccess(t('تم حذف سجل العقد.', 'Booking record deleted.'));
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.DELETE, `bookings/${bookingId}`);
      setErrorFeedback(
        t('تعذر حذف سجل العقد حالياً.', 'Could not delete booking record right now.')
      );
    }
  };

  const handleExportActivityCsv = () => {
    if (filteredActivityLogs.length === 0) return;
    const escapeCsv = (val: string) => `"${String(val || '').replace(/"/g, '""')}"`;
    const headers = [
      'Timestamp_ISO',
      'Action_Type',
      'Severity',
      'Target_Type',
      'Target_ID',
      'Target_Label',
      'Previous_Value',
      'New_Value',
      'Summary_AR',
      'Summary_EN',
      'Actor_Name',
    ];
    const rows = filteredActivityLogs.map((log) => [
      new Date(log.createdAtMs).toISOString(),
      log.actionType,
      log.severity,
      log.targetType,
      log.targetId,
      log.targetLabel,
      log.previousValue,
      log.newValue,
      log.summaryAr,
      log.summaryEn,
      log.actorDisplayName,
    ]);
    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ejar_admin_activity_log_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleSelectTimePreset = (preset: DashboardTimePreset) => {
    setDashboardTimePreset(preset);
    if (preset === 'last_3_months') {
      setDashboardGranularity('weekly');
    } else if (preset === 'all_time') {
      setDashboardGranularity('monthly');
    } else {
      setDashboardGranularity('daily');
    }
  };

  const handleToggleDashboardCategory = (category: ListingCategory) => {
    setSelectedCategories((prev) => {
      const exists = prev.includes(category);
      if (exists) {
        if (prev.length === 1) {
          return ALL_DASHBOARD_CATEGORY_KEYS;
        }
        return prev.filter((item) => item !== category);
      }
      return [...prev, category];
    });
  };

  const handleExportDashboardCsv = () => {
    const escapeCsv = (val: string | number) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const headers = [
      'Category_Key',
      'Category_Label',
      'Commission_Rate_Pct',
      'Live_Listed_Units',
      'Period_Rentals_Count',
      'Completed_Count',
      'Escrow_Active_Count',
      'Pending_Requests_Count',
      'Share_Pct',
      'Gross_Volume_EGP',
      'Platform_Commission_EGP',
      'Active_Period',
    ];
    const rows = analytics.categoryBreakdown.map((row) => [
      row.category,
      row.fullLabel,
      row.commissionPct,
      row.liveListedCount,
      row.rawPeriodCount,
      row.periodCompletedCount,
      row.periodEscrowCount,
      row.periodPendingRequestsCount,
      row.sharePct,
      row.periodGrossEgp,
      row.periodCommissionEgp,
      analytics.activePeriodLabel,
    ]);
    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ejar_rentals_distribution_${analytics.effectiveStartInput}_to_${analytics.effectiveEndInput}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const formatMetricReadout = (val: number): string => {
    if (dashboardMetric === 'count') {
      return `${formatNumber(val)} ${t('عقد', 'rentals')}`;
    }
    return `${formatNumber(val)} ${t('ج.م', 'EGP')}`;
  };

  const renderTimelineTooltip = (tooltipProps: {
    active?: boolean;
    payload?: ReadonlyArray<{
      payload?: TimelineBucketRow;
    }>;
  }) => {
    const { active, payload } = tooltipProps;
    if (!active || !payload || payload.length === 0) return null;
    const bucket = payload[0]?.payload;
    if (!bucket) return null;

    return (
      <div
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        className="bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl shadow-lg p-3.5 min-w-[240px] space-y-2.5 text-xs"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
          <span className="font-bold text-slate-900">{bucket.fullLabel}</span>
          <span className="font-mono tabular-nums font-bold text-blue-700 whitespace-nowrap">
            {formatMetricReadout(bucket.totalMetric)}
          </span>
        </div>

        <div className="space-y-1.5">
          {DASHBOARD_CATEGORIES.filter((cat) => selectedCategories.includes(cat.key)).map((cat) => {
            const val = bucket[cat.key] || 0;
            const pct =
              bucket.totalMetric > 0 ? Math.round((val / bucket.totalMetric) * 100) : 0;
            return (
              <div key={cat.key} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-xs shrink-0 ${cat.swatchClass}`} />
                  <span className="text-slate-700 font-medium truncate">
                    {lang === 'ar' ? cat.fullAr : cat.fullEn}
                  </span>
                </div>
                <div className="font-mono tabular-nums text-slate-900 font-semibold whitespace-nowrap">
                  {formatNumber(val)}
                  {dashboardMetric !== 'count' ? ` ${t('ج.م', 'EGP')}` : ''}
                  {bucket.totalMetric > 0 && (
                    <span className="text-slate-400 ms-1">({formatNumber(pct)}%)</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-500 font-mono tabular-nums">
          <span>
            {formatNumber(bucket.totalCount)} {t('إيجار', 'rentals')}
          </span>
          <span>·</span>
          <span>
            {formatNumber(bucket.totalGrossEgp)} {t('ج.م حجم', 'EGP vol')}
          </span>
          <span>·</span>
          <span className="text-emerald-700 font-semibold">
            {formatNumber(bucket.totalCommissionEgp)} {t('ج.م ربح', 'EGP fee')}
          </span>
        </div>
      </div>
    );
  };

  const renderCategoryPieTooltip = (tooltipProps: {
    active?: boolean;
    payload?: ReadonlyArray<{
      payload?: {
        name: string;
        count: number;
        grossEgp: number;
        commissionEgp: number;
        sharePct: number;
        swatchClass: string;
      };
    }>;
  }) => {
    const { active, payload } = tooltipProps;
    if (!active || !payload || payload.length === 0) return null;
    const item = payload[0]?.payload;
    if (!item) return null;

    return (
      <div
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        className="bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl shadow-lg p-3 min-w-[210px] space-y-1.5 text-xs"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-xs shrink-0 ${item.swatchClass}`} />
            <span className="font-bold text-slate-900">{item.name}</span>
          </div>
          <span className="font-mono tabular-nums font-bold text-blue-700">
            {formatNumber(item.sharePct, 1)}%
          </span>
        </div>
        <div className="flex items-center justify-between text-slate-600">
          <span>{t('عدد العقود:', 'Rentals:')}</span>
          <span className="font-mono tabular-nums font-semibold text-slate-900">
            {formatNumber(item.count)}
          </span>
        </div>
        <div className="flex items-center justify-between text-slate-600">
          <span>{t('إجمالي الإيجارات:', 'Gross Volume:')}</span>
          <span className="font-mono tabular-nums font-semibold text-slate-900">
            {formatNumber(item.grossEgp)} {t('ج.م', 'EGP')}
          </span>
        </div>
        <div className="flex items-center justify-between text-slate-600">
          <span>{t('عمولة المنصة:', 'Commission:')}</span>
          <span className="font-mono tabular-nums font-semibold text-emerald-700">
            {formatNumber(item.commissionEgp)} {t('ج.م', 'EGP')}
          </span>
        </div>
      </div>
    );
  };

  const renderSectorComparisonTooltip = (tooltipProps: {
    active?: boolean;
    payload?: ReadonlyArray<{
      payload?: {
        fullSector: string;
        listed: number;
        periodRentals: number;
        pendingRequests: number;
        grossEgp: number;
        commissionPct: number;
      };
    }>;
  }) => {
    const { active, payload } = tooltipProps;
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload;
    if (!row) return null;

    return (
      <div
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        className="bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl shadow-lg p-3 min-w-[215px] space-y-1.5 text-xs"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
          <span className="font-bold text-slate-900">{row.fullSector}</span>
          <span className="font-mono tabular-nums text-blue-700 font-semibold">
            {formatNumber(row.commissionPct)}% {t('عمولة', 'fee')}
          </span>
        </div>
        <div className="flex items-center justify-between text-slate-600">
          <span>{t('الوحدات المعروضة:', 'Live Listed Units:')}</span>
          <span className="font-mono tabular-nums font-semibold text-slate-900">
            {formatNumber(row.listed)}
          </span>
        </div>
        <div className="flex items-center justify-between text-slate-600">
          <span>{t('إيجارات الفترة:', 'Period Rentals:')}</span>
          <span className="font-mono tabular-nums font-semibold text-emerald-700">
            {formatNumber(row.periodRentals)}
          </span>
        </div>
        <div className="flex items-center justify-between text-slate-600">
          <span>{t('طلبات قيد التنفيذ:', 'Active Requests:')}</span>
          <span className="font-mono tabular-nums font-semibold text-amber-700">
            {formatNumber(row.pendingRequests)}
          </span>
        </div>
        <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-slate-100">
          <span>{t('حجم العقود:', 'Rental Volume:')}</span>
          <span className="font-mono tabular-nums font-semibold text-slate-900">
            {formatNumber(row.grossEgp)} {t('ج.م', 'EGP')}
          </span>
        </div>
      </div>
    );
  };

  const handleExportGovernorateOccupancyCsv = () => {
    const escapeCsv = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;
    const headers = [
      'Governorate_AR',
      'Governorate_Display',
      'Verified_Units_Total',
      'Occupied_Units_30d',
      'Available_Verified_Units',
      'Occupancy_Rate_Pct',
      'Bookings_Last_30d',
      'Rental_Volume_30d_EGP',
    ];
    const rows = governorateOccupancyAnalytics.visibleRows.map((row) => [
      row.governorateAr,
      row.govDisplay,
      row.verifiedUnitsCount,
      row.occupiedUnitsCount,
      row.availableUnitsCount,
      row.occupancyRatePct,
      row.bookings30dCount,
      row.volume30dEgp,
    ]);
    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ejar_governorate_occupancy_30d_${toLocalDateInputValue(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const renderGovernorateOccupancyTooltip = (tooltipProps: {
    active?: boolean;
    payload?: ReadonlyArray<{
      payload?: GovernorateOccupancyRow;
    }>;
  }) => {
    const { active, payload } = tooltipProps;
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload;
    if (!row) return null;

    return (
      <div
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        className="bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl shadow-lg p-3.5 min-w-[235px] space-y-2 text-xs"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-xs shrink-0"
              style={{ backgroundColor: row.fillHex }}
            />
            <span className="font-bold text-slate-900 truncate">{row.govDisplay}</span>
          </div>
          <span className="font-mono tabular-nums font-bold text-blue-700 whitespace-nowrap">
            {formatNumber(row.occupancyRatePct, 1)}%
          </span>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-slate-600">
            <span>{t('إجمالي الوحدات الموثقة:', 'Verified Units Total:')}</span>
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              {formatNumber(row.verifiedUnitsCount)}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span>{t('الوحدات المشغولة (30 يوماً):', 'Occupied Units (30d):')}</span>
            <span className="font-mono tabular-nums font-semibold text-emerald-700">
              {formatNumber(row.occupiedUnitsCount)}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span>{t('الوحدات الموثقة المتاحة:', 'Available Verified Units:')}</span>
            <span className="font-mono tabular-nums font-semibold text-blue-700">
              {formatNumber(row.availableUnitsCount)}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span>{t('عقود آخر 30 يوماً:', '30-Day Contracts:')}</span>
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              {formatNumber(row.bookings30dCount)}
            </span>
          </div>
        </div>

        <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-slate-600">
          <span>{t('قيمة إيجارات 30 يوماً:', '30-Day Rental Volume:')}</span>
          <span className="font-mono tabular-nums font-bold text-slate-900">
            {formatNumber(row.volume30dEgp)} {t('ج.م', 'EGP')}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Top Executive Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-blue-700">
            {t('لوحة التحكم الكاملة لصاحب الموقع', 'Site Owner Master Control Console')}
            <span aria-hidden="true"> · </span>
            <span className="font-mono text-slate-600">{currentUser.email}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
            {t(
              'التحكم الفوري في النسب والأسعار والإعلانات والمستخدمين',
              'Live Governance of Rates, Listings, Users & Contracts'
            )}
          </h1>
          <p className="text-xs text-slate-500">
            {t(
              'كل تعديل تجريه هنا يُحفظ سحابياً وينعكس في نفس اللحظة على شاشات جميع زوار ومستخدمي المنصة بدون تحديث الصفحة.',
              'Every change saved here syncs in real time across all active user sessions.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={syncingShowcase}
            onClick={() => void handleSyncShowcaseUnits()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingShowcase ? 'animate-spin' : ''}`} />
            <span>
              {t('تثبيت الوحدات النموذجية بالسجل الحي', 'Sync Showcase Units to DB')}
            </span>
          </button>
        </div>
      </div>

      {/* Feedback Banners */}
      {statusFeedback && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs font-semibold text-emerald-950">
          <span>{statusFeedback}</span>
          <button
            type="button"
            onClick={() => setStatusFeedback(null)}
            className="text-emerald-700 hover:text-emerald-950 whitespace-nowrap shrink-0"
          >
            {t('إغلاق', 'Dismiss')}
          </button>
        </div>
      )}

      {errorFeedback && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs font-semibold text-rose-900">
          <span>{errorFeedback}</span>
          <button
            type="button"
            onClick={() => setErrorFeedback(null)}
            className="text-rose-700 hover:text-rose-950 whitespace-nowrap shrink-0"
          >
            {t('إغلاق', 'Dismiss')}
          </button>
        </div>
      )}

      {/* Quick Inline User Ban Modal/Drawer when triggered from any Ad or Review */}
      {quickBanTarget && (
        <div className="bg-rose-50/90 border border-rose-300 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-rose-950">
              <Ban className="w-4 h-4 text-rose-700 shrink-0" />
              <span>
                {t('تأكيد حظر المستخدم وإخفاء جميع إعلاناته:', 'Ban User & Hide All Listings:')}{' '}
                {quickBanTarget.displayName}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setQuickBanTarget(null)}
              className="text-xs font-semibold text-rose-800 hover:text-rose-950"
            >
              {t('إلغاء', 'Cancel')}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-8">
              <label className="block text-xs font-semibold text-rose-900 mb-1">
                {t('سبب الحظر (يظهر للمستخدم المحظور فوراً)', 'Ban Reason (Shown to banned user)')}
              </label>
              <input
                type="text"
                value={quickBanReason}
                onChange={(e) => setQuickBanReason(e.target.value)}
                className="w-full px-3.5 py-2 bg-white border border-rose-300 rounded-xl text-xs text-slate-900"
              />
            </div>
            <div className="sm:col-span-4 flex items-center gap-2">
              <button
                type="button"
                disabled={submittingBan}
                onClick={() =>
                  void executeBanUser(
                    quickBanTarget.userId,
                    quickBanTarget.displayName,
                    quickBanReason
                  )
                }
                className="w-full py-2.5 px-4 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
              >
                {submittingBan
                  ? t('جاري تنفيذ الحظر...', 'Banning...')
                  : t('تنفيذ الحظر الفوري', 'Confirm Instant Ban')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Primary Section Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            {
              id: 'dashboard',
              icon: BarChart3,
              label: t('لوحة البيانات والإحصائيات', 'Executive Dashboard'),
            },
            {
              id: 'rates_and_settings',
              icon: Percent,
              label: t(
                `النسب والعملات والتحكم (${formatNumber(platformSettings.commissionRatePct)}%)`,
                `Rates, FX & Switches (${formatNumber(platformSettings.commissionRatePct)}%)`
              ),
            },
            {
              id: 'listings_control',
              icon: Building2,
              label: `${t('إدارة وحذف الإعلانات', 'Ads & Listings')} (${formatNumber(
                unifiedListings.length
              )})`,
            },
            {
              id: 'users_and_bans',
              icon: Users,
              label: `${t('المستخدمون والحظر', 'Users & Bans')} (${formatNumber(
                allBannedUsers.length
              )} ${t('محظور', 'banned')})`,
            },
            {
              id: 'moderation_and_contracts',
              icon: MessageSquareWarning,
              label: `${t('التعليقات والشات والعقود', 'Reviews, Chats & Contracts')} (${formatNumber(
                persistedReviews.length + allBookings.length + allChatThreads.length
              )})`,
            },
            {
              id: 'admin_activity_logs',
              icon: FileText,
              label: `${t('سجل الأنشطة الرقابي', 'Admin Activity Logs')} (${formatNumber(
                allAdminActivityLogs.length
              )})`,
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ===================================================================== */}
      {/* SECTION 1: RATES, PERCENTAGES, FX CURRENCIES & GLOBAL SWITCHES        */}
      {/* ===================================================================== */}
      {activeSection === 'rates_and_settings' && (
        <div className="space-y-6">
          {/* Instant Master Switches */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Power className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>
                    {t('استقبال إعلانات الوحدات الجديدة', 'Allow New Property Listings')}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {platformSettings.allowNewListings
                    ? t(
                        'مسموح حالياً للملاك برفع شقق ومنازل ووحدات جديدة على المنصة.',
                        'Landlords can currently submit new listings.'
                      )
                    : t(
                        'متوقف مؤقتاً بأمر الإدارة — يظهر تنبيه الإيقاف فوراً في صفحة «اعرض وحدتك».',
                        'Paused by Admin — new submissions are blocked live.'
                      )}
                </p>
              </div>
              <button
                type="button"
                disabled={savingSettings}
                onClick={() => {
                  const nextVal = !platformSettings.allowNewListings;
                  void writePlatformConfig(
                    { allowNewListings: nextVal },
                    nextVal
                      ? t('تم فتح استقبال الإعلانات الجديدة فوراً.', 'New listings enabled.')
                      : t('تم إيقاف استقبال الإعلانات الجديدة مؤقتاً.', 'New listings paused.'),
                    {
                      actionType: 'settings_change',
                      severity: 'warning',
                      targetType: 'platform_settings',
                      targetId: 'allowNewListings',
                      targetLabel: 'مفتاح استقبال الإعلانات / New Listings Switch',
                      summaryAr: nextVal
                        ? 'تفعيل استقبال إعلانات الوحدات العقارية الجديدة'
                        : 'إيقاف استقبال إعلانات الوحدات العقارية الجديدة مؤقتاً',
                      summaryEn: nextVal
                        ? 'Enabled new property listing submissions'
                        : 'Temporarily paused new property listing submissions',
                      previousValue: platformSettings.allowNewListings
                        ? 'مُفعّل / Active'
                        : 'متوقف / Paused',
                      newValue: nextVal ? 'مُفعّل / Active' : 'متوقف / Paused',
                    }
                  );
                }}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap shrink-0 ${
                  platformSettings.allowNewListings
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                    : 'bg-rose-600 hover:bg-rose-700 text-white border-rose-600'
                }`}
              >
                {platformSettings.allowNewListings
                  ? t('مُفعّل — اضغط للإيقاف', 'Active — Click to Pause')
                  : t('متوقف — اضغط للتفعيل', 'Paused — Click to Enable')}
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Power className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>
                    {t('استقبال الحجوزات وطلبات الإيجار', 'Allow New Bookings & Requests')}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {platformSettings.allowNewBookings
                    ? t(
                        'بوابة الحجز والضمان مفتوحة حالياً لجميع المستأجرين.',
                        'Escrow checkout and rental requests are open.'
                      )
                    : t(
                        'متوقف مؤقتاً بأمر الإدارة — لا يمكن إتمام حجوزات جديدة حالياً.',
                        'Paused by Admin — checkout is temporarily locked.'
                      )}
                </p>
              </div>
              <button
                type="button"
                disabled={savingSettings}
                onClick={() => {
                  const nextVal = !platformSettings.allowNewBookings;
                  void writePlatformConfig(
                    { allowNewBookings: nextVal },
                    nextVal
                      ? t('تم فتح الحجوزات وطلبات الإيجار فوراً.', 'Bookings enabled.')
                      : t('تم إيقاف الحجوزات الجديدة مؤقتاً.', 'Bookings paused.'),
                    {
                      actionType: 'settings_change',
                      severity: 'warning',
                      targetType: 'platform_settings',
                      targetId: 'allowNewBookings',
                      targetLabel: 'مفتاح استقبال الحجوزات / New Bookings Switch',
                      summaryAr: nextVal
                        ? 'تفعيل استقبال الحجوزات وطلبات الإيجار بالضمان'
                        : 'إيقاف استقبال الحجوزات وطلبات الإيجار الجديدة مؤقتاً',
                      summaryEn: nextVal
                        ? 'Enabled escrow bookings and rental requests'
                        : 'Temporarily paused new escrow bookings and rental requests',
                      previousValue: platformSettings.allowNewBookings
                        ? 'مُفعّل / Active'
                        : 'متوقف / Paused',
                      newValue: nextVal ? 'مُفعّل / Active' : 'متوقف / Paused',
                    }
                  );
                }}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap shrink-0 ${
                  platformSettings.allowNewBookings
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                    : 'bg-rose-600 hover:bg-rose-700 text-white border-rose-600'
                }`}
              >
                {platformSettings.allowNewBookings
                  ? t('مُفعّل — اضغط للإيقاف', 'Active — Click to Pause')
                  : t('متوقف — اضغط للتفعيل', 'Paused — Click to Enable')}
              </button>
            </div>
          </div>

          {/* Comprehensive Form: Per-Category Commissions %, Base %, Service Fee %, Discount %, FX Rates & Broadcast Banner */}
          <form
            onSubmit={(e) => void handleSaveAllRatesAndSettings(e)}
            className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-6"
          >
            {/* 1A. Per-Category Independent Commission Matrix */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    {t(
                      '1. نسب العمولة المستقلة لكل تصنيف عقاري (تحكم مخصص لكل قسم)',
                      '1. Independent Per-Category Brokerage Commission Rates'
                    )}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t(
                      'حدّد نسبة مئوية مستقلة لكل قسم (شقة عائلية، منزل كامل، غرفة فندقية، مصنع، سكن طلاب)؛ تُطبّق النسبة تلقائياً على جميع وحدات القسم وعلى إجمالي عقد المنزل الكامل.',
                      'Assign a dedicated commission percentage to each property sector; automatically applied to all units in that sector and whole-house contracts.'
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleApplyBaseCommissionToAllCategories}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    {t(
                      `تعميم النسبة الافتراضية (${commissionText || '10'}%) على كل الأقسام`,
                      `Apply Base (${commissionText || '10'}%) to All Sectors`
                    )}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                {[
                  {
                    key: 'family_apartment' as const,
                    title: categoryLabel('family_apartment'),
                    sub: t('وحدات سكنية وعائلية', 'Residential flats'),
                    sampleRent: 15000,
                    val: familyCommissionText,
                    set: setFamilyCommissionText,
                    savedVal: getCategoryCommissionPct('family_apartment', platformSettings),
                  },
                  {
                    key: 'whole_house' as const,
                    title: categoryLabel('whole_house'),
                    sub: t('تُطبّق على إجمالي عقد البيت كله', 'Applied to whole-house contract'),
                    sampleRent: 85000,
                    val: wholeHouseCommissionText,
                    set: setWholeHouseCommissionText,
                    savedVal: getCategoryCommissionPct('whole_house', platformSettings),
                  },
                  {
                    key: 'hotel_room' as const,
                    title: categoryLabel('hotel_room'),
                    sub: t('أجنحة وغرف يومية/شهرية', 'Daily & monthly suites'),
                    sampleRent: 12000,
                    val: hotelCommissionText,
                    set: setHotelCommissionText,
                    savedVal: getCategoryCommissionPct('hotel_room', platformSettings),
                  },
                  {
                    key: 'industrial_factory' as const,
                    title: categoryLabel('industrial_factory'),
                    sub: t('مصانع ومنشآت تشغيلية', 'Industrial & warehouses'),
                    sampleRent: 120000,
                    val: factoryCommissionText,
                    set: setFactoryCommissionText,
                    savedVal: getCategoryCommissionPct('industrial_factory', platformSettings),
                  },
                  {
                    key: 'student_housing' as const,
                    title: categoryLabel('student_housing'),
                    sub: t('سكن طلابي وسراير جامعية', 'Student beds & units'),
                    sampleRent: 4000,
                    val: studentCommissionText,
                    set: setStudentCommissionText,
                    savedVal: getCategoryCommissionPct('student_housing', platformSettings),
                  },
                ].map((catItem) => {
                  const numericPct = Math.max(
                    1,
                    Math.min(50, Math.round(Number(catItem.val) || catItem.savedVal))
                  );
                  const sampleFee = Math.round((catItem.sampleRent * numericPct) / 100);
                  return (
                    <div
                      key={catItem.key}
                      className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-0.5">
                        <label className="block text-sm font-bold text-slate-900">
                          {catItem.title}
                        </label>
                        <p className="text-[11px] text-slate-500">{catItem.sub}</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            inputMode="numeric"
                            dir="ltr"
                            aria-label={`${catItem.title} %`}
                            value={catItem.val}
                            onKeyDown={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              catItem.set(normalizeNumericInput(e.target.value).slice(0, 2))
                            }
                            onBlur={() => {
                              if (!catItem.val.trim()) {
                                catItem.set(String(catItem.savedVal));
                              }
                            }}
                            className="w-20 px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-base font-bold font-mono tabular-nums text-center text-slate-900"
                          />
                          <span className="text-sm font-bold text-blue-700">%</span>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {[5, 8, 10, 12, 15].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => catItem.set(String(preset))}
                              className={`px-2 py-0.5 rounded text-[11px] font-mono tabular-nums font-semibold border transition-colors ${
                                Number(catItem.val) === preset
                                  ? 'bg-blue-700 text-white border-blue-700'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {preset}%
                            </button>
                          ))}
                        </div>

                        <div className="pt-1 border-t border-slate-200/80 text-[11px] text-slate-500 font-mono tabular-nums">
                          {t('مثال عقد', 'Sample')} {formatNumber(catItem.sampleRent)} →{' '}
                          <span className="font-bold text-slate-800">
                            {formatNumber(sampleFee)} {t('ج.م', 'EGP')}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Base Fallback Commission, Promotional Discount & Escrow Protection Fee */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    {t(
                      'النسبة المرجعية الافتراضية للمنصة (1% - 50%)',
                      'Default Fallback Commission % (1 - 50)'
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      value={commissionText}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setCommissionText(normalizeNumericInput(e.target.value).slice(0, 2))
                      }
                      onBlur={() => {
                        if (!commissionText.trim()) {
                          setCommissionText(String(platformSettings.commissionRatePct));
                        }
                      }}
                      className="w-24 px-3 py-2 bg-white border border-slate-300 rounded-lg text-lg font-bold font-mono tabular-nums text-center"
                    />
                    <span className="text-sm font-bold text-blue-700">%</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[5, 8, 10, 12, 15, 20].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setCommissionText(String(preset))}
                        className={`px-2.5 py-1 rounded-md text-xs font-mono tabular-nums font-bold border ${
                          Number(commissionText) === preset
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {preset}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    {t(
                      'نسبة خصم ترويجي عام للمستأجرين (0% - 50%)',
                      'Global Tenant Promotional Discount % (0 - 50)'
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      dir="ltr"
                      value={discountText}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setDiscountText(normalizeNumericInput(e.target.value, true).slice(0, 5))
                      }
                      onBlur={() => {
                        if (!discountText.trim()) setDiscountText('0');
                      }}
                      className="w-24 px-3 py-2 bg-white border border-slate-300 rounded-lg text-lg font-bold font-mono tabular-nums text-center"
                    />
                    <span className="text-sm font-bold text-emerald-700">%</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {t(
                      'عند وضع نسبة أكبر من 0% يظهر شريط العرض الترويجي وقيمة الوفر فوراً للمستخدمين.',
                      'When > 0%, displays a live promotional discount notice on user screens.'
                    )}
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    {t(
                      'نسبة رسوم خدمة حماية الضمان (0% - 25%)',
                      'Escrow Protection Service Fee % (0 - 25)'
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      dir="ltr"
                      value={escrowFeeText}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setEscrowFeeText(normalizeNumericInput(e.target.value, true).slice(0, 5))
                      }
                      onBlur={() => {
                        if (!escrowFeeText.trim()) setEscrowFeeText('0');
                      }}
                      className="w-24 px-3 py-2 bg-white border border-slate-300 rounded-lg text-lg font-bold font-mono tabular-nums text-center"
                    />
                    <span className="text-sm font-bold text-slate-700">%</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {t(
                      'تظهر ضمن ملخص الرسوم المعتمدة في بوابة الدفع والضمان (0% = مجاناً).',
                      'Shown in checkout fee breakdown (0% = waived).'
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Live Multi-Currency Exchange Rates */}
            <div className="pt-5 border-t border-slate-200 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    {t(
                      '2. التحكم في أسعار صرف العملات مقابل الجنيه المصري (تحديث لحظي)',
                      '2. Live Foreign Currency Exchange Rates to EGP'
                    )}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {t(
                      'يُطبّق فوراً عند تسعير الوحدات أو الدفع بالدولار أو الريال أو اليورو أو الدرهم.',
                      'Immediately updates multi-currency conversions in Listing Wizard & Checkout.'
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetFxToMarketDefaults}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t('استعادة السعر المرجعي', 'Reset Default FX')}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {
                    code: 'USD',
                    label: t('الدولار الأمريكي ($)', 'US Dollar (USD)'),
                    val: usdRateText,
                    set: setUsdRateText,
                  },
                  {
                    code: 'SAR',
                    label: t('الريال السعودي (ر.س)', 'Saudi Riyal (SAR)'),
                    val: sarRateText,
                    set: setSarRateText,
                  },
                  {
                    code: 'EUR',
                    label: t('اليورو الأوروبي (€)', 'Euro (EUR)'),
                    val: eurRateText,
                    set: setEurRateText,
                  },
                  {
                    code: 'AED',
                    label: t('الدرهم الإماراتي (د.إ)', 'UAE Dirham (AED)'),
                    val: aedRateText,
                    set: setAedRateText,
                  },
                ].map((fx) => (
                  <div
                    key={fx.code}
                    className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5"
                  >
                    <label className="block text-xs font-bold text-slate-700">{fx.label}</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        dir="ltr"
                        value={fx.val}
                        onKeyDown={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          fx.set(normalizeNumericInput(e.target.value, true).slice(0, 7))
                        }
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold font-mono tabular-nums text-start"
                      />
                      <span className="text-xs font-semibold text-slate-500 shrink-0">
                        {t('ج.م', 'EGP')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Global Broadcast Announcement Banner */}
            <div className="pt-5 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-900">
                  <Megaphone className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>
                    {t(
                      '3. رسالة بث وتنبيه مباشر أعلى صفحة جميع المستخدمين',
                      '3. Global Live Broadcast Banner on User Pages'
                    )}
                  </span>
                </div>
                {announcementInput.trim() !== '' && (
                  <button
                    type="button"
                    onClick={() => setAnnouncementInput('')}
                    className="text-xs font-semibold text-rose-700 hover:text-rose-900"
                  >
                    {t('مسح الرسالة', 'Clear Banner')}
                  </button>
                )}
              </div>
              <input
                type="text"
                maxLength={300}
                placeholder={t(
                  'اكتب أي تنبيه أو عرض عام ليظهر في نفس اللحظة أعلى شاشة كل مستخدم (اتركه فارغاً لإخفاء الشريط)...',
                  'Type a live announcement for all visitors (leave empty to hide)...'
                )}
                value={announcementInput}
                onChange={(e) => setAnnouncementInput(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900"
              />
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                {t(
                  'مزامنة فورية عبر السحابة لجميع المتصفحات والهواتف المفتوحة الآن.',
                  'Zero-reload real-time cloud propagation.'
                )}
              </span>
              <button
                type="submit"
                disabled={savingSettings}
                className="px-6 py-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs sm:text-sm font-bold rounded-xl transition-colors"
              >
                {savingSettings
                  ? t('جاري الحفظ والتعميم الفوري...', 'Applying Globally...')
                  : t(
                      'اعتماد وتعميم جميع النسب والإعدادات الآن',
                      'Save & Broadcast All Changes Live'
                    )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 2: FULL LISTINGS / ADS CONTROL (EDIT, HIDE, DELETE, BAN)      */}
      {/* ===================================================================== */}
      {activeSection === 'listings_control' && (
        <div className="space-y-5">
          {/* Isolated Legal Dossier Drawer */}
          {inspectedDossier && (
            <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">
                  {t('خزينة مستندات الملكية المعزولة', 'Isolated Legal Ownership Dossier')}
                </h3>
                <button
                  type="button"
                  onClick={() => setInspectedDossier(null)}
                  className="text-xs text-slate-300 hover:text-white"
                >
                  {t('إغلاق', 'Close')}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                <div>
                  <span className="text-slate-400 block font-sans">
                    {t('الرقم القومي للمالك', 'National ID')}
                  </span>
                  {inspectedDossier.nationalIdNumber}
                </div>
                <div>
                  <span className="text-slate-400 block font-sans">
                    {t('هاتف المالك', 'Phone')}
                  </span>
                  {inspectedDossier.ownerPhone}
                </div>
                <div>
                  <span className="text-slate-400 block font-sans">
                    {t('رقم التسجيل العقاري', 'Registry No.')}
                  </span>
                  {inspectedDossier.propertyRegistryNumber}
                </div>
                <div className="sm:col-span-2 font-sans">
                  <span className="text-slate-400 block">
                    {t('العنوان التفصيلي', 'Exact Address')}
                  </span>
                  {inspectedDossier.exactAddress}
                </div>
                <div>
                  <span className="text-slate-400 block font-sans">
                    {t('التوقيع الرقمي', 'Digital Signature')}
                  </span>
                  {inspectedDossier.digitalSignatureName}
                </div>
              </div>
            </div>
          )}

          {/* Search & Sector/Status Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5" />
              <input
                type="text"
                value={listingSearch}
                onChange={(e) => setListingSearch(e.target.value)}
                placeholder={t(
                  'ابحث بعنوان الإعلان، المحافظة، الحي، اسم المالك، أو الكود...',
                  'Search by ad title, governorate, district, owner name, or ID...'
                )}
                className="w-full ps-10 pe-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {(
                [
                  { id: 'all', label: t('كل الإعلانات', 'All Ads') },
                  { id: 'verified', label: t('المعروضة حالياً', 'Live Verified') },
                  { id: 'pending_review', label: t('قيد المراجعة', 'Pending') },
                  { id: 'rejected', label: t('المخفية / المرفوضة', 'Hidden / Rejected') },
                  { id: 'family_apartment', label: categoryLabel('family_apartment') },
                  { id: 'whole_house', label: categoryLabel('whole_house') },
                  { id: 'hotel_room', label: categoryLabel('hotel_room') },
                  { id: 'industrial_factory', label: categoryLabel('industrial_factory') },
                  { id: 'student_housing', label: categoryLabel('student_housing') },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setListingFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                    listingFilter === f.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Listings List */}
          {filteredListings.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-500">
              {t('لا توجد إعلانات مطابقة للبحث الحالي.', 'No listings match the current filter.')}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredListings.map((apt) => {
                const ownerBanned = bannedMap.has(apt.ownerId);
                const isEditing = editDraft?.id === apt.id;
                const isConfirmingDelete = confirmDeleteAptId === apt.id;
                const canBanOwner =
                  apt.ownerId !== currentUser.uid && apt.ownerId !== 'showcase_owner';
                const sectorCommissionPct = getCategoryCommissionPct(
                  apt.category,
                  platformSettings
                );

                return (
                  <div
                    key={apt.id}
                    className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                          <span className="font-semibold text-blue-700">
                            {categoryLabel(apt.category)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {govLabel(apt.governorate)} — {apt.district}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{apt.ownerDisplayName}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`font-semibold ${
                              ownerBanned
                                ? 'text-rose-700'
                                : apt.verificationStatus === 'verified'
                                  ? 'text-emerald-700'
                                  : apt.verificationStatus === 'pending_review'
                                    ? 'text-amber-700'
                                    : 'text-rose-700'
                            }`}
                          >
                            {ownerBanned
                              ? t('مخفي (المالك محظور)', 'Hidden (Owner Banned)')
                              : apt.verificationStatus === 'verified'
                                ? t('منشور على الخريطة', 'Live on Map')
                                : apt.verificationStatus === 'pending_review'
                                  ? t('قيد المراجعة', 'Pending Review')
                                  : t('مخفي / مرفوض', 'Hidden / Rejected')}
                          </span>
                        </div>

                        <h4 className="text-sm sm:text-base font-bold text-slate-900">
                          {apt.title}
                        </h4>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono tabular-nums text-slate-700">
                          <span className="font-bold text-blue-700">
                            {formatNumber(apt.monthlyRentEgp)} {t('ج.م / شهر', 'EGP / mo')}
                          </span>
                          {apt.dailyRateEgp > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>
                                {formatNumber(apt.dailyRateEgp)} {t('ج.م / يوم', 'EGP / day')}
                              </span>
                            </>
                          )}
                          {apt.category === 'whole_house' &&
                            (apt.houseApartmentsCount || 0) > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-teal-700 font-semibold">
                                  {formatNumber(apt.houseApartmentsCount || 1)}{' '}
                                  {t('شقق بالمنزل', 'apts in house')}
                                </span>
                              </>
                            )}
                          {apt.studentBedsCount > 0 && apt.studentPricePerBedEgp > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>
                                {formatNumber(apt.studentPricePerBedEgp)}{' '}
                                {t('ج.م / سرير', 'EGP / bed')} ({apt.studentBedsCount})
                              </span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-600">
                            {t('عمولة القسم:', 'Sector Fee:')} {formatNumber(sectorCommissionPct)}%
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-400">ID: {apt.id}</span>
                        </div>
                      </div>

                      {/* Action Toolbar */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            isEditing ? setEditDraft(null) : handleStartEditListing(apt)
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-blue-700" />
                          <span>{isEditing ? t('إغلاق التعديل', 'Cancel Edit') : t('تعديل السعر/الإعلان', 'Edit Ad')}</span>
                        </button>

                        {apt.isPersistedInDb && (
                          <button
                            type="button"
                            onClick={() => void handleInspectDossier(apt.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                          >
                            <FileSearch className="w-3.5 h-3.5" />
                            <span>{t('الملكية', 'Dossier')}</span>
                          </button>
                        )}

                        {apt.verificationStatus !== 'verified' ? (
                          <button
                            type="button"
                            disabled={savingListingId === apt.id}
                            onClick={() => void handleApartmentDecision(apt, 'verified')}
                            className="inline-flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold whitespace-nowrap"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{t('إظهار واعتماد', 'Publish')}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={savingListingId === apt.id}
                            onClick={() => void handleApartmentDecision(apt, 'rejected')}
                            className="inline-flex items-center gap-1 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold whitespace-nowrap"
                          >
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>{t('إخفاء مؤقت', 'Hide')}</span>
                          </button>
                        )}

                        {canBanOwner && !ownerBanned && (
                          <button
                            type="button"
                            onClick={() =>
                              setQuickBanTarget({
                                userId: apt.ownerId,
                                displayName: apt.ownerDisplayName,
                              })
                            }
                            className="inline-flex items-center gap-1 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-lg text-xs font-bold whitespace-nowrap"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>{t('حظر المالك', 'Ban Owner')}</span>
                          </button>
                        )}

                        {!isConfirmingDelete ? (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteAptId(apt.id)}
                            className="inline-flex items-center gap-1 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{t('حذف الإعلان', 'Delete Ad')}</span>
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-300 rounded-lg p-1">
                            <button
                              type="button"
                              disabled={savingListingId === apt.id}
                              onClick={() => void handlePermanentDeleteListing(apt)}
                              className="px-2.5 py-1 bg-rose-700 hover:bg-rose-800 text-white rounded-md text-xs font-bold whitespace-nowrap"
                            >
                              {t('تأكيد الحذف النهائي', 'Confirm Delete')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteAptId(null)}
                              className="px-2 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 whitespace-nowrap"
                            >
                              {t('تراجع', 'Cancel')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Inline Live Editor for Title, Classification, Furnishing & Prices */}
                    {isEditing && editDraft && (
                      <div className="pt-4 border-t border-slate-200 bg-slate-50 rounded-xl p-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              {t('عنوان الإعلان', 'Listing Title')}
                            </label>
                            <input
                              type="text"
                              value={editDraft.title}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, title: e.target.value })
                              }
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              {t('تصنيف الوحدة', 'Classification')}
                            </label>
                            <select
                              value={editDraft.category}
                              onChange={(e) => {
                                const nextCat = e.target.value as ListingCategory;
                                setEditDraft({
                                  ...editDraft,
                                  category: nextCat,
                                  billingMode:
                                    nextCat === 'hotel_room'
                                      ? 'daily_or_monthly'
                                      : nextCat === 'whole_house'
                                        ? editDraft.billingMode
                                        : 'monthly_only',
                                });
                              }}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm"
                            >
                              <option value="family_apartment">
                                {categoryLabel('family_apartment')}
                              </option>
                              <option value="whole_house">{categoryLabel('whole_house')}</option>
                              <option value="hotel_room">{categoryLabel('hotel_room')}</option>
                              <option value="industrial_factory">
                                {categoryLabel('industrial_factory')}
                              </option>
                              <option value="student_housing">
                                {categoryLabel('student_housing')}
                              </option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              {t('مستوى الفرش', 'Furnishing')}
                            </label>
                            <select
                              value={editDraft.furnishing}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  furnishing: e.target.value as FurnishingType,
                                })
                              }
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm"
                            >
                              <option value="furnished">{furnishingLabel('furnished')}</option>
                              <option value="semi_furnished">
                                {furnishingLabel('semi_furnished')}
                              </option>
                              <option value="unfurnished">{furnishingLabel('unfurnished')}</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              {t('الإيجار الشهري (ج.م)', 'Monthly Rent (EGP)')}
                            </label>
                            <input
                              type="text"
                              inputMode="numeric"
                              dir="ltr"
                              value={editDraft.monthlyRentText}
                              onKeyDown={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  monthlyRentText: normalizeNumericInput(e.target.value),
                                })
                              }
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm font-mono tabular-nums"
                            />
                          </div>

                          {editDraft.category === 'whole_house' && (
                            <>
                              <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                  {t('عدد الشقق داخل المنزل', 'Apartments in House')}
                                </label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  dir="ltr"
                                  value={editDraft.houseApartmentsCountText}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    setEditDraft({
                                      ...editDraft,
                                      houseApartmentsCountText: normalizeNumericInput(
                                        e.target.value
                                      ).slice(0, 2),
                                    })
                                  }
                                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm font-mono tabular-nums"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                  {t('عدد الأدوار', 'Building Floors')}
                                </label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  dir="ltr"
                                  value={editDraft.houseFloorsCountText}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    setEditDraft({
                                      ...editDraft,
                                      houseFloorsCountText: normalizeNumericInput(
                                        e.target.value
                                      ).slice(0, 2),
                                    })
                                  }
                                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm font-mono tabular-nums"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                  {t('نظام التعاقد للمنزل', 'House Billing Mode')}
                                </label>
                                <select
                                  value={editDraft.billingMode}
                                  onChange={(e) =>
                                    setEditDraft({
                                      ...editDraft,
                                      billingMode: e.target.value as BillingMode,
                                    })
                                  }
                                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm"
                                >
                                  <option value="monthly_only">
                                    {t('إيجار شهري فقط', 'Monthly Only')}
                                  </option>
                                  <option value="daily_or_monthly">
                                    {t('شهري أو يومي', 'Daily or Monthly')}
                                  </option>
                                </select>
                              </div>
                            </>
                          )}

                          {(editDraft.category === 'hotel_room' ||
                            (editDraft.category === 'whole_house' &&
                              editDraft.billingMode === 'daily_or_monthly')) && (
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                {t('السعر اليومي بالليلة (ج.م)', 'Daily Rate (EGP)')}
                              </label>
                              <input
                                type="text"
                                inputMode="numeric"
                                dir="ltr"
                                value={editDraft.dailyRateText}
                                onKeyDown={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    dailyRateText: normalizeNumericInput(e.target.value),
                                  })
                                }
                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm font-mono tabular-nums"
                              />
                            </div>
                          )}

                          {editDraft.category === 'student_housing' && (
                            <>
                              <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                  {t('عدد السراير الطلابية', 'Student Beds')}
                                </label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  dir="ltr"
                                  value={editDraft.studentBedsText}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    setEditDraft({
                                      ...editDraft,
                                      studentBedsText: normalizeNumericInput(e.target.value).slice(
                                        0,
                                        2
                                      ),
                                    })
                                  }
                                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm font-mono tabular-nums"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                  {t('سعر السرير شهرياً (ج.م)', 'Price / Bed (EGP)')}
                                </label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  dir="ltr"
                                  value={editDraft.studentBedPriceText}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    setEditDraft({
                                      ...editDraft,
                                      studentBedPriceText: normalizeNumericInput(e.target.value),
                                    })
                                  }
                                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm font-mono tabular-nums"
                                />
                              </div>
                            </>
                          )}
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditDraft(null)}
                            className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                          >
                            {t('إلغاء', 'Cancel')}
                          </button>
                          <button
                            type="button"
                            disabled={savingListingId === apt.id}
                            onClick={() => void handleSaveEditedListing(apt)}
                            className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold"
                          >
                            {savingListingId === apt.id
                              ? t('جاري التحديث...', 'Saving...')
                              : t(
                                  'حفظ التعديل وتحديث صفحة المستخدمين فوراً',
                                  'Save & Update Live'
                                )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Removed Showcase Ads Tray (1-Click Restore) */}
          {removedShowcaseUnits.length > 0 && (
            <div className="bg-slate-100 border border-slate-200 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                {t(
                  `إعلانات نموذجية محذوفة من الخريطة (${formatNumber(removedShowcaseUnits.length)})`,
                  `Removed Showcase Listings (${formatNumber(removedShowcaseUnits.length)})`
                )}
              </h3>
              <div className="space-y-2">
                {removedShowcaseUnits.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="font-semibold text-slate-700 truncate">{item.title}</span>
                    <button
                      type="button"
                      onClick={() => void handleRestoreShowcaseUnit(item.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg font-bold whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{t('استعادة للخريطة', 'Restore')}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 3: USERS DIRECTORY, BANS & KYC IDENTITY VERIFICATION          */}
      {/* ===================================================================== */}
      {activeSection === 'users_and_bans' && (
        <div className="space-y-6">
          {/* Private KYC Inspector */}
          {inspectedKyc && (
            <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">
                  {t('بيانات التحقق من هوية المستأجر (KYC)', 'Private Tenant KYC Record')}
                </h3>
                <button
                  type="button"
                  onClick={() => setInspectedKyc(null)}
                  className="text-xs text-slate-300 hover:text-white"
                >
                  {t('إغلاق', 'Close')}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block">
                    {t('الاسم القانوني الكامل', 'Full Legal Name')}
                  </span>
                  {inspectedKyc.fullLegalName}
                </div>
                <div className="font-mono">
                  <span className="text-slate-400 block font-sans">
                    {t('الرقم القومي', 'National ID')}
                  </span>
                  {inspectedKyc.nationalIdNumber}
                </div>
                <div className="font-mono">
                  <span className="text-slate-400 block font-sans">
                    {t('رقم الهاتف', 'Mobile')}
                  </span>
                  {inspectedKyc.tenantPhone}
                </div>
                <div>
                  <span className="text-slate-400 block">
                    {t('الجامعة / جهة العمل', 'University / Employer')}
                  </span>
                  {inspectedKyc.occupationOrUniversity}
                </div>
              </div>
            </div>
          )}

          {/* Direct User Ban Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void executeBanUser(manualBanUid, manualBanName, manualBanReason);
            }}
            className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
          >
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {t(
                  'حظر مستخدم مزعج أو مخالف فوراً (منع النشر والحجز + إخفاء إعلاناته)',
                  'Ban Disruptive User Immediately (Block Actions & Hide Ads)'
                )}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t(
                  'يمكنك حظر أي مستخدم مباشرة من القائمة بالأسفل بنقرة واحدة، أو إدخال معرّف الحساب (UID) يدوياً هنا.',
                  'Ban any user with 1 click from the directory below, or enter their UID manually here.'
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('معرّف المستخدم (UID)', 'User UID')}
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={manualBanUid}
                  onChange={(e) => setManualBanUid(e.target.value)}
                  placeholder="uid_..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('اسم المستخدم للتوضيح', 'Display Name')}
                </label>
                <input
                  type="text"
                  required
                  value={manualBanName}
                  onChange={(e) => setManualBanName(e.target.value)}
                  placeholder={t('اسم صاحب الحساب', 'User Name')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                />
              </div>
              <div className="sm:col-span-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('سبب الحظر', 'Ban Reason')}
                </label>
                <input
                  type="text"
                  required
                  value={manualBanReason}
                  onChange={(e) => setManualBanReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={submittingBan}
                  className="w-full py-2.5 px-4 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
                >
                  {t('حظر الحساب', 'Ban User')}
                </button>
              </div>
            </div>
          </form>

          {/* Active Banned Users List */}
          {allBannedUsers.length > 0 && (
            <div className="bg-rose-50/60 border border-rose-200 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-rose-950">
                {t(
                  `الحسابات المحظورة حالياً (${formatNumber(allBannedUsers.length)})`,
                  `Currently Banned Accounts (${formatNumber(allBannedUsers.length)})`
                )}
              </h3>
              <div className="space-y-2.5">
                {allBannedUsers.map((bu) => (
                  <div
                    key={bu.userId}
                    className="bg-white border border-rose-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-slate-900">
                        {bu.displayName}{' '}
                        <span className="text-xs font-mono font-normal text-slate-400">
                          ({bu.userId})
                        </span>
                      </div>
                      <div className="text-xs text-rose-800">
                        {t('السبب:', 'Reason:')} {bu.reason} · {formatTimeAgo(bu.updatedAtMs)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleUnbanUser(bu.userId, bu.displayName)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg whitespace-nowrap shrink-0"
                    >
                      {t('فك الحظر وإعادة التفعيل', 'Unban User')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unified Platform Users Directory & KYC Queue */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  {t(
                    'دليل مستخدمي المنصة وطلبات توثيق الهوية (KYC)',
                    'Platform Users Directory & KYC Verification Queue'
                  )}
                </h3>
                <p className="text-xs text-slate-500">
                  {t(
                    'جميع الملاك والمستأجرين المتفاعلين على المنصة مع تحكم مباشر في التوثيق أو الحظر.',
                    'All landlords, tenants, and reviewers with 1-click KYC approval or account ban.'
                  )}
                </p>
              </div>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder={t('بحث باسم المستخدم أو UID...', 'Search user or UID...')}
                className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs w-full sm:w-64"
              />
            </div>

            {unifiedUsers.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                {t('لا يوجد مستخدمون مسجلون مطابقون حالياً.', 'No matching users yet.')}
              </div>
            ) : (
              <div className="space-y-3">
                {unifiedUsers.map((u) => {
                  const isSelfAdmin = u.userId === currentUser.uid;
                  const banRec = bannedMap.get(u.userId);
                  return (
                    <div
                      key={u.userId}
                      className="border border-slate-200 rounded-xl p-4 space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-xs text-slate-500">
                            {Array.from(u.roles).join(' · ')}
                            {' · '}
                            <span className="font-mono">{u.userId}</span>
                          </div>
                          <div className="text-sm font-bold text-slate-900">
                            {u.displayName}
                            {isSelfAdmin && (
                              <span className="ms-2 text-xs font-semibold text-blue-700">
                                ({t('حساب صاحب الموقع', 'Site Owner')})
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-mono tabular-nums text-slate-600">
                            {formatNumber(u.listingsCount)} {t('إعلانات', 'ads')} ·{' '}
                            {formatNumber(u.bookingsCount)} {t('عقود', 'contracts')} ·{' '}
                            {formatNumber(u.requestsCount)} {t('طلبات', 'requests')} ·{' '}
                            {formatNumber(u.reviewsCount)} {t('تقييمات', 'reviews')}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {u.kycRecord && (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleInspectTenantKyc(u.userId)}
                                className="inline-flex items-center gap-1 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                <FileSearch className="w-3.5 h-3.5" />
                                <span>
                                  {t('هوية KYC', 'Inspect KYC')} (
                                  {tenantCategoryLabel(u.kycRecord.tenantCategory)})
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleTenantKycDecision(u.userId, 'verified')}
                                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
                              >
                                {t('اعتماد الهوية', 'Approve KYC')}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleTenantKycDecision(u.userId, 'rejected')}
                                className="px-3 py-2 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold"
                              >
                                {t('رفض الهوية', 'Reject KYC')}
                              </button>
                            </>
                          )}

                          {!isSelfAdmin &&
                            (banRec ? (
                              <button
                                type="button"
                                onClick={() => void handleUnbanUser(u.userId, u.displayName)}
                                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
                              >
                                {t('فك الحظر', 'Unban')}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setQuickBanTarget({
                                    userId: u.userId,
                                    displayName: u.displayName,
                                  })
                                }
                                className="inline-flex items-center gap-1 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>{t('حظر المستخدم', 'Ban User')}</span>
                              </button>
                            ))}
                        </div>
                      </div>

                      {u.kycRecord && (
                        <input
                          type="text"
                          placeholder={t(
                            'ملاحظة الإدارة للمستأجر بخصوص الهوية (اختياري)...',
                            'Optional KYC review note...'
                          )}
                          value={kycReviewNotes[u.userId] ?? u.kycRecord.reviewNote}
                          onChange={(e) =>
                            setKycReviewNotes((prev) => ({
                              ...prev,
                              [u.userId]: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 4: REVIEWS, PRIVACY CHAT VIOLATIONS & ESCROW CONTRACTS        */}
      {/* ===================================================================== */}
      {activeSection === 'moderation_and_contracts' && (
        <div className="space-y-6">
          {/* 0. Privacy-Gated Chat & Anti-Circumvention Moderation */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <MessageSquareLock className="w-4 h-4 text-blue-700" />
                  <h2 className="text-base font-bold text-slate-900">
                    {t(
                      `مراقبة الشات ومخالفات الخصوصية (${formatNumber(allChatThreads.length)})`,
                      `Privacy Chat & Anti-Circumvention Monitor (${formatNumber(allChatThreads.length)})`
                    )}
                  </h2>
                </div>
                <p className="text-xs text-slate-500">
                  {t(
                    'رصد محاولات كتابة أرقام الهواتف أو التحايل قبل سداد نسبة الموقع، مع إمكانية الحظر الفوري أو إعادة تفعيل المحادثة.',
                    'Monitors off-platform phone-number leaks prior to site commission settlement with instant violator ban controls.'
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                <span className="text-rose-700 font-bold">
                  {t('مخالفة / معلقة:', 'Violations:')}{' '}
                  {formatNumber(
                    allChatThreads.filter(
                      (c) =>
                        c.status === 'flagged_violation' ||
                        c.tenantViolationCount > 0 ||
                        c.landlordViolationCount > 0
                    ).length
                  )}
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-700 font-bold">
                  {t('مفتوحة (مدفوعة):', 'Unlocked:')}{' '}
                  {formatNumber(allChatThreads.filter((c) => c.commissionPaid).length)}
                </span>
              </div>
            </div>

            {allChatThreads.length === 0 ? (
              <p className="text-xs text-slate-500">
                {t('لا توجد محادثات مسجلة بين المستأجرين والملاك حتى الآن.', 'No tenant-landlord chat threads recorded yet.')}
              </p>
            ) : (
              <div className="space-y-3">
                {[...allChatThreads]
                  .sort((a, b) => {
                    const aScore =
                      (a.status === 'flagged_violation' ? 100 : 0) +
                      a.tenantViolationCount +
                      a.landlordViolationCount;
                    const bScore =
                      (b.status === 'flagged_violation' ? 100 : 0) +
                      b.tenantViolationCount +
                      b.landlordViolationCount;
                    if (aScore !== bScore) return bScore - aScore;
                    return b.lastMessageAtMs - a.lastMessageAtMs;
                  })
                  .map((chat) => {
                    const hasStrikes =
                      chat.tenantViolationCount > 0 ||
                      chat.landlordViolationCount > 0 ||
                      chat.status === 'flagged_violation';
                    const offenderUid =
                      chat.lastViolationSenderId ||
                      (chat.landlordViolationCount > chat.tenantViolationCount
                        ? chat.landlordId
                        : chat.tenantId);
                    const offenderName =
                      offenderUid === chat.landlordId
                        ? chat.landlordDisplayName
                        : chat.tenantDisplayName;
                    const canBanOffender =
                      hasStrikes &&
                      offenderUid !== 'showcase_owner' &&
                      offenderUid !== currentUser.uid &&
                      !bannedMap.has(offenderUid);

                    return (
                      <div
                        key={chat.id}
                        className={`border rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                          chat.status === 'flagged_violation'
                            ? 'border-rose-300 bg-rose-50/50'
                            : hasStrikes
                              ? 'border-amber-300 bg-amber-50/40'
                              : 'border-slate-200'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {chat.status === 'flagged_violation' ? (
                              <span className="inline-flex items-center gap-1 font-bold text-rose-700">
                                <ShieldAlert className="w-3.5 h-3.5" />
                                <span>{t('معلقة — تجاوز 3 مخالفات هاتف', 'Flagged — 3 Strikes')}</span>
                              </span>
                            ) : chat.commissionPaid ? (
                              <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                                <Unlock className="w-3.5 h-3.5" />
                                <span>{t('مدفوعة ومفتوحة', 'Commission Paid & Unlocked')}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-bold text-slate-700">
                                <Lock className="w-3.5 h-3.5" />
                                <span>{t('مقيدة قبل السداد', 'Locked Pre-Payment')}</span>
                              </span>
                            )}
                            <span aria-hidden="true">·</span>
                            <span>
                              {t('المستأجر:', 'Tenant:')} <strong>{chat.tenantDisplayName}</strong> (
                              {formatNumber(chat.tenantViolationCount)}/3)
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {t('المالك:', 'Landlord:')} <strong>{chat.landlordDisplayName}</strong> (
                              {formatNumber(chat.landlordViolationCount)}/3)
                            </span>
                          </div>

                          <div className="text-sm font-bold text-slate-900 truncate">
                            {chat.apartmentTitle} · {govLabel(chat.governorate)}
                          </div>

                          <div className="text-xs text-slate-600 truncate">
                            {chat.lastViolationReason
                              ? `${t('آخر تنبيه مخالفة:', 'Last Violation:')} ${chat.lastViolationReason}`
                              : chat.lastMessagePreview}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <span className="text-xs font-mono tabular-nums font-bold text-blue-700">
                            {formatNumber(chat.commissionAmountEgp)} {t('ج.م عمولة', 'EGP fee')}
                          </span>

                          {chat.status === 'flagged_violation' && (
                            <button
                              type="button"
                              onClick={() => {
                                void (async () => {
                                  try {
                                    await updateDoc(doc(db, 'chatThreads', chat.id), {
                                      status: chat.commissionPaid
                                        ? 'unlocked'
                                        : 'restricted_pre_payment',
                                      updatedAt: serverTimestamp(),
                                    });
                                    await logAdminActivity({
                                      actionType: 'moderation_action',
                                      severity: 'info',
                                      targetType: 'user',
                                      targetId: chat.id,
                                      targetLabel: chat.apartmentTitle.slice(0, 120),
                                      summaryAr: `إعادة تفعيل المحادثة المعلقة لوحدة «${chat.apartmentTitle}»`,
                                      summaryEn: `Re-enabled flagged chat thread for "${chat.apartmentTitle}"`,
                                    });
                                    notifySuccess(
                                      t(
                                        'تم فك تجميد المحادثة وإعادة إتاحتها للطرفين.',
                                        'Chat thread unfrozen.'
                                      )
                                    );
                                  } catch (err) {
                                    logFirestoreDiagnostic(
                                      err,
                                      OperationType.UPDATE,
                                      `chatThreads/${chat.id}`
                                    );
                                    setErrorFeedback(
                                      t('تعذر تعديل حالة المحادثة.', 'Could not update chat status.')
                                    );
                                  }
                                })();
                              }}
                              className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-lg text-xs font-semibold"
                            >
                              {t('فك تجميد الشات', 'Unfreeze Chat')}
                            </button>
                          )}

                          {canBanOffender && (
                            <button
                              type="button"
                              disabled={submittingBan}
                              onClick={() =>
                                void executeBanUser(
                                  offenderUid,
                                  offenderName,
                                  chat.lastViolationReason ||
                                    'مخالفة الخصوصية ومحاولة تبادل رقم هاتف للتحايل على نسبة الموقع'
                                )
                              }
                              className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-bold"
                            >
                              {t('حظر المخالف فوراً', 'Ban Offender Now')}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* 1. Reviews Moderation */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              {t(
                `مراقبة التقييمات والتعليقات المسجلة (${formatNumber(persistedReviews.length)})`,
                `User Reviews Moderation (${formatNumber(persistedReviews.length)})`
              )}
            </h2>

            {persistedReviews.length === 0 ? (
              <p className="text-xs text-slate-500">
                {t('لا توجد تعليقات مضافة من مستأجرين في السجل حالياً.', 'No user reviews yet.')}
              </p>
            ) : (
              <div className="space-y-3">
                {persistedReviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="text-xs text-slate-500">
                        <span className="font-semibold text-slate-900">
                          {rev.tenantDisplayName}
                        </span>{' '}
                        · {rev.apartmentTitle} ·{' '}
                        <span className="font-mono tabular-nums">{rev.rating}/5</span> ·{' '}
                        <span className="font-semibold">
                          {rev.visibilityStatus === 'published'
                            ? t('منشور', 'Published')
                            : t('مخفي', 'Hidden')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">{rev.comment}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleToggleReviewVisibility(rev)}
                        className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {rev.visibilityStatus === 'published'
                          ? t('إخفاء التعليق', 'Hide')
                          : t('إظهار التعليق', 'Publish')}
                      </button>

                      {rev.tenantId !== currentUser.uid && !bannedMap.has(rev.tenantId) && (
                        <button
                          type="button"
                          onClick={() =>
                            setQuickBanTarget({
                              userId: rev.tenantId,
                              displayName: rev.tenantDisplayName,
                            })
                          }
                          className="px-3 py-1.5 bg-rose-50 text-rose-800 border border-rose-200 rounded-lg text-xs font-bold"
                        >
                          {t('حظر صاحب التعليق', 'Ban Author')}
                        </button>
                      )}

                      {confirmDeleteReviewId !== rev.id ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteReviewId(rev.id)}
                          className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold"
                        >
                          {t('حذف', 'Delete')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleDeleteReview(rev.id)}
                          className="px-3 py-1.5 bg-rose-800 text-white rounded-lg text-xs font-bold"
                        >
                          {t('تأكيد الحذف', 'Confirm')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Rental Requests Governance */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              {t(
                `إدارة طلبات الإيجار (${formatNumber(allRentalRequests.length)})`,
                `Rental Requests Control (${formatNumber(allRentalRequests.length)})`
              )}
            </h2>

            {allRentalRequests.length === 0 ? (
              <p className="text-xs text-slate-500">
                {t('لا توجد طلبات إيجار حالياً.', 'No rental requests found.')}
              </p>
            ) : (
              <div className="space-y-3">
                {allRentalRequests.map((req) => (
                  <div
                    key={req.id}
                    className="border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="text-xs text-slate-500">
                        {req.tenantDisplayName} · {govLabel(req.governorate)} ·{' '}
                        <span className="font-semibold text-slate-800">{req.status}</span>
                      </div>
                      <div className="text-sm font-bold text-slate-900">{req.apartmentTitle}</div>
                      <div className="text-xs font-mono tabular-nums text-blue-700">
                        {formatNumber(req.totalRentEgp)} {t('ج.م إجمالي', 'EGP total')} ·{' '}
                        {t('العمولة:', 'Commission:')} {formatNumber(req.platformCommissionEgp)}{' '}
                        {t('ج.م', 'EGP')}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {req.status === 'pending_approval' && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleAdminUpdateRequestStatus(req, 'awaiting_payment')
                          }
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold"
                        >
                          {t('موافقة وفتح الدفع', 'Approve for Payment')}
                        </button>
                      )}
                      {req.status !== 'cancelled' && req.status !== 'approved' && (
                        <button
                          type="button"
                          onClick={() => void handleAdminUpdateRequestStatus(req, 'cancelled')}
                          className="px-3 py-1.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold"
                        >
                          {t('إلغاء الطلب', 'Cancel Request')}
                        </button>
                      )}
                      {confirmDeleteRequestId !== req.id ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteRequestId(req.id)}
                          className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold"
                        >
                          {t('حذف', 'Delete')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleAdminDeleteRequest(req.id)}
                          className="px-3 py-1.5 bg-rose-800 text-white rounded-lg text-xs font-bold"
                        >
                          {t('تأكيد الحذف', 'Confirm')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Active & Completed Escrow Contracts */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              {t(
                `إدارة عقود الضمان المدفوعة (${formatNumber(allBookings.length)})`,
                `Paid Escrow Contracts (${formatNumber(allBookings.length)})`
              )}
            </h2>

            {allBookings.length === 0 ? (
              <p className="text-xs text-slate-500">
                {t('لا توجد عقود مدفوعة حالياً.', 'No paid escrow bookings yet.')}
              </p>
            ) : (
              <div className="space-y-3">
                {allBookings.map((bk) => (
                  <div
                    key={bk.id}
                    className="border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="text-xs text-slate-500">
                        {bk.tenantDisplayName} · {bk.paymentReference} ·{' '}
                        <span className="font-semibold text-slate-900">{bk.status}</span>
                      </div>
                      <div className="text-sm font-bold text-slate-900">{bk.apartmentTitle}</div>
                      <div className="text-xs font-mono tabular-nums text-emerald-700">
                        {formatNumber(bk.totalRentEgp)} {t('ج.م', 'EGP')} ·{' '}
                        {t('ربح المنصة:', 'Commission:')} {formatNumber(bk.platformCommissionEgp)}{' '}
                        {t('ج.م', 'EGP')}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {bk.status === 'escrow_paid' && (
                        <button
                          type="button"
                          onClick={() => void handleAdminCompleteBooking(bk.id)}
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold"
                        >
                          {t('اعتماد تسليم المفتاح', 'Mark Completed')}
                        </button>
                      )}
                      {confirmDeleteBookingId !== bk.id ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteBookingId(bk.id)}
                          className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold"
                        >
                          {t('حذف السجل', 'Delete')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleAdminDeleteBooking(bk.id)}
                          className="px-3 py-1.5 bg-rose-700 text-white rounded-lg text-xs font-bold"
                        >
                          {t('تأكيد الحذف', 'Confirm')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 6: INTERACTIVE RECHARTS ANALYTICS DASHBOARD                   */}
      {/* ===================================================================== */}
      {activeSection === 'admin_activity_logs' && (
        <AdminActivityLogsSection allAdminActivityLogs={allAdminActivityLogs} />
      )}
      {activeSection === 'dashboard' && (
        <div className="space-y-6">
          {/* Interactive Temporal & Category Filter Control Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-blue-700">
                    {t('تحليل الإيجارات حسب التصنيف العقاري', 'Rental Distribution by Property Category')}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-slate-700">{analytics.activePeriodLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-slate-500">
                    {formatNumber(analytics.timelineData.length)}{' '}
                    {dashboardGranularity === 'daily'
                      ? t('نقطة يومية', 'daily buckets')
                      : dashboardGranularity === 'weekly'
                        ? t('أسابيع', 'weekly buckets')
                        : t('أشهر', 'monthly buckets')}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  {t(
                    'توزيع عقود الإيجار على التصنيفات الخمسة (شقق، منازل، فنادق، مصانع، طلاب)',
                    'Rentals Across All 5 Categories (Apartments, Houses, Hotels, Factories, Student)'
                  )}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {dashboardTimePreset !== 'current_month' && (
                  <button
                    type="button"
                    onClick={() => {
                      handleSelectTimePreset('current_month');
                      setSelectedCategories(ALL_DASHBOARD_CATEGORY_KEYS);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{t('إعادة للشهر الحالي', 'Reset to Current Month')}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleExportDashboardCsv}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('تصدير التقرير CSV', 'Export Report CSV')}</span>
                </button>
              </div>
            </div>

            {/* Row 1: Preset Temporal Filters + Exact Custom Date Range Pickers */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
                {(
                  [
                    { id: 'current_month', label: t('الشهر الحالي', 'Current Month') },
                    { id: 'first_half_month', label: t('النصف الأول (1–15)', 'Days 1–15') },
                    { id: 'second_half_month', label: t('النصف الثاني (16+)', 'Days 16+') },
                    { id: 'last_7_days', label: t('آخر 7 أيام', 'Last 7 Days') },
                    { id: 'last_14_days', label: t('آخر 14 يوماً', 'Last 14 Days') },
                    { id: 'previous_month', label: t('الشهر السابق', 'Prev Month') },
                    { id: 'last_3_months', label: t('آخر 3 أشهر', 'Last 3 Months') },
                    { id: 'all_time', label: t('كل الفترات', 'All Time') },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectTimePreset(preset.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      dashboardTimePreset === preset.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                  <span className="whitespace-nowrap">{t('من', 'From')}</span>
                  <input
                    type="date"
                    dir="ltr"
                    aria-label={t('تاريخ البداية', 'Start date')}
                    value={analytics.effectiveStartInput}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setCustomStartDate(e.target.value);
                      setCustomEndDate(analytics.effectiveEndInput);
                      setDashboardTimePreset('custom');
                    }}
                    className="bg-transparent font-mono tabular-nums text-xs font-semibold text-slate-900 focus:outline-hidden"
                  />
                  <span className="text-slate-400">–</span>
                  <span className="whitespace-nowrap">{t('إلى', 'To')}</span>
                  <input
                    type="date"
                    dir="ltr"
                    aria-label={t('تاريخ النهاية', 'End date')}
                    value={analytics.effectiveEndInput}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setCustomStartDate(analytics.effectiveStartInput);
                      setCustomEndDate(e.target.value);
                      setDashboardTimePreset('custom');
                    }}
                    className="bg-transparent font-mono tabular-nums text-xs font-semibold text-slate-900 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            {/* Row 2: Interactive Category Toggles + Metric, Granularity & Scope Controls */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedCategories(ALL_DASHBOARD_CATEGORY_KEYS)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                    selectedCategories.length === ALL_DASHBOARD_CATEGORY_KEYS.length
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {t('كل التصنيفات (5)', 'All Categories (5)')}
                </button>

                {analytics.categoryBreakdown.map((catItem) => (
                  <button
                    key={catItem.category}
                    type="button"
                    onClick={() => handleToggleDashboardCategory(catItem.category)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                      catItem.isSelected
                        ? catItem.meta.activeBtnClass
                        : 'bg-white text-slate-400 border-slate-200 hover:text-slate-700'
                    }`}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-xs shrink-0 ${
                        catItem.isSelected ? catItem.meta.swatchClass : 'bg-slate-300'
                      }`}
                    />
                    <span>{catItem.shortLabel}</span>
                    <span className="font-mono tabular-nums text-[11px] opacity-80">
                      ({formatNumber(catItem.rawPeriodCount)})
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/* Metric Mode Toggle */}
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                  {(
                    [
                      { id: 'count', label: t('عدد الإيجارات', 'Rentals Count') },
                      { id: 'gross_egp', label: t('قيمة العقود ج.م', 'Volume EGP') },
                      { id: 'commission_egp', label: t('ربح العمولة ج.م', 'Commission EGP') },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setDashboardMetric(m.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        dashboardMetric === m.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Time Granularity Toggle */}
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                  {(
                    [
                      { id: 'daily', label: t('يومي', 'Daily') },
                      { id: 'weekly', label: t('أسبوعي', 'Weekly') },
                      { id: 'monthly', label: t('شهري', 'Monthly') },
                    ] as const
                  ).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setDashboardGranularity(g.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        dashboardGranularity === g.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>

                {/* Record Scope Toggle */}
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setDashboardRecordScope('confirmed_bookings')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      dashboardRecordScope === 'confirmed_bookings'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t('العقود المؤكدة', 'Confirmed Rentals')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDashboardRecordScope('bookings_and_requests')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      dashboardRecordScope === 'bookings_and_requests'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t('شامل طلبات الإيجار', 'Include Requests')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 4-Column Executive KPI Strip Synced to Temporal & Category Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{t('إجمالي الإيجارات بالفترة المحددة', 'Rentals in Selected Period')}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              </div>
              <div className="text-3xl font-bold font-mono tabular-nums text-slate-900">
                {formatNumber(analytics.periodTotalCount)}
              </div>
              <div className="text-xs text-slate-500 font-mono tabular-nums">
                {formatNumber(analytics.periodCompletedCount)} {t('مكتمل', 'completed')} ·{' '}
                {formatNumber(analytics.periodEscrowCount)} {t('بالضمان', 'escrow')}
                {analytics.periodRequestsInScopeCount > 0 && (
                  <>
                    {' '}
                    · {formatNumber(analytics.periodRequestsInScopeCount)}{' '}
                    {t('طلب نشط', 'requests')}
                  </>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{t('قيمة عقود الإيجار بالفترة', 'Period Gross Rental Volume')}</span>
                <BarChart3 className="w-4 h-4 text-blue-700 shrink-0" />
              </div>
              <div className="text-3xl font-bold font-mono tabular-nums text-slate-900">
                {formatNumber(analytics.periodGrossEgp)}{' '}
                <span className="text-sm font-semibold text-slate-500">{t('ج.م', 'EGP')}</span>
              </div>
              <div className="text-xs text-slate-500 font-mono tabular-nums">
                {analytics.deltaCount >= 0 ? '+' : ''}
                {formatNumber(analytics.deltaCount)}{' '}
                {t('عقد مقارنة بالفترة المماثلة السابقة', 'vs. prior equivalent window')}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{t('صافي أرباح العمولة بالفترة', 'Period Platform Commission')}</span>
                <TrendingUp className="w-4 h-4 text-blue-700 shrink-0" />
              </div>
              <div className="text-3xl font-bold font-mono tabular-nums text-blue-700">
                {formatNumber(analytics.periodCommissionEgp)}{' '}
                <span className="text-sm font-semibold">{t('ج.م', 'EGP')}</span>
              </div>
              <div className="text-xs text-slate-500 font-mono tabular-nums">
                {t('متوسط نسبة العمولة المحققة:', 'Effective fee margin:')}{' '}
                {formatNumber(analytics.periodEffectiveMarginPct, 1)}%
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{t('التصنيف الأعلى نشاطاً والمحفظة الحية', 'Leading Category & Live Units')}</span>
                <Building2 className="w-4 h-4 text-teal-700 shrink-0" />
              </div>
              <div className="text-2xl font-bold text-slate-900 truncate">
                {analytics.periodTotalCount > 0
                  ? analytics.topCategory.fullLabel
                  : `${formatNumber(analytics.verifiedUnitsCount)} ${t('وحدة نشطة', 'Live Units')}`}
              </div>
              <div className="text-xs text-slate-500 font-mono tabular-nums">
                {analytics.periodTotalCount > 0 ? (
                  <>
                    {formatNumber(analytics.topCategory.rawPeriodCount)} {t('عقد', 'rentals')} ·{' '}
                    {formatNumber(analytics.topCategory.sharePct, 1)}%{' '}
                    {t('من الفترة', 'of period')}
                  </>
                ) : (
                  <>
                    {formatNumber(analytics.pendingUnitsCount)} {t('قيد المراجعة', 'pending')} ·{' '}
                    {formatNumber(allBannedUsers.length)} {t('حساب محظور', 'banned')}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* PRIMARY FOCAL CHART: Time-Series Category Distribution over Current Month / Filtered Window */}
            <div className="lg:col-span-12 min-w-0 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    {t(
                      `توزيع الإيجارات حسب التصنيف عبر الزمن — ${analytics.activePeriodLabel}`,
                      `Rental Distribution by Category Over Time — ${analytics.activePeriodLabel}`
                    )}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {t(
                      'مرّر المؤشر فوق أي عمود أو نقطة زمنية لمعاينة تفصيل الشقق والمنازل والفنادق والمصانع وسكن الطلاب وحصتها النسبية.',
                      'Hover over any time bucket to inspect per-category counts, rental volume, and relative share.'
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl shrink-0">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 ms-2 me-1 shrink-0" />
                  {(
                    [
                      { id: 'stacked_bar', label: t('أعمدة مكدسة', 'Stacked Bars') },
                      { id: 'grouped_bar', label: t('أعمدة مقارنة', 'Grouped Bars') },
                      { id: 'area', label: t('منحنى مساحي', 'Area Trend') },
                    ] as const
                  ).map((styleOpt) => (
                    <button
                      key={styleOpt.id}
                      type="button"
                      onClick={() => setDashboardChartStyle(styleOpt.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        dashboardChartStyle === styleOpt.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {styleOpt.label}
                    </button>
                  ))}
                </div>
              </div>

              {analytics.periodTotalCount === 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="text-slate-600">
                    {t(
                      'لا توجد عقود إيجار مسجلة ضمن هذا النطاق الزمني للتصنيفات المحددة حالياً — يعرض الرسم أدناه المحور الزمني الفعلي للفترة (0 عقود).',
                      'No rentals recorded within this exact time window for the selected categories — showing the live zero-baseline timeline.'
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {analytics.totalAllTimeBookingsCount > 0 &&
                      dashboardTimePreset !== 'all_time' && (
                        <button
                          type="button"
                          onClick={() => handleSelectTimePreset('all_time')}
                          className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          {t(
                            `عرض كل الفترات (${formatNumber(analytics.totalAllTimeBookingsCount)})`,
                            `Show All Time (${formatNumber(analytics.totalAllTimeBookingsCount)})`
                          )}
                        </button>
                      )}
                    {analytics.totalActivePendingRequestsCount > 0 &&
                      dashboardRecordScope !== 'bookings_and_requests' && (
                        <button
                          type="button"
                          onClick={() => setDashboardRecordScope('bookings_and_requests')}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          {t(
                            `تضمين طلبات الإيجار النشطة (${formatNumber(
                              analytics.totalActivePendingRequestsCount
                            )})`,
                            `Include Active Requests (${formatNumber(
                              analytics.totalActivePendingRequestsCount
                            )})`
                          )}
                        </button>
                      )}
                  </div>
                </div>
              )}

              <div className="h-80 w-full min-w-0" dir="ltr">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  {dashboardChartStyle === 'area' ? (
                    <AreaChart
                      data={analytics.timelineData}
                      margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: '#475569' }}
                        interval="preserveStartEnd"
                        minTickGap={14}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#475569' }}
                      />
                      <Tooltip content={renderTimelineTooltip} />
                      {DASHBOARD_CATEGORIES.filter((cat) =>
                        selectedCategories.includes(cat.key)
                      ).map((cat) => (
                        <Area
                          key={cat.key}
                          type="monotone"
                          dataKey={cat.key}
                          stackId="rentals"
                          name={lang === 'ar' ? cat.shortAr : cat.shortEn}
                          stroke={cat.colorHex}
                          fill={cat.softFillHex}
                          strokeWidth={2}
                        />
                      ))}
                    </AreaChart>
                  ) : (
                    <BarChart
                      data={analytics.timelineData}
                      margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: '#475569' }}
                        interval="preserveStartEnd"
                        minTickGap={14}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#475569' }}
                      />
                      <Tooltip content={renderTimelineTooltip} />
                      {DASHBOARD_CATEGORIES.filter((cat) =>
                        selectedCategories.includes(cat.key)
                      ).map((cat, idx, arr) => (
                        <Bar
                          key={cat.key}
                          dataKey={cat.key}
                          stackId={dashboardChartStyle === 'stacked_bar' ? 'rentals' : undefined}
                          name={lang === 'ar' ? cat.shortAr : cat.shortEn}
                          fill={cat.colorHex}
                          radius={
                            dashboardChartStyle === 'stacked_bar'
                              ? idx === arr.length - 1
                                ? [5, 5, 0, 0]
                                : [0, 0, 0, 0]
                              : [5, 5, 0, 0]
                          }
                        />
                      ))}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Clean Category Legend & Active Commission Readout */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  {analytics.categoryBreakdown
                    .filter((item) => item.isSelected)
                    .map((item) => (
                      <div key={item.category} className="inline-flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-xs shrink-0 ${item.meta.swatchClass}`}
                        />
                        <span className="font-semibold text-slate-800">{item.shortLabel}</span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {dashboardMetric === 'count'
                            ? formatNumber(item.rawPeriodCount)
                            : `${formatNumber(item.metricValue)} ${t('ج.م', 'EGP')}`}
                        </span>
                      </div>
                    ))}
                </div>
                <span className="text-slate-400 font-mono tabular-nums">
                  {analytics.effectiveStartInput} → {analytics.effectiveEndInput}
                </span>
              </div>
            </div>

            {/* SECONDARY LEFT (5 COLS): Interactive Category Share Donut Chart */}
            <div className="lg:col-span-5 min-w-0 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-slate-900">
                  {t(
                    'الحصة النسبية للإيجارات حسب التصنيف',
                    'Proportional Share by Property Category'
                  )}
                </h3>
                <p className="text-xs text-slate-500">
                  {t(
                    'نسبة مساهمة كل قسم عقاري من إجمالي الفترة الزمنية المحددة.',
                    'Relative share of each category within the active time filter.'
                  )}
                </p>
              </div>

              {analytics.categoryPieData.length === 0 ? (
                <div className="h-56 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-xl px-4 text-center space-y-1">
                  <span className="font-mono tabular-nums text-2xl font-bold text-slate-400">
                    0%
                  </span>
                  <span className="text-xs font-semibold text-slate-700">
                    {t(
                      'لا توجد حصص إيجارية مسجلة في هذه الفترة بعد',
                      'No category rental shares recorded in this period yet'
                    )}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {t(
                      'بمجرد إتمام عقود شقق أو منازل أو فنادق أو مصانع أو طلاب، يظهر التوزيع النسبي هنا تلقائياً.',
                      'Category proportions populate automatically as contracts are recorded.'
                    )}
                  </span>
                </div>
              ) : (
                <div className="h-56 w-full min-w-0" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie
                        data={analytics.categoryPieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={84}
                        paddingAngle={3}
                        onMouseEnter={(_, idx) => {
                          const hovered = analytics.categoryPieData[idx];
                          if (hovered) setFocusedCategoryKey(hovered.category);
                        }}
                        onMouseLeave={() => setFocusedCategoryKey(null)}
                      >
                        {analytics.categoryPieData.map((entry) => (
                          <Cell
                            key={entry.category}
                            fill={entry.colorHex}
                            opacity={
                              focusedCategoryKey && focusedCategoryKey !== entry.category
                                ? 0.45
                                : 1
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip content={renderCategoryPieTooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="divide-y divide-slate-100 border-t border-slate-100 pt-2">
                {analytics.categoryBreakdown.map((item) => {
                  const isHighlighted = focusedCategoryKey === item.category;
                  return (
                    <button
                      key={item.category}
                      type="button"
                      onClick={() => handleToggleDashboardCategory(item.category)}
                      onMouseEnter={() => setFocusedCategoryKey(item.category)}
                      onMouseLeave={() => setFocusedCategoryKey(null)}
                      className={`w-full py-2.5 px-2 flex items-center justify-between gap-2 text-xs transition-colors rounded-lg ${
                        isHighlighted ? 'bg-slate-50' : 'hover:bg-slate-50/70'
                      } ${!item.isSelected ? 'opacity-45' : ''}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-2.5 h-2.5 rounded-xs shrink-0 ${item.meta.swatchClass}`}
                        />
                        <span className="font-semibold text-slate-800 truncate">
                          {item.fullLabel}
                        </span>
                        <span className="text-slate-400 font-mono tabular-nums">
                          · {formatNumber(item.commissionPct)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                        <span className="text-slate-600">
                          {formatNumber(item.rawPeriodCount)} {t('عقد', 'rentals')}
                        </span>
                        <span className="font-bold text-slate-900 w-12 text-end">
                          {formatNumber(item.sharePct, 1)}%
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SECONDARY RIGHT (7 COLS): Listed Supply vs. Period Rentals BarChart & High-Density Matrix */}
            <div className="lg:col-span-7 min-w-0 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-slate-900">
                  {t(
                    'مقارنة الوحدات المعروضة مقابل إيجارات وطلبات الفترة لكل تصنيف',
                    'Active Supply vs. Period Rentals & Requests by Category'
                  )}
                </h3>
                <p className="text-xs text-slate-500">
                  {t(
                    'يقارن حجم المعروض الموثق على الخريطة بعدد العقود المنفذة والطلبات النشطة لكل قسم.',
                    'Compares live verified inventory against executed rentals and active requests per sector.'
                  )}
                </p>
              </div>

              <div className="h-56 w-full min-w-0" dir="ltr">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart
                    data={analytics.sectorComparisonData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="sector" tick={{ fontSize: 11, fill: '#475569' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                    <Tooltip content={renderSectorComparisonTooltip} />
                    <Bar
                      dataKey="listed"
                      name={t('الوحدات المعروضة', 'Listed Units')}
                      fill="#1D4ED8"
                      radius={[5, 5, 0, 0]}
                    />
                    <Bar
                      dataKey="periodRentals"
                      name={t('إيجارات الفترة', 'Period Rentals')}
                      fill="#059669"
                      radius={[5, 5, 0, 0]}
                    />
                    <Bar
                      dataKey="pendingRequests"
                      name={t('طلبات قيد التنفيذ', 'Active Requests')}
                      fill="#D97706"
                      radius={[5, 5, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* High-Density Per-Category Financial & Volume Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 text-start font-semibold whitespace-nowrap">
                        {t('التصنيف', 'Category')}
                      </th>
                      <th className="py-2.5 px-3 text-end font-semibold whitespace-nowrap">
                        {t('نسبة القسم', 'Fee %')}
                      </th>
                      <th className="py-2.5 px-3 text-end font-semibold whitespace-nowrap">
                        {t('المعروض', 'Listed')}
                      </th>
                      <th className="py-2.5 px-3 text-end font-semibold whitespace-nowrap">
                        {t('إيجارات الفترة', 'Rentals')}
                      </th>
                      <th className="py-2.5 px-3 text-end font-semibold whitespace-nowrap">
                        {t('حجم العقود (ج.م)', 'Volume (EGP)')}
                      </th>
                      <th className="py-2.5 px-3 text-end font-semibold whitespace-nowrap">
                        {t('ربح العمولة (ج.م)', 'Commission (EGP)')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analytics.categoryBreakdown.map((row) => (
                      <tr
                        key={row.category}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          !row.isSelected ? 'opacity-45' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <span
                              className={`w-2.5 h-2.5 rounded-xs shrink-0 ${row.meta.swatchClass}`}
                            />
                            <span>{row.shortLabel}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums text-blue-700 font-semibold">
                          {formatNumber(row.commissionPct)}%
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums text-slate-700">
                          {formatNumber(row.liveListedCount)}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-slate-900">
                          {formatNumber(row.rawPeriodCount)}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums text-slate-800">
                          {formatNumber(row.periodGrossEgp)}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-emerald-700">
                          {formatNumber(row.periodCommissionEgp)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* REGIONAL OCCUPANCY (LAST 30 DAYS): Recharts Chart Across Egypt Governorates */}
            <div className="lg:col-span-12 min-w-0 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-emerald-700">
                      {t('مؤشر الإشغال الإقليمي · آخر 30 يوماً', 'Regional Occupancy · Last 30 Days')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-slate-700">
                      {formatNumber(governorateOccupancyAnalytics.coveredGovernoratesCount)} /{' '}
                      {formatNumber(EGYPT_GOVERNORATES.length)}{' '}
                      {t('محافظة مغطاة', 'governorates covered')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {selectedCategories.length === ALL_DASHBOARD_CATEGORY_KEYS.length
                        ? t('جميع التصنيفات الموثقة', 'All Verified Categories')
                        : t(
                            `${formatNumber(selectedCategories.length)} تصنيفات محددة`,
                            `${formatNumber(selectedCategories.length)} selected categories`
                          )}
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    {t(
                      'نسب إشغال الوحدات الموثقة عبر محافظات مصر خلال الـ 30 يوماً الماضية',
                      'Verified Property Occupancy Rates Across Egypt Governorates (Last 30 Days)'
                    )}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {t(
                      'يقيس نسبة الوحدات الموثقة المشغولة بعقود سارية أو مبرمة خلال آخر 30 يوماً مقارنة بإجمالي المعروض الموثق في كل محافظة.',
                      'Measures the share of verified units occupied by active or signed contracts in the last 30 days against total verified supply per governorate.'
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {/* Chart Mode Switch */}
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setOccupancyChartMode('rate_pct')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        occupancyChartMode === 'rate_pct'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t('نسبة الإشغال %', 'Occupancy %')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOccupancyChartMode('units_stack')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        occupancyChartMode === 'units_stack'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t('مشغول مقابل متاح', 'Occupied vs. Available')}
                    </button>
                  </div>

                  {/* Governorate Scope Toggle */}
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setOccupancyGovScope('active_supply')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        occupancyGovScope === 'active_supply'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t('المحافظات النشطة', 'Active Governorates')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOccupancyGovScope('all_27')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        occupancyGovScope === 'all_27'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t('كل المحافظات (27)', 'All 27 Governorates')}
                    </button>
                  </div>

                  {/* Sort Order Toggle */}
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                    {(
                      [
                        { id: 'highest_rate', label: t('الأعلى إشغالاً', 'Highest %') },
                        { id: 'most_units', label: t('الأكثر وحدات', 'Most Units') },
                        { id: 'geo_order', label: t('الترتيب الجغرافي', 'Geo Order') },
                      ] as const
                    ).map((sortOpt) => (
                      <button
                        key={sortOpt.id}
                        type="button"
                        onClick={() => setOccupancySortMode(sortOpt.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          occupancySortMode === sortOpt.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {sortOpt.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleExportGovernorateOccupancyCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>{t('تصدير CSV', 'Export CSV')}</span>
                  </button>
                </div>
              </div>

              {/* 4-Cell Hairline Summary Strip (No Nested Cards) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-slate-200 rounded-xl bg-slate-50/60 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-slate-200">
                <div className="p-3.5 space-y-0.5">
                  <div className="text-[11px] text-slate-500">
                    {t('متوسط الإشغال القومي (30 يوماً)', 'National 30-Day Occupancy')}
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-emerald-700">
                    {formatNumber(governorateOccupancyAnalytics.nationalOccupancyRatePct, 1)}%
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500">
                    {formatNumber(governorateOccupancyAnalytics.totalOccupiedNational)}{' '}
                    {t('مشغول من أصل', 'occupied of')}{' '}
                    {formatNumber(governorateOccupancyAnalytics.totalVerifiedNational)}{' '}
                    {t('وحدة موثقة', 'verified')}
                  </div>
                </div>

                <div className="p-3.5 space-y-0.5">
                  <div className="text-[11px] text-slate-500">
                    {t('المحافظة الأعلى إشغالاً', 'Highest Occupancy Governorate')}
                  </div>
                  <div className="text-xl font-bold text-slate-900 truncate">
                    {governorateOccupancyAnalytics.topOccupancyGov
                      ? governorateOccupancyAnalytics.topOccupancyGov.govDisplay
                      : '—'}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500">
                    {governorateOccupancyAnalytics.topOccupancyGov
                      ? `${formatNumber(
                          governorateOccupancyAnalytics.topOccupancyGov.occupancyRatePct,
                          1
                        )}% · ${formatNumber(
                          governorateOccupancyAnalytics.topOccupancyGov.occupiedUnitsCount
                        )}/${formatNumber(
                          governorateOccupancyAnalytics.topOccupancyGov.verifiedUnitsCount
                        )} ${t('وحدة', 'units')}`
                      : t('لا توجد وحدات موثقة', 'No verified units')}
                  </div>
                </div>

                <div className="p-3.5 space-y-0.5">
                  <div className="text-[11px] text-slate-500">
                    {t('تغطية المحافظات والوحدات المتاحة', 'Governorate Reach & Open Supply')}
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-blue-700">
                    {formatNumber(governorateOccupancyAnalytics.coveredGovernoratesCount)} /{' '}
                    {formatNumber(EGYPT_GOVERNORATES.length)}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500">
                    {formatNumber(governorateOccupancyAnalytics.occupiedGovernoratesCount)}{' '}
                    {t('محافظة بإشغال فعلي', 'with active occupancy')} ·{' '}
                    {formatNumber(governorateOccupancyAnalytics.totalAvailableNational)}{' '}
                    {t('وحدة متاحة', 'available')}
                  </div>
                </div>

                <div className="p-3.5 space-y-0.5">
                  <div className="text-[11px] text-slate-500">
                    {t('نشاط العقود خلال الـ 30 يوماً', 'Last 30 Days Contract Volume')}
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-900">
                    {formatNumber(governorateOccupancyAnalytics.totalVolume30dEgp)}{' '}
                    <span className="text-xs font-semibold text-slate-500">{t('ج.م', 'EGP')}</span>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500">
                    {formatNumber(governorateOccupancyAnalytics.totalBookings30d)}{' '}
                    {t('عقد نشط أو مبرم بآخر 30 يوماً', 'active/signed contracts in 30d')}
                  </div>
                </div>
              </div>

              {governorateOccupancyAnalytics.visibleRows.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-xl px-4 text-center space-y-1.5">
                  <span className="text-sm font-semibold text-slate-800">
                    {t(
                      'لا توجد وحدات موثقة ضمن التصنيفات المحددة لعرض الإشغال',
                      'No verified properties match the active category filters'
                    )}
                  </span>
                  <span className="text-xs text-slate-500">
                    {t(
                      'اختر جميع التصنيفات أو بدّل إلى عرض كل المحافظات (27) لمعاينة التغطية الكاملة.',
                      'Select all categories or switch to All 27 Governorates to inspect full regional coverage.'
                    )}
                  </span>
                </div>
              ) : (
                <>
                  <div className="h-88 w-full min-w-0" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <BarChart
                        data={governorateOccupancyAnalytics.visibleRows}
                        margin={{
                          top: 14,
                          right: 20,
                          left: 0,
                          bottom:
                            governorateOccupancyAnalytics.visibleRows.length > 10 ? 28 : 8,
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis
                          dataKey="govDisplay"
                          interval={0}
                          angle={
                            governorateOccupancyAnalytics.visibleRows.length > 10 ? -35 : 0
                          }
                          textAnchor={
                            governorateOccupancyAnalytics.visibleRows.length > 10
                              ? 'end'
                              : 'middle'
                          }
                          height={
                            governorateOccupancyAnalytics.visibleRows.length > 10 ? 72 : 34
                          }
                          tick={{ fontSize: 11, fill: '#334155' }}
                        />
                        {occupancyChartMode === 'rate_pct' ? (
                          <YAxis
                            domain={[0, 100]}
                            tickFormatter={(val: number) => `${val}%`}
                            tick={{ fontSize: 11, fill: '#475569' }}
                          />
                        ) : (
                          <YAxis
                            allowDecimals={false}
                            tick={{ fontSize: 11, fill: '#475569' }}
                          />
                        )}
                        <Tooltip content={renderGovernorateOccupancyTooltip} />
                        {occupancyChartMode === 'rate_pct' && (
                          <ReferenceLine
                            y={governorateOccupancyAnalytics.nationalOccupancyRatePct}
                            stroke="#0F172A"
                            strokeDasharray="4 4"
                            strokeWidth={1.5}
                          />
                        )}
                        {occupancyChartMode === 'rate_pct' ? (
                          <Bar
                            dataKey="occupancyRatePct"
                            name={t('نسبة الإشغال %', 'Occupancy Rate %')}
                            radius={[6, 6, 0, 0]}
                            maxBarSize={44}
                          >
                            {governorateOccupancyAnalytics.visibleRows.map((entry) => (
                              <Cell key={entry.governorateAr} fill={entry.fillHex} />
                            ))}
                          </Bar>
                        ) : (
                          <>
                            <Bar
                              dataKey="occupiedUnitsCount"
                              stackId="govUnits"
                              name={t('وحدات مشغولة (30 يوماً)', 'Occupied Units (30d)')}
                              fill="#059669"
                              radius={[0, 0, 0, 0]}
                              maxBarSize={44}
                            />
                            <Bar
                              dataKey="availableUnitsCount"
                              stackId="govUnits"
                              name={t('وحدات موثقة متاحة', 'Available Verified Units')}
                              fill="#93C5FD"
                              radius={[6, 6, 0, 0]}
                              maxBarSize={44}
                            />
                          </>
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Clean Legend Row */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                    {occupancyChartMode === 'rate_pct' ? (
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                        <div className="inline-flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 shrink-0" />
                          <span>{t('إشغال مرتفع (60%+)', 'High Occupancy (60%+)')}</span>
                        </div>
                        <div className="inline-flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-xs bg-blue-700 shrink-0" />
                          <span>{t('إشغال متوسط (25%–59%)', 'Moderate (25%–59%)')}</span>
                        </div>
                        <div className="inline-flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-xs bg-amber-600 shrink-0" />
                          <span>{t('إشغال أولي (1%–24%)', 'Early Demand (1%–24%)')}</span>
                        </div>
                        <div className="inline-flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-xs bg-slate-300 shrink-0" />
                          <span>{t('متاح بالكامل (0%)', '0% Occupied')}</span>
                        </div>
                        <div className="inline-flex items-center gap-1.5 font-mono tabular-nums text-slate-800">
                          <span className="w-4 border-t-2 border-dashed border-slate-900 shrink-0" />
                          <span>
                            {t('المتوسط القومي:', 'National Avg:')}{' '}
                            {formatNumber(
                              governorateOccupancyAnalytics.nationalOccupancyRatePct,
                              1
                            )}
                            %
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                        <div className="inline-flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 shrink-0" />
                          <span>
                            {t('وحدات مشغولة خلال 30 يوماً', 'Occupied in Last 30 Days')}
                          </span>
                        </div>
                        <div className="inline-flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-xs bg-blue-300 shrink-0" />
                          <span>{t('وحدات موثقة متاحة حالياً', 'Available Verified Supply')}</span>
                        </div>
                      </div>
                    )}

                    <span className="font-mono tabular-nums text-[11px] text-slate-400">
                      {formatNumber(governorateOccupancyAnalytics.visibleRows.length)}{' '}
                      {t('محافظة معروضة', 'governorates displayed')}
                    </span>
                  </div>

                  {/* High-Density Per-Governorate Occupancy Table */}
                  <div className="max-h-64 overflow-y-auto overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="py-2.5 px-3 text-start font-semibold whitespace-nowrap">
                            {t('المحافظة', 'Governorate')}
                          </th>
                          <th className="py-2.5 px-3 text-end font-semibold whitespace-nowrap">
                            {t('الوحدات الموثقة', 'Verified Units')}
                          </th>
                          <th className="py-2.5 px-3 text-end font-semibold whitespace-nowrap">
                            {t('المشغول (30 يوماً)', 'Occupied (30d)')}
                          </th>
                          <th className="py-2.5 px-3 text-end font-semibold whitespace-nowrap">
                            {t('المتاح حالياً', 'Available')}
                          </th>
                          <th className="py-2.5 px-3 text-end font-semibold whitespace-nowrap">
                            {t('نسبة الإشغال', 'Occupancy %')}
                          </th>
                          <th className="py-2.5 px-3 text-end font-semibold whitespace-nowrap">
                            {t('عقود 30 يوماً', '30d Contracts')}
                          </th>
                          <th className="py-2.5 px-3 text-end font-semibold whitespace-nowrap">
                            {t('حجم العقود (ج.م)', '30d Volume (EGP)')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {governorateOccupancyAnalytics.visibleRows.map((row) => (
                          <tr
                            key={row.governorateAr}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              row.verifiedUnitsCount === 0 ? 'opacity-55' : ''
                            }`}
                          >
                            <td className="py-2 px-3 font-semibold text-slate-900 whitespace-nowrap">
                              <div className="inline-flex items-center gap-2">
                                <span
                                  className="w-2 h-2 rounded-xs shrink-0"
                                  style={{ backgroundColor: row.fillHex }}
                                />
                                <span>{row.govDisplay}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-end font-mono tabular-nums text-slate-700">
                              {formatNumber(row.verifiedUnitsCount)}
                            </td>
                            <td className="py-2 px-3 text-end font-mono tabular-nums font-semibold text-emerald-700">
                              {formatNumber(row.occupiedUnitsCount)}
                            </td>
                            <td className="py-2 px-3 text-end font-mono tabular-nums text-blue-700">
                              {formatNumber(row.availableUnitsCount)}
                            </td>
                            <td className="py-2 px-3 text-end font-mono tabular-nums font-bold text-slate-900">
                              {formatNumber(row.occupancyRatePct, 1)}%
                            </td>
                            <td className="py-2 px-3 text-end font-mono tabular-nums text-slate-700">
                              {formatNumber(row.bookings30dCount)}
                            </td>
                            <td className="py-2 px-3 text-end font-mono tabular-nums text-slate-800">
                              {formatNumber(row.volume30dEgp)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Recent Sensitive Actions Preview Card in Executive Dashboard */}
            <div className="lg:col-span-12 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {t(
                      'أحدث الإجراءات الحساسة في سجل الأنشطة (Activity Log)',
                      'Latest Sensitive Actions in Activity Log'
                    )}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {t(
                      'آخر القرارات الإدارية المرتبة زمنياً (تغيير النسب، حظر المستخدمين، حذف الإعلانات).',
                      'Most recent chronologically ordered rate changes, user bans, and listing removals.'
                    )}
                  </p>
                </div>

              </div>

              {chronologicalActivityLogs.length === 0 ? (
                <p className="text-xs text-slate-500">
                  {t(
                    'لم يتم تسجيل أنشطة إدارية بعد — ستظهر أحدث الإجراءات هنا تلقائياً فور تنفيذها.',
                    'No administrative actions recorded yet.'
                  )}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {chronologicalActivityLogs.slice(0, 5).map((log) => (
                    <div
                      key={log.id}
                      className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {lang === 'ar' ? log.summaryAr : log.summaryEn}
                        </div>
                        {(log.previousValue || log.newValue) && (
                          <div className="font-mono tabular-nums text-slate-500 truncate">
                            {log.previousValue || '—'} →{' '}
                            <span className="font-semibold text-slate-800">
                              {log.newValue || '—'}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="font-mono tabular-nums text-slate-500 shrink-0">
                        {formatTimeAgo(log.createdAtMs)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ===================================================================== */
/* SECTION 6 COMPONENT: ADMIN ACTIVITY LOGS                              */
/* ===================================================================== */
function AdminActivityLogsSection({
  allAdminActivityLogs,
}: {
  allAdminActivityLogs: AdminActivityLogRecord[];
}) {
  const { t, lang, formatTimeAgo, formatNumber } = useI18n();

  const [logs, setLogs] = useState<AdminActivityLogRecord[]>([]);
  const [filterType, setFilterType] = useState<ActivityFilterGroup>('all');
  const [sortOrder, setSortOrder] = useState<ActivitySortOrder>('newest');

  useEffect(() => {
    const sorted = [...allAdminActivityLogs].sort((a, b) => {
      const cmp = b.createdAtMs - a.createdAtMs;
      return sortOrder === 'newest' ? cmp : -cmp;
    });
    const filtered =
      filterType === 'all'
        ? sorted
        : sorted.filter((l) => {
            if (filterType === 'commissions') return l.actionType === 'commission_change' || l.actionType === 'settings_change';
            if (filterType === 'bans') return l.actionType === 'user_ban' || l.actionType === 'user_unban';
            if (filterType === 'listings') return l.actionType === 'listing_status' || l.actionType === 'listing_edited' || l.actionType === 'listing_removed';
            if (filterType === 'moderation') return l.actionType === 'moderation_action';
            return true;
          });
    setLogs(filtered);
  }, [allAdminActivityLogs, filterType, sortOrder]);

  const typeLabels: Record<ActivityFilterGroup, string> = {
    all: t('الكل', 'All'),
    commissions: t('النسب والعمولات', 'Commissions'),
    bans: t('الحظر والمستخدمين', 'Bans & Users'),
    listings: t('الإعلانات', 'Listings'),
    moderation: t('التعليقات والمراجعة', 'Moderation'),
  };

  const typeColors: Record<ActivityFilterGroup, string> = {
    all: 'text-slate-600',
    commissions: 'text-blue-700',
    bans: 'text-rose-700',
    listings: 'text-amber-700',
    moderation: 'text-emerald-700',
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-700 shrink-0" />
              {t('سجل الأنشطة الرقابي', 'Admin Activity Logs')}
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              {t('سجل غير قابل للتعديل لكل العمليات الإدارية المنفذة على المنصة.', 'Immutable log of every administrative action performed on the platform.')}
            </p>
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {(
              [
                'all',
                'commissions',
                'bans',
                'listings',
                'moderation',
              ] as const
            ).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                  filterType === type
                    ? `bg-slate-900 text-white border-slate-900 ${typeColors[type]}`
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {typeLabels[type]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 pt-3">
          <span className="text-[11px] font-semibold text-slate-600">
            {t('ترتيب:', 'Sort:')}
          </span>
          <button
            type="button"
            onClick={() => setSortOrder('newest')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
              sortOrder === 'newest'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {t('الأحدث أولاً', 'Newest First')}
          </button>
          <button
            type="button"
            onClick={() => setSortOrder('oldest')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
              sortOrder === 'oldest'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {t('الأقدم أولاً', 'Oldest First')}
          </button>
          <div className="ml-auto text-[10px] text-slate-400 font-mono tabular-nums">
            {t('إجمالي السجلات:', 'Total Records:')} {formatNumber(logs.length)}
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
            <div className="flex flex-col items-center gap-2">
              <FileText className="w-8 h-8 text-slate-300 shrink-0" />
              <span className="text-sm text-slate-500">
                {t('لا توجد سجلات إدارية مسجلة بعد', 'No administrative records yet')}
              </span>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-2.5 text-slate-500 font-semibold w-24">
                    {t('النوع', 'Type')}
                  </th>
                  <th className="px-4 py-2.5 text-slate-500 font-semibold">
                    {t('الملخص', 'Summary')}
                  </th>
                  <th className="px-4 py-2.5 text-slate-500 font-semibold w-40 text-right">
                    {t('القيمة السابقة', 'Previous')}
                  </th>
                  <th className="px-4 py-2.5 text-slate-500 font-semibold w-40">
                    {t('القيمة الجديدة', 'New Value')}
                  </th>
                  <th className="px-4 py-2.5 text-slate-500 font-semibold w-32">
                    {t('التاريخ', 'Time')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold border text-blue-700 bg-blue-50 border-blue-200">
                        {log.actionType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-800 truncate max-w-[300px]">
                      {lang === 'ar' ? log.summaryAr : log.summaryEn}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-500 text-right">
                      {log.previousValue || '—'}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-900">
                      {log.newValue || '—'}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-500">
                      {formatTimeAgo(log.createdAtMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              {t('تصدير السجل إلى CSV', 'Export Activity Log to CSV')}
            </h4>
            <p className="text-[11px] text-slate-500 mt-1">
              {t('تحميل جميع السجلات الرقابية كملف CSV للمراجعة الخارجية.', 'Download all administrative records as CSV for external audit.')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const csvHeaders = ['id', 'type', 'summaryAr', 'summaryEn', 'previousValue', 'newValue', 'createdAtMs'];
              const rows = logs.map((l) =>
                csvHeaders.map((h) => String(l[h as keyof AdminActivityLogRecord] || '')).join(',')
              );
              const csv = [csvHeaders.join(','), ...rows].join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `ejar_admin_activity_log_${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>{t('تصدير CSV', 'Export CSV')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
export default PlatformAdminConsole;

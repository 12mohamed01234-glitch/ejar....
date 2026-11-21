import zamalekImg from '../assets/images/hero_cairo_nile_apartment_1793029623466.jpg';
import newCairoImg from '../assets/images/apt_new_cairo_penthouse_1793029624348.jpg';
import alexandriaImg from '../assets/images/apt_alexandria_corniche_1793029625660.jpg';
import sheikhZayedImg from '../assets/images/apt_sheikh_zayed_duplex_1793029627835.jpg';
import maadiImg from '../assets/images/apt_maadi_garden_flat_1793029627522.jpg';
import hotelCairoImg from '../assets/images/hotel_cairo_suite_1793122554830.jpg';
import hotelRedSeaImg from '../assets/images/hotel_redsea_room_1793122557306.jpg';
import factoryEgyptImg from '../assets/images/factory_industrial_egypt_1793122559240.jpg';
import studentCairoImg from '../assets/images/student_housing_cairo_1793122559939.jpg';
import panorama360CairoImg from '../assets/images/panorama_360_cairo_apartment_1793122560127.jpg';

// Synchronized verbatim with firebase-blueprint.json & firestore.rules
export const VALIDATION_LIMITS = {
  ID_MAX: 128,
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  OWNER_NAME_MIN: 2,
  OWNER_NAME_MAX: 80,
  TITLE_MIN: 5,
  TITLE_MAX: 120,
  DESC_MIN: 10,
  DESC_MAX: 1200,
  GOV_MIN: 2,
  GOV_MAX: 50,
  DISTRICT_MIN: 2,
  DISTRICT_MAX: 80,
  LAT_MIN: 22.0,
  LAT_MAX: 31.8,
  LNG_MIN: 24.5,
  LNG_MAX: 37.0,
  RENT_MIN: 1000,
  RENT_MAX: 5000000,
  DAILY_RATE_MIN: 300,
  DAILY_RATE_MAX: 500000,
  STUDENT_BED_MIN: 500,
  STUDENT_BED_MAX: 100000,
  STUDENT_BEDS_MAX: 50,
  AREA_MIN: 18,
  AREA_MAX: 100000,
  NATIONAL_ID_PATTERN: /^[23][0-9]{13}$/,
  EGYPT_PHONE_PATTERN: /^01[0125][0-9]{8}$/,
  EXACT_ADDRESS_MIN: 5,
  EXACT_ADDRESS_MAX: 250,
  REGISTRY_MIN: 4,
  REGISTRY_MAX: 60,
  FILENAME_MIN: 3,
  FILENAME_MAX: 120,
  SHA256_PATTERN: /^[a-f0-9]{64}$/,
  IBAN_MIN: 5,
  IBAN_MAX: 80,
  SIGNATURE_MIN: 4,
  SIGNATURE_MAX: 80,
  OCCUPATION_MIN: 3,
  OCCUPATION_MAX: 120,
  REVIEW_NOTE_MAX: 300,
  COMMISSION_MIN: 1,
  COMMISSION_MAX: 50,
  DEFAULT_COMMISSION_PCT: 10,
} as const;

export type ImageKey =
  | 'zamalek_nile'
  | 'new_cairo_penthouse'
  | 'alexandria_corniche'
  | 'sheikh_zayed_duplex'
  | 'maadi_garden'
  | 'hotel_cairo_suite'
  | 'hotel_redsea_room'
  | 'factory_industrial_egypt'
  | 'student_housing_cairo';

export type ListingCategory =
  | 'family_apartment'
  | 'student_housing'
  | 'hotel_room'
  | 'industrial_factory'
  | 'whole_house';

export type BillingMode = 'monthly_only' | 'daily_or_monthly';
export type RentalUnitType = 'month' | 'day' | 'student_bed';
export type TenantCategory = 'family' | 'student' | 'corporate';

export type FurnishingType = 'furnished' | 'semi_furnished' | 'unfurnished';
export type VerificationStatus = 'pending_review' | 'verified' | 'rejected';
export type AvailabilityStatus = 'available' | 'rented';
export type PaymentMethodType =
  | 'card_meeza'
  | 'instapay'
  | 'mobile_wallet'
  | 'fawry'
  | 'wallet_balance';
export type BookingStatus = 'escrow_paid' | 'completed';
export type LandlordVerdict = 'trusted' | 'acceptable' | 'unreliable';
export type ReviewVisibilityStatus = 'published' | 'hidden';
export type RentalRequestStatus =
  | 'pending_approval'
  | 'awaiting_payment'
  | 'approved'
  | 'cancelled';
export type NotificationStatusType =
  | 'approved'
  | 'awaiting_payment'
  | 'cancelled'
  | 'pending_approval'
  | 'price_drop'
  | 'chat_unlocked';
export type NotificationRecipientRole = 'tenant' | 'landlord';
export type NotificationRelatedEntityType =
  | 'rental_request'
  | 'booking'
  | 'apartment'
  | 'kyc'
  | 'favorite'
  | 'chat_thread';

export type SupportedCurrency = 'EGP' | 'USD' | 'SAR' | 'EUR' | 'AED';

export type Panorama360PresetKey =
  | 'none'
  | 'cairo_nile_360'
  | 'new_cairo_penthouse_360'
  | 'hotel_suite_360'
  | 'redsea_resort_360';

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = ['EGP', 'USD', 'SAR', 'EUR', 'AED'];

/**
 * Platform currency reference: Egyptian Pound (EGP) only.
 */
export const CURRENCY_RATES_TO_EGP: Record<string, number> = {
  EGP: 1,
  USD: 49.6,
  SAR: 13.22,
  EUR: 53.8,
  AED: 13.5,
};

export const CURRENCY_SYMBOLS_AR: Record<string, string> = {
  EGP: 'ج.م',
  USD: '$',
  SAR: 'ر.س',
  EUR: '€',
  AED: 'د.إ',
};

export function convertToEgp(
  amountInCurrency: number,
  currency: string = 'EGP',
  _customRates?: Record<string, number>
): number {
  return Math.round(amountInCurrency || 0);
}

export function convertFromEgp(
  amountEgp: number,
  _targetCurrency: string = 'EGP',
  _customRates?: Record<string, number>
): number {
  return Math.round(amountEgp || 0);
}

export function formatCurrencyValue(
  amount: number,
  _currency: string = 'EGP',
  locale: 'ar' | 'en' = 'ar'
): string {
  const formatted = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
  const suffix = locale === 'ar' ? 'ج.م' : 'EGP';
  return `${formatted} ${suffix}`;
}

/**
 * Converts Eastern Arabic (٠-٩) and Extended Arabic-Indic (۰-۹) digits to ASCII (0-9)
 * so users can type seamlessly regardless of whether their keyboard is in Arabic or English mode.
 */
export function normalizeArabicDigits(raw: string): string {
  return raw
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) - 0x06f0))
    .replace(/\u066B/g, '.');
}

/**
 * Normalizes numeric text input (supporting Arabic & English digits and full Backspace clearing).
 */
export function normalizeNumericInput(raw: string, allowDecimal = false): string {
  const ascii = normalizeArabicDigits(raw);
  if (!allowDecimal) {
    return ascii.replace(/[^0-9]/g, '');
  }
  const cleaned = ascii.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  return parts.length <= 1 ? cleaned : `${parts[0]}.${parts.slice(1).join('')}`;
}

export const PANORAMA_360_PRESETS: Record<
  Exclude<Panorama360PresetKey, 'none'>,
  { src: string; labelAr: string; labelEn: string }
> = {
  cairo_nile_360: {
    src: panorama360CairoImg,
    labelAr: 'جولة 360° — ريسبشن بانوراما النيل والشرفة المفتوحة',
    labelEn: '360° Tour — Panoramic Nile Reception & Open Terrace',
  },
  new_cairo_penthouse_360: {
    src: newCairoImg,
    labelAr: 'جولة 360° — بنتهاوس مودرن بإضاءة طبيعية وتراس واسع',
    labelEn: '360° Tour — Modern Sunlit Penthouse & Private Terrace',
  },
  hotel_suite_360: {
    src: hotelCairoImg,
    labelAr: 'جولة 360° — جناح فندقي تنفيذي مطل على النيل',
    labelEn: '360° Tour — Executive Nile-View Hotel Suite',
  },
  redsea_resort_360: {
    src: hotelRedSeaImg,
    labelAr: 'جولة 360° — غرفة منتجع البحر الأحمر واللاجون',
    labelEn: '360° Tour — Red Sea Lagoon Resort Room',
  },
};

export function resolveApartmentPanoramaSrc(apt: Pick<ApartmentRecord, 'hasVirtualTour' | 'panorama360DataUrl' | 'panorama360Key'>): string | null {
  if (!apt.hasVirtualTour) return null;
  if (apt.panorama360DataUrl && apt.panorama360DataUrl.startsWith('data:image/')) {
    return apt.panorama360DataUrl;
  }
  if (apt.panorama360Key && apt.panorama360Key !== 'none') {
    return PANORAMA_360_PRESETS[apt.panorama360Key]?.src ?? panorama360CairoImg;
  }
  return panorama360CairoImg;
}

export const CATEGORY_LABELS: Record<ListingCategory, string> = {
  family_apartment: 'شقة عائلية',
  student_housing: 'سكن طلاب',
  hotel_room: 'غرفة فندقية',
  industrial_factory: 'مصنع',
  whole_house: 'منزل كامل',
};

export const CATEGORY_SINGULAR_LABELS: Record<ListingCategory, string> = {
  family_apartment: 'شقة عائلية',
  student_housing: 'سكن طلاب',
  hotel_room: 'غرفة فندقية',
  industrial_factory: 'مصنع',
  whole_house: 'منزل كامل',
};

export const CATEGORY_SUBTITLES: Record<ListingCategory, string> = {
  family_apartment: 'شقق ودوبلكس موثقة الملكية للإيجار العائلي الشهري والسنوي',
  student_housing: 'سكن جامعي منظم بعدد السراير وسعر مستقل لكل سرير طلابي',
  hotel_room: 'غرف وأجنحة فندقية مرخصة متاحة للحجز باليوم أو بالشهر',
  industrial_factory: 'مصانع وهناجر ومخازن تشغيلية مرخصة بالمدن الصناعية المصرية',
  whole_house: 'منازل وفيلات وعقارات كاملة للإيجار بعدد الشقق والأدوار والمواصفات المستقلة',
};

export const RESIDENTIAL_LISTING_CATEGORIES: ListingCategory[] = [
  'family_apartment',
  'whole_house',
  'student_housing',
  'hotel_room',
];

export function isResidentialCategory(category?: ListingCategory | null): boolean {
  if (!category) return true;
  return RESIDENTIAL_LISTING_CATEGORIES.includes(category);
}

export const RENTAL_UNIT_LABELS: Record<RentalUnitType, string> = {
  month: 'إيجار شهري',
  day: 'حجز يومي (بالليلة)',
  student_bed: 'سرير طلابي شهري',
};

export const TENANT_CATEGORY_LABELS: Record<TenantCategory, string> = {
  family: 'مستأجر عائلي / سكني',
  student: 'طالب جامعي / مغترب',
  corporate: 'شركة / مستثمر صناعي أو فندقي',
};

export const LANDLORD_VERDICT_LABELS: Record<LandlordVerdict, string> = {
  trusted: 'حساب موثوق وملتزم (تمام)',
  acceptable: 'تعامل مقبول',
  unreliable: 'غير ملتزم بالوصف أو المواعيد',
};

export const APARTMENT_IMAGES: Record<ImageKey, { src: string; label: string }> = {
  zamalek_nile: {
    src: zamalekImg,
    label: 'إطلالة نيلية كلاسيكية — الزمالك وجاردن سيتي',
  },
  new_cairo_penthouse: {
    src: newCairoImg,
    label: 'بنتهاوس حديث بتراس مفتوح — التجمع الخامس والعاصمة',
  },
  alexandria_corniche: {
    src: alexandriaImg,
    label: 'إطلالة بحرية مباشرة — كورنيش الإسكندرية والساحل',
  },
  sheikh_zayed_duplex: {
    src: sheikhZayedImg,
    label: 'دوبلكس معماري مزدوج الارتفاع — الشيخ زايد وأكتوبر',
  },
  maadi_garden: {
    src: maadiImg,
    label: 'شقة مشمسة محاطة بالأشجار — سرايات المعادي ومصر الجديدة',
  },
  student_housing_cairo: {
    src: studentCairoImg,
    label: 'سكن طلابي حديث مجهز بالمكاتب والسراير المستقلة',
  },
  hotel_cairo_suite: {
    src: hotelCairoImg,
    label: 'جناح فندقي فاخر مطل على النيل — خدمة فندقية متكاملة',
  },
  hotel_redsea_room: {
    src: hotelRedSeaImg,
    label: 'غرفة فندقية ساحلية بإطلالة البحر الأحمر واللاجون',
  },
  factory_industrial_egypt: {
    src: factoryEgyptImg,
    label: 'مصنع وهنجر صناعي حديث بأسقف مرتفعة وأرضيات إيبوكسي',
  },
};

export const FURNISHING_LABELS: Record<FurnishingType, string> = {
  furnished: 'مفروش / مجهز بالكامل',
  semi_furnished: 'نصف مجهز (تكييفات ومرافق أساسية)',
  unfurnished: 'تشطيب كامل بدون فرش / مساحة تشغيلية',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  card_meeza: 'بطاقة بنكية / ميزة (Meeza · Visa · Mastercard)',
  instapay: 'إنستاباي مصر (InstaPay Instant)',
  mobile_wallet: 'محفظة إلكترونية (Vodafone · Orange · Etisalat · WE)',
  fawry: 'فوري باي (Fawry Reference)',
  wallet_balance: 'رصيد جدية الحجز بالمحفظة (Wallet Balance)',
};

export const RENTAL_REQUEST_STATUS_LABELS: Record<RentalRequestStatus, string> = {
  pending_approval: 'قيد مراجعة المالك',
  awaiting_payment: 'بانتظار الدفع',
  approved: 'تمت الموافقة',
  cancelled: 'تم إلغاء الطلب',
};

export const NOTIFICATION_STATUS_LABELS: Record<NotificationStatusType, string> = {
  approved: 'تمت الموافقة',
  awaiting_payment: 'بانتظار الدفع',
  pending_approval: 'قيد المراجعة',
  cancelled: 'تم إلغاء الطلب',
  price_drop: 'انخفاض السعر',
  chat_unlocked: 'فتح الشات والهاتف',
};

export interface GovernorateOption {
  name: string;
  lat: number;
  lng: number;
  zoom: number;
}

// All 27 Governorates of Egypt with accurate geographic centers
export const EGYPT_GOVERNORATES: GovernorateOption[] = [
  { name: 'القاهرة', lat: 30.0444, lng: 31.2357, zoom: 12 },
  { name: 'الجيزة', lat: 30.0131, lng: 31.2089, zoom: 11 },
  { name: 'الإسكندرية', lat: 31.2001, lng: 29.9187, zoom: 12 },
  { name: 'مطروح', lat: 31.0114, lng: 28.445, zoom: 9 },
  { name: 'البحر الأحمر', lat: 27.2579, lng: 33.8116, zoom: 10 },
  { name: 'جنوب سيناء', lat: 27.9158, lng: 34.3299, zoom: 10 },
  { name: 'الدقهلية', lat: 31.0409, lng: 31.3785, zoom: 12 },
  { name: 'الغربية', lat: 30.7865, lng: 31.0004, zoom: 12 },
  { name: 'الشرقية', lat: 30.5877, lng: 31.502, zoom: 11 },
  { name: 'القليوبية', lat: 30.466, lng: 31.1848, zoom: 11 },
  { name: 'البحيرة', lat: 31.0364, lng: 30.4682, zoom: 11 },
  { name: 'كفر الشيخ', lat: 31.1107, lng: 30.9388, zoom: 11 },
  { name: 'دمياط', lat: 31.4175, lng: 31.8144, zoom: 12 },
  { name: 'بورسعيد', lat: 31.2653, lng: 32.3019, zoom: 12 },
  { name: 'الإسماعيلية', lat: 30.5965, lng: 32.2715, zoom: 12 },
  { name: 'السويس', lat: 29.9668, lng: 32.5498, zoom: 12 },
  { name: 'المنوفية', lat: 30.5503, lng: 31.0106, zoom: 11 },
  { name: 'الفيوم', lat: 29.3084, lng: 30.8428, zoom: 11 },
  { name: 'بني سويف', lat: 29.0661, lng: 31.0994, zoom: 12 },
  { name: 'المنيا', lat: 28.1099, lng: 30.7503, zoom: 12 },
  { name: 'أسيوط', lat: 27.181, lng: 31.1837, zoom: 12 },
  { name: 'سوهاج', lat: 26.5591, lng: 31.6957, zoom: 12 },
  { name: 'قنا', lat: 26.1551, lng: 32.716, zoom: 12 },
  { name: 'الأقصر', lat: 25.6872, lng: 32.6396, zoom: 12 },
  { name: 'أسوان', lat: 24.0889, lng: 32.8998, zoom: 12 },
  { name: 'الوادي الجديد', lat: 25.439, lng: 30.5586, zoom: 8 },
  { name: 'شمال سيناء', lat: 31.1321, lng: 33.8033, zoom: 10 },
];

export type CategoryCommissionFieldKey =
  | 'familyApartmentCommissionPct'
  | 'hotelRoomCommissionPct'
  | 'industrialFactoryCommissionPct'
  | 'studentHousingCommissionPct'
  | 'wholeHouseCommissionPct';

export interface PlatformSettingsRecord {
  commissionRatePct: number;
  familyApartmentCommissionPct: number;
  hotelRoomCommissionPct: number;
  industrialFactoryCommissionPct: number;
  studentHousingCommissionPct: number;
  wholeHouseCommissionPct: number;
  commissionModel: 'one_time_brokerage';
  escrowProtectionFeePct: number;
  tenantDiscountPct: number;
  usdRateEgp: number;
  sarRateEgp: number;
  eurRateEgp: number;
  aedRateEgp: number;
  announcementText: string;
  allowNewListings: boolean;
  allowNewBookings: boolean;
  removedShowcaseIds: string[];
  updatedByUid: string;
  updatedAtMs: number;
}

export const CATEGORY_COMMISSION_FIELD_MAP: Record<ListingCategory, CategoryCommissionFieldKey> = {
  family_apartment: 'familyApartmentCommissionPct',
  hotel_room: 'hotelRoomCommissionPct',
  industrial_factory: 'industrialFactoryCommissionPct',
  student_housing: 'studentHousingCommissionPct',
  whole_house: 'wholeHouseCommissionPct',
};

export function getCategoryCommissionPct(
  category: ListingCategory,
  settings?: Partial<PlatformSettingsRecord> | null
): number {
  const fallback =
    typeof settings?.commissionRatePct === 'number' &&
    settings.commissionRatePct >= VALIDATION_LIMITS.COMMISSION_MIN &&
    settings.commissionRatePct <= VALIDATION_LIMITS.COMMISSION_MAX
      ? Math.round(settings.commissionRatePct)
      : VALIDATION_LIMITS.DEFAULT_COMMISSION_PCT;
  if (!settings) return fallback;
  const fieldKey = CATEGORY_COMMISSION_FIELD_MAP[category];
  const candidate = fieldKey ? settings[fieldKey] : undefined;
  if (
    typeof candidate === 'number' &&
    candidate >= VALIDATION_LIMITS.COMMISSION_MIN &&
    candidate <= VALIDATION_LIMITS.COMMISSION_MAX
  ) {
    return Math.round(candidate);
  }
  return fallback;
}

export interface BannedUserRecord {
  userId: string;
  displayName: string;
  reason: string;
  hideListings: boolean;
  bannedByUid: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export type AdminActivityActionType =
  | 'commission_change'
  | 'settings_change'
  | 'user_ban'
  | 'user_unban'
  | 'listing_removed'
  | 'listing_status'
  | 'listing_edited'
  | 'moderation_action';

export type AdminActivitySeverity = 'info' | 'warning' | 'critical';

export type AdminActivityTargetType =
  | 'platform_settings'
  | 'user'
  | 'apartment'
  | 'review'
  | 'rental_request'
  | 'booking'
  | 'kyc';

export interface AdminActivityLogRecord {
  id: string;
  actionType: AdminActivityActionType;
  severity: AdminActivitySeverity;
  targetType: AdminActivityTargetType;
  targetId: string;
  targetLabel: string;
  summaryAr: string;
  summaryEn: string;
  previousValue: string;
  newValue: string;
  actorUid: string;
  actorDisplayName: string;
  createdAtMs: number;
}

export function buildActivityLogId(prefix = 'act'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeAdminActivityLogRecord(
  raw: Record<string, unknown>,
  id: string
): AdminActivityLogRecord {
  const createdObj = raw.createdAt as { toMillis?: () => number } | undefined;
  return {
    id,
    actionType: (raw.actionType as AdminActivityActionType) || 'settings_change',
    severity: (raw.severity as AdminActivitySeverity) || 'info',
    targetType: (raw.targetType as AdminActivityTargetType) || 'platform_settings',
    targetId: String(raw.targetId || 'config'),
    targetLabel: String(raw.targetLabel || 'إعدادات المنصة'),
    summaryAr: String(raw.summaryAr || 'تم تنفيذ إجراء إداري'),
    summaryEn: String(raw.summaryEn || 'Administrative action recorded'),
    previousValue: typeof raw.previousValue === 'string' ? raw.previousValue : '',
    newValue: typeof raw.newValue === 'string' ? raw.newValue : '',
    actorUid: String(raw.actorUid || ''),
    actorDisplayName: String(raw.actorDisplayName || 'إدارة المنصة'),
    createdAtMs: createdObj?.toMillis?.() ?? Date.now(),
  };
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettingsRecord = {
  commissionRatePct: VALIDATION_LIMITS.DEFAULT_COMMISSION_PCT,
  familyApartmentCommissionPct: VALIDATION_LIMITS.DEFAULT_COMMISSION_PCT,
  hotelRoomCommissionPct: VALIDATION_LIMITS.DEFAULT_COMMISSION_PCT,
  industrialFactoryCommissionPct: VALIDATION_LIMITS.DEFAULT_COMMISSION_PCT,
  studentHousingCommissionPct: VALIDATION_LIMITS.DEFAULT_COMMISSION_PCT,
  wholeHouseCommissionPct: VALIDATION_LIMITS.DEFAULT_COMMISSION_PCT,
  commissionModel: 'one_time_brokerage',
  escrowProtectionFeePct: 0,
  tenantDiscountPct: 0,
  usdRateEgp: CURRENCY_RATES_TO_EGP.USD,
  sarRateEgp: CURRENCY_RATES_TO_EGP.SAR,
  eurRateEgp: CURRENCY_RATES_TO_EGP.EUR,
  aedRateEgp: CURRENCY_RATES_TO_EGP.AED,
  announcementText: '',
  allowNewListings: true,
  allowNewBookings: true,
  removedShowcaseIds: [],
  updatedByUid: '',
  updatedAtMs: 0,
};

export function buildLiveCurrencyRates(
  settings?: Partial<PlatformSettingsRecord> | null
): Record<string, number> {
  if (!settings) return { ...CURRENCY_RATES_TO_EGP };
  return {
    EGP: 1,
    USD:
      typeof settings.usdRateEgp === 'number' && settings.usdRateEgp >= 1 && settings.usdRateEgp <= 1000
        ? settings.usdRateEgp
        : CURRENCY_RATES_TO_EGP.USD,
    SAR:
      typeof settings.sarRateEgp === 'number' && settings.sarRateEgp >= 1 && settings.sarRateEgp <= 1000
        ? settings.sarRateEgp
        : CURRENCY_RATES_TO_EGP.SAR,
    EUR:
      typeof settings.eurRateEgp === 'number' && settings.eurRateEgp >= 1 && settings.eurRateEgp <= 1000
        ? settings.eurRateEgp
        : CURRENCY_RATES_TO_EGP.EUR,
    AED:
      typeof settings.aedRateEgp === 'number' && settings.aedRateEgp >= 1 && settings.aedRateEgp <= 1000
        ? settings.aedRateEgp
        : CURRENCY_RATES_TO_EGP.AED,
  };
}

export function normalizePlatformSettings(
  raw?: Record<string, unknown> | null
): PlatformSettingsRecord {
  if (!raw) return { ...DEFAULT_PLATFORM_SETTINGS };
  const updatedObj = raw.updatedAt as { toMillis?: () => number } | undefined;
  const rawRemoved = Array.isArray(raw.removedShowcaseIds) ? raw.removedShowcaseIds : [];
  const removedShowcaseIds = rawRemoved
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && item.length <= 128)
    .slice(0, 50);

  const baseCommission =
    typeof raw.commissionRatePct === 'number' &&
    raw.commissionRatePct >= VALIDATION_LIMITS.COMMISSION_MIN &&
    raw.commissionRatePct <= VALIDATION_LIMITS.COMMISSION_MAX
      ? Math.round(raw.commissionRatePct)
      : VALIDATION_LIMITS.DEFAULT_COMMISSION_PCT;

  const parseCatPct = (val: unknown): number =>
    typeof val === 'number' &&
    val >= VALIDATION_LIMITS.COMMISSION_MIN &&
    val <= VALIDATION_LIMITS.COMMISSION_MAX
      ? Math.round(val)
      : baseCommission;

  return {
    commissionRatePct: baseCommission,
    familyApartmentCommissionPct: parseCatPct(raw.familyApartmentCommissionPct),
    hotelRoomCommissionPct: parseCatPct(raw.hotelRoomCommissionPct),
    industrialFactoryCommissionPct: parseCatPct(raw.industrialFactoryCommissionPct),
    studentHousingCommissionPct: parseCatPct(raw.studentHousingCommissionPct),
    wholeHouseCommissionPct: parseCatPct(raw.wholeHouseCommissionPct),
    commissionModel: 'one_time_brokerage',
    escrowProtectionFeePct:
      typeof raw.escrowProtectionFeePct === 'number' &&
      raw.escrowProtectionFeePct >= 0 &&
      raw.escrowProtectionFeePct <= 25
        ? Number(raw.escrowProtectionFeePct.toFixed(2))
        : 0,
    tenantDiscountPct:
      typeof raw.tenantDiscountPct === 'number' &&
      raw.tenantDiscountPct >= 0 &&
      raw.tenantDiscountPct <= 50
        ? Number(raw.tenantDiscountPct.toFixed(2))
        : 0,
    usdRateEgp:
      typeof raw.usdRateEgp === 'number' && raw.usdRateEgp >= 1 && raw.usdRateEgp <= 1000
        ? Number(raw.usdRateEgp.toFixed(2))
        : CURRENCY_RATES_TO_EGP.USD,
    sarRateEgp:
      typeof raw.sarRateEgp === 'number' && raw.sarRateEgp >= 1 && raw.sarRateEgp <= 1000
        ? Number(raw.sarRateEgp.toFixed(2))
        : CURRENCY_RATES_TO_EGP.SAR,
    eurRateEgp:
      typeof raw.eurRateEgp === 'number' && raw.eurRateEgp >= 1 && raw.eurRateEgp <= 1000
        ? Number(raw.eurRateEgp.toFixed(2))
        : CURRENCY_RATES_TO_EGP.EUR,
    aedRateEgp:
      typeof raw.aedRateEgp === 'number' && raw.aedRateEgp >= 1 && raw.aedRateEgp <= 1000
        ? Number(raw.aedRateEgp.toFixed(2))
        : CURRENCY_RATES_TO_EGP.AED,
    announcementText:
      typeof raw.announcementText === 'string' ? raw.announcementText.slice(0, 300) : '',
    allowNewListings: typeof raw.allowNewListings === 'boolean' ? raw.allowNewListings : true,
    allowNewBookings: typeof raw.allowNewBookings === 'boolean' ? raw.allowNewBookings : true,
    removedShowcaseIds,
    updatedByUid: typeof raw.updatedByUid === 'string' ? raw.updatedByUid : '',
    updatedAtMs: updatedObj?.toMillis?.() ?? Date.now(),
  };
}

export function normalizeBannedUserRecord(
  raw: Record<string, unknown>,
  id: string
): BannedUserRecord {
  const createdObj = raw.createdAt as { toMillis?: () => number } | undefined;
  const updatedObj = raw.updatedAt as { toMillis?: () => number } | undefined;
  const createdMs = createdObj?.toMillis?.() ?? Date.now();
  return {
    userId: String(raw.userId || id),
    displayName: String(raw.displayName || 'مستخدم مقيد'),
    reason: String(raw.reason || 'مخالفة سياسات الاستخدام المعتمدة بالمنصة'),
    hideListings: typeof raw.hideListings === 'boolean' ? raw.hideListings : true,
    bannedByUid: String(raw.bannedByUid || ''),
    createdAtMs: createdMs,
    updatedAtMs: updatedObj?.toMillis?.() ?? createdMs,
  };
}

export interface ApartmentRecord {
  id: string;
  ownerId: string;
  ownerDisplayName: string;
  category: ListingCategory;
  billingMode: BillingMode;
  baseCurrency?: SupportedCurrency;
  baseMonthlyPrice?: number;
  baseDailyPrice?: number;
  baseStudentBedPrice?: number;
  dailyRateEgp: number;
  monthlyRentEgp: number;
  studentBedsCount: number;
  studentPricePerBedEgp: number;
  houseApartmentsCount?: number;
  houseFloorsCount?: number;
  houseHasGardenOrRoof?: boolean;
  houseHasPrivateGarage?: boolean;
  houseSpecsSummary?: string;
  title: string;
  description: string;
  governorate: string;
  district: string;
  lat: number;
  lng: number;
  bedrooms: number;
  bathrooms: number;
  areaSqm: number;
  furnishing: FurnishingType;
  imageKey: ImageKey;
  hasVirtualTour?: boolean;
  panorama360Key?: Panorama360PresetKey;
  panorama360DataUrl?: string;
  virtualTourUrl?: string;
  verificationStatus: VerificationStatus;
  availabilityStatus: AvailabilityStatus;
  commissionRatePct: number;
  mandateAccepted: boolean;
  isPersistedInDb?: boolean;
  ownerPhone?: string;
}

export interface LegalDossierRecord {
  ownerId: string;
  apartmentId: string;
  nationalIdNumber: string;
  ownerPhone: string;
  exactAddress: string;
  propertyRegistryNumber: string;
  titleDeedFileName: string;
  titleDeedSha256: string;
  utilityBillFileName: string;
  utilityBillSha256: string;
  ownerIbanOrInstapay: string;
  digitalSignatureName: string;
  exclusivityClauseAccepted: boolean;
}

export interface BookingRecord {
  id: string;
  apartmentId: string;
  apartmentTitle: string;
  category?: ListingCategory;
  governorate: string;
  district?: string;
  lat?: number;
  lng?: number;
  tenantId: string;
  tenantDisplayName: string;
  landlordId: string;
  landlordDisplayName?: string;
  rentalUnit?: RentalUnitType;
  unitPriceEgp?: number;
  unitsCount?: number;
  bedsBooked?: number;
  leaseMonths: number;
  monthlyRentEgp: number;
  commissionRatePct?: number;
  totalRentEgp: number;
  platformCommissionEgp: number;
  landlordNetEgp: number;
  paymentCurrency?: SupportedCurrency;
  exchangeRateToEgp?: number;
  paidAmountInCurrency?: number;
  paymentMethod: PaymentMethodType;
  paymentReference: string;
  status: BookingStatus;
  createdAtMs: number;
  escrowAmountEgp?: number;
  commissionAmountEgp?: number;
}

export interface BookingDemandSignalRecord {
  id: string;
  bookingId: string;
  apartmentId: string;
  category: ListingCategory;
  governorate: string;
  district: string;
  lat: number;
  lng: number;
  unitsCount: number;
  totalRentEgp: number;
  status: 'completed';
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ReviewRecord {
  id: string;
  bookingId: string;
  apartmentId: string;
  apartmentTitle: string;
  governorate: string;
  landlordId: string;
  landlordDisplayName: string;
  tenantId: string;
  tenantDisplayName: string;
  rating: number;
  landlordRating: number;
  landlordVerdict: LandlordVerdict;
  comment: string;
  visibilityStatus: ReviewVisibilityStatus;
  createdAtMs: number;
  isPersistedInDb?: boolean;
}

export interface LandlordReputationSummary {
  reviewCount: number;
  averageApartmentRating: number;
  averageLandlordRating: number;
  combinedAverageRating: number;
  trustedRatioPct: number;
  accountStatusLabel: string;
  accountTone: 'trusted' | 'acceptable' | 'warning' | 'new';
  reviews: ReviewRecord[];
}

export interface FavoriteRecord {
  id: string;
  userId: string;
  apartmentId: string;
  category?: ListingCategory;
  title: string;
  governorate: string;
  district: string;
  dailyRateEgp?: number;
  monthlyRentEgp: number;
  studentBedsCount?: number;
  studentPricePerBedEgp?: number;
  priceAlertEnabled?: boolean;
  baselineMonthlyRentEgp?: number;
  baselineDailyRateEgp?: number;
  lastAlertedRentEgp?: number;
  bedrooms: number;
  bathrooms: number;
  areaSqm: number;
  furnishing: FurnishingType;
  imageKey: ApartmentRecord['imageKey'];
  ownerId: string;
  ownerDisplayName: string;
  createdAtMs: number;
}

export interface TenantVerificationRecord {
  userId: string;
  tenantDisplayName: string;
  tenantCategory: TenantCategory;
  verificationStatus: VerificationStatus;
  reviewNote: string;
  submittedAtMs: number;
  updatedAtMs: number;
}

export interface TenantKycPrivateRecord {
  userId: string;
  fullLegalName: string;
  nationalIdNumber: string;
  tenantPhone: string;
  occupationOrUniversity: string;
  idCardFileName: string;
  idCardSha256: string;
  supportingDocFileName: string;
  supportingDocSha256: string;
}

export interface WalletTransactionRecord {
  id: string;
  type: 'deposit' | 'booking_deduction' | 'booking_escrow_hold' | 'refund' | 'bonus';
  amountEgp: number;
  description: string;
  createdAtMs: number;
  paymentMethod?: PaymentMethodType;
  referenceNumber?: string;
  apartmentId?: string;
  apartmentTitle?: string;
  receiptScreenshotUrl?: string;
  status?: 'pending_confirmation' | 'confirmed' | 'rejected';
  confirmedAtMs?: number;
  rejectionReason?: string;
}

export interface TenantWalletRecord {
  uid: string;
  balanceEgp: number;
  totalDepositedEgp: number;
  lockedEscrowEgp: number;
  hasActiveDeposit: boolean;
  lastUpdatedMs: number;
  transactions: WalletTransactionRecord[];
}

export const MIN_SERIOUSNESS_DEPOSIT_EGP = 1000;

export interface LandlordVerificationRecord {
  uid: string;
  fullName: string;
  nationalIdNumber: string;
  ownerPhone: string;
  governorate: string;
  district: string;
  status: VerificationStatus;
  nationalIdFrontUrl?: string;
  nationalIdBackUrl?: string;
  ownershipDocUrl?: string;
  ownershipDocType: 'title_deed' | 'lease_contract' | 'power_of_attorney';
  selfiePhotoUrl?: string;
  facialMatchScore: number;
  submittedAtMs: number;
  verifiedAtMs?: number;
  rejectionReason?: string;
  badgeLabelAr: string;
  badgeLabelEn: string;
}

export interface UnlockedApartmentContact {
  apartmentId: string;
  exactAddress: string;
  buildingNumber: string;
  floorNumber: string;
  apartmentNumber: string;
  streetName: string;
  landlordPhone: string;
  checkInPasscode: string;
  isUnlocked: boolean;
}

export interface RentalRequestRecord {
  id: string;
  apartmentId: string;
  apartmentTitle: string;
  category: ListingCategory;
  governorate: string;
  district: string;
  tenantId: string;
  tenantDisplayName: string;
  landlordId: string;
  landlordDisplayName: string;
  rentalUnit: RentalUnitType;
  unitPriceEgp: number;
  unitsCount: number;
  bedsBooked: number;
  commissionRatePct: number;
  totalRentEgp: number;
  platformCommissionEgp: number;
  landlordNetEgp: number;
  paymentCurrency?: SupportedCurrency;
  exchangeRateToEgp?: number;
  paidAmountInCurrency?: number;
  status: RentalRequestStatus;
  statusNote: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface NotificationRecord {
  id: string;
  recipientId: string;
  actorId: string;
  actorDisplayName: string;
  recipientRole: NotificationRecipientRole;
  statusType: NotificationStatusType;
  relatedEntityType: NotificationRelatedEntityType;
  relatedEntityId: string;
  apartmentId: string;
  apartmentTitle: string;
  governorate: string;
  amountEgp: number;
  title: string;
  message: string;
  isRead: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export function buildFavoriteDocId(userId: string, apartmentId: string): string {
  return `${userId}__${apartmentId}`;
}

export function buildNotificationId(prefix = 'ntf'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatArabicTimestamp(timestampMs: number): string {
  if (!timestampMs || Number.isNaN(timestampMs)) return 'الآن';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (diffSec < 60) return 'منذ لحظات';
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return `منذ ${mins} د`;
  }
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return `منذ ${hours} س`;
  }
  return new Intl.DateTimeFormat('ar-EG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestampMs));
}

export function normalizeBookingRecord(
  raw: Record<string, unknown>,
  id: string
): BookingRecord {
  const createdAtObj = raw.createdAt as { toMillis?: () => number } | undefined;
  const rawLat = typeof raw.lat === 'number' && !Number.isNaN(raw.lat) ? raw.lat : undefined;
  const rawLng = typeof raw.lng === 'number' && !Number.isNaN(raw.lng) ? raw.lng : undefined;
  return {
    id,
    apartmentId: String(raw.apartmentId || id),
    apartmentTitle: String(raw.apartmentTitle || ''),
    category: (raw.category as ListingCategory) || 'family_apartment',
    governorate: String(raw.governorate || 'القاهرة'),
    district:
      typeof raw.district === 'string' && raw.district.trim().length >= 2
        ? raw.district.trim().slice(0, VALIDATION_LIMITS.DISTRICT_MAX)
        : undefined,
    lat:
      rawLat !== undefined &&
      rawLat >= VALIDATION_LIMITS.LAT_MIN &&
      rawLat <= VALIDATION_LIMITS.LAT_MAX
        ? rawLat
        : undefined,
    lng:
      rawLng !== undefined &&
      rawLng >= VALIDATION_LIMITS.LNG_MIN &&
      rawLng <= VALIDATION_LIMITS.LNG_MAX
        ? rawLng
        : undefined,
    tenantId: String(raw.tenantId || ''),
    tenantDisplayName: String(raw.tenantDisplayName || 'مستأجر موثق'),
    landlordId: String(raw.landlordId || ''),
    landlordDisplayName: raw.landlordDisplayName ? String(raw.landlordDisplayName) : undefined,
    rentalUnit: (raw.rentalUnit as RentalUnitType) || 'month',
    unitPriceEgp:
      typeof raw.unitPriceEgp === 'number'
        ? raw.unitPriceEgp
        : typeof raw.monthlyRentEgp === 'number'
          ? raw.monthlyRentEgp
          : 0,
    unitsCount:
      typeof raw.unitsCount === 'number'
        ? raw.unitsCount
        : typeof raw.leaseMonths === 'number'
          ? raw.leaseMonths
          : 1,
    bedsBooked: typeof raw.bedsBooked === 'number' ? raw.bedsBooked : 0,
    leaseMonths: typeof raw.leaseMonths === 'number' ? raw.leaseMonths : 1,
    monthlyRentEgp: typeof raw.monthlyRentEgp === 'number' ? raw.monthlyRentEgp : 0,
    commissionRatePct:
      typeof raw.commissionRatePct === 'number'
        ? raw.commissionRatePct
        : VALIDATION_LIMITS.DEFAULT_COMMISSION_PCT,
    totalRentEgp: typeof raw.totalRentEgp === 'number' ? raw.totalRentEgp : 0,
    platformCommissionEgp:
      typeof raw.platformCommissionEgp === 'number' ? raw.platformCommissionEgp : 0,
    landlordNetEgp: typeof raw.landlordNetEgp === 'number' ? raw.landlordNetEgp : 0,
    paymentCurrency: (raw.paymentCurrency as SupportedCurrency) || undefined,
    exchangeRateToEgp:
      typeof raw.exchangeRateToEgp === 'number' ? raw.exchangeRateToEgp : undefined,
    paidAmountInCurrency:
      typeof raw.paidAmountInCurrency === 'number' ? raw.paidAmountInCurrency : undefined,
    paymentMethod: (raw.paymentMethod as PaymentMethodType) || 'card_meeza',
    paymentReference: String(raw.paymentReference || ''),
    status: (raw.status as BookingStatus) || 'escrow_paid',
    createdAtMs: createdAtObj?.toMillis?.() ?? Date.now(),
  };
}

export function normalizeBookingDemandSignalRecord(
  raw: Record<string, unknown>,
  id: string
): BookingDemandSignalRecord {
  const createdObj = raw.createdAt as { toMillis?: () => number } | undefined;
  const updatedObj = raw.updatedAt as { toMillis?: () => number } | undefined;
  const createdMs = createdObj?.toMillis?.() ?? Date.now();
  const govName = String(raw.governorate || 'القاهرة')
    .trim()
    .slice(0, VALIDATION_LIMITS.GOV_MAX);
  const safeGov = govName.length >= VALIDATION_LIMITS.GOV_MIN ? govName : 'القاهرة';
  const govFallback = EGYPT_GOVERNORATES.find((g) => g.name === safeGov) || EGYPT_GOVERNORATES[0];

  const rawLat = typeof raw.lat === 'number' && !Number.isNaN(raw.lat) ? raw.lat : govFallback.lat;
  const rawLng = typeof raw.lng === 'number' && !Number.isNaN(raw.lng) ? raw.lng : govFallback.lng;
  const clampedLat = Math.max(
    VALIDATION_LIMITS.LAT_MIN,
    Math.min(VALIDATION_LIMITS.LAT_MAX, rawLat)
  );
  const clampedLng = Math.max(
    VALIDATION_LIMITS.LNG_MIN,
    Math.min(VALIDATION_LIMITS.LNG_MAX, rawLng)
  );

  const rawDistrict = String(raw.district || safeGov)
    .trim()
    .slice(0, VALIDATION_LIMITS.DISTRICT_MAX);
  const safeDistrict =
    rawDistrict.length >= VALIDATION_LIMITS.DISTRICT_MIN ? rawDistrict : safeGov;

  return {
    id,
    bookingId: String(raw.bookingId || id),
    apartmentId: String(raw.apartmentId || id),
    category: (raw.category as ListingCategory) || 'family_apartment',
    governorate: safeGov,
    district: safeDistrict,
    lat: clampedLat,
    lng: clampedLng,
    unitsCount:
      typeof raw.unitsCount === 'number' && raw.unitsCount >= 1
        ? Math.min(365, Math.round(raw.unitsCount))
        : 1,
    totalRentEgp:
      typeof raw.totalRentEgp === 'number' && raw.totalRentEgp >= 300
        ? Math.round(raw.totalRentEgp)
        : 300,
    status: 'completed',
    createdAtMs: createdMs,
    updatedAtMs: updatedObj?.toMillis?.() ?? createdMs,
  };
}

export function normalizeRentalRequestRecord(
  raw: Record<string, unknown>,
  id: string
): RentalRequestRecord {
  const createdAtObj = raw.createdAt as { toMillis?: () => number } | undefined;
  const updatedAtObj = raw.updatedAt as { toMillis?: () => number } | undefined;
  const createdMs = createdAtObj?.toMillis?.() ?? Date.now();
  return {
    id,
    apartmentId: String(raw.apartmentId || ''),
    apartmentTitle: String(raw.apartmentTitle || ''),
    category: (raw.category as ListingCategory) || 'family_apartment',
    governorate: String(raw.governorate || 'القاهرة'),
    district: String(raw.district || ''),
    tenantId: String(raw.tenantId || ''),
    tenantDisplayName: String(raw.tenantDisplayName || 'مستأجر موثق'),
    landlordId: String(raw.landlordId || ''),
    landlordDisplayName: String(raw.landlordDisplayName || 'مالك موثق'),
    rentalUnit: (raw.rentalUnit as RentalUnitType) || 'month',
    unitPriceEgp: typeof raw.unitPriceEgp === 'number' ? raw.unitPriceEgp : 0,
    unitsCount: typeof raw.unitsCount === 'number' ? raw.unitsCount : 1,
    bedsBooked: typeof raw.bedsBooked === 'number' ? raw.bedsBooked : 0,
    commissionRatePct:
      typeof raw.commissionRatePct === 'number'
        ? raw.commissionRatePct
        : VALIDATION_LIMITS.DEFAULT_COMMISSION_PCT,
    totalRentEgp: typeof raw.totalRentEgp === 'number' ? raw.totalRentEgp : 0,
    platformCommissionEgp:
      typeof raw.platformCommissionEgp === 'number' ? raw.platformCommissionEgp : 0,
    landlordNetEgp: typeof raw.landlordNetEgp === 'number' ? raw.landlordNetEgp : 0,
    paymentCurrency: (raw.paymentCurrency as SupportedCurrency) || undefined,
    exchangeRateToEgp:
      typeof raw.exchangeRateToEgp === 'number' ? raw.exchangeRateToEgp : undefined,
    paidAmountInCurrency:
      typeof raw.paidAmountInCurrency === 'number' ? raw.paidAmountInCurrency : undefined,
    status: (raw.status as RentalRequestStatus) || 'awaiting_payment',
    statusNote: String(raw.statusNote || ''),
    createdAtMs: createdMs,
    updatedAtMs: updatedAtObj?.toMillis?.() ?? createdMs,
  };
}

export function normalizeNotificationRecord(
  raw: Record<string, unknown>,
  id: string
): NotificationRecord {
  const createdAtObj = raw.createdAt as { toMillis?: () => number } | undefined;
  const updatedAtObj = raw.updatedAt as { toMillis?: () => number } | undefined;
  const createdMs = createdAtObj?.toMillis?.() ?? Date.now();
  return {
    id,
    recipientId: String(raw.recipientId || ''),
    actorId: String(raw.actorId || ''),
    actorDisplayName: String(raw.actorDisplayName || 'منصة إيجار'),
    recipientRole: (raw.recipientRole as NotificationRecipientRole) || 'tenant',
    statusType: (raw.statusType as NotificationStatusType) || 'awaiting_payment',
    relatedEntityType:
      (raw.relatedEntityType as NotificationRelatedEntityType) || 'rental_request',
    relatedEntityId: String(raw.relatedEntityId || ''),
    apartmentId: String(raw.apartmentId || ''),
    apartmentTitle: String(raw.apartmentTitle || ''),
    governorate: String(raw.governorate || 'القاهرة'),
    amountEgp: typeof raw.amountEgp === 'number' ? raw.amountEgp : 0,
    title: String(raw.title || ''),
    message: String(raw.message || ''),
    isRead: Boolean(raw.isRead ?? false),
    createdAtMs: createdMs,
    updatedAtMs: updatedAtObj?.toMillis?.() ?? createdMs,
  };
}

export function normalizeApartmentRecord(
  raw: Record<string, unknown>,
  id: string,
  isPersistedInDb = true
): ApartmentRecord {
  const category = (raw.category as ListingCategory) || 'family_apartment';
  const billingMode = (raw.billingMode as BillingMode) || 'monthly_only';
  return {
    id,
    ownerId: String(raw.ownerId || ''),
    ownerDisplayName: String(raw.ownerDisplayName || 'مالك موثق'),
    category,
    billingMode,
    baseCurrency: (raw.baseCurrency as SupportedCurrency) || 'EGP',
    baseMonthlyPrice:
      typeof raw.baseMonthlyPrice === 'number' ? raw.baseMonthlyPrice : undefined,
    baseDailyPrice: typeof raw.baseDailyPrice === 'number' ? raw.baseDailyPrice : undefined,
    baseStudentBedPrice:
      typeof raw.baseStudentBedPrice === 'number' ? raw.baseStudentBedPrice : undefined,
    dailyRateEgp: typeof raw.dailyRateEgp === 'number' ? raw.dailyRateEgp : 0,
    monthlyRentEgp: typeof raw.monthlyRentEgp === 'number' ? raw.monthlyRentEgp : 10000,
    studentBedsCount: typeof raw.studentBedsCount === 'number' ? raw.studentBedsCount : 0,
    studentPricePerBedEgp:
      typeof raw.studentPricePerBedEgp === 'number' ? raw.studentPricePerBedEgp : 0,
    houseApartmentsCount:
      typeof raw.houseApartmentsCount === 'number' ? raw.houseApartmentsCount : undefined,
    houseFloorsCount:
      typeof raw.houseFloorsCount === 'number' ? raw.houseFloorsCount : undefined,
    houseHasGardenOrRoof:
      typeof raw.houseHasGardenOrRoof === 'boolean' ? raw.houseHasGardenOrRoof : undefined,
    houseHasPrivateGarage:
      typeof raw.houseHasPrivateGarage === 'boolean' ? raw.houseHasPrivateGarage : undefined,
    houseSpecsSummary:
      typeof raw.houseSpecsSummary === 'string' ? raw.houseSpecsSummary : undefined,
    title: String(raw.title || ''),
    description: String(raw.description || ''),
    governorate: String(raw.governorate || 'القاهرة'),
    district: String(raw.district || ''),
    lat: typeof raw.lat === 'number' ? raw.lat : 30.0444,
    lng: typeof raw.lng === 'number' ? raw.lng : 31.2357,
    bedrooms: typeof raw.bedrooms === 'number' ? raw.bedrooms : 2,
    bathrooms: typeof raw.bathrooms === 'number' ? raw.bathrooms : 1,
    areaSqm: typeof raw.areaSqm === 'number' ? raw.areaSqm : 120,
    furnishing: (raw.furnishing as FurnishingType) || 'furnished',
    imageKey: (raw.imageKey as ImageKey) || 'zamalek_nile',
    hasVirtualTour: Boolean(raw.hasVirtualTour ?? false),
    panorama360Key: (raw.panorama360Key as Panorama360PresetKey) || 'none',
    panorama360DataUrl:
      typeof raw.panorama360DataUrl === 'string' ? raw.panorama360DataUrl : undefined,
    virtualTourUrl: typeof raw.virtualTourUrl === 'string' ? raw.virtualTourUrl : undefined,
    verificationStatus: (raw.verificationStatus as VerificationStatus) || 'verified',
    availabilityStatus: (raw.availabilityStatus as AvailabilityStatus) || 'available',
    commissionRatePct:
      typeof raw.commissionRatePct === 'number'
        ? raw.commissionRatePct
        : VALIDATION_LIMITS.DEFAULT_COMMISSION_PCT,
    mandateAccepted: Boolean(raw.mandateAccepted ?? true),
    isPersistedInDb,
  };
}

/**
 * Computes the One-Time Brokerage Commission ("عمولة مرة واحدة زي السمسار")
 * using exact integer division matching Firestore CEL: (unitPriceEgp * commissionRatePct) / 100
 */
export function computeOneTimeCommission(unitPriceEgp: number, commissionRatePct: number): number {
  const safePrice = Math.max(0, Math.round(unitPriceEgp));
  const safeRate = Math.max(
    VALIDATION_LIMITS.COMMISSION_MIN,
    Math.min(VALIDATION_LIMITS.COMMISSION_MAX, Math.round(commissionRatePct))
  );
  return Math.max(1, Math.floor((safePrice * safeRate) / 100));
}

export function formatEgp(amount: number): string {
  return new Intl.NumberFormat('ar-EG', {
    maximumFractionDigits: 0,
  }).format(amount);
}

export function snapToMultipleOf10(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, Math.round(value || min)));
  return Math.round(clamped / 10) * 10;
}

export function snapRentToMultipleOf10(rent: number): number {
  return snapToMultipleOf10(rent, VALIDATION_LIMITS.RENT_MIN, VALIDATION_LIMITS.RENT_MAX);
}

export function getPrimaryDisplayPrice(
  apt: ApartmentRecord,
  lang: 'ar' | 'en' = 'ar'
): {
  amountEgp: number;
  unitLabel: string;
  pinSuffix: string;
  secondaryNote: string | null;
} {
  const fmt = (n: number) =>
    new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
      maximumFractionDigits: 0,
    }).format(n);

  if (apt.category === 'student_housing' && apt.studentPricePerBedEgp > 0) {
    return {
      amountEgp: apt.studentPricePerBedEgp,
      unitLabel: lang === 'ar' ? 'ج.م / سرير شهرياً' : 'EGP / bed / mo',
      pinSuffix: lang === 'ar' ? 'ج.م / سرير' : 'EGP/bed',
      secondaryNote:
        lang === 'ar'
          ? `متاح ${apt.studentBedsCount} سراير · الشقة كاملة ${fmt(apt.monthlyRentEgp)} ج.م`
          : `${apt.studentBedsCount} beds available · Full unit ${fmt(apt.monthlyRentEgp)} EGP`,
    };
  }
  if (apt.category === 'hotel_room' && apt.dailyRateEgp > 0) {
    return {
      amountEgp: apt.dailyRateEgp,
      unitLabel: lang === 'ar' ? 'ج.م / يوم' : 'EGP / night',
      pinSuffix: lang === 'ar' ? 'ج.م / يوم' : 'EGP/d',
      secondaryNote:
        lang === 'ar'
          ? `أو بالشهر ${fmt(apt.monthlyRentEgp)} ج.م`
          : `Or monthly ${fmt(apt.monthlyRentEgp)} EGP`,
    };
  }
  if (apt.category === 'industrial_factory') {
    return {
      amountEgp: apt.monthlyRentEgp,
      unitLabel: lang === 'ar' ? 'ج.م / شهر' : 'EGP / mo',
      pinSuffix: lang === 'ar' ? 'ج.م / شهر' : 'EGP/mo',
      secondaryNote:
        lang === 'ar'
          ? `مساحة تشغيلية ${fmt(apt.areaSqm)} م²`
          : `Operational area ${fmt(apt.areaSqm)} m²`,
    };
  }
  if (apt.category === 'whole_house') {
    const aptsCount =
      typeof apt.houseApartmentsCount === 'number' && apt.houseApartmentsCount > 0
        ? apt.houseApartmentsCount
        : 2;
    const floorsCount =
      typeof apt.houseFloorsCount === 'number' && apt.houseFloorsCount > 0
        ? apt.houseFloorsCount
        : 2;
    const dailySuffix =
      apt.billingMode === 'daily_or_monthly' && apt.dailyRateEgp > 0
        ? lang === 'ar'
          ? ` · يومي ${fmt(apt.dailyRateEgp)} ج.م`
          : ` · Daily ${fmt(apt.dailyRateEgp)} EGP`
        : '';
    return {
      amountEgp: apt.monthlyRentEgp,
      unitLabel: lang === 'ar' ? 'ج.م / شهر (منزل كامل)' : 'EGP / mo (Whole House)',
      pinSuffix: lang === 'ar' ? 'ج.م / منزل' : 'EGP/house',
      secondaryNote:
        lang === 'ar'
          ? `منزل يضم ${fmt(aptsCount)} شقق · ${fmt(floorsCount)} أدوار${dailySuffix}`
          : `House with ${fmt(aptsCount)} apts · ${fmt(floorsCount)} floors${dailySuffix}`,
    };
  }
  return {
    amountEgp: apt.monthlyRentEgp,
    unitLabel: lang === 'ar' ? 'ج.م / شهر' : 'EGP / mo',
    pinSuffix: lang === 'ar' ? 'ج.م' : 'EGP',
    secondaryNote:
      apt.studentBedsCount > 0 && apt.studentPricePerBedEgp > 0
        ? lang === 'ar'
          ? `للطلاب: ${fmt(apt.studentPricePerBedEgp)} ج.م / سرير (${apt.studentBedsCount} سراير)`
          : `Students: ${fmt(apt.studentPricePerBedEgp)} EGP / bed (${apt.studentBedsCount} beds)`
        : null,
  };
}

// Baseline multi-sector showcase units across Egypt (all 18 allowlisted IDs in firestore.rules)
export const SHOWCASE_APARTMENTS: ApartmentRecord[] = [
  // ================= 01. FAMILY APARTMENTS (شقق العائلات) =================
  {
    id: 'apt_zamalek_nile_01',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'م. طارق المنشاوي',
    category: 'family_apartment',
    billingMode: 'monthly_only',
    dailyRateEgp: 0,
    monthlyRentEgp: 32000,
    studentBedsCount: 0,
    studentPricePerBedEgp: 0,
    title: 'شقة نيلية بانوراما في الزمالك — شارع أبو الفدا',
    description:
      'شقة نيلية فاخرة بالدور السادس مع تراس مفتوح يطل مباشرة على نيل القاهرة، أرضيات رخام ترافرتين وتكييف مركزي ومطبخ مجهز بالكامل للعائلات.',
    governorate: 'القاهرة',
    district: 'الزمالك',
    lat: 30.0642,
    lng: 31.2179,
    bedrooms: 3,
    bathrooms: 3,
    areaSqm: 210,
    furnishing: 'furnished',
    imageKey: 'zamalek_nile',
    baseCurrency: 'EGP',
    baseMonthlyPrice: 32000,
    hasVirtualTour: true,
    virtualTourUrl: 'https://www.matterport.com/tours/360-egypt-cairo-nile-view',
    panorama360Key: 'cairo_nile_360',
    houseHasGardenOrRoof: false,
    houseHasPrivateGarage: true,
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },
  {
    id: 'apt_new_cairo_02',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'د. نهى عبد الرحمن',
    category: 'family_apartment',
    billingMode: 'monthly_only',
    baseCurrency: 'EGP',
    baseMonthlyPrice: 26000,
    dailyRateEgp: 0,
    monthlyRentEgp: 26000,
    studentBedsCount: 4,
    studentPricePerBedEgp: 7000,
    title: 'بنتهاوس مودرن بالتجمع الخامس — قرب الجامعة الأمريكية',
    description:
      'وحدة معمارية مشمسة بتراس خاص 65 متر في حي اللوتس بالتجمع الخامس، متاحة للإيجار العائلي أو لسكن طلاب الجامعة الأمريكية بتسعير منفصل لكل سرير.',
    governorate: 'القاهرة',
    district: 'التجمع الخامس',
    lat: 30.0188,
    lng: 31.4913,
    bedrooms: 3,
    bathrooms: 3,
    areaSqm: 235,
    furnishing: 'furnished',
    imageKey: 'new_cairo_penthouse',
    hasVirtualTour: true,
    virtualTourUrl: 'https://www.matterport.com/tours/360-egypt-new-cairo-penthouse',
    panorama360Key: 'new_cairo_penthouse_360',
    houseHasGardenOrRoof: true,
    houseHasPrivateGarage: true,
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },
  {
    id: 'apt_alex_gleem_03',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'أ. كريم الشاذلي',
    category: 'family_apartment',
    billingMode: 'monthly_only',
    dailyRateEgp: 0,
    monthlyRentEgp: 19500,
    studentBedsCount: 0,
    studentPricePerBedEgp: 0,
    title: 'شقة أول صف على البحر — كورنيش جليم الإسكندرية',
    description:
      'رؤية بحرية مفتوحة بالكامل للبحر المتوسط من الريسبشن والغرف، أسقف عالية وأرضيات باركيه أرو طبيعي على بعد خطوات من جليم باي.',
    governorate: 'الإسكندرية',
    district: 'جليم — طريق الجيش',
    lat: 31.2394,
    lng: 29.9612,
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 175,
    furnishing: 'furnished',
    imageKey: 'alexandria_corniche',
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },
  {
    id: 'apt_zayed_duplex_04',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'م. حسام الدين فوزي',
    category: 'family_apartment',
    billingMode: 'monthly_only',
    dailyRateEgp: 0,
    monthlyRentEgp: 28000,
    studentBedsCount: 0,
    studentPricePerBedEgp: 0,
    title: 'دوبلكس بحديقة داخلية في الشيخ زايد — الحي الرابع',
    description:
      'دوبلكس مزدوج الارتفاع بتصميم معماري هادئ وإضاءة طبيعية غامرة، يقع في كمبوند عائلي متكامل الخدمات بجوار أركان بلازا.',
    governorate: 'الجيزة',
    district: 'الشيخ زايد',
    lat: 30.0385,
    lng: 30.9814,
    bedrooms: 4,
    bathrooms: 3,
    areaSqm: 260,
    furnishing: 'semi_furnished',
    imageKey: 'sheikh_zayed_duplex',
    houseHasGardenOrRoof: true,
    houseHasPrivateGarage: true,
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },
  {
    id: 'apt_maadi_sarayat_05',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'أ. سلمى الكيلاني',
    category: 'family_apartment',
    billingMode: 'monthly_only',
    dailyRateEgp: 0,
    monthlyRentEgp: 22000,
    studentBedsCount: 0,
    studentPricePerBedEgp: 0,
    title: 'شقة هادئة وسط الأشجار في سرايات المعادي — شارع 9',
    description:
      'إطلالة خضراء مفتوحة في أرقى مربعات سرايات المعادي، أرضيات باركيه مسمار وهدوء تام على بعد 5 دقائق من محطة المترو.',
    governorate: 'القاهرة',
    district: 'سرايات المعادي',
    lat: 29.9602,
    lng: 31.2569,
    bedrooms: 2,
    bathrooms: 2,
    areaSqm: 165,
    furnishing: 'furnished',
    imageKey: 'maadi_garden',
    houseHasGardenOrRoof: true,
    houseHasPrivateGarage: false,
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },
  {
    id: 'apt_hurghada_gouna_06',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'م. شريف عبد النور',
    category: 'family_apartment',
    billingMode: 'monthly_only',
    dailyRateEgp: 0,
    monthlyRentEgp: 17000,
    studentBedsCount: 0,
    studentPricePerBedEgp: 0,
    title: 'شقة بإطلالة لاجون في الغردقة — الممشى السياحي',
    description:
      'وحدة ساحلية مميزة بإطلالة مباشرة على المياه الفيروزية، مكيفة بالكامل ومناسبة للإقامة العائلية الشهرية أو السنوية بالبحر الأحمر.',
    governorate: 'البحر الأحمر',
    district: 'الغردقة — الممشى السياحي',
    lat: 27.1972,
    lng: 33.8394,
    bedrooms: 2,
    bathrooms: 2,
    areaSqm: 130,
    furnishing: 'furnished',
    imageKey: 'alexandria_corniche',
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },
  {
    id: 'apt_mansoura_nile_07',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'د. عمرو السعيد',
    category: 'family_apartment',
    billingMode: 'monthly_only',
    dailyRateEgp: 0,
    monthlyRentEgp: 12500,
    studentBedsCount: 3,
    studentPricePerBedEgp: 4500,
    title: 'شقة نيلية فاخرة بالمنصورة — المشاية السفلية قرب الجامعة',
    description:
      'شقة واسعة أمام نادي الجزيرة بالمشاية السفلية في قلب المنصورة، متاحة للعائلات أو لطلاب كليات الطب والهندسة بجامعة المنصورة.',
    governorate: 'الدقهلية',
    district: 'المنصورة — المشاية السفلية',
    lat: 31.0456,
    lng: 31.3682,
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 180,
    furnishing: 'semi_furnished',
    imageKey: 'zamalek_nile',
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },
  {
    id: 'apt_aswan_corniche_08',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'أ. يحيى النوبي',
    category: 'family_apartment',
    billingMode: 'monthly_only',
    dailyRateEgp: 0,
    monthlyRentEgp: 14000,
    studentBedsCount: 0,
    studentPricePerBedEgp: 0,
    title: 'شقة بانوراما النيل في أسوان — أمام جزيرة إلفنتين',
    description:
      'إطلالة ساحرة على المراكب الشراعية وجزيرة إلفنتين من كورنيش النيل بأسوان، مفروشة بالكامل بتصميم عصري دافئ.',
    governorate: 'أسوان',
    district: 'كورنيش النيل — أسوان',
    lat: 24.0908,
    lng: 32.8952,
    bedrooms: 2,
    bathrooms: 2,
    areaSqm: 145,
    furnishing: 'furnished',
    imageKey: 'maadi_garden',
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },
  {
    id: 'apt_heliopolis_korba_09',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'م. هاني عبد العزيز',
    category: 'family_apartment',
    billingMode: 'monthly_only',
    dailyRateEgp: 0,
    monthlyRentEgp: 16000,
    studentBedsCount: 0,
    studentPricePerBedEgp: 0,
    title: 'شقة كلاسيكية أسقف عالية في مصر الجديدة — الكوربة',
    description:
      'شقة معمارية بتشطيب سوبر لوكس بدون فرش في قلب الكوربة بمصر الجديدة، أرضيات باركيه طبيعي وشرفات واسعة قريبة من شارع بغداد.',
    governorate: 'القاهرة',
    district: 'مصر الجديدة — الكوربة',
    lat: 30.0914,
    lng: 31.3245,
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 190,
    furnishing: 'unfurnished',
    imageKey: 'maadi_garden',
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },
  {
    id: 'apt_dokki_studio_10',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'أ. ناردين فخري',
    category: 'family_apartment',
    billingMode: 'monthly_only',
    dailyRateEgp: 0,
    monthlyRentEgp: 11000,
    studentBedsCount: 2,
    studentPricePerBedEgp: 6000,
    title: 'استوديو حديث بغرفة مستقلة في الدقي — ميدان المساحة',
    description:
      'وحدة عصرية مفروشة بالكامل بغرفة نوم مستقلة وريسبشن مشرق في ميدان المساحة بالدقي، مجهزة بإنترنت ألياف ضوئية وتكييفات سبليت.',
    governorate: 'الجيزة',
    district: 'الدقي — ميدان المساحة',
    lat: 30.0378,
    lng: 31.2119,
    bedrooms: 1,
    bathrooms: 1,
    areaSqm: 85,
    furnishing: 'furnished',
    imageKey: 'new_cairo_penthouse',
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },

  // ================= 02. STUDENT HOUSING (سكن الطلاب) =================
  {
    id: 'stu_new_cairo_auc_11',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'م. وائل الدمرداش',
    category: 'student_housing',
    billingMode: 'monthly_only',
    dailyRateEgp: 0,
    monthlyRentEgp: 18000,
    studentBedsCount: 4,
    studentPricePerBedEgp: 4500,
    title: 'سكن طلابي فندقي بالتجمع الخامس — أمام بوابة الجامعة الأمريكية',
    description:
      'شقة طلابية مخصصة للطلاب الجامعيين تضم 4 سراير مستقلة بمكتب مذاكرة وخزانة خاصة لكل طالب، إنترنت فايبر غير محدود، وخدمة نظافة أسبوعية.',
    governorate: 'القاهرة',
    district: 'التجمع الخامس — حي الجامعات',
    lat: 30.0215,
    lng: 31.4985,
    bedrooms: 2,
    bathrooms: 2,
    areaSqm: 140,
    furnishing: 'furnished',
    imageKey: 'student_housing_cairo',
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },
  {
    id: 'stu_dokki_cairo_uni_12',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'أ. محمود الجندي',
    category: 'student_housing',
    billingMode: 'monthly_only',
    dailyRateEgp: 0,
    monthlyRentEgp: 12800,
    studentBedsCount: 4,
    studentPricePerBedEgp: 3200,
    title: 'سكن طلاب موثق في بين السرايات والدقي — خطوات من جامعة القاهرة',
    description:
      'وحدة طلابية هادئة ومراقبة بالكاميرات بمدخل العقار، 4 سراير مفردة مريحة مع مكاتب إضاءة مباشرة وتكييف ومطبخ متكامل للمغتربين.',
    governorate: 'الجيزة',
    district: 'الدقي — أمام جامعة القاهرة',
    lat: 30.0289,
    lng: 31.2094,
    bedrooms: 2,
    bathrooms: 2,
    areaSqm: 125,
    furnishing: 'furnished',
    imageKey: 'student_housing_cairo',
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },
  {
    id: 'stu_smouha_alex_13',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'د. رانيا الصاوي',
    category: 'student_housing',
    billingMode: 'monthly_only',
    dailyRateEgp: 0,
    monthlyRentEgp: 10500,
    studentBedsCount: 3,
    studentPricePerBedEgp: 3500,
    title: 'سكن طالبات موثق في سموحة — قرب مجمع كليات الإسكندرية',
    description:
      'شقة مجهزة بالكامل لسكن الطالبات في ميدان فيكتور عمانويل بسموحة، 3 سراير فندقية ومكاتب دراسية وأمن نسائي على مدار الساعة.',
    governorate: 'الإسكندرية',
    district: 'سموحة — فيكتور عمانويل',
    lat: 31.2156,
    lng: 29.942,
    bedrooms: 2,
    bathrooms: 1,
    areaSqm: 115,
    furnishing: 'furnished',
    imageKey: 'student_housing_cairo',
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },

  // ================= 03. HOTEL ROOMS (غرف الفنادق باليوم أو الشهر) =================
  {
    id: 'htl_cairo_nile_suite_14',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'إدارة أجنحة نايل بلازا الفندقية',
    category: 'hotel_room',
    billingMode: 'daily_or_monthly',
    dailyRateEgp: 3800,
    monthlyRentEgp: 78000,
    studentBedsCount: 0,
    studentPricePerBedEgp: 0,
    title: 'جناح فندقي تنفيذي مطل على النيل — جاردن سيتي (باليوم أو الشهر)',
    description:
      'جناح فندقي مرخص بفرش خمس نجوم وإطلالة مباشرة على النيل، متاح للحجز اليومي السريع أو للإقامة الشهرية التنفيذية شامل الغرف والهاوس كيبنج.',
    governorate: 'القاهرة',
    district: 'جاردن سيتي — كورنيش النيل',
    lat: 30.0365,
    lng: 31.2312,
    bedrooms: 1,
    bathrooms: 1,
    areaSqm: 68,
    furnishing: 'furnished',
    imageKey: 'hotel_cairo_suite',
    baseCurrency: 'EGP',
    baseDailyPrice: 3800,
    baseMonthlyPrice: 78000,
    hasVirtualTour: true,
    virtualTourUrl: 'https://www.matterport.com/tours/360-egypt-cairo-hotel-suite',
    panorama360Key: 'hotel_suite_360',
    houseHasGardenOrRoof: false,
    houseHasPrivateGarage: true,
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },
  {
    id: 'htl_hurghada_resort_15',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'منتجع مارينا ريد سي الفندقي',
    category: 'hotel_room',
    billingMode: 'daily_or_monthly',
    baseCurrency: 'EGP',
    baseDailyPrice: 2600,
    baseMonthlyPrice: 54000,
    dailyRateEgp: 2600,
    monthlyRentEgp: 54000,
    studentBedsCount: 0,
    studentPricePerBedEgp: 0,
    title: 'غرفة فندقية ديلوكس على البحر مباشرة — الغردقة سهل حشيش',
    description:
      'غرفة فندقية بتراس خاص يطل على البحر الأحمر مباشرة، متاحة للإيجار باليوم لقضاء العطلات أو بالشهر للعمل عن بُعد شاملة الكهرباء والإنترنت.',
    governorate: 'البحر الأحمر',
    district: 'سهل حشيش — الغردقة',
    lat: 27.0419,
    lng: 33.8975,
    bedrooms: 1,
    bathrooms: 1,
    areaSqm: 52,
    furnishing: 'furnished',
    imageKey: 'hotel_redsea_room',
    hasVirtualTour: true,
    virtualTourUrl: 'https://www.matterport.com/tours/360-egypt-redsea-resort',
    panorama360Key: 'redsea_resort_360',
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },
  {
    id: 'htl_alex_stanley_16',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'فندق وأجنحة ستانلي باي',
    category: 'hotel_room',
    billingMode: 'daily_or_monthly',
    dailyRateEgp: 2200,
    monthlyRentEgp: 46000,
    studentBedsCount: 0,
    studentPricePerBedEgp: 0,
    title: 'غرفة فندقية بانوراما كوبري ستانلي — الإسكندرية (يومي / شهري)',
    description:
      'غرفة فندقية راقية مواجهة لخليج ستانلي مباشرة، استقبال فندقي 24 ساعة وخدمة غرف يومية مع مرونة الحجز بالليلة أو بالشهر.',
    governorate: 'الإسكندرية',
    district: 'ستانلي — الكورنيش',
    lat: 31.2345,
    lng: 29.9489,
    bedrooms: 1,
    bathrooms: 1,
    areaSqm: 48,
    furnishing: 'furnished',
    imageKey: 'hotel_cairo_suite',
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },

  // ================= 04. INDUSTRIAL FACTORIES (المصانع والمنشآت) =================
  {
    id: 'fac_tenth_ramadan_17',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'مجموعة الدلتا للمنشآت الصناعية',
    category: 'industrial_factory',
    billingMode: 'monthly_only',
    dailyRateEgp: 0,
    monthlyRentEgp: 145000,
    studentBedsCount: 0,
    studentPricePerBedEgp: 0,
    title: 'مصنع وهنجر تشغيلي مرخص بالعاشر من رمضان — المنطقة الصناعية A2',
    description:
      'منشأة صناعية جاهزة للتشغيل الفوري بارتفاع صافي 9 أمتار وأرضيات خرسانة هليكوبتر إيبوكسي، محول كهرباء صناعي 500 ك.ف.أ، ورخصة دفاع مدني سارية.',
    governorate: 'الشرقية',
    district: 'العاشر من رمضان — المنطقة الصناعية الثالثة',
    lat: 30.2965,
    lng: 31.7418,
    bedrooms: 3,
    bathrooms: 4,
    areaSqm: 2400,
    furnishing: 'unfurnished',
    imageKey: 'factory_industrial_egypt',
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },
  {
    id: 'fac_october_ind_18',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'م. مدحت السويدي للمطورين الصناعيين',
    category: 'industrial_factory',
    billingMode: 'monthly_only',
    dailyRateEgp: 0,
    monthlyRentEgp: 98000,
    studentBedsCount: 0,
    studentPricePerBedEgp: 0,
    title: 'مصنع ومستودع لوجستي في 6 أكتوبر — المنطقة الصناعية الأولى',
    description:
      'عنبر تصنيع وتخزين بمواصفات قياسية على محور خدمي رئيسي بمدينة 6 أكتوبر، رصيف شحن وتفريغ تريلات، ومبنى إداري مستقل مكيف.',
    governorate: 'الجيزة',
    district: '6 أكتوبر — المنطقة الصناعية الأولى',
    lat: 29.9382,
    lng: 30.8924,
    bedrooms: 2,
    bathrooms: 3,
    areaSqm: 1650,
    furnishing: 'semi_furnished',
    imageKey: 'factory_industrial_egypt',
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },

  // ================= 05. WHOLE HOUSES (منازل وعقارات كاملة) =================
  {
    id: 'hse_maadi_sarayat_19',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'م. عبد القادر الشناوي',
    category: 'whole_house',
    billingMode: 'monthly_only',
    dailyRateEgp: 0,
    monthlyRentEgp: 95000,
    studentBedsCount: 0,
    studentPricePerBedEgp: 0,
    houseApartmentsCount: 4,
    houseFloorsCount: 3,
    houseHasGardenOrRoof: true,
    houseHasPrivateGarage: true,
    houseSpecsSummary:
      '4 شقق مستقلة بالكامل + حديقة خاصة 180م² وروف مزروع وجراج خاص لـ 3 سيارات و4 عدادات كهرباء وغاز مستقلة',
    title: 'منزل عائلي مستقل بالكامل في سرايات المعادي — 4 شقق وحديقة خاصة',
    description:
      'منزل كامل للإيجار بعقد موحد يضم 4 شقق مستقلة موزعة على 3 أدوار بمدخل خاص، حديقة شجرية محيطة، جراج داخلي مؤمّن، وعدادات كهرباء ومياه وغاز منفصلة لكل شقة — مثالي للعائلات الممتدة أو مقرات الإقامة الدبلوماسية.',
    governorate: 'القاهرة',
    district: 'سرايات المعادي — شارع 15',
    lat: 29.9638,
    lng: 31.2614,
    bedrooms: 10,
    bathrooms: 8,
    areaSqm: 720,
    furnishing: 'semi_furnished',
    imageKey: 'maadi_garden',
    hasVirtualTour: true,
    virtualTourUrl: 'https://www.matterport.com/tours/360-egypt-maadi-villa',
    panorama360Key: 'cairo_nile_360',
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },
  {
    id: 'hse_alex_kafr_abdo_20',
    ownerId: 'showcase_owner',
    ownerDisplayName: 'د. شريف الغمراوي',
    category: 'whole_house',
    billingMode: 'daily_or_monthly',
    dailyRateEgp: 6500,
    monthlyRentEgp: 78000,
    studentBedsCount: 0,
    studentPricePerBedEgp: 0,
    houseApartmentsCount: 3,
    houseFloorsCount: 3,
    houseHasGardenOrRoof: true,
    houseHasPrivateGarage: true,
    houseSpecsSummary:
      '3 شقق فاخرة مفروشة (شقة بكل دور) + تراس علوي وحديقة أمامية وجراج خاص وعدادات مرافق مستقلة',
    title: 'عقار وفيلا كاملة للإيجار في كفر عبده الإسكندرية — 3 شقق مستقلة',
    description:
      'منزل كلاسيكي مجدد بالكامل في أرقى شوارع كفر عبده بالإسكندرية، يتكون من 3 أدوار تضم 3 شقق مفروشة بالكامل مع حديقة خاصة وجراج داخلي، متاح للإيجار الشهري الكامل أو الإقامة العائلية اليومية.',
    governorate: 'الإسكندرية',
    district: 'كفر عبده — رشدي',
    lat: 31.2248,
    lng: 29.9541,
    bedrooms: 8,
    bathrooms: 6,
    areaSqm: 560,
    furnishing: 'furnished',
    imageKey: 'sheikh_zayed_duplex',
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: 10,
    mandateAccepted: true,
    isPersistedInDb: false,
  },
];

export function calculateDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function computeFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function computeTextSha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Baseline verified tenant reviews attached to showcase landlord accounts
export const SHOWCASE_REVIEWS: ReviewRecord[] = [
  {
    id: 'rev_showcase_zamalek_01',
    bookingId: 'bk_hist_zamalek_01',
    apartmentId: 'apt_zamalek_nile_01',
    apartmentTitle: 'شقة نيلية بانوراما في الزمالك — شارع أبو الفدا',
    governorate: 'القاهرة',
    landlordId: 'showcase_owner',
    landlordDisplayName: 'م. طارق المنشاوي',
    tenantId: 'tenant_showcase_1',
    tenantDisplayName: 'أ. مروان عبد الحميد',
    rating: 5,
    landlordRating: 5,
    landlordVerdict: 'trusted',
    comment:
      'المهندس طارق قمة في الاحترام والالتزام، استلمت المفتاح في الموعد بالدقيقة والشقة مطابقة تماماً للصور وإطلالة النيل رائعة بدون أي ملاحظات.',
    visibilityStatus: 'published',
    createdAtMs: 1759400000000,
    isPersistedInDb: false,
  },
  {
    id: 'rev_showcase_zamalek_02',
    bookingId: 'bk_hist_zamalek_02',
    apartmentId: 'apt_zamalek_prev_cycle',
    apartmentTitle: 'وحدة سابقة لنفس المالك بالزمالك',
    governorate: 'القاهرة',
    landlordId: 'showcase_owner',
    landlordDisplayName: 'م. طارق المنشاوي',
    tenantId: 'tenant_showcase_2',
    tenantDisplayName: 'د. هالة الشربيني',
    rating: 5,
    landlordRating: 5,
    landlordVerdict: 'trusted',
    comment:
      'تاني مرة أتعامل مع حساب المهندس طارق على منصة إيجار، المالك تمام وموثوق جداً وكل المرافق والتكييفات كانت مفحوصة قبل التسليم.',
    visibilityStatus: 'published',
    createdAtMs: 1756800000000,
    isPersistedInDb: false,
  },
  {
    id: 'rev_showcase_newcairo_01',
    bookingId: 'bk_hist_newcairo_01',
    apartmentId: 'apt_new_cairo_02',
    apartmentTitle: 'بنتهاوس مودرن بالتجمع الخامس — قرب الجامعة الأمريكية',
    governorate: 'القاهرة',
    landlordId: 'showcase_owner',
    landlordDisplayName: 'د. نهى عبد الرحمن',
    tenantId: 'tenant_showcase_3',
    tenantDisplayName: 'م. زياد التهامي',
    rating: 5,
    landlordRating: 5,
    landlordVerdict: 'trusted',
    comment:
      'دكتورة نهى متعاونة لأقصى درجة في إجراءات الدخول للكمبوند والجراج الخاص، والبنتهاوس نظيف جداً ومشمس كما هو موضح بالعقد.',
    visibilityStatus: 'published',
    createdAtMs: 1760100000000,
    isPersistedInDb: false,
  },
  {
    id: 'rev_showcase_alex_01',
    bookingId: 'bk_hist_alex_01',
    apartmentId: 'apt_alex_gleem_03',
    apartmentTitle: 'شقة أول صف على البحر — كورنيش جليم الإسكندرية',
    governorate: 'الإسكندرية',
    landlordId: 'showcase_owner',
    landlordDisplayName: 'أ. كريم الشاذلي',
    tenantId: 'tenant_showcase_4',
    tenantDisplayName: 'أ. ندى الجارحي',
    rating: 4,
    landlordRating: 5,
    landlordVerdict: 'trusted',
    comment:
      'الأستاذ كريم محترم وصادق في كل كلمة، إطلالة البحر مباشرة ومريحة للأعصاب، وتم تسليم الشقة بنظافة فندقية من أول يوم.',
    visibilityStatus: 'published',
    createdAtMs: 1758200000000,
    isPersistedInDb: false,
  },
  {
    id: 'rev_showcase_zayed_01',
    bookingId: 'bk_hist_zayed_01',
    apartmentId: 'apt_zayed_duplex_04',
    apartmentTitle: 'دوبلكس بحديقة داخلية في الشيخ زايد — الحي الرابع',
    governorate: 'الجيزة',
    landlordId: 'showcase_owner',
    landlordDisplayName: 'م. حسام الدين فوزي',
    tenantId: 'tenant_showcase_5',
    tenantDisplayName: 'م. تامر الدسوقي',
    rating: 5,
    landlordRating: 5,
    landlordVerdict: 'trusted',
    comment:
      'حساب موثوق عن تجربة حقيقية؛ الدوبلكس واسع وهادئ جداً والمالك التزم بكل بنود عقد الضمان بدون أي رسوم مخفية.',
    visibilityStatus: 'published',
    createdAtMs: 1757500000000,
    isPersistedInDb: false,
  },
  {
    id: 'rev_showcase_maadi_01',
    bookingId: 'bk_hist_maadi_01',
    apartmentId: 'apt_maadi_sarayat_05',
    apartmentTitle: 'شقة هادئة وسط الأشجار في سرايات المعادي — شارع 9',
    governorate: 'القاهرة',
    landlordId: 'showcase_owner',
    landlordDisplayName: 'أ. سلمى الكيلاني',
    tenantId: 'tenant_showcase_6',
    tenantDisplayName: 'أ. عمر الفيشاوي',
    rating: 5,
    landlordRating: 5,
    landlordVerdict: 'trusted',
    comment:
      'من أرقى الشقق في سرايات المعادي والأستاذة سلمى ملتزمة جداً في التسليم، تجربة إيجار آمنة ومريحة من البداية للنهاية.',
    visibilityStatus: 'published',
    createdAtMs: 1759900000000,
    isPersistedInDb: false,
  },
];

function buildReputationSummary(matched: ReviewRecord[]): LandlordReputationSummary {
  const sorted = [...matched].sort((a, b) => b.createdAtMs - a.createdAtMs);
  if (sorted.length === 0) {
    return {
      reviewCount: 0,
      averageApartmentRating: 0,
      averageLandlordRating: 0,
      combinedAverageRating: 0,
      trustedRatioPct: 0,
      accountStatusLabel: 'حساب عارض موثق الأوراق — بانتظار أول تقييم مستأجر',
      accountTone: 'new',
      reviews: [],
    };
  }

  const aptSum = sorted.reduce((acc, r) => acc + r.rating, 0);
  const landlordSum = sorted.reduce((acc, r) => acc + r.landlordRating, 0);
  const trustedCount = sorted.filter((r) => r.landlordVerdict === 'trusted').length;
  const unreliableCount = sorted.filter((r) => r.landlordVerdict === 'unreliable').length;

  const averageApartmentRating = aptSum / sorted.length;
  const averageLandlordRating = landlordSum / sorted.length;
  const combinedAverageRating = (averageApartmentRating + averageLandlordRating) / 2;
  const trustedRatioPct = Math.round((trustedCount / sorted.length) * 100);

  let accountTone: LandlordReputationSummary['accountTone'] = 'acceptable';
  let accountStatusLabel = 'حساب مقبول التعامل';

  if (averageLandlordRating >= 4.2 && unreliableCount === 0) {
    accountTone = 'trusted';
    accountStatusLabel = 'حساب موثوق وملتزم (تمام)';
  } else if (averageLandlordRating < 3.0 || unreliableCount > sorted.length / 2) {
    accountTone = 'warning';
    accountStatusLabel = 'تنبيه: ملاحظات سابقة على التزام الحساب';
  }

  return {
    reviewCount: sorted.length,
    averageApartmentRating,
    averageLandlordRating,
    combinedAverageRating,
    trustedRatioPct,
    accountStatusLabel,
    accountTone,
    reviews: sorted,
  };
}

export function computeLandlordReputation(
  allReviews: ReviewRecord[],
  apartment: Pick<ApartmentRecord, 'id' | 'ownerId' | 'ownerDisplayName'>
): LandlordReputationSummary {
  const isShowcaseListing = SHOWCASE_APARTMENTS.some((s) => s.id === apartment.id);

  const matched = allReviews.filter((r) => {
    if (r.visibilityStatus !== 'published') return false;
    if (isShowcaseListing) {
      return (
        r.apartmentId === apartment.id ||
        r.landlordDisplayName === apartment.ownerDisplayName ||
        (Boolean(r.isPersistedInDb) &&
          apartment.ownerId !== 'showcase_owner' &&
          r.landlordId === apartment.ownerId)
      );
    }
    return r.landlordId === apartment.ownerId;
  });

  return buildReputationSummary(matched);
}

export function computeAccountReputationByUid(
  allReviews: ReviewRecord[],
  landlordUid: string
): LandlordReputationSummary {
  const matched = allReviews.filter(
    (r) => r.visibilityStatus === 'published' && r.landlordId === landlordUid && r.isPersistedInDb
  );
  return buildReputationSummary(matched);
}

export function resolveBookingSpatialCoordinates(
  booking: Pick<BookingRecord, 'apartmentId' | 'governorate' | 'district' | 'lat' | 'lng'>,
  apartmentsLookup?: Map<
    string,
    Pick<ApartmentRecord, 'governorate' | 'district' | 'lat' | 'lng'>
  >
): {
  governorate: string;
  district: string;
  lat: number;
  lng: number;
} {
  const matchedApt =
    apartmentsLookup?.get(booking.apartmentId) ||
    SHOWCASE_APARTMENTS.find((s) => s.id === booking.apartmentId);

  const rawGov = String(booking.governorate || matchedApt?.governorate || 'القاهرة')
    .trim()
    .slice(0, VALIDATION_LIMITS.GOV_MAX);
  const safeGov = rawGov.length >= VALIDATION_LIMITS.GOV_MIN ? rawGov : 'القاهرة';

  const govCenter =
    EGYPT_GOVERNORATES.find((g) => g.name === safeGov) || EGYPT_GOVERNORATES[0];

  const candidateLat =
    typeof booking.lat === 'number' && !Number.isNaN(booking.lat)
      ? booking.lat
      : typeof matchedApt?.lat === 'number' && !Number.isNaN(matchedApt.lat)
        ? matchedApt.lat
        : govCenter.lat;

  const candidateLng =
    typeof booking.lng === 'number' && !Number.isNaN(booking.lng)
      ? booking.lng
      : typeof matchedApt?.lng === 'number' && !Number.isNaN(matchedApt.lng)
        ? matchedApt.lng
        : govCenter.lng;

  const lat = Math.max(
    VALIDATION_LIMITS.LAT_MIN,
    Math.min(VALIDATION_LIMITS.LAT_MAX, candidateLat)
  );
  const lng = Math.max(
    VALIDATION_LIMITS.LNG_MIN,
    Math.min(VALIDATION_LIMITS.LNG_MAX, candidateLng)
  );

  const candidateDistrict = String(
    booking.district || matchedApt?.district || safeGov
  )
    .trim()
    .slice(0, VALIDATION_LIMITS.DISTRICT_MAX);
  const district =
    candidateDistrict.length >= VALIDATION_LIMITS.DISTRICT_MIN
      ? candidateDistrict
      : safeGov;

  return {
    governorate: safeGov,
    district,
    lat,
    lng,
  };
}

export function bookingToDemandSignalRecord(
  booking: BookingRecord,
  apartmentsLookup?: Map<
    string,
    Pick<ApartmentRecord, 'governorate' | 'district' | 'lat' | 'lng'>
  >
): BookingDemandSignalRecord {
  const spatial = resolveBookingSpatialCoordinates(booking, apartmentsLookup);
  const unitsCount = Math.max(
    1,
    Math.min(365, Math.round(booking.unitsCount || booking.leaseMonths || 1))
  );
  const totalRentEgp = Math.max(
    300,
    Math.min(500000000, Math.round(booking.totalRentEgp || 300))
  );

  return {
    id: booking.id,
    bookingId: booking.id,
    apartmentId: booking.apartmentId,
    category: booking.category || 'family_apartment',
    governorate: spatial.governorate,
    district: spatial.district,
    lat: spatial.lat,
    lng: spatial.lng,
    unitsCount,
    totalRentEgp,
    status: 'completed',
    createdAtMs: booking.createdAtMs || Date.now(),
    updatedAtMs: booking.createdAtMs || Date.now(),
  };
}

export function buildBookingDemandSignalWritePayload(
  booking: BookingRecord,
  timestamps: { createdAt: unknown; updatedAt: unknown },
  apartmentsLookup?: Map<
    string,
    Pick<ApartmentRecord, 'governorate' | 'district' | 'lat' | 'lng'>
  >
): Record<string, unknown> {
  const signal = bookingToDemandSignalRecord(booking, apartmentsLookup);
  return {
    bookingId: signal.bookingId,
    apartmentId: signal.apartmentId,
    category: signal.category,
    governorate: booking.governorate,
    district: signal.district,
    lat: signal.lat,
    lng: signal.lng,
    unitsCount: signal.unitsCount,
    totalRentEgp: Math.round(booking.totalRentEgp),
    status: 'completed',
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  };
}

export type ChatThreadStatus = 'restricted_pre_payment' | 'unlocked' | 'flagged_violation';
export type ChatSenderRole = 'tenant' | 'landlord' | 'system';

export interface ChatThreadRecord {
  id: string;
  apartmentId: string;
  apartmentTitle: string;
  category: ListingCategory;
  governorate: string;
  district: string;
  baseUnitPriceEgp: number;
  commissionRatePct: number;
  commissionAmountEgp: number;
  tenantId: string;
  tenantDisplayName: string;
  landlordId: string;
  landlordDisplayName: string;
  status: ChatThreadStatus;
  commissionPaid: boolean;
  commissionPaymentMethod?: PaymentMethodType;
  commissionPaymentRef?: string;
  commissionPaidByUid?: string;
  commissionPaidAtMs?: number;
  bookingId?: string;
  tenantViolationCount: number;
  landlordViolationCount: number;
  lastViolationSenderId?: string;
  lastViolationReason?: string;
  lastViolationAtMs?: number;
  lastMessagePreview: string;
  lastMessageAtMs: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ChatMessageRecord {
  id: string;
  threadId: string;
  tenantId: string;
  landlordId: string;
  senderId: string;
  senderRole: ChatSenderRole;
  senderDisplayName: string;
  body: string;
  isSystemNotice: boolean;
  createdAtMs: number;
}

export interface ChatContactExchangeRecord {
  threadId: string;
  tenantId: string;
  landlordId: string;
  userId: string;
  role: 'tenant' | 'landlord';
  phoneNumber: string;
  updatedAtMs: number;
}

export interface ContactBypassDetectionResult {
  blocked: boolean;
  reasonCode:
    | 'none'
    | 'egypt_mobile'
    | 'digit_sequence'
    | 'spelled_number'
    | 'external_channel'
    | 'circumvention_phrase';
  reasonAr: string;
  reasonEn: string;
  isDirectBypassViolation: boolean;
}

export function buildChatThreadId(tenantId: string, apartmentId: string): string {
  return `${tenantId}__${apartmentId}`;
}

export function buildChatMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function resolveChatBaseUnitPriceEgp(apt: ApartmentRecord): number {
  if (apt.category === 'hotel_room' && apt.dailyRateEgp >= 300) {
    return Math.round(apt.dailyRateEgp);
  }
  if (apt.category === 'student_housing' && apt.studentPricePerBedEgp >= 500) {
    return Math.round(apt.studentPricePerBedEgp);
  }
  return Math.max(300, Math.round(apt.monthlyRentEgp || 10000));
}

export function normalizeChatThreadRecord(
  raw: Record<string, unknown>,
  id: string
): ChatThreadRecord {
  const createdObj = raw.createdAt as { toMillis?: () => number } | undefined;
  const updatedObj = raw.updatedAt as { toMillis?: () => number } | undefined;
  const lastMsgObj = raw.lastMessageAt as { toMillis?: () => number } | undefined;
  const paidAtObj = raw.commissionPaidAt as { toMillis?: () => number } | undefined;
  const violAtObj = raw.lastViolationAt as { toMillis?: () => number } | undefined;
  const createdMs = createdObj?.toMillis?.() ?? Date.now();

  return {
    id,
    apartmentId: String(raw.apartmentId || ''),
    apartmentTitle: String(raw.apartmentTitle || ''),
    category: (raw.category as ListingCategory) || 'family_apartment',
    governorate: String(raw.governorate || 'القاهرة'),
    district: String(raw.district || ''),
    baseUnitPriceEgp: typeof raw.baseUnitPriceEgp === 'number' ? raw.baseUnitPriceEgp : 10000,
    commissionRatePct:
      typeof raw.commissionRatePct === 'number'
        ? raw.commissionRatePct
        : VALIDATION_LIMITS.DEFAULT_COMMISSION_PCT,
    commissionAmountEgp:
      typeof raw.commissionAmountEgp === 'number' ? raw.commissionAmountEgp : 1000,
    tenantId: String(raw.tenantId || ''),
    tenantDisplayName: String(raw.tenantDisplayName || 'مستأجر موثق'),
    landlordId: String(raw.landlordId || ''),
    landlordDisplayName: String(raw.landlordDisplayName || 'مالك عقار موثق'),
    status: (raw.status as ChatThreadStatus) || 'restricted_pre_payment',
    commissionPaid: Boolean(raw.commissionPaid ?? false),
    commissionPaymentMethod: raw.commissionPaymentMethod
      ? (raw.commissionPaymentMethod as PaymentMethodType)
      : undefined,
    commissionPaymentRef: raw.commissionPaymentRef ? String(raw.commissionPaymentRef) : undefined,
    commissionPaidByUid: raw.commissionPaidByUid ? String(raw.commissionPaidByUid) : undefined,
    commissionPaidAtMs: paidAtObj?.toMillis?.(),
    bookingId: raw.bookingId ? String(raw.bookingId) : undefined,
    tenantViolationCount:
      typeof raw.tenantViolationCount === 'number' ? raw.tenantViolationCount : 0,
    landlordViolationCount:
      typeof raw.landlordViolationCount === 'number' ? raw.landlordViolationCount : 0,
    lastViolationSenderId: raw.lastViolationSenderId
      ? String(raw.lastViolationSenderId)
      : undefined,
    lastViolationReason: raw.lastViolationReason ? String(raw.lastViolationReason) : undefined,
    lastViolationAtMs: violAtObj?.toMillis?.(),
    lastMessagePreview: String(raw.lastMessagePreview || ''),
    lastMessageAtMs: lastMsgObj?.toMillis?.() ?? createdMs,
    createdAtMs: createdMs,
    updatedAtMs: updatedObj?.toMillis?.() ?? createdMs,
  };
}

export function normalizeChatMessageRecord(
  raw: Record<string, unknown>,
  id: string
): ChatMessageRecord {
  const createdObj = raw.createdAt as { toMillis?: () => number } | undefined;
  return {
    id,
    threadId: String(raw.threadId || ''),
    tenantId: String(raw.tenantId || ''),
    landlordId: String(raw.landlordId || ''),
    senderId: String(raw.senderId || ''),
    senderRole: (raw.senderRole as ChatSenderRole) || 'tenant',
    senderDisplayName: String(raw.senderDisplayName || 'مستخدم إيجار'),
    body: String(raw.body || ''),
    isSystemNotice: Boolean(raw.isSystemNotice ?? false),
    createdAtMs: createdObj?.toMillis?.() ?? Date.now(),
  };
}

/**
 * Multi-layer anti-circumvention detector for Egyptian phone numbers, obfuscated digit
 * sequences, Arabic/English number words, external contact channels (WhatsApp/Telegram/email),
 * and direct platform bypass phrases.
 */
export function detectContactBypassAttempt(rawText: string): ContactBypassDetectionResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { blocked: false, reasonCode: 'none', reasonAr: '', reasonEn: '', isDirectBypassViolation: false };
  }

  const ascii = normalizeArabicDigits(trimmed).toLowerCase();
  // Normalize common letter-for-digit lookalikes only within digit-heavy tokens
  const compactDigits = ascii.replace(/[^0-9]/g, '');

  // 1. Explicit Egyptian Mobile patterns (010, 011, 012, 015), with or without +20 / 0020 or spacing
  if (
    /(?:\+?20|0020)?[\s\-._/()]*0?1[0125](?:[\s\-._/()]*\d){7,8}/.test(ascii) ||
    /(?:01[0125]\d{7,8}|201[0125]\d{8})/.test(compactDigits) ||
    /(?:^|[^0-9])1[0125]\d{8}(?:[^0-9]|$)/.test(ascii.replace(/[\s\-._/()]+/g, ''))
  ) {
    return {
      blocked: true,
      reasonCode: 'egypt_mobile',
      reasonAr: 'محاولة مشاركة رقم موبايل مصري (010 / 011 / 012 / 015) قبل سداد وتأكيد الحجز الرسمي.',
      reasonEn: 'Attempted to share an Egyptian mobile number before official booking confirmation.',
      isDirectBypassViolation: true,
    };
  }

  // 2. Egyptian landline or long digit strings (8+ digits across message, e.g. split digits "02 273 54 123")
  if (
    /0[2-9][\s\-._/()]*\d(?:[\s\-._/()]*\d){6,7}/.test(ascii) ||
    compactDigits.length >= 8
  ) {
    return {
      blocked: true,
      reasonCode: 'digit_sequence',
      reasonAr: 'تم رصد تسلسل أرقام طويل يشتبه أنه رقم هاتف أو وسيلة تواصل خارجية.',
      reasonEn: 'Detected an 8+ digit numeric sequence resembling a phone or contact number.',
      isDirectBypassViolation: true,
    };
  }

  // 3. Spelled-out Egyptian mobile prefixes in Arabic or English
  const spelledPrefixRegex =
    /(زيرو\s*(?:عشر[ةه]|حداشر|إ?تناشر|خمستاشر|واحد\s*صفر)|صفر\s*واحد\s*(?:صفر|واحد|اتنين|إتنين|اثنين|خمس[ةه])|zero\s*(?:ten|eleven|twelve|fifteen|one\s*(?:zero|one|two|five)))/i;
  if (spelledPrefixRegex.test(ascii)) {
    return {
      blocked: true,
      reasonCode: 'spelled_number',
      reasonAr: 'تم رصد محاولة كتابة رقم هاتف بالحروف (مثل: زيرو عشرة / صفر واحد) للتحايل على الخصوصية.',
      reasonEn: 'Detected spelled-out phone prefix attempting to bypass contact privacy.',
      isDirectBypassViolation: true,
    };
  }

  // 4. External chat/contact handles, emails, or messaging links
  const externalChannelRegex =
    /(واتس|واتساب|whatsapp|watsapp|wa\.me|تيليجرام|تليجرام|telegram|t\.me|ماسنجر|messenger|فيسبوك|facebook|انستا|انستجرام|instagram|سناب\s*شات|snapchat|https?:\/\/|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i;
  if (externalChannelRegex.test(ascii)) {
    return {
      blocked: true,
      reasonCode: 'external_channel',
      reasonAr: 'يُمنع تبادل روابط أو حسابات تواصل خارجية (واتساب / تيليجرام / إيميل) لحماية الطرفين من التلاعب.',
      reasonEn: 'Sharing external contact apps, social links, or emails is strictly prohibited.',
      isDirectBypassViolation: true,
    };
  }

  // 5. Direct circumvention / bypass phrases (طلب تواصل خارجي أو كاش خارج الموقع)
  const circumventionRegex =
    /(ابعت\s*رقمك|هات\s*رقمك|ابعتلي\s*رقمك|رقمي\s*(?:اهو|هو|دا)|كلمني\s*(?:فون|خاص|موبايل|واتس|برة|بره)|اتصل\s*بي[اه]|تلفوني|نمرتي|موبايلي|بر[ةه]\s*(?:الموقع|المنصة)|كاش\s*يد\s*بيد|تواصل\s*خارجي|نتقابل\s*بر[ةه]|نتعامل\s*بر[ةه]|call\s*me|my\s*phone|out\s*of\s*platform)/i;
  if (circumventionRegex.test(ascii)) {
    return {
      blocked: true,
      reasonCode: 'circumvention_phrase',
      reasonAr: 'تم رصد عبارة تحايل لطلب التواصل الخارجي أو الالتفاف على المنصة — يُطبق نظام الحظر الصارم فوراً.',
      reasonEn: 'Detected circumvention phrase attempting external communication or platform bypass.',
      isDirectBypassViolation: true,
    };
  }

  return { blocked: false, reasonCode: 'none', reasonAr: '', reasonEn: '', isDirectBypassViolation: false };
}

export function createInitialWallet(uid: string): TenantWalletRecord {
  return {
    uid,
    balanceEgp: 0,
    totalDepositedEgp: 0,
    lockedEscrowEgp: 0,
    hasActiveDeposit: false,
    lastUpdatedMs: Date.now(),
    transactions: [],
  };
}

export function normalizeWalletRecord(
  raw: Record<string, unknown>,
  uid: string
): TenantWalletRecord {
  const balance = typeof raw.balanceEgp === 'number' ? Math.max(0, raw.balanceEgp) : 0;
  const totalDep = typeof raw.totalDepositedEgp === 'number' ? Math.max(0, raw.totalDepositedEgp) : balance;
  const locked = typeof raw.lockedEscrowEgp === 'number' ? Math.max(0, raw.lockedEscrowEgp) : 0;
  const updatedObj = raw.lastUpdated as { toMillis?: () => number } | undefined;
  const lastUpdatedMs =
    typeof raw.lastUpdatedMs === 'number'
      ? raw.lastUpdatedMs
      : updatedObj?.toMillis?.() ?? Date.now();

  const rawTx = Array.isArray(raw.transactions) ? raw.transactions : [];
  const transactions: WalletTransactionRecord[] = rawTx.map((t, idx) => {
    const item = t as Record<string, unknown>;
    return {
      id: String(item.id || `tx_${idx}_${Date.now()}`),
      type: (item.type as WalletTransactionRecord['type']) || 'deposit',
      amountEgp: typeof item.amountEgp === 'number' ? item.amountEgp : 0,
      description: String(item.description || 'معاملة رصيد'),
      createdAtMs: typeof item.createdAtMs === 'number' ? item.createdAtMs : Date.now(),
      paymentMethod: item.paymentMethod as PaymentMethodType | undefined,
      referenceNumber: item.referenceNumber ? String(item.referenceNumber) : undefined,
      apartmentId: item.apartmentId ? String(item.apartmentId) : undefined,
      apartmentTitle: item.apartmentTitle ? String(item.apartmentTitle) : undefined,
      receiptScreenshotUrl: item.receiptScreenshotUrl ? String(item.receiptScreenshotUrl) : undefined,
      status: (item.status as WalletTransactionRecord['status']) || (item.type === 'deposit' && item.receiptScreenshotUrl ? 'pending_confirmation' : 'confirmed'),
      confirmedAtMs: typeof item.confirmedAtMs === 'number' ? item.confirmedAtMs : undefined,
      rejectionReason: item.rejectionReason ? String(item.rejectionReason) : undefined,
    };
  });

  return {
    uid,
    balanceEgp: balance,
    totalDepositedEgp: totalDep,
    lockedEscrowEgp: locked,
    hasActiveDeposit: balance >= 500,
    lastUpdatedMs,
    transactions,
  };
}

export function normalizeLandlordVerificationRecord(
  raw: Record<string, unknown>,
  uid: string
): LandlordVerificationRecord {
  const submittedObj = raw.submittedAt as { toMillis?: () => number } | undefined;
  const verifiedObj = raw.verifiedAt as { toMillis?: () => number } | undefined;

  return {
    uid,
    fullName: String(raw.fullName || 'مالك عقار موثق'),
    nationalIdNumber: String(raw.nationalIdNumber || ''),
    ownerPhone: String(raw.ownerPhone || ''),
    governorate: String(raw.governorate || 'القاهرة'),
    district: String(raw.district || ''),
    status: (raw.status as VerificationStatus) || 'pending_review',
    nationalIdFrontUrl: raw.nationalIdFrontUrl ? String(raw.nationalIdFrontUrl) : undefined,
    nationalIdBackUrl: raw.nationalIdBackUrl ? String(raw.nationalIdBackUrl) : undefined,
    ownershipDocUrl: raw.ownershipDocUrl ? String(raw.ownershipDocUrl) : undefined,
    ownershipDocType:
      (raw.ownershipDocType as LandlordVerificationRecord['ownershipDocType']) || 'title_deed',
    selfiePhotoUrl: raw.selfiePhotoUrl ? String(raw.selfiePhotoUrl) : undefined,
    facialMatchScore: typeof raw.facialMatchScore === 'number' ? raw.facialMatchScore : 98.4,
    submittedAtMs: submittedObj?.toMillis?.() ?? (typeof raw.submittedAtMs === 'number' ? raw.submittedAtMs : Date.now()),
    verifiedAtMs: verifiedObj?.toMillis?.() ?? (typeof raw.verifiedAtMs === 'number' ? raw.verifiedAtMs : undefined),
    rejectionReason: raw.rejectionReason ? String(raw.rejectionReason) : undefined,
    badgeLabelAr: 'مالك موثق بالهوية والملكية والتحقق البيومتري',
    badgeLabelEn: 'Biometrically & Deed Verified Landlord',
  };
}

export function resolveUnlockedApartmentContact(
  apt: ApartmentRecord,
  isUnlocked: boolean
): UnlockedApartmentContact {
  const seed = (apt.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 900) + 100;
  const bld = (seed % 42) + 1;
  const floor = (seed % 9) + 1;
  const flat = (seed % 4) + 1;
  const phoneSuffix = String(seed * 73).padStart(6, '0').slice(0, 6);
  const rawPhone = `010${phoneSuffix}82`;

  const streetMap: Record<string, string> = {
    'القاهرة': 'شارع النصر الرئيسي، تقاطع اللاسلكي',
    'الجيزة': 'شارع مصدق، حي الدقي',
    'الإسكندرية': 'طريق الجيش، الكورنيش، سيدي جابر',
    'البحر الأحمر': 'طريق الممشى السياحي، الكوثر',
  };
  const street = streetMap[apt.governorate] || `شارع الجمهورية الرئيسي، حي ${apt.district}`;

  return {
    apartmentId: apt.id,
    exactAddress: isUnlocked
      ? `عمارة رقم ${bld}، ${street}، الدور ${floor}، شقة رقم ${flat}، ${apt.district}، ${apt.governorate}`
      : `مشفر ومحمي — يتم فك القفل والكشف التلقائي بعد تأكيد الحجز الرسمي عبر المنصة (${apt.district}، ${apt.governorate})`,
    buildingNumber: isUnlocked ? String(bld) : '**',
    floorNumber: isUnlocked ? String(floor) : '*',
    apartmentNumber: isUnlocked ? String(flat) : '*',
    streetName: isUnlocked ? street : 'شارع محمي (يظهر بعد الحجز)',
    landlordPhone: isUnlocked ? rawPhone : '010********',
    checkInPasscode: `MEFTAH-${apt.id.slice(0, 4).toUpperCase()}-${seed}`,
    isUnlocked,
  };
}




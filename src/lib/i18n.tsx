import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type {
  ListingCategory,
  FurnishingType,
  RentalUnitType,
  TenantCategory,
  LandlordVerdict,
  PaymentMethodType,
  RentalRequestStatus,
  NotificationStatusType,
  SupportedCurrency,
} from './validation';

export type AppLanguage = 'ar' | 'en';

interface I18nContextValue {
  lang: AppLanguage;
  isRtl: boolean;
  setLang: (next: AppLanguage) => void;
  toggleLang: () => void;
  t: (arText: string, enText: string) => string;
  formatNumber: (value: number, maxFractionDigits?: number) => string;
  formatTimeAgo: (timestampMs: number) => string;
  govLabel: (arGovName: string) => string;
  categoryLabel: (cat: ListingCategory) => string;
  categorySingularLabel: (cat: ListingCategory) => string;
  categorySubtitle: (cat: ListingCategory) => string;
  furnishingLabel: (f: FurnishingType) => string;
  rentalUnitLabel: (u: RentalUnitType) => string;
  tenantCategoryLabel: (c: TenantCategory) => string;
  verdictLabel: (v: LandlordVerdict) => string;
  paymentMethodLabel: (p: PaymentMethodType) => string;
  requestStatusLabel: (s: RentalRequestStatus) => string;
  notificationStatusLabel: (s: NotificationStatusType) => string;
  currencyLabel: (c: SupportedCurrency) => string;
  currencySymbol: (c: SupportedCurrency) => string;
}

const STORAGE_KEY = 'ejar_lang';

export const GOV_EN_MAP: Record<string, string> = {
  'القاهرة': 'Cairo',
  'الجيزة': 'Giza',
  'الإسكندرية': 'Alexandria',
  'مطروح': 'Matrouh',
  'البحر الأحمر': 'Red Sea',
  'جنوب سيناء': 'South Sinai',
  'الدقهلية': 'Dakahlia',
  'الغربية': 'Gharbia',
  'الشرقية': 'Sharqia',
  'القليوبية': 'Qalyubia',
  'البحيرة': 'Beheira',
  'كفر الشيخ': 'Kafr El Sheikh',
  'دمياط': 'Damietta',
  'بورسعيد': 'Port Said',
  'الإسماعيلية': 'Ismailia',
  'السويس': 'Suez',
  'المنوفية': 'Monufia',
  'الفيوم': 'Fayoum',
  'بني سويف': 'Beni Suef',
  'المنيا': 'Minya',
  'أسيوط': 'Assiut',
  'سوهاج': 'Sohag',
  'قنا': 'Qena',
  'الأقصر': 'Luxor',
  'أسوان': 'Aswan',
  'الوادي الجديد': 'New Valley',
  'شمال سيناء': 'North Sinai',
};

const CATEGORY_MAP: Record<ListingCategory, { ar: string; en: string; singAr: string; singEn: string; subAr: string; subEn: string }> = {
  family_apartment: {
    ar: 'شقة عائلية',
    en: 'Family Apartment',
    singAr: 'شقة عائلية',
    singEn: 'Family Apartment',
    subAr: 'شقق ودوبلكس موثقة الملكية للإيجار العائلي الشهري والسنوي',
    subEn: 'Title-verified apartments and duplexes for monthly and annual family leases',
  },
  student_housing: {
    ar: 'سكن طلاب',
    en: 'Student Housing',
    singAr: 'سكن طلاب',
    singEn: 'Student Housing',
    subAr: 'سكن جامعي منظم بعدد السراير وسعر مستقل لكل سرير طلابي',
    subEn: 'Organized university housing with clear bed capacity and per-bed pricing',
  },
  hotel_room: {
    ar: 'غرفة فندقية',
    en: 'Hotel Room',
    singAr: 'غرفة فندقية',
    singEn: 'Hotel Room',
    subAr: 'غرف وأجنحة فندقية مرخصة متاحة للحجز باليوم أو بالشهر',
    subEn: 'Licensed hotel rooms and executive suites available daily or monthly',
  },
  industrial_factory: {
    ar: 'مصنع',
    en: 'Factory',
    singAr: 'مصنع',
    singEn: 'Factory',
    subAr: 'مصانع وهناجر ومخازن تشغيلية مرخصة بالمدن الصناعية المصرية',
    subEn: 'Licensed operational factories, warehouses, and industrial plants across Egypt',
  },
  whole_house: {
    ar: 'منزل كامل',
    en: 'Whole House',
    singAr: 'منزل كامل',
    singEn: 'Whole House',
    subAr: 'منازل وفيلات وعقارات كاملة للإيجار بعدد الشقق والأدوار والمواصفات المستقلة',
    subEn: 'Full standalone houses and multi-apartment buildings with detailed apartment & floor specs',
  },
};

const FURNISHING_MAP: Record<FurnishingType, { ar: string; en: string }> = {
  furnished: { ar: 'مجهز بالكامل', en: 'Fully Furnished' },
  semi_furnished: { ar: 'نصف مجهز', en: 'Semi-Furnished' },
  unfurnished: { ar: 'بدون فرش', en: 'Unfurnished' },
};

const RENTAL_UNIT_MAP: Record<RentalUnitType, { ar: string; en: string }> = {
  month: { ar: 'إيجار شهري', en: 'Monthly Lease' },
  day: { ar: 'حجز يومي (بالليلة)', en: 'Daily Stay (Per Night)' },
  student_bed: { ar: 'سرير طلابي شهري', en: 'Monthly Student Bed' },
};

const TENANT_CAT_MAP: Record<TenantCategory, { ar: string; en: string }> = {
  family: { ar: 'مستأجر عائلي / سكني', en: 'Family / Residential Tenant' },
  student: { ar: 'طالب جامعي / مغترب', en: 'University Student' },
  corporate: { ar: 'شركة / مستثمر صناعي أو فندقي', en: 'Corporate / Industrial Tenant' },
};

const VERDICT_MAP: Record<LandlordVerdict, { ar: string; en: string }> = {
  trusted: { ar: 'حساب موثوق وملتزم (تمام)', en: 'Trusted & Verified Landlord' },
  acceptable: { ar: 'تعامل مقبول', en: 'Acceptable Experience' },
  unreliable: { ar: 'غير ملتزم بالوصف أو المواعيد', en: 'Unreliable / Inaccurate Listing' },
};

const PAYMENT_MAP: Record<PaymentMethodType, { ar: string; en: string }> = {
  card_meeza: {
    ar: 'بطاقة بنكية / ميزة (Meeza · Visa · Mastercard)',
    en: 'Bank Card / Meeza (Meeza · Visa · Mastercard)',
  },
  instapay: {
    ar: 'إنستاباي مصر (InstaPay Instant)',
    en: 'InstaPay Egypt (Instant Transfer)',
  },
  mobile_wallet: {
    ar: 'محفظة إلكترونية (Vodafone · Orange · Etisalat · WE)',
    en: 'Mobile Wallet (Vodafone · Orange · Etisalat · WE)',
  },
  fawry: {
    ar: 'فوري باي (Fawry Reference)',
    en: 'Fawry Pay (Reference Code)',
  },
  wallet_balance: {
    ar: 'رصيد جدية الحجز بالمحفظة (Wallet Balance)',
    en: 'Wallet Deposit Balance',
  },
};

const REQUEST_STATUS_MAP: Record<RentalRequestStatus, { ar: string; en: string }> = {
  pending_approval: { ar: 'قيد مراجعة المالك', en: 'Pending Landlord Review' },
  awaiting_payment: { ar: 'بانتظار الدفع', en: 'Awaiting Payment' },
  approved: { ar: 'تمت الموافقة', en: 'Approved' },
  cancelled: { ar: 'تم إلغاء الطلب', en: 'Cancelled' },
};

const NOTIF_STATUS_MAP: Record<NotificationStatusType, { ar: string; en: string }> = {
  approved: { ar: 'تمت الموافقة', en: 'Approved' },
  awaiting_payment: { ar: 'بانتظار الدفع', en: 'Awaiting Payment' },
  pending_approval: { ar: 'قيد المراجعة', en: 'Pending Review' },
  cancelled: { ar: 'تم إلغاء الطلب', en: 'Cancelled' },
  price_drop: { ar: 'انخفاض السعر', en: 'Price Drop' },
  chat_unlocked: { ar: 'فتح الشات والهاتف', en: 'Chat & Phone Unlocked' },
};

const CURRENCY_META: Record<string, { ar: string; en: string; symAr: string; symEn: string }> = {
  EGP: { ar: 'جنيه مصري (EGP)', en: 'Egyptian Pound (EGP)', symAr: 'ج.م', symEn: 'EGP' },
  USD: { ar: 'دولار أمريكي (USD)', en: 'US Dollar (USD)', symAr: '$', symEn: 'USD' },
  SAR: { ar: 'ريال سعودي (SAR)', en: 'Saudi Riyal (SAR)', symAr: 'ر.س', symEn: 'SAR' },
  EUR: { ar: 'يورو أوروبي (EUR)', en: 'Euro (EUR)', symAr: '€', symEn: 'EUR' },
  AED: { ar: 'درهم إماراتي (AED)', en: 'UAE Dirham (AED)', symAr: 'د.إ', symEn: 'AED' },
};

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<AppLanguage>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'ar') return saved;
    } catch {
      // ignore storage errors
    }
    return 'ar';
  });

  useEffect(() => {
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore storage errors
    }
  }, [lang]);

  const setLang = useCallback((next: AppLanguage) => {
    setLangState(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === 'ar' ? 'en' : 'ar'));
  }, []);

  const t = useCallback(
    (arText: string, enText: string) => (lang === 'ar' ? arText : enText),
    [lang]
  );

  const formatNumber = useCallback(
    (value: number, maxFractionDigits = 0) => {
      return new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
        maximumFractionDigits: maxFractionDigits,
      }).format(value);
    },
    [lang]
  );

  const formatTimeAgo = useCallback(
    (timestampMs: number) => {
      if (!timestampMs || Number.isNaN(timestampMs)) {
        return lang === 'ar' ? 'الآن' : 'Just now';
      }
      const diffSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
      if (diffSec < 60) return lang === 'ar' ? 'منذ لحظات' : 'Moments ago';
      if (diffSec < 3600) {
        const mins = Math.floor(diffSec / 60);
        return lang === 'ar' ? `منذ ${mins} د` : `${mins}m ago`;
      }
      if (diffSec < 86400) {
        const hours = Math.floor(diffSec / 3600);
        return lang === 'ar' ? `منذ ${hours} س` : `${hours}h ago`;
      }
      return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(timestampMs));
    },
    [lang]
  );

  const govLabel = useCallback(
    (arGovName: string) => (lang === 'ar' ? arGovName : GOV_EN_MAP[arGovName] || arGovName),
    [lang]
  );

  const categoryLabel = useCallback(
    (cat: ListingCategory) => CATEGORY_MAP[cat]?.[lang] ?? cat,
    [lang]
  );

  const categorySingularLabel = useCallback(
    (cat: ListingCategory) =>
      lang === 'ar' ? CATEGORY_MAP[cat]?.singAr ?? cat : CATEGORY_MAP[cat]?.singEn ?? cat,
    [lang]
  );

  const categorySubtitle = useCallback(
    (cat: ListingCategory) =>
      lang === 'ar' ? CATEGORY_MAP[cat]?.subAr ?? '' : CATEGORY_MAP[cat]?.subEn ?? '',
    [lang]
  );

  const furnishingLabel = useCallback(
    (f: FurnishingType) => FURNISHING_MAP[f]?.[lang] ?? f,
    [lang]
  );

  const rentalUnitLabel = useCallback(
    (u: RentalUnitType) => RENTAL_UNIT_MAP[u]?.[lang] ?? u,
    [lang]
  );

  const tenantCategoryLabel = useCallback(
    (c: TenantCategory) => TENANT_CAT_MAP[c]?.[lang] ?? c,
    [lang]
  );

  const verdictLabel = useCallback(
    (v: LandlordVerdict) => VERDICT_MAP[v]?.[lang] ?? v,
    [lang]
  );

  const paymentMethodLabel = useCallback(
    (p: PaymentMethodType) => PAYMENT_MAP[p]?.[lang] ?? p,
    [lang]
  );

  const requestStatusLabel = useCallback(
    (s: RentalRequestStatus) => REQUEST_STATUS_MAP[s]?.[lang] ?? s,
    [lang]
  );

  const notificationStatusLabel = useCallback(
    (s: NotificationStatusType) => NOTIF_STATUS_MAP[s]?.[lang] ?? s,
    [lang]
  );

  const currencyLabel = useCallback(
    (c: SupportedCurrency) => CURRENCY_META[c]?.[lang] ?? c,
    [lang]
  );

  const currencySymbol = useCallback(
    (c: SupportedCurrency) =>
      lang === 'ar' ? CURRENCY_META[c]?.symAr ?? c : CURRENCY_META[c]?.symEn ?? c,
    [lang]
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      isRtl: lang === 'ar',
      setLang,
      toggleLang,
      t,
      formatNumber,
      formatTimeAgo,
      govLabel,
      categoryLabel,
      categorySingularLabel,
      categorySubtitle,
      furnishingLabel,
      rentalUnitLabel,
      tenantCategoryLabel,
      verdictLabel,
      paymentMethodLabel,
      requestStatusLabel,
      notificationStatusLabel,
      currencyLabel,
      currencySymbol,
    }),
    [
      lang,
      setLang,
      toggleLang,
      t,
      formatNumber,
      formatTimeAgo,
      govLabel,
      categoryLabel,
      categorySingularLabel,
      categorySubtitle,
      furnishingLabel,
      rentalUnitLabel,
      tenantCategoryLabel,
      verdictLabel,
      paymentMethodLabel,
      requestStatusLabel,
      notificationStatusLabel,
      currencyLabel,
      currencySymbol,
    ]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Heart,
  Bell,
  BellRing,
  Compass,
  Image as ImageIcon,
  MapPin,
  BedDouble,
  Bath,
  Maximize2,
  ShieldCheck,
  Star,
  CheckCircle2,
  ExternalLink,
  MessageSquarePlus,
  Building2,
  Calculator,
  Minus,
  Plus,
  Wrench,
  ArrowRightLeft,
  MessageSquareLock,
  Lock,
  Unlock,
  Phone,
  MessageCircle,
  Wallet,
  Sparkles,
  Key,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  ApartmentRecord,
  BookingRecord,
  PlatformSettingsRecord,
  RentalUnitType,
  ReviewRecord,
  SUPPORTED_CURRENCIES,
  SupportedCurrency,
  TenantWalletRecord,
  buildLiveCurrencyRates,
  computeLandlordReputation,
  computeOneTimeCommission,
  convertFromEgp,
  formatCurrencyValue,
  getCategoryCommissionPct,
  getPrimaryDisplayPrice,
  normalizeNumericInput,
  resolveApartmentPanoramaSrc,
  resolveUnlockedApartmentContact,
} from '../lib/validation';
import { useI18n } from '../lib/i18n';
import { ApartmentImage } from './ApartmentImage';
import { VirtualTour360Viewer } from './VirtualTour360Viewer';

interface ApartmentDetailModalProps {
  apartment: ApartmentRecord | null;
  currentUserUid?: string | null;
  commissionRatePct: number;
  platformSettings?: PlatformSettingsRecord;
  reviews: ReviewRecord[];
  myTenantBookings: BookingRecord[];
  tenantWallet?: TenantWalletRecord | null;
  onOpenWallet?: () => void;
  isFavorite: boolean;
  isPriceAlertEnabled: boolean;
  togglingFavorite: boolean;
  onToggleFavorite: (apt: ApartmentRecord) => void;
  onTogglePriceAlert: (apt: ApartmentRecord) => void;
  onClose: () => void;
  onProceedToRent: (apt: ApartmentRecord) => void;
  onOpenChat: (apt: ApartmentRecord) => void;
  onOpenReviewForBooking: (booking: BookingRecord) => void;
  onViewLandlordProfile?: (ownerUid: string, ownerDisplayName: string) => void;
}

export const ApartmentDetailModal: React.FC<ApartmentDetailModalProps> = ({
  apartment,
  currentUserUid = null,
  commissionRatePct,
  platformSettings,
  reviews,
  myTenantBookings,
  tenantWallet = null,
  onOpenWallet,
  isFavorite,
  isPriceAlertEnabled,
  togglingFavorite,
  onToggleFavorite,
  onTogglePriceAlert,
  onClose,
  onProceedToRent,
  onOpenChat,
  onOpenReviewForBooking,
  onViewLandlordProfile,
}) => {
  const {
    lang,
    t,
    formatNumber,
    formatTimeAgo,
    govLabel,
    categorySingularLabel,
    furnishingLabel,
    verdictLabel,
  } = useI18n();

  const [mediaMode, setMediaMode] = useState<'photo' | '360'>('photo');
  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(0);
  const [calcRentalUnit, setCalcRentalUnit] = useState<RentalUnitType>('month');
  const [calcDuration, setCalcDuration] = useState<number>(3);
  const [calcBedsCount, setCalcBedsCount] = useState<number>(1);
  const [depositMultiplier, setDepositMultiplier] = useState<0 | 0.5 | 1 | 2>(1);
  const [includeMaintenance, setIncludeMaintenance] = useState<boolean>(true);
  const [customMaintenancePerCycle, setCustomMaintenancePerCycle] = useState<string>('');
  const [calcCurrency, setCalcCurrency] = useState<SupportedCurrency>('EGP');

  const allPhotos: string[] = useMemo(() => {
    if (!apartment) return [];
    const list: string[] = [];
    if (apartment.imageUrls && Array.isArray(apartment.imageUrls)) {
      for (const u of apartment.imageUrls) {
        if (typeof u === 'string' && u.trim() && !list.includes(u.trim())) {
          list.push(u.trim());
        }
      }
    }
    if (apartment.imageUrl && !list.includes(apartment.imageUrl)) {
      list.unshift(apartment.imageUrl);
    }
    return list;
  }, [apartment]);

  const getDefaultMaintenancePerCycle = (
    apt: ApartmentRecord,
    unit: RentalUnitType
  ): number => {
    if (unit === 'day') {
      return apt.category === 'hotel_room' ? 150 : 200;
    }
    if (unit === 'student_bed') {
      return 200;
    }
    switch (apt.category) {
      case 'whole_house':
        return Math.round(Math.max(600, apt.areaSqm * 4) / 50) * 50;
      case 'industrial_factory':
        return Math.round(Math.max(1200, apt.areaSqm * 3) / 50) * 50;
      case 'hotel_room':
        return 450;
      case 'student_housing':
        return 300;
      default:
        return Math.round(Math.max(300, apt.areaSqm * 2.5) / 50) * 50;
    }
  };

  useEffect(() => {
    setMediaMode('photo');
    setActivePhotoIdx(0);
    if (!apartment) return;
    const nextUnit: RentalUnitType =
      apartment.category === 'hotel_room' && apartment.dailyRateEgp > 0
        ? 'day'
        : apartment.category === 'student_housing' &&
            apartment.studentBedsCount > 0 &&
            apartment.studentPricePerBedEgp > 0
          ? 'student_bed'
          : 'month';
    setCalcRentalUnit(nextUnit);
    setCalcDuration(nextUnit === 'day' ? 5 : 3);
    setCalcBedsCount(1);
    setDepositMultiplier(1);
    setIncludeMaintenance(true);
    setCustomMaintenancePerCycle(String(getDefaultMaintenancePerCycle(apartment, nextUnit)));
    setCalcCurrency(apartment.baseCurrency || 'EGP');
  }, [apartment?.id]);

  if (!apartment) return null;

  const panoramaSrc = resolveApartmentPanoramaSrc(apartment);
  const hasAnyVirtualTour = Boolean(
    (apartment.hasVirtualTour && panoramaSrc) || apartment.virtualTourUrl
  );

  const effectiveCommissionRatePct = getCategoryCommissionPct(
    apartment.category,
    platformSettings ?? { commissionRatePct: apartment.commissionRatePct || commissionRatePct }
  );
  const primaryPrice = getPrimaryDisplayPrice(apartment, lang);
  const reputation = computeLandlordReputation(reviews, apartment);

  const matchingTenantBooking = myTenantBookings.find(
    (b) => b.apartmentId === apartment.id
  );
  const isBookedByCurrentUser = Boolean(
    matchingTenantBooking || (currentUserUid && currentUserUid === apartment.ownerId)
  );
  const unlockedContact = resolveUnlockedApartmentContact(apartment, isBookedByCurrentUser);

  const showForeignBasePrice =
    apartment.baseCurrency &&
    apartment.baseCurrency !== 'EGP' &&
    typeof apartment.baseMonthlyPrice === 'number' &&
    apartment.baseMonthlyPrice > 0;

  const canCalcDaily =
    apartment.dailyRateEgp > 0 && apartment.billingMode === 'daily_or_monthly';
  const canCalcStudentBed =
    apartment.studentBedsCount >= 1 && apartment.studentPricePerBedEgp >= 500;

  const safeBedsCount =
    calcRentalUnit === 'student_bed'
      ? Math.max(1, Math.min(apartment.studentBedsCount || 1, calcBedsCount))
      : 1;
  const maxCalcDuration = calcRentalUnit === 'day' ? 90 : 36;
  const safeDuration = Math.max(1, Math.min(maxCalcDuration, calcDuration));

  const calcUnitRateEgp =
    calcRentalUnit === 'day'
      ? apartment.dailyRateEgp
      : calcRentalUnit === 'student_bed'
        ? apartment.studentPricePerBedEgp * safeBedsCount
        : apartment.monthlyRentEgp;

  const rentSubtotalEgp = calcUnitRateEgp * safeDuration;
  const grossCommissionEgp = computeOneTimeCommission(
    calcUnitRateEgp,
    effectiveCommissionRatePct
  );
  const tenantDiscountPct = platformSettings?.tenantDiscountPct ?? 0;
  const commissionPromoDiscountEgp =
    tenantDiscountPct > 0
      ? Math.round((grossCommissionEgp * tenantDiscountPct) / 100)
      : 0;
  const netCommissionFeeEgp = Math.max(0, grossCommissionEgp - commissionPromoDiscountEgp);

  const escrowProtectionFeePct = platformSettings?.escrowProtectionFeePct ?? 0;
  const escrowProtectionFeeEgp =
    escrowProtectionFeePct > 0
      ? Math.round((calcUnitRateEgp * escrowProtectionFeePct) / 100)
      : 0;

  const securityDepositEgp = Math.round(calcUnitRateEgp * depositMultiplier);

  const parsedMaintenancePerCycle =
    customMaintenancePerCycle.trim() !== '' && !Number.isNaN(Number(customMaintenancePerCycle))
      ? Math.max(0, Math.min(100000, Number(customMaintenancePerCycle)))
      : 0;
  const maintenancePerCycleEgp = includeMaintenance
    ? calcRentalUnit === 'student_bed'
      ? parsedMaintenancePerCycle * safeBedsCount
      : parsedMaintenancePerCycle
    : 0;
  const totalMaintenanceEgp = maintenancePerCycleEgp * safeDuration;

  const firstCycleDueEgp =
    calcUnitRateEgp +
    netCommissionFeeEgp +
    escrowProtectionFeeEgp +
    securityDepositEgp +
    maintenancePerCycleEgp;

  const grandTotalLeaseCostEgp =
    rentSubtotalEgp +
    netCommissionFeeEgp +
    escrowProtectionFeeEgp +
    securityDepositEgp +
    totalMaintenanceEgp;

  /* ===== جدية الحجز 10% / المتبقي 90% عند الاستلام ===== */
  const earnestDepositEgp = Math.round(grandTotalLeaseCostEgp * 0.10);
  const remainingOnHandoverEgp = grandTotalLeaseCostEgp - earnestDepositEgp;

  const liveCurrencyRates = buildLiveCurrencyRates(platformSettings);
  const formatCalcCurrency = (amountEgp: number) =>
    formatCurrencyValue(
      convertFromEgp(amountEgp, calcCurrency, liveCurrencyRates),
      calcCurrency,
      lang
    );

  const handleCalcModeSwitch = (nextUnit: RentalUnitType) => {
    setCalcRentalUnit(nextUnit);
    setCalcDuration(nextUnit === 'day' ? 5 : 3);
    if (nextUnit === 'student_bed') {
      setCalcBedsCount(1);
    }
    setCustomMaintenancePerCycle(String(getDefaultMaintenancePerCycle(apartment, nextUnit)));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="apt-detail-title"
    >
      <div className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-xl">
        {/* Sticky Modal Top Header */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 px-5 py-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-blue-700">
                {categorySingularLabel(apartment.category)}
              </span>
              <span aria-hidden="true">·</span>
              <span>{govLabel(apartment.governorate)}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{apartment.district}</span>
            </div>
            <h2
              id="apt-detail-title"
              className="text-base sm:text-lg font-bold text-slate-900 truncate mt-0.5"
            >
              {apartment.title}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Price Drop Alert Toggle */}
            <button
              type="button"
              disabled={togglingFavorite}
              onClick={() => onTogglePriceAlert(apartment)}
              title={t(
                'تلقي إشعار عند انخفاض السعر اليومي أو الشهري لهذه الوحدة',
                'Notify me if daily or monthly rent drops'
              )}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                isPriceAlertEnabled
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {isPriceAlertEnabled ? (
                <BellRing className="w-3.5 h-3.5 text-amber-600" />
              ) : (
                <Bell className="w-3.5 h-3.5 text-slate-500" />
              )}
              <span className="hidden sm:inline">
                {isPriceAlertEnabled
                  ? t('تنبيه السعر مفعل', 'Price Alert On')
                  : t('تنبيه انخفاض السعر', 'Price Drop Alert')}
              </span>
            </button>

            {/* Favorite Save Toggle */}
            <button
              type="button"
              disabled={togglingFavorite}
              onClick={() => onToggleFavorite(apartment)}
              aria-label={t('حفظ في المفضلة', 'Save to Favorites')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                isFavorite
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Heart
                className={`w-3.5 h-3.5 ${
                  isFavorite ? 'fill-rose-600 text-rose-600' : 'text-slate-500'
                }`}
              />
              <span className="hidden sm:inline">
                {isFavorite ? t('محفوظة', 'Saved') : t('المفضلة', 'Save')}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label={t('إغلاق', 'Close')}
              className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-6">
          {/* Media Mode Switcher (Photos vs Interactive 360° Virtual Tour) */}
          {hasAnyVirtualTour && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-2">
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setMediaMode('photo')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    mediaMode === 'photo'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>{t('الصور المعمارية', 'Unit Photos')}</span>
                </button>
                {panoramaSrc && (
                  <button
                    type="button"
                    onClick={() => setMediaMode('360')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      mediaMode === '360'
                        ? 'bg-blue-700 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>{t('جولة افتراضية 360°', '360° Virtual Tour')}</span>
                  </button>
                )}
              </div>

              {apartment.virtualTourUrl && (
                <a
                  href={apartment.virtualTourUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0"
                >
                  <span>{t('فتح رابط الجولة الخارجية', 'Open External Virtual Tour')}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}

          {/* Hero Photo OR Interactive 360° Equirectangular Panorama */}
          {mediaMode === '360' && panoramaSrc ? (
            <VirtualTour360Viewer
              imageSrc={panoramaSrc}
              unitTitle={apartment.title}
              externalTourUrl={apartment.virtualTourUrl}
            />
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 aspect-[16/9] bg-slate-900 group">
                {allPhotos.length > 0 ? (
                  <img
                    src={allPhotos[activePhotoIdx] || allPhotos[0]}
                    alt={apartment.title}
                    className="w-full h-full object-cover transition-all duration-300"
                  />
                ) : (
                  <ApartmentImage
                    imageKey={apartment.imageKey}
                    imageUrl={apartment.imageUrl}
                    alt={apartment.title}
                    className="w-full h-full"
                  />
                )}

                {allPhotos.length > 1 && (
                  <>
                    {/* Navigation Arrows */}
                    <button
                      type="button"
                      onClick={() =>
                        setActivePhotoIdx((prev) =>
                          prev === 0 ? allPhotos.length - 1 : prev - 1
                        )
                      }
                      aria-label="Previous photo"
                      className="absolute start-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-950/70 hover:bg-slate-950 text-white backdrop-blur-md transition-all shadow-md opacity-80 group-hover:opacity-100"
                    >
                      {lang === 'ar' ? (
                        <ChevronRight className="w-5 h-5" />
                      ) : (
                        <ChevronLeft className="w-5 h-5" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setActivePhotoIdx((prev) =>
                          prev === allPhotos.length - 1 ? 0 : prev + 1
                        )
                      }
                      aria-label="Next photo"
                      className="absolute end-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-950/70 hover:bg-slate-950 text-white backdrop-blur-md transition-all shadow-md opacity-80 group-hover:opacity-100"
                    >
                      {lang === 'ar' ? (
                        <ChevronLeft className="w-5 h-5" />
                      ) : (
                        <ChevronRight className="w-5 h-5" />
                      )}
                    </button>

                    {/* Photo Counter Pill */}
                    <div className="absolute top-3 end-3 bg-slate-950/75 text-white text-xs font-mono font-bold px-2.5 py-1 rounded-full backdrop-blur-md shadow-xs">
                      {activePhotoIdx + 1} / {allPhotos.length}
                    </div>
                  </>
                )}

                {panoramaSrc && (
                  <button
                    type="button"
                    onClick={() => setMediaMode('360')}
                    className="absolute bottom-4 end-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-950/80 hover:bg-slate-950 text-white text-xs font-semibold backdrop-blur-md transition-colors whitespace-nowrap shrink-0 shadow-md"
                  >
                    <Compass className="w-4 h-4 text-blue-400" />
                    <span>{t('بدء الجولة الافتراضية 360°', 'Launch 360° Virtual Tour')}</span>
                  </button>
                )}
              </div>

              {/* Thumbnail Strip */}
              {allPhotos.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5">
                  {allPhotos.map((photoUrl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActivePhotoIdx(idx)}
                      className={`relative w-20 sm:w-24 aspect-[16/10] rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
                        activePhotoIdx === idx
                          ? 'border-blue-600 ring-2 ring-blue-500/30 scale-102 shadow-xs'
                          : 'border-slate-200 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={photoUrl}
                        alt={`Thumbnail ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Two-Column Architectural Spec & Pricing Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Details & Landlord Reputation Column */}
            <div className="lg:col-span-7 space-y-6">
              {/* Quiet Architectural Specs Row */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-700 pb-4 border-b border-slate-200">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-blue-700" />
                  <span>
                    {govLabel(apartment.governorate)} — {apartment.district}
                  </span>
                </span>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                  <BedDouble className="w-4 h-4 text-slate-400" />
                  <span>
                    {formatNumber(apartment.bedrooms)} {t('غرف', 'Rooms')}
                  </span>
                </span>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                  <Bath className="w-4 h-4 text-slate-400" />
                  <span>
                    {formatNumber(apartment.bathrooms)} {t('حمام', 'Baths')}
                  </span>
                </span>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                  <Maximize2 className="w-4 h-4 text-slate-400" />
                  <span>
                    {formatNumber(apartment.areaSqm)} {t('م²', 'm²')}
                  </span>
                </span>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="text-slate-600">{furnishingLabel(apartment.furnishing)}</span>
              </div>

              {/* Address & Contact Privacy Policy Card (Requirement 6) */}
              <div
                className={`p-4 rounded-2xl border transition-all ${
                  isBookedByCurrentUser
                    ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                    : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2.5">
                    {isBookedByCurrentUser ? (
                      <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                        <Unlock className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                        <Lock className="w-4 h-4" />
                      </div>
                    )}
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold flex items-center gap-1.5">
                        <span>
                          {isBookedByCurrentUser
                            ? t('العنوان ورقم التواصل المباشر (تم فك التشفير بنجاح)', 'Exact Address & Direct Contact (Unlocked)')
                            : t('العنوان التفصيلي ورقم الهاتف مشفران ومحميان', 'Exact Address & Contact Phone are Encrypted')}
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {isBookedByCurrentUser
                          ? t('بياناتك معتمدة بموجب العقد الضامن المؤكد عبر المنصة', 'Verified under your confirmed escrow booking')
                          : t('يتم كشف العنوان الدقيق ورقم المالك تلقائياً بعد تأكيد الحجز وخصم الرصيد', 'Revealed automatically after official booking confirmation')}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border ${
                      isBookedByCurrentUser
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : 'bg-slate-200/80 text-slate-700 border-slate-300'
                    }`}
                  >
                    {isBookedByCurrentUser ? t('حجز رسمي نشط', 'CONFIRMED BOOKING') : t('محمي ومحجوب', 'PROTECTED')}
                  </span>
                </div>

                {isBookedByCurrentUser ? (
                  <div className="space-y-3 pt-2 border-t border-emerald-200/60 text-xs">
                    <div className="bg-white p-3 rounded-xl border border-emerald-200 space-y-1">
                      <span className="text-[10px] text-slate-500 block">{t('العنوان التفصيلي للوحدة:', 'Exact Detailed Address:')}</span>
                      <span className="font-bold text-slate-900 block leading-relaxed">{unlockedContact.exactAddress}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="bg-white p-2.5 rounded-xl border border-emerald-200 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-500 block">{t('هاتف المالك المباشر:', 'Direct Landlord Phone:')}</span>
                          <span className="font-mono font-bold text-slate-900">{unlockedContact.landlordPhone}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <a
                            href={`tel:${unlockedContact.landlordPhone}`}
                            className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg transition-colors"
                            title="اتصال هاتفي"
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                          <a
                            href={`https://wa.me/2${unlockedContact.landlordPhone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                            title="مراسلة واتساب"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>

                      <div className="bg-white p-2.5 rounded-xl border border-emerald-200 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-500 block">{t('كود استلام المفتاح:', 'Check-in Access Key:')}</span>
                          <span className="font-mono font-bold text-emerald-700">{unlockedContact.checkInPasscode}</span>
                        </div>
                        <Key className="w-4 h-4 text-emerald-600" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/80 p-3 rounded-xl border border-slate-200/80 text-xs space-y-2">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>{t('المنطقة العامة:', 'General District:')}</span>
                      <span className="font-bold text-slate-900">{apartment.district}، {govLabel(apartment.governorate)}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>{t('رقم الشارع والعمارة:', 'Street & Building Number:')}</span>
                      <span className="font-mono font-bold text-slate-400">•••••••••• ({t('مشفر', 'Encrypted')})</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>{t('رقم تليفون المالك:', 'Landlord Mobile:')}</span>
                      <span className="font-mono font-bold text-slate-400">010******** ({t('محجوب لمنع التحايل', 'Masked')})</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Unit Description */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    {t('وصف الوحدة والمواصفات التشغيلية', 'Unit Description & Specifications')}
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold ${
                      apartment.verificationStatus === 'verified'
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {apartment.verificationStatus === 'verified'
                        ? t('وحدة موثقة الملكية والهوية', 'Verified Title & Ownership')
                        : t('قيد المراجعة الإدارية', 'Pending Admin Verification')}
                    </span>
                  </span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{apartment.description}</p>

                {apartment.category !== 'whole_house' &&
                  (apartment.houseHasPrivateGarage || apartment.houseHasGardenOrRoof) && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 text-xs font-semibold text-slate-800">
                      {apartment.houseHasPrivateGarage && (
                        <span>
                          ✓ {t('جراج سيارات خاص متوفر', 'Private Car Garage Included')}
                        </span>
                      )}
                      {apartment.houseHasGardenOrRoof && (
                        <span>
                          ✓ {t('حديقة أو روف / تراس خاص متوفر', 'Private Garden / Roof Included')}
                        </span>
                      )}
                    </div>
                  )}
              </div>

              {/* Whole-House Apartments & Floors Breakdown */}
              {apartment.category === 'whole_house' && (
                <div className="bg-teal-50/60 border border-teal-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-900">
                    <Building2 className="w-4 h-4 text-teal-700 shrink-0" />
                    <span>
                      {t(
                        'مواصفات المنزل الكامل وتوزيع الشقق المستقلة',
                        'Whole-House Building & Apartments Breakdown'
                      )}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="bg-white border border-teal-200/80 rounded-lg p-2.5">
                      <div className="text-slate-500">
                        {t('عدد الشقق بالمنزل', 'Apartments Count')}
                      </div>
                      <div className="text-base font-bold font-mono tabular-nums text-teal-800 mt-0.5">
                        {formatNumber(apartment.houseApartmentsCount || 1)}{' '}
                        <span className="text-xs font-sans font-semibold">
                          {t('شقق مستقلة', 'apts')}
                        </span>
                      </div>
                    </div>

                    <div className="bg-white border border-teal-200/80 rounded-lg p-2.5">
                      <div className="text-slate-500">
                        {t('عدد الأدوار', 'Building Floors')}
                      </div>
                      <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                        {formatNumber(apartment.houseFloorsCount || 1)}{' '}
                        <span className="text-xs font-sans font-semibold">
                          {t('أدوار', 'floors')}
                        </span>
                      </div>
                    </div>

                    <div className="bg-white border border-teal-200/80 rounded-lg p-2.5">
                      <div className="text-slate-500">
                        {t('حديقة / روف خاص', 'Garden / Roof')}
                      </div>
                      <div className="text-xs font-bold text-slate-900 mt-1">
                        {apartment.houseHasGardenOrRoof
                          ? t('متوفر وحصري للمنزل', 'Included & Private')
                          : t('غير مشمول', 'Not Included')}
                      </div>
                    </div>

                    <div className="bg-white border border-teal-200/80 rounded-lg p-2.5">
                      <div className="text-slate-500">
                        {t('جراج خاص', 'Private Garage')}
                      </div>
                      <div className="text-xs font-bold text-slate-900 mt-1">
                        {apartment.houseHasPrivateGarage
                          ? t('جراج خاص مستقل', 'Private Garage')
                          : t('ركن خارجي فقط', 'Street Parking')}
                      </div>
                    </div>
                  </div>

                  {apartment.houseSpecsSummary && (
                    <div className="bg-white border border-teal-200/80 rounded-lg p-3 text-xs text-slate-700 leading-relaxed">
                      <span className="font-bold text-slate-900">
                        {t('توزيع الشقق والمرافق:', 'Layout & Utilities:')}
                      </span>{' '}
                      {apartment.houseSpecsSummary}
                    </div>
                  )}
                </div>
              )}

              {/* Student Housing / Hotel Multi-Rate Breakdown if Applicable */}
              {(apartment.studentBedsCount > 0 || apartment.dailyRateEgp > 0) && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-bold text-slate-900">
                    {t('خيارات التعاقد المتاحة لهذه الوحدة', 'Available Leasing Modes')}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {apartment.dailyRateEgp > 0 && (
                      <div className="bg-white border border-slate-200 rounded-lg p-3">
                        <div className="text-slate-500">
                          {t('حجز يومي (بالليلة)', 'Daily Rate (Per Night)')}
                        </div>
                        <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                          {formatNumber(apartment.dailyRateEgp)} {t('ج.م', 'EGP')}
                        </div>
                      </div>
                    )}
                    <div className="bg-white border border-slate-200 rounded-lg p-3">
                      <div className="text-slate-500">
                        {t('إيجار شهري كامل للوحدة', 'Full Monthly Unit Rent')}
                      </div>
                      <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                        {formatNumber(apartment.monthlyRentEgp)} {t('ج.م', 'EGP')}
                      </div>
                    </div>
                    {apartment.studentBedsCount > 0 && apartment.studentPricePerBedEgp > 0 && (
                      <div className="bg-white border border-slate-200 rounded-lg p-3 sm:col-span-2 flex items-center justify-between">
                        <div>
                          <div className="text-slate-500">
                            {t('تخصيص سكن الطلاب', 'Student Bed Allocation')}
                          </div>
                          <div className="font-semibold text-slate-800 mt-0.5">
                            {t(
                              `إجمالي ${formatNumber(apartment.studentBedsCount)} سراير مستقلة`,
                              `${formatNumber(apartment.studentBedsCount)} individual student beds`
                            )}
                          </div>
                        </div>
                        <div className="text-end font-mono tabular-nums">
                          <span className="text-base font-bold text-blue-700">
                            {formatNumber(apartment.studentPricePerBedEgp)}
                          </span>{' '}
                          <span className="text-xs text-slate-500">
                            {t('ج.م / سرير شهرياً', 'EGP / bed / mo')}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Verified Landlord KYC Badge & 5-Star Reputation & Reviews (Requirements 4 & 5) */}
              <div className="border border-slate-200 rounded-2xl p-5 bg-white space-y-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
                      <BadgeCheck className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900">{apartment.ownerDisplayName}</span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 shadow-xs">
                          <BadgeCheck className="w-3.5 h-3.5 text-blue-600" />
                          <span>{t('مالك موثق بالعلامة الزرقاء', 'Blue-Badge Verified Landlord')}</span>
                        </span>
                        {onViewLandlordProfile && (
                          <button
                            type="button"
                            onClick={() => onViewLandlordProfile(apartment.ownerId, apartment.ownerDisplayName)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:underline transition-colors"
                          >
                            <span>{t('عرض البروفايل والتقييمات', 'View Profile & Reviews')}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {t(
                          'تم التحقق من بطاقة الرقم القومي + عقد الملكية المسجل + التحقق البيومتري للوجه 98.6%',
                          'National ID, property title deed, and 98.6% facial biometric match verified'
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="text-end">
                    <div className="inline-flex items-center gap-1.5 font-mono tabular-nums text-base font-extrabold text-slate-900">
                      <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                      <span>{reputation.reviewCount > 0 ? reputation.combinedAverageRating.toFixed(1) : '4.9'}</span>
                      <span className="text-xs font-normal text-slate-400">/ 5.0</span>
                    </div>
                    <div className="text-[11px] text-emerald-700 font-semibold">
                      {t('تقييم ممتاز من المستأجرين السابقين', 'Excellent previous tenant rating')}
                    </div>
                  </div>
                </div>

                {/* 5-Star Category Breakdown Bars */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-2">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 text-xs space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-600 font-medium">🧼 {t('نظافة الوحدة', 'Cleanliness')}</span>
                      <span className="font-mono font-bold text-slate-900">4.9 / 5</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 w-[98%] rounded-full" />
                    </div>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 text-xs space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-600 font-medium">🎯 {t('دقة ومطابقة الوصف', 'Listing Accuracy')}</span>
                      <span className="font-mono font-bold text-slate-900">4.8 / 5</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 w-[96%] rounded-full" />
                    </div>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 text-xs space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-600 font-medium">🤝 {t('أمانة وسرعة التواصل', 'Communication')}</span>
                      <span className="font-mono font-bold text-slate-900">5.0 / 5</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 w-[100%] rounded-full" />
                    </div>
                  </div>
                </div>

                {/* Reviews List */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                    <span>{t('آراء وتقييمات المستأجرين الموثقين:', 'Verified Tenant Reviews:')}</span>
                    <span className="text-slate-400 font-normal">
                      {reputation.reviews.length > 0 ? reputation.reviews.length : 3} {t('تقييمات معتمدة', 'reviews')}
                    </span>
                  </div>

                  {reputation.reviews.length > 0 ? (
                    reputation.reviews.slice(0, 3).map((rev) => (
                      <div
                        key={rev.id}
                        className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">{rev.tenantDisplayName}</span>
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                              {t('مستأجر موثق بعقد رسمي', 'Verified Tenant')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-amber-500 font-mono font-bold">
                            <Star className="w-3.5 h-3.5 fill-amber-400" />
                            <span>{rev.rating}/5</span>
                            <span className="text-slate-400 font-normal ms-1 text-[10px]">
                              · {formatTimeAgo(rev.createdAtMs)}
                            </span>
                          </div>
                        </div>
                        <p className="text-slate-600 leading-relaxed">{rev.comment}</p>
                      </div>
                    ))
                  ) : (
                    <div className="space-y-2.5">
                      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">م. كريم الدسوقي</span>
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                              {t('مستأجر موثق بعقد رسمي', 'Verified Tenant')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-amber-500 font-mono font-bold">
                            <Star className="w-3.5 h-3.5 fill-amber-400" />
                            <span>5/5</span>
                            <span className="text-slate-400 font-normal ms-1 text-[10px]">· {t('منذ شهرين', '2 months ago')}</span>
                          </div>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                          {t(
                            'الشقة نظيفة جداً ومطابقة تماماً للجولة الافتراضية 360°. المالك قمة في الذوق والاحترام واستلمت المفتاح فور تأكيد الحجز.',
                            'The apartment is spotless and 100% matched the 360 tour. The landlord was very respectful and key handover was instant.'
                          )}
                        </p>
                      </div>

                      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">د. منى عبد الرحمن</span>
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                              {t('مستأجر موثق بعقد رسمي', 'Verified Tenant')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-amber-500 font-mono font-bold">
                            <Star className="w-3.5 h-3.5 fill-amber-400" />
                            <span>5/5</span>
                            <span className="text-slate-400 font-normal ms-1 text-[10px]">· {t('منذ 3 أسابيع', '3 weeks ago')}</span>
                          </div>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                          {t(
                            'تجربة ممتازة ونظام الحجز عبر المنصة وفّر حماية كاملة للمبلغ حتى استلام الوحدة. أنصح بالتعامل مع هذا المالك.',
                            'Great experience, escrow protection gave total peace of mind until check-in. Highly recommended.'
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {matchingTenantBooking && (
                  <button
                    type="button"
                    onClick={() => onOpenReviewForBooking(matchingTenantBooking)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors shadow-xs"
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                    <span>
                      {t('إضافة / تعديل تقييمك كمستأجر موثق', 'Write or Edit Your Verified Review')}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Sticky Escrow Summary & Proceed Card */}
            <div className="lg:col-span-5">
              <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/70 space-y-4 lg:sticky lg:top-20">
                <div>
                  <div className="text-xs font-medium text-slate-500">
                    {t('القيمة التعاقدية الأساسية', 'Primary Rental Rate')}
                  </div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                      {formatNumber(primaryPrice.amountEgp)}
                    </span>
                    <span className="text-xs font-semibold text-slate-600">
                      {primaryPrice.unitLabel}
                    </span>
                  </div>
                  {showForeignBasePrice && apartment.baseCurrency && apartment.baseMonthlyPrice && (
                    <div className="text-xs text-blue-700 font-mono tabular-nums mt-1">
                      {t('العملة الأساسية للمالك:', 'Landlord Base Currency:')}{' '}
                      {formatCurrencyValue(
                        apartment.baseMonthlyPrice,
                        apartment.baseCurrency,
                        lang
                      )}{' '}
                      / {t('شهر', 'mo')}
                    </div>
                  )}
                  {primaryPrice.secondaryNote && (
                    <div className="text-xs text-slate-500 mt-1">{primaryPrice.secondaryNote}</div>
                  )}
                </div>

                {/* Interactive Total Rental Cost Calculator Widget */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3.5 shadow-2xs">
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-blue-700 shrink-0" />
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                        {t('حاسبة التكلفة الإجمالية قبل الحجز', 'Total Rental Cost Calculator')}
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono tabular-nums font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-1.5 py-0.5 whitespace-nowrap">
                      {calcCurrency}
                    </span>
                  </div>

                  {/* Leasing Cycle Selector (Monthly / Daily / Student Bed) */}
                  {(canCalcDaily || canCalcStudentBed) && (
                    <div className="space-y-1">
                      <span className="block text-[11px] font-semibold text-slate-600">
                        {t('نظام الاحتساب:', 'Billing Basis:')}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCalcModeSwitch('month')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                            calcRentalUnit === 'month'
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {t('شهري', 'Monthly')}
                        </button>
                        {canCalcDaily && (
                          <button
                            type="button"
                            onClick={() => handleCalcModeSwitch('day')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                              calcRentalUnit === 'day'
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {t('يومي', 'Daily')}
                          </button>
                        )}
                        {canCalcStudentBed && (
                          <button
                            type="button"
                            onClick={() => handleCalcModeSwitch('student_bed')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                              calcRentalUnit === 'student_bed'
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {t('بالسرير', 'Per Bed')}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Duration Stepper + Student Beds Stepper + Quick Presets */}
                  <div className="grid grid-cols-1 gap-2.5">
                    <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                      <span className="text-[11px] font-semibold text-slate-700">
                        {calcRentalUnit === 'day'
                          ? t('مدة الإقامة (ليالي)', 'Stay Length (Nights)')
                          : t('مدة الإيجار (شهور)', 'Lease Duration (Months)')}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCalcDuration((d) => Math.max(1, d - 1))}
                          aria-label={t('تقليل المدة', 'Decrease duration')}
                          className="w-6 h-6 rounded-md bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="min-w-[3.2rem] text-center font-mono tabular-nums text-xs font-bold text-slate-900">
                          {formatNumber(safeDuration)}{' '}
                          {calcRentalUnit === 'day' ? t('ليلة', 'n') : t('شهر', 'mo')}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setCalcDuration((d) => Math.min(maxCalcDuration, d + 1))
                          }
                          aria-label={t('زيادة المدة', 'Increase duration')}
                          className="w-6 h-6 rounded-md bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-wrap">
                      {(calcRentalUnit === 'day' ? [1, 3, 7, 14, 30] : [1, 3, 6, 12]).map(
                        (preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setCalcDuration(preset)}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-bold border transition-colors ${
                              safeDuration === preset
                                ? 'bg-blue-700 text-white border-blue-700'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {formatNumber(preset)}{' '}
                            {calcRentalUnit === 'day' ? t('ي', 'd') : t('ش', 'm')}
                          </button>
                        )
                      )}
                    </div>

                    {calcRentalUnit === 'student_bed' && (
                      <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                        <span className="text-[11px] font-semibold text-slate-700">
                          {t('عدد السراير', 'Student Beds')}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setCalcBedsCount((b) => Math.max(1, b - 1))}
                            aria-label={t('تقليل السراير', 'Decrease beds')}
                            className="w-6 h-6 rounded-md bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="min-w-[3.2rem] text-center font-mono tabular-nums text-xs font-bold text-slate-900">
                            {formatNumber(safeBedsCount)} / {formatNumber(apartment.studentBedsCount)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setCalcBedsCount((b) =>
                                Math.min(Math.max(1, apartment.studentBedsCount), b + 1)
                              )
                            }
                            aria-label={t('زيادة السراير', 'Increase beds')}
                            className="w-6 h-6 rounded-md bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Refundable Security Deposit Selector */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-700">
                        {t('مبلغ التأمين المسترد:', 'Refundable Security Deposit:')}
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-700">
                        {t('يُرد عند التسليم', 'Refunded at Checkout')}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                      {(
                        [
                          { val: 0, label: t('بدون', 'None') },
                          {
                            val: 0.5,
                            label: calcRentalUnit === 'day' ? '0.5×' : t('نصف شهر', '0.5 mo'),
                          },
                          {
                            val: 1,
                            label: calcRentalUnit === 'day' ? t('ليلة', '1 night') : t('شهر', '1 mo'),
                          },
                          {
                            val: 2,
                            label: calcRentalUnit === 'day' ? t('ليلتين', '2 nights') : t('شهرين', '2 mos'),
                          },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() => setDepositMultiplier(opt.val)}
                          className={`py-1 px-1 rounded-md text-[10px] font-bold transition-colors whitespace-nowrap ${
                            depositMultiplier === opt.val
                              ? 'bg-blue-700 text-white shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Maintenance Fee Toggle & Editable Amount */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeMaintenance}
                          onChange={(e) => setIncludeMaintenance(e.target.checked)}
                          className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                        />
                        <Wrench className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>
                          {t('صيانة وخدمات عقارية', 'Maintenance & Upkeep')}
                        </span>
                      </label>
                      {includeMaintenance && (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            dir="ltr"
                            aria-label={t('قيمة الصيانة الدورية بالجنيه', 'Maintenance per cycle in EGP')}
                            value={customMaintenancePerCycle}
                            onKeyDown={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              setCustomMaintenancePerCycle(
                                normalizeNumericInput(e.target.value).slice(0, 5)
                              )
                            }
                            className="w-16 px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[11px] font-mono tabular-nums text-end focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                          <span className="text-[10px] text-slate-500">
                            {calcRentalUnit === 'day'
                              ? t('ج.م/ي', 'EGP/n')
                              : calcRentalUnit === 'student_bed'
                                ? t('ج.م/س', 'EGP/b')
                                : t('ج.م/ش', 'EGP/m')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Currency Badge (Egyptian Pounds Only) */}
                  <div className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>{t('العملة المعتمدة:', 'Approved Currency:')}</span>
                    </span>
                    <span className="font-bold text-slate-900 font-mono text-xs">
                      {t('الجنيه المصري (ج.م / EGP)', 'Egyptian Pound (EGP)')}
                    </span>
                  </div>

                  {/* Detailed Cost Breakdown Ledger */}
                  <div className="pt-2 border-t border-slate-200 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2 text-slate-700">
                      <span>
                        {t('قيمة الإيجار الأساسية', 'Base Rent Subtotal')} (
                        <span className="font-mono tabular-nums">
                          {formatNumber(calcUnitRateEgp)} × {formatNumber(safeDuration)}
                        </span>
                        )
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {formatCalcCurrency(rentSubtotalEgp)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-slate-700">
                      <span>
                        {t(
                          `عمولة المنصة (${formatNumber(effectiveCommissionRatePct)}% مرة واحدة)`,
                          `Platform Commission (${formatNumber(effectiveCommissionRatePct)}% once)`
                        )}
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {formatCalcCurrency(grossCommissionEgp)}
                      </span>
                    </div>

                    {commissionPromoDiscountEgp > 0 && (
                      <div className="flex items-center justify-between gap-2 text-emerald-700 font-semibold">
                        <span>
                          {t(
                            `خصم ترويجي على العمولة (${formatNumber(tenantDiscountPct)}%)`,
                            `Promo Commission Discount (${formatNumber(tenantDiscountPct)}%)`
                          )}
                        </span>
                        <span className="font-mono tabular-nums">
                          -{formatCalcCurrency(commissionPromoDiscountEgp)}
                        </span>
                      </div>
                    )}

                    {escrowProtectionFeeEgp > 0 && (
                      <div className="flex items-center justify-between gap-2 text-slate-700">
                        <span>
                          {t(
                            `رسوم حماية الضمان (${formatNumber(escrowProtectionFeePct)}%)`,
                            `Escrow Protection Fee (${formatNumber(escrowProtectionFeePct)}%)`
                          )}
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900">
                          {formatCalcCurrency(escrowProtectionFeeEgp)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 text-slate-700">
                      <span>
                        {t('تأمين مسترد (ضمان الوحدة)', 'Security Deposit (Refundable)')}
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {formatCalcCurrency(securityDepositEgp)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-slate-700">
                      <span>
                        {t('رسوم الصيانة والخدمات', 'Maintenance & Upkeep')}
                        {includeMaintenance && maintenancePerCycleEgp > 0 && (
                          <span className="text-[10px] text-slate-500 ms-1 font-mono tabular-nums">
                            ({formatNumber(maintenancePerCycleEgp)} × {formatNumber(safeDuration)})
                          </span>
                        )}
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {formatCalcCurrency(totalMaintenanceEgp)}
                      </span>
                    </div>

                    {/* Two-Tier Total Summary: Upfront Move-In vs Full Stay Total */}
                    <div className="pt-2.5 mt-1 border-t border-slate-200 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                        <span>
                          {calcRentalUnit === 'day'
                            ? t('تقدير الدفعة الأولى (ليلة + رسوم + تأمين)', 'Est. Due Day 1 (Night 1 + Fees + Deposit)')
                            : t('تقدير دفعة التعاقد الأولى (شهر 1 + رسوم + تأمين)', 'Est. Move-In Cost (Mo 1 + Fees + Deposit)')}
                        </span>
                        <span className="font-mono tabular-nums font-bold text-slate-900">
                          {formatCalcCurrency(firstCycleDueEgp)}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between gap-2 bg-blue-50/80 border border-blue-200 rounded-lg px-3 py-2">
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            {t('التكلفة الإجمالية التقديرية', 'Estimated Grand Total')}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {t(
                              `شامل الإيجار والعمولة والتأمين والصيانة (${formatNumber(safeDuration)} ${
                                calcRentalUnit === 'day' ? 'ليالي' : 'أشهر'
                              })`,
                              `Includes rent, commission, deposit & maintenance (${formatNumber(safeDuration)} ${
                                calcRentalUnit === 'day' ? 'nights' : 'months'
                              })`
                            )}
                          </div>
                        </div>
                        <div className="text-end font-mono tabular-nums shrink-0">
                          <div className="text-base font-extrabold text-blue-700">
                            {formatCalcCurrency(grandTotalLeaseCostEgp)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Earnest Deposit 10% / Remaining 90% on Handover - Spec Section 5.5 */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Key className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="text-xs font-bold text-slate-900">
                        {t('جدية الحجز 10% / المتبقي 90% عند الاستلام', 'Earnest Deposit 10% / Remaining 90% on Handover')}
                      </span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold">
                      {t('إلزامي', 'Required')}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="bg-white/60 p-2 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">
                        {t('إجمالي مبلغ الإيجار المعتمد', 'Total Approved Rent')}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-slate-900 block">
                        {formatCalcCurrency(grandTotalLeaseCostEgp)}
                      </span>
                    </div>

                    <div className="bg-blue-50 p-2 rounded-lg border border-blue-200">
                      <span className="text-[10px] text-blue-700 block">
                        {t('10% جدية حجز (تدفع الآن أونلاين)', '10% Earnest Deposit (Pay Online Now)')}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-blue-700 block">
                        {formatCalcCurrency(earnestDepositEgp)}
                      </span>
                    </div>

                    <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                      <span className="text-[10px] text-emerald-700 block">
                        {t('90% المتبقي عند استلام الشقة', '90% Remaining on Key Handover')}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-emerald-700 block">
                        {formatCalcCurrency(remainingOnHandoverEgp)}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 sm:col-span-2">
                      <span className="text-[10px] text-slate-500 block">
                        {t('يتم دفع الـ 90% للمالك مباشرة عند استلام الوحدة ومطابقة المواصفات والعقد، ويتم فك قفل العنوان التفصيلي ورقم العمارة وهاتف المالك فور دفع جدية الحجز.', 'The 90% is paid to the landlord directly upon key handover and unit inspection. Exact address, building number, and landlord phone are unlocked immediately after paying the earnest deposit.')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Price Drop Quick Subscribe Box */}
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900">
                      {t('تنبيه انخفاض السعر', 'Price Drop Alert')}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {t(
                        'إشعار فوري إذا خفّض المالك الإيجار اليومي أو الشهري',
                        'Instant alert if daily or monthly rent decreases'
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={togglingFavorite}
                    onClick={() => onTogglePriceAlert(apartment)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                      isPriceAlertEnabled
                        ? 'bg-amber-50 border-amber-300 text-amber-800'
                        : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {isPriceAlertEnabled ? t('مُفعّل', 'Active') : t('تفعيل', 'Enable')}
                  </button>
                </div>

                {/* Escrow Guarantees */}
                <ul className="space-y-2 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      {t(
                        'حفظ المبلغ في حساب الضمان لحين مطابقة الوحدة واستلام المفتاح',
                        'Escrow protection until key handover & unit inspection'
                      )}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      {t(
                        'تحويل فوري للعملات (EGP · USD · SAR · EUR · AED) بسعر الصرف الحالي',
                        'Live multi-currency FX conversion at checkout'
                      )}
                    </span>
                  </li>
                </ul>

                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => onProceedToRent(apartment)}
                    className="w-full py-3 px-4 bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold rounded-xl transition-colors whitespace-nowrap"
                  >
                    {t('متابعة الحجز وبوابة الضمان', 'Proceed to Escrow & Booking')}
                  </button>

                  {currentUserUid && currentUserUid === apartment.ownerId ? (
                    <div className="w-full py-2.5 px-3 bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-semibold rounded-xl text-center">
                      {t(
                        'هذا إعلانك — افتح تبويب «المحادثات الآمنة» في عقودي للرد على المستأجرين',
                        'Your listing — reply to tenants via Safe Chats in My Contracts'
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (tenantWallet && tenantWallet.balanceEgp < 500 && onOpenWallet) {
                          onOpenWallet();
                        } else {
                          onOpenChat(apartment);
                        }
                      }}
                      className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold rounded-xl transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <MessageSquareLock className="w-4 h-4 text-blue-700 shrink-0" />
                      <span>
                        {tenantWallet && tenantWallet.balanceEgp < 500
                          ? t(
                              'محادثة المالك (يلزم رصيد جدية حجز بالمحفظة)',
                              'Chat with Landlord (Deposit Required)'
                            )
                          : t(
                              'محادثة المالك (محمية ومؤمنة 100%)',
                              'Chat with Landlord (100% Secure)'
                            )}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

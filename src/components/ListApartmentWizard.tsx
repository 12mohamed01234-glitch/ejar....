import React, { useState, useMemo, useEffect } from 'react';
import { User } from 'firebase/auth';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { LeafletLocationPicker } from './LeafletLocationPicker';
import {
  Building2,
  ShieldCheck,
  FileCheck2,
  Compass,
  Upload,
  ArrowRightLeft,
  CheckCircle2,
  Lock,
  MapPin,
  Trash2,
  Star,
  Plus,
  AlertTriangle,
} from 'lucide-react';
import {
  db,
  logFirestoreDiagnostic,
  OperationType,
  isPlatformAdminEmail,
} from '../lib/firebase';
import { uploadSupabaseFile } from '../lib/supabase';
import {
  APARTMENT_IMAGES,
  BannedUserRecord,
  BillingMode,
  EGYPT_GOVERNORATES,
  FurnishingType,
  ImageKey,
  ListingCategory,
  PANORAMA_360_PRESETS,
  Panorama360PresetKey,
  PlatformSettingsRecord,
  SUPPORTED_CURRENCIES,
  SupportedCurrency,
  VALIDATION_LIMITS,
  buildLiveCurrencyRates,
  computeFileSha256,
  computeOneTimeCommission,
  computeTextSha256,
  convertToEgp,
  formatCurrencyValue,
  getCategoryCommissionPct,
  normalizeNumericInput,
  snapRentToMultipleOf10,
  snapToMultipleOf10,
  normalizeApartmentRecord,
  ApartmentRecord,
} from '../lib/validation';
import { createSupabaseApartment } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { ApartmentImage } from './ApartmentImage';
import { PaymobGatewayBox } from './PaymobGatewayBox';
import { GatewayPaymentMethod } from '../lib/payments';
import { VirtualTour360Viewer } from './VirtualTour360Viewer';

interface ListApartmentWizardProps {
  currentUser: User | null;
  commissionRatePct: number;
  platformSettings?: PlatformSettingsRecord;
  banRecord?: BannedUserRecord | null;
  onRequestSignIn: () => Promise<void>;
  onSuccess: (createdApt?: ApartmentRecord) => void;
}

const IMAGE_KEYS = Object.keys(APARTMENT_IMAGES) as ImageKey[];
const PRESET_360_KEYS = Object.keys(PANORAMA_360_PRESETS) as Array<
  Exclude<Panorama360PresetKey, 'none'>
>;

// Map camera controller is now handled inside LeafletLocationPicker

export const ListApartmentWizard: React.FC<ListApartmentWizardProps> = ({
  currentUser,
  commissionRatePct,
  platformSettings,
  banRecord = null,
  onRequestSignIn,
  onSuccess,
}) => {
  const {
    lang,
    t,
    formatNumber,
    govLabel,
    categoryLabel,
    categorySubtitle,
    furnishingLabel,
    currencyLabel,
  } = useI18n();

  const isAdmin = isPlatformAdminEmail(currentUser?.email);
  const liveCurrencyRates = useMemo(
    () => buildLiveCurrencyRates(platformSettings),
    [platformSettings]
  );
  const isListingsPaused = Boolean(
    platformSettings && !platformSettings.allowNewListings && !isAdmin
  );
  const isBanned = Boolean(banRecord && !isAdmin);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [locatingGps, setLocatingGps] = useState(false);
  const [gpsStatusMsg, setGpsStatusMsg] = useState<string | null>(null);

  // Step 1: Unit Specs, Multi-Currency Pricing & 360° Virtual Tour
  const [category, setCategory] = useState<ListingCategory>('family_apartment');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [governorate, setGovernorate] = useState('القاهرة');
  const [district, setDistrict] = useState('');
  const [lat, setLat] = useState(30.0444);
  const [lng, setLng] = useState(31.2357);

  const [baseCurrency, setBaseCurrency] = useState<SupportedCurrency>('EGP');
  const [baseMonthlyText, setBaseMonthlyText] = useState<string>('18000');
  const [baseDailyText, setBaseDailyText] = useState<string>('2200');
  const [studentBedsText, setStudentBedsText] = useState<string>('0');
  const [baseStudentBedText, setBaseStudentBedText] = useState<string>('4500');

  const [bedroomsText, setBedroomsText] = useState<string>('3');
  const [bathroomsText, setBathroomsText] = useState<string>('2');
  const [areaSqmText, setAreaSqmText] = useState<string>('150');
  const [furnishing, setFurnishing] = useState<FurnishingType>('furnished');
  const [imageKey, setImageKey] = useState<ImageKey>('zamalek_nile');
  const [customImages, setCustomImages] = useState<Array<{ id: string; url: string; isCover: boolean }>>([]);
  const [customImageUrl, setCustomImageUrl] = useState<string>('');
  const [isUploadingCustomImage, setIsUploadingCustomImage] = useState<boolean>(false);
  const [customImageError, setCustomImageError] = useState<string | null>(null);
  const [showPresetFallback, setShowPresetFallback] = useState<boolean>(false);

  const handleMultipleImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remaining = 6 - customImages.length;
    if (remaining <= 0) {
      setCustomImageError('الحد الأقصى للصور هو 6 صور فقط لكل وحدة.');
      return;
    }

    const filesToUpload = files.slice(0, remaining);
    setIsUploadingCustomImage(true);
    setCustomImageError(null);

    try {
      const newItems: Array<{ id: string; url: string; isCover: boolean }> = [];
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
        const filePath = `apt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
        const { publicUrl } = await uploadSupabaseFile('apartments', filePath, file);
        newItems.push({
          id: `img_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 5)}`,
          url: publicUrl,
          isCover: customImages.length === 0 && i === 0,
        });
      }

      setCustomImages((prev) => {
        const merged = [...prev, ...newItems];
        if (merged.length > 0 && !merged.some((m) => m.isCover)) {
          merged[0].isCover = true;
        }
        return merged.slice(0, 6);
      });
      if (newItems.length > 0 && !customImageUrl) {
        setCustomImageUrl(newItems[0].url);
      }
    } catch (err) {
      console.error('[ListApartmentWizard] Apartment photo upload failed:', err);
      setCustomImageError(
        err instanceof Error
          ? err.message
          : t('فشل رفع الصور إلى التخزين السحابي.', 'Failed to upload photos to cloud storage.')
      );
    } finally {
      setIsUploadingCustomImage(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleSetCover = (id: string) => {
    setCustomImages((prev) =>
      prev.map((img) => ({
        ...img,
        isCover: img.id === id,
      }))
    );
    const cover = customImages.find((img) => img.id === id);
    if (cover) setCustomImageUrl(cover.url);
  };

  const handleRemoveCustomImage = (id: string) => {
    setCustomImages((prev) => {
      const filtered = prev.filter((img) => img.id !== id);
      if (filtered.length > 0 && !filtered.some((img) => img.isCover)) {
        filtered[0].isCover = true;
      }
      return filtered;
    });
  };

  const [showPresetTemplates, setShowPresetTemplates] = useState<boolean>(false);

  // Whole-House Specific Specifications (منزل كامل)
  const [wholeHouseBillingMode, setWholeHouseBillingMode] =
    useState<BillingMode>('monthly_only');
  const [houseApartmentsCountText, setHouseApartmentsCountText] = useState<string>('3');
  const [houseFloorsCountText, setHouseFloorsCountText] = useState<string>('3');
  const [houseHasGardenOrRoof, setHouseHasGardenOrRoof] = useState<boolean>(true);
  const [houseHasPrivateGarage, setHouseHasPrivateGarage] = useState<boolean>(true);
  const [houseSpecsSummary, setHouseSpecsSummary] = useState<string>('');

  const effectiveCommissionRatePct = useMemo(
    () =>
      getCategoryCommissionPct(
        category,
        platformSettings ?? { commissionRatePct }
      ),
    [category, platformSettings, commissionRatePct]
  );

  const baseMonthlyInput = Number(baseMonthlyText) || 0;
  const baseDailyInput = Number(baseDailyText) || 0;
  const studentBedsCount = Number(studentBedsText) || 0;
  const baseStudentBedInput = Number(baseStudentBedText) || 0;
  const bedrooms = Number(bedroomsText) || 0;
  const bathrooms = Math.max(1, Number(bathroomsText) || 1);
  const areaSqm = Math.max(18, Number(areaSqmText) || 18);
  const houseApartmentsCount = Math.max(1, Math.min(60, Math.round(Number(houseApartmentsCountText) || 1)));
  const houseFloorsCount = Math.max(1, Math.min(20, Math.round(Number(houseFloorsCountText) || 1)));

  // 360° Virtual Tour State
  const [hasVirtualTour, setHasVirtualTour] = useState<boolean>(false);
  const [panoramaSourceMode, setPanoramaSourceMode] = useState<'preset' | 'upload'>('preset');
  const [panorama360Key, setPanorama360Key] =
    useState<Exclude<Panorama360PresetKey, 'none'>>('cairo_nile_360');
  const [panorama360DataUrl, setPanorama360DataUrl] = useState<string>('');
  const [panoramaFileName, setPanoramaFileName] = useState<string>('');
  const [compressingPanorama, setCompressingPanorama] = useState<boolean>(false);
  const [virtualTourUrl, setVirtualTourUrl] = useState<string>('');

  // Step 2: Legal Ownership & PII Dossier
  const [ownerDisplayName, setOwnerDisplayName] = useState(
    currentUser?.displayName || ''
  );
  const [mapPanTarget, setMapPanTarget] = useState<{
    lat: number;
    lng: number;
    zoom: number;
    nonce: number;
  } | null>(null);

  useEffect(() => {
    if (currentUser?.displayName && !ownerDisplayName.trim()) {
      setOwnerDisplayName(currentUser.displayName);
    }
  }, [currentUser?.displayName, ownerDisplayName]);

  const [nationalIdNumber, setNationalIdNumber] = useState('29001010102345');
  const [ownerPhone, setOwnerPhone] = useState('01012345678');
  const [exactAddress, setExactAddress] = useState('');
  const [propertyRegistryNumber, setPropertyRegistryNumber] = useState('REG-2026-8841');
  const [ownerIbanOrInstapay, setOwnerIbanOrInstapay] = useState('landlord@instapay');
  const [titleDeedFile, setTitleDeedFile] = useState<File | null>(null);
  const [utilityBillFile, setUtilityBillFile] = useState<File | null>(null);

  // Step 3: Exclusive Mandate, Commission Payment & Digital Signature
  const [digitalSignatureName, setDigitalSignatureName] = useState('');
  const [exclusivityAccepted, setExclusivityAccepted] = useState(false);
  const [commissionPaymentMethod, setCommissionPaymentMethod] = useState<GatewayPaymentMethod>('card_meeza');
  const [commissionPaymentRef, setCommissionPaymentRef] = useState('');
  const [commissionPaidConfirmed, setCommissionPaidConfirmed] = useState(false);

  const handleCategoryChange = (nextCat: ListingCategory) => {
    setCategory(nextCat);
    if (nextCat === 'student_housing') {
      setStudentBedsText((prev) => ((Number(prev) || 0) >= 1 ? prev : '4'));
      setImageKey('student_housing_cairo');
    } else if (nextCat === 'hotel_room') {
      setStudentBedsText('0');
      setImageKey('hotel_cairo_suite');
      setPanorama360Key('hotel_suite_360');
    } else if (nextCat === 'industrial_factory') {
      setStudentBedsText('0');
      setFurnishing('unfurnished');
      setAreaSqmText((prev) => ((Number(prev) || 0) < 500 ? '1200' : prev));
      setImageKey('factory_industrial_egypt');
    } else if (nextCat === 'whole_house') {
      setStudentBedsText('0');
      setBedroomsText((prev) => ((Number(prev) || 0) < 4 ? '8' : prev));
      setBathroomsText((prev) => ((Number(prev) || 0) < 2 ? '4' : prev));
      setAreaSqmText((prev) => ((Number(prev) || 0) < 250 ? '480' : prev));
      setBaseMonthlyText((prev) => ((Number(prev) || 0) < 25000 ? '65000' : prev));
      setImageKey('maadi_garden');
      setPanorama360Key('new_cairo_penthouse_360');
    } else {
      setStudentBedsText('0');
      setImageKey('zamalek_nile');
      setPanorama360Key('cairo_nile_360');
    }
  };

  const handleGovernorateChange = (govName: string) => {
    setGovernorate(govName);
    const gov = EGYPT_GOVERNORATES.find((g) => g.name === govName);
    if (gov) {
      setLat(gov.lat);
      setLng(gov.lng);
      setMapPanTarget({ lat: gov.lat, lng: gov.lng, zoom: Math.max(11, gov.zoom), nonce: Date.now() });
    }
  };

  const handleCurrencyChange = (nextCur: SupportedCurrency) => {
    const currentMonthlyEgp = convertToEgp(
      baseMonthlyInput || 0,
      baseCurrency,
      liveCurrencyRates
    );
    const currentDailyEgp = convertToEgp(baseDailyInput || 0, baseCurrency, liveCurrencyRates);
    const currentBedEgp = convertToEgp(
      baseStudentBedInput || 0,
      baseCurrency,
      liveCurrencyRates
    );
    const nextRate = liveCurrencyRates[nextCur] || 1;

    setBaseCurrency(nextCur);
    setBaseMonthlyText(String(Math.max(10, Math.round(currentMonthlyEgp / nextRate))));
    setBaseDailyText(String(Math.max(5, Math.round(currentDailyEgp / nextRate))));
    setBaseStudentBedText(String(Math.max(5, Math.round(currentBedEgp / nextRate))));
  };

  const computedMonthlyRentEgp = useMemo(
    () =>
      snapRentToMultipleOf10(
        convertToEgp(baseMonthlyInput || 0, baseCurrency, liveCurrencyRates)
      ),
    [baseMonthlyInput, baseCurrency, liveCurrencyRates]
  );

  const supportsDailyRate =
    category === 'hotel_room' ||
    (category === 'whole_house' && wholeHouseBillingMode === 'daily_or_monthly');

  const computedDailyRateEgp = useMemo(() => {
    if (!supportsDailyRate) return 0;
    return snapToMultipleOf10(
      convertToEgp(baseDailyInput || 0, baseCurrency, liveCurrencyRates),
      VALIDATION_LIMITS.DAILY_RATE_MIN,
      VALIDATION_LIMITS.DAILY_RATE_MAX
    );
  }, [supportsDailyRate, baseDailyInput, baseCurrency, liveCurrencyRates]);

  const effectiveStudentBeds = useMemo(() => {
    if (
      category === 'hotel_room' ||
      category === 'industrial_factory' ||
      category === 'whole_house'
    ) {
      return 0;
    }
    if (category === 'student_housing') {
      return Math.max(1, Math.min(50, Math.round(studentBedsCount || 1)));
    }
    return Math.max(0, Math.min(50, Math.round(studentBedsCount || 0)));
  }, [category, studentBedsCount]);

  const computedStudentBedEgp = useMemo(() => {
    if (effectiveStudentBeds === 0) return 0;
    return snapToMultipleOf10(
      convertToEgp(baseStudentBedInput || 0, baseCurrency, liveCurrencyRates),
      VALIDATION_LIMITS.STUDENT_BED_MIN,
      VALIDATION_LIMITS.STUDENT_BED_MAX
    );
  }, [effectiveStudentBeds, baseStudentBedInput, baseCurrency, liveCurrencyRates]);

  const previewPanoramaSrc = useMemo(() => {
    if (!hasVirtualTour) return null;
    if (panoramaSourceMode === 'upload' && panorama360DataUrl) {
      return panorama360DataUrl;
    }
    return PANORAMA_360_PRESETS[panorama360Key]?.src || null;
  }, [hasVirtualTour, panoramaSourceMode, panorama360DataUrl, panorama360Key]);

  const handlePanoramaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setCompressingPanorama(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
      const filePath = `panoramas/pano_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { publicUrl } = await uploadSupabaseFile('apartments', filePath, file, {
        maxWidth: 2048,
        maxHeight: 2048,
        quality: 0.82,
      });
      setPanorama360DataUrl(publicUrl);
      setVirtualTourUrl(publicUrl);
      setPanoramaFileName(file.name);
      setPanoramaSourceMode('upload');
      setHasVirtualTour(true);
    } catch (err) {
      console.error('[ListApartmentWizard] 360 panorama upload failed:', err);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : t(
              'تعذر رفع صورة الجولة 360° إلى التخزين السحابي.',
              'Could not upload the 360° panorama image to cloud storage.'
            )
      );
    } finally {
      setCompressingPanorama(false);
    }
  };

  const validateStep1 = (): boolean => {
    setErrorMsg(null);
    if (title.trim().length < VALIDATION_LIMITS.TITLE_MIN) {
      setErrorMsg(
        t(
          'يرجى إدخال عنوان واضح للوحدة لا يقل عن 5 أحرف.',
          'Please enter a unit title of at least 5 characters.'
        )
      );
      return false;
    }
    if (description.trim().length < VALIDATION_LIMITS.DESC_MIN) {
      setErrorMsg(
        t(
          'يرجى كتابة وصف تفصيلي للوحدة لا يقل عن 10 أحرف.',
          'Please enter a description of at least 10 characters.'
        )
      );
      return false;
    }
    if (district.trim().length < VALIDATION_LIMITS.DISTRICT_MIN) {
      setErrorMsg(
        t(
          'يرجى تحديد الحي أو المنطقة داخل المحافظة.',
          'Please enter the district or neighborhood.'
        )
      );
      return false;
    }
    if (category === 'whole_house' && (Number(houseApartmentsCountText) || 0) < 1) {
      setErrorMsg(
        t(
          'يرجى تحديد عدد الشقق داخل المنزل الكامل (شقة واحدة على الأقل).',
          'Please enter the number of apartments inside the whole house (at least 1).'
        )
      );
      return false;
    }
    if (
      virtualTourUrl.trim() !== '' &&
      (!virtualTourUrl.trim().startsWith('https://') || virtualTourUrl.trim().length > 300)
    ) {
      setErrorMsg(
        t(
          'رابط الجولة الافتراضية الخارجي يجب أن يبدأ بـ https:// ولا يتجاوز 300 حرف.',
          'External virtual tour URL must start with https:// and be under 300 characters.'
        )
      );
      return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    setErrorMsg(null);
    const cleanOwner = (ownerDisplayName.trim() || currentUser?.displayName || '').trim();
    if (cleanOwner.length < 2) {
      setErrorMsg(
        t('يرجى إدخال اسم المالك الثنائي أو الثلاثي.', 'Please enter the owner full name.')
      );
      return false;
    }
    if (!VALIDATION_LIMITS.NATIONAL_ID_PATTERN.test(nationalIdNumber.trim())) {
      setErrorMsg(
        t(
          'الرقم القومي المصري يجب أن يتكون من 14 رقماً ويبدأ بـ 2 أو 3.',
          'Egyptian National ID must be 14 digits starting with 2 or 3.'
        )
      );
      return false;
    }
    if (!VALIDATION_LIMITS.EGYPT_PHONE_PATTERN.test(ownerPhone.trim())) {
      setErrorMsg(
        t(
          'رقم الهاتف المصري يجب أن يتكون من 11 رقماً ويبدأ بـ 010 أو 011 أو 012 أو 015.',
          'Egyptian mobile number must be 11 digits (010 / 011 / 012 / 015).'
        )
      );
      return false;
    }
    if (exactAddress.trim().length < 5) {
      setErrorMsg(
        t(
          'يرجى كتابة العنوان التفصيلي كما هو مثبت في عقد الملكية.',
          'Please enter the exact legal property address.'
        )
      );
      return false;
    }
    return true;
  };

  const handleSubmitListing = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!currentUser) {
      await onRequestSignIn();
      return;
    }

    if (isBanned) {
      setErrorMsg(
        t(
          `تم تقييد حسابك من قِبل إدارة المنصة: ${banRecord?.reason || ''}`,
          `Your account is restricted by platform administration: ${banRecord?.reason || ''}`
        )
      );
      return;
    }

    if (isListingsPaused) {
      setErrorMsg(
        t(
          'نشر الإعلانات الجديدة متوقف مؤقتاً بقرار من إدارة المنصة. يرجى المحاولة لاحقاً.',
          'New listing submissions are temporarily paused by platform administration.'
        )
      );
      return;
    }

    if (digitalSignatureName.trim().length < 4 || !exclusivityAccepted) {
      setErrorMsg(
        t(
          'يرجى التوقيع الرقمي والموافقة على تفويض الوساطة والضمان لإتمام العرض.',
          'Please provide your digital signature and accept the escrow mandate.'
        )
      );
      return;
    }

    if (oneTimeCommissionSample > 0 && (!commissionPaidConfirmed || commissionPaymentRef.trim().length < 4)) {
      setErrorMsg(
        t(
          'يرجى استكمال بيانات دفع العمولة وتأكيد السداد في الخطوة الأخيرة قبل نشر الوحدة.',
          'Please complete the commission payment reference and confirm payment before publishing.'
        )
      );
      return;
    }

    setSubmitting(true);
    const apartmentId = `apt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    try {
      const deedHash = titleDeedFile
        ? await computeFileSha256(titleDeedFile)
        : await computeTextSha256(`${apartmentId}_deed_${propertyRegistryNumber}`);
      const utilityHash = utilityBillFile
        ? await computeFileSha256(utilityBillFile)
        : await computeTextSha256(`${apartmentId}_utility_${exactAddress}`);

      const deedName = (titleDeedFile?.name || 'verified_title_deed.pdf').slice(0, 120);
      const utilityName = (utilityBillFile?.name || 'recent_utility_bill.pdf').slice(0, 120);

      let titleDeedUrl: string | undefined;
      let utilityBillUrl: string | undefined;
      if (titleDeedFile) {
        const deedExt = (titleDeedFile.name.split('.').pop() || 'pdf').replace(/[^a-zA-Z0-9]/g, '') || 'pdf';
        const uploadedDeed = await uploadSupabaseFile(
          'kyc-documents',
          `apartments_kyc/${apartmentId}_deed_${Date.now()}.${deedExt}`,
          titleDeedFile
        );
        titleDeedUrl = uploadedDeed.publicUrl;
      }
      if (utilityBillFile) {
        const utilityExt = (utilityBillFile.name.split('.').pop() || 'pdf').replace(/[^a-zA-Z0-9]/g, '') || 'pdf';
        const uploadedUtility = await uploadSupabaseFile(
          'kyc-documents',
          `apartments_kyc/${apartmentId}_utility_${Date.now()}.${utilityExt}`,
          utilityBillFile
        );
        utilityBillUrl = uploadedUtility.publicUrl;
      }

      const billingMode: BillingMode =
        category === 'hotel_room'
          ? 'daily_or_monthly'
          : category === 'whole_house'
            ? wholeHouseBillingMode
            : 'monthly_only';
      const safeOwnerName = (
        ownerDisplayName.trim() ||
        currentUser.displayName?.trim() ||
        'مالك عقار موثق'
      ).slice(0, 80);

      const safeLat = Math.max(
        VALIDATION_LIMITS.LAT_MIN,
        Math.min(VALIDATION_LIMITS.LAT_MAX, Number(lat.toFixed(5)))
      );
      const safeLng = Math.max(
        VALIDATION_LIMITS.LNG_MIN,
        Math.min(VALIDATION_LIMITS.LNG_MAX, Number(lng.toFixed(5)))
      );

      const verificationStatus =
        isPlatformAdminEmail(currentUser.email) ||
        commissionPaidConfirmed ||
        oneTimeCommissionSample <= 0
          ? 'verified'
          : 'pending_review';

      const aptPayload: Record<string, unknown> = {
        ownerId: currentUser.uid,
        ownerDisplayName: safeOwnerName.length >= 2 ? safeOwnerName : 'مالك عقار موثق',
        category,
        billingMode,
        baseCurrency,
        baseMonthlyPrice: Math.max(
          0,
          Math.min(5000000, Number(baseMonthlyInput) || computedMonthlyRentEgp)
        ),
        dailyRateEgp: computedDailyRateEgp,
        monthlyRentEgp: computedMonthlyRentEgp,
        studentBedsCount: effectiveStudentBeds,
        studentPricePerBedEgp: computedStudentBedEgp,
        title: title.trim().slice(0, 120),
        description: description.trim().slice(0, 1200),
        governorate,
        district: district.trim().slice(0, 80),
        lat: safeLat,
        lng: safeLng,
        bedrooms: Math.max(0, Math.min(50, Math.round(bedrooms))),
        bathrooms: Math.max(1, Math.min(30, Math.round(bathrooms))),
        areaSqm: Math.max(18, Math.min(100000, Math.round(areaSqm))),
        furnishing,
        imageKey,
        imageUrl: (customImages.find((img) => img.isCover)?.url || customImages[0]?.url || customImageUrl) || undefined,
        imageUrls: customImages.length > 0 ? customImages.map((img) => img.url) : (customImageUrl ? [customImageUrl] : undefined),
        hasVirtualTour: Boolean(hasVirtualTour),
        verificationStatus,
        availabilityStatus: 'available',
        commissionRatePct: effectiveCommissionRatePct,
        commissionPaid: oneTimeCommissionSample <= 0 || commissionPaidConfirmed,
        commissionPaymentMethod,
        commissionPaymentRef: commissionPaymentRef.trim().slice(0, 60),
        commissionAmountEgp: oneTimeCommissionSample,
        mandateAccepted: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (supportsDailyRate && baseDailyInput > 0) {
        aptPayload.baseDailyPrice = Math.max(0, Math.min(500000, Number(baseDailyInput)));
      }
      if (category !== 'industrial_factory') {
        aptPayload.houseHasGardenOrRoof = Boolean(houseHasGardenOrRoof);
        aptPayload.houseHasPrivateGarage = Boolean(houseHasPrivateGarage);
      }
      if (category === 'whole_house') {
        aptPayload.houseApartmentsCount = houseApartmentsCount;
        aptPayload.houseFloorsCount = houseFloorsCount;
        if (houseSpecsSummary.trim() !== '') {
          aptPayload.houseSpecsSummary = houseSpecsSummary.trim().slice(0, 240);
        }
      }
      if (effectiveStudentBeds > 0 && baseStudentBedInput > 0) {
        aptPayload.baseStudentBedPrice = Math.max(
          0,
          Math.min(100000, Number(baseStudentBedInput))
        );
      }
      if (hasVirtualTour) {
        if (panoramaSourceMode === 'upload' && panorama360DataUrl) {
          aptPayload.panorama360Key = 'none';
          aptPayload.panorama360DataUrl = panorama360DataUrl;
        } else {
          aptPayload.panorama360Key = panorama360Key;
        }
      }
      if (virtualTourUrl.trim() !== '') {
        aptPayload.virtualTourUrl = virtualTourUrl.trim().slice(0, 300);
      }

      // 1. Primary Cloud Save: Supabase Database
      const savedRecord = normalizeApartmentRecord(
        {
          ...aptPayload,
          ownerPhone: ownerPhone.trim(),
        },
        apartmentId,
        true
      );
      await createSupabaseApartment(savedRecord);

      // 2. Optional Secondary Sync: Firestore (non-blocking for Supabase-only sessions)
      try {
        const firestoreAptPayload = Object.fromEntries(
          Object.entries(aptPayload).filter(([, v]) => v !== undefined)
        );
        const batch = writeBatch(db);
        batch.set(doc(db, 'apartments', apartmentId), firestoreAptPayload);
        batch.set(doc(db, 'apartments', apartmentId, 'legalDocs', 'dossier'), {
          ownerId: currentUser.uid,
          apartmentId,
          nationalIdNumber: nationalIdNumber.trim(),
          ownerPhone: ownerPhone.trim(),
          exactAddress: exactAddress.trim().slice(0, 250),
          propertyRegistryNumber: propertyRegistryNumber.trim().slice(0, 60),
          titleDeedFileName: deedName.length >= 3 ? deedName : 'deed.pdf',
          titleDeedSha256: deedHash,
          ...(titleDeedUrl ? { titleDeedUrl } : {}),
          utilityBillFileName: utilityName.length >= 3 ? utilityName : 'utility.pdf',
          utilityBillSha256: utilityHash,
          ...(utilityBillUrl ? { utilityBillUrl } : {}),
          ownerIbanOrInstapay: ownerIbanOrInstapay.trim().slice(0, 80),
          digitalSignatureName: digitalSignatureName.trim().slice(0, 80),
          exclusivityClauseAccepted: true,
          createdAt: serverTimestamp(),
        });
        void batch.commit().catch((fsErr) => {
          console.warn('[Firestore secondary sync skipped]:', fsErr);
        });
      } catch (fsErr) {
        console.warn('[Firestore secondary sync skipped]:', fsErr);
      }

      setSubmitting(false);
      onSuccess(savedRecord);
    } catch (err) {
      setSubmitting(false);
      logFirestoreDiagnostic(err, OperationType.CREATE, `apartments/${apartmentId}`);
      const extractedMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err && (err as { message?: unknown }).message
            ? String((err as { message?: unknown }).message)
            : '';
      setErrorMsg(
        extractedMessage ||
          t(
            'تعذر إرسال الوحدة وملف الملكية للمراجعة حالياً. يرجى مراجعة البيانات المدخلة وحالة الجلسة والمحاولة مجدداً.',
            'Could not submit unit and legal dossier right now. Please verify your entries and session, then try again.'
          )
      );
    }
  };

  const samplePrimaryEgp =
    category === 'hotel_room'
      ? computedDailyRateEgp
      : category === 'student_housing'
        ? computedStudentBedEgp
        : computedMonthlyRentEgp;
  const oneTimeCommissionSample = computeOneTimeCommission(
    samplePrimaryEgp,
    effectiveCommissionRatePct
  );

  if (!currentUser) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            {t('يجب تسجيل الدخول لعرض وحدة', 'Sign In Required to List a Unit')}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            {t(
              'لحماية الملاك والمستأجرين، لا يُسمح بعرض أو حجز الوحدات إلا بعد تسجيل الدخول بحساب موثق على منصة إيجار مصر.',
              'To protect landlords and tenants, only signed-in users with a platform account can list or book units.'
            )}
          </p>
          <button
            type="button"
            onClick={() => void onRequestSignIn()}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm transition-colors shadow-sm"
          >
            {t('تسجيل الدخول / إنشاء حساب', 'Sign In / Create Account')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header & 3-Step Progress Bar */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full mb-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{t('منصة إيجار الموثقة — طرح الوحدات', 'Verified Ejar Listing Portal')}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {t('اعرض وحدتك العقارية', 'List Your Property')}
            </h1>
          </div>
          <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
            {t(
              'خطوات سهلة ومنظمة لعرض عقارك للمستأجرين الموثقين بالجنيه المصري وبحماية كاملة.',
              'Simple and secure steps to list your property for verified tenants in EGP.'
            )}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { num: 1, label: t('١. المواصفات والصور', '1. Specs & Photos') },
            { num: 2, label: t('٢. إثبات الملكية', '2. Title & ID') },
            { num: 3, label: t('٣. دفع العمولة والنشر', '3. Commission & Publish') },
          ].map((s) => (
            <div
              key={s.num}
              className={`px-3 py-2.5 rounded-xl border text-xs font-bold text-center transition-all ${
                step === s.num
                  ? 'bg-blue-700 text-white border-blue-700 shadow-xs'
                  : step > s.num
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
            >
              {s.label}
            </div>
          ))}
        </div>
      </div>

      {isBanned && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 text-xs font-semibold text-rose-900">
          {t(
            `حسابك مقيد حالياً من نشر إعلانات جديدة بقرار من إدارة الموقع — السبب: ${banRecord?.reason}`,
            `Your account is restricted from publishing listings — Reason: ${banRecord?.reason}`
          )}
        </div>
      )}

      {isListingsPaused && !isBanned && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-xs font-semibold text-amber-950">
          {t(
            'أوقفت إدارة الموقع استقبال إعلانات الوحدات الجديدة مؤقتاً للمراجعة والتحديث — سيعود النشر فور تفعيله من الإدارة.',
            'New property submissions are temporarily paused by the site administrator.'
          )}
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-xs font-medium text-rose-800">
          {errorMsg}
        </div>
      )}

      {/* STEP 1 */}
      {step === 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-6">
          {/* 1. Unit Classification Dropdown (شقة عائلية · منزل كامل · غرفة فندقية · مصنع · سكن طلاب) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-5 space-y-1.5">
              <label
                htmlFor="wizard-unit-category-select"
                className="flex items-center gap-1.5 text-xs font-bold text-slate-800"
              >
                <Building2 className="w-4 h-4 text-blue-700 shrink-0" />
                <span>{t('تصنيف الوحدة العقارية', 'Unit Classification')}</span>
              </label>
              <select
                id="wizard-unit-category-select"
                aria-label={t('تصنيف الوحدة العقارية', 'Unit Classification')}
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value as ListingCategory)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="family_apartment">{categoryLabel('family_apartment')}</option>
                <option value="whole_house">{categoryLabel('whole_house')}</option>
                <option value="hotel_room">{categoryLabel('hotel_room')}</option>
                <option value="industrial_factory">{categoryLabel('industrial_factory')}</option>
                <option value="student_housing">{categoryLabel('student_housing')}</option>
              </select>
            </div>

            <div className="md:col-span-7 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-600 leading-relaxed flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-bold text-blue-700">{categoryLabel(category)}</span>
                <span aria-hidden="true"> · </span>
                <span>{categorySubtitle(category)}</span>
              </div>
              <span className="font-mono tabular-nums font-bold text-emerald-700 shrink-0">
                {t(
                  `عمولة القسم: ${formatNumber(effectiveCommissionRatePct)}%`,
                  `Category Fee: ${formatNumber(effectiveCommissionRatePct)}%`
                )}
              </span>
            </div>
          </div>

          {/* Dedicated Whole-House Building & Apartments Configuration */}
          {category === 'whole_house' && (
            <div className="bg-teal-50/60 border border-teal-200 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {t(
                      'مواصفات المنزل الكامل وتوزيع الشقق والأدوار',
                      'Whole-House Building Breakdown & Apartments Count'
                    )}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {t(
                      `تُطبّق نسبة عمولة قسم المنازل الكاملة (${formatNumber(
                        effectiveCommissionRatePct
                      )}%) على إجمالي عقد المنزل بالكامل كما حددها الأدمن.`,
                      `The Whole-House category commission (${formatNumber(
                        effectiveCommissionRatePct
                      )}%) applies automatically to the full house lease.`
                    )}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    {t('عدد الشقق المستقلة داخل المنزل', 'Number of Apartments Inside House')}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    value={houseApartmentsCountText}
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setHouseApartmentsCountText(
                        normalizeNumericInput(e.target.value).slice(0, 2)
                      )
                    }
                    onBlur={() => {
                      const val = Number(houseApartmentsCountText) || 0;
                      if (val < 1) setHouseApartmentsCountText('1');
                      else if (val > 60) setHouseApartmentsCountText('60');
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-start"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    {t('عدد الأدوار / الطوابق بالمنزل', 'Number of Building Floors')}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    value={houseFloorsCountText}
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setHouseFloorsCountText(normalizeNumericInput(e.target.value).slice(0, 2))
                    }
                    onBlur={() => {
                      const val = Number(houseFloorsCountText) || 0;
                      if (val < 1) setHouseFloorsCountText('1');
                      else if (val > 20) setHouseFloorsCountText('20');
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-start"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    {t('نظام تأجير المنزل الكامل', 'Whole-House Leasing Mode')}
                  </label>
                  <select
                    value={wholeHouseBillingMode}
                    onChange={(e) => setWholeHouseBillingMode(e.target.value as BillingMode)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm font-semibold text-slate-900"
                  >
                    <option value="monthly_only">
                      {t('إيجار شهري / سنوي للمنزل بالكامل', 'Monthly / Annual Whole-House Lease')}
                    </option>
                    <option value="daily_or_monthly">
                      {t('متاح للإيجار الشهري أو اليومي (فيلا/منزل ضيافة)', 'Monthly or Daily Stay')}
                    </option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-5 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={houseHasGardenOrRoof}
                    onChange={(e) => setHouseHasGardenOrRoof(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-700"
                  />
                  <span>{t('يشمل حديقة خاصة أو روف مستقل', 'Includes Private Garden or Roof')}</span>
                </label>

                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={houseHasPrivateGarage}
                    onChange={(e) => setHouseHasPrivateGarage(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-700"
                  />
                  <span>{t('يشمل جراج سيارات خاص للمنزل', 'Includes Private Car Garage')}</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  {t(
                    'تفاصيل توزيع الشقق والمرافق المستقلة داخل المنزل',
                    'Apartments Layout & Building Specifications Summary'
                  )}
                </label>
                <input
                  type="text"
                  maxLength={240}
                  value={houseSpecsSummary}
                  onChange={(e) => setHouseSpecsSummary(e.target.value)}
                  placeholder={t(
                    'مثال: 3 شقق مستقلة (شقة بكل دور 160م²) + عدادات كهرباء ومياه منفصلة + مدخل رخام خاص',
                    'e.g. 3 self-contained apartments (1 per floor, 160m² each) + separate utility meters + private gate'
                  )}
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm"
                />
              </div>
            </div>
          )}

          {/* 2. Official Pricing Currency: EGP Only */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>
                  {t(
                    'عملة تسعير الوحدة: الجنيه المصري حصراً (ج.م / EGP)',
                    'Official Listing Currency: Egyptian Pound (EGP)'
                  )}
                </span>
              </div>
              <span className="text-xs font-bold font-mono text-emerald-800 bg-emerald-100/70 px-2.5 py-0.5 rounded-full">
                {t('العملة الرسمية المعتمدة', 'Official Legal Currency')}
              </span>
            </div>
            <p className="text-xs text-slate-600">
              {t(
                'المنصة مخصصة للتعامل بالجنيه المصري (ج.م) فقط لحماية المتعاملين وضمان سريان العقود الرسمية وفقاً للوائح البنك المركزي المصري.',
                'The platform exclusively operates in Egyptian Pounds (EGP) under Egyptian law and Central Bank regulations.'
              )}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Monthly Price */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t(
                    `الإيجار الشهري للوحدة (${baseCurrency})`,
                    `Monthly Unit Rent (${baseCurrency})`
                  )}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={baseMonthlyText}
                  onKeyDown={(e) => e.stopPropagation()}
                  onChange={(e) => setBaseMonthlyText(normalizeNumericInput(e.target.value))}
                  onBlur={() => {
                    if (!baseMonthlyText.trim()) setBaseMonthlyText('1000');
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-start"
                />
                <div className="text-[11px] font-mono tabular-nums text-blue-700 mt-1">
                  {t('المعادل المعتمد بالضمان:', 'Escrow EGP:')} {formatNumber(computedMonthlyRentEgp)}{' '}
                  {t('ج.م / شهر', 'EGP / mo')}
                </div>
              </div>

              {/* Hotel or Whole-House Daily Rate */}
              {supportsDailyRate && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {category === 'whole_house'
                      ? t(
                          `إيجار المنزل الكامل بالليلة (${baseCurrency})`,
                          `Whole-House Nightly Rate (${baseCurrency})`
                        )
                      : t(
                          `سعر الغرفة اليومي بالليلة (${baseCurrency})`,
                          `Daily Nightly Rate (${baseCurrency})`
                        )}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    value={baseDailyText}
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => setBaseDailyText(normalizeNumericInput(e.target.value))}
                    onBlur={() => {
                      if (!baseDailyText.trim()) setBaseDailyText('300');
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-start"
                  />
                  <div className="text-[11px] font-mono tabular-nums text-blue-700 mt-1">
                    {t('المعادل اليومي:', 'Daily EGP:')} {formatNumber(computedDailyRateEgp)}{' '}
                    {t('ج.م / يوم', 'EGP / night')}
                  </div>
                </div>
              )}

              {/* Student Housing Beds & Per-Bed Price */}
              {(category === 'student_housing' || category === 'family_apartment') && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {category === 'student_housing'
                        ? t('عدد السراير الطلابية المتاحة', 'Total Student Beds')
                        : t(
                            'عدد السراير (اختياري لو متاح للطلاب)',
                            'Student Beds (Optional, 0 if family only)'
                          )}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      value={studentBedsText}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setStudentBedsText(normalizeNumericInput(e.target.value).slice(0, 2))
                      }
                      onBlur={() => {
                        if (!studentBedsText.trim()) {
                          setStudentBedsText(category === 'student_housing' ? '1' : '0');
                        }
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-start"
                    />
                  </div>

                  {effectiveStudentBeds > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {t(
                          `سعر السرير الواحد شهرياً (${baseCurrency})`,
                          `Monthly Price per Bed (${baseCurrency})`
                        )}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        value={baseStudentBedText}
                        onKeyDown={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setBaseStudentBedText(normalizeNumericInput(e.target.value))
                        }
                        onBlur={() => {
                          if (!baseStudentBedText.trim()) setBaseStudentBedText('500');
                        }}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-start"
                      />
                      <div className="text-[11px] font-mono tabular-nums text-blue-700 mt-1">
                        {formatNumber(computedStudentBedEgp)}{' '}
                        {t('ج.م / سرير شهرياً', 'EGP / bed / mo')}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 3. Unit Title, Description & Specs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('عنوان الإعلان المعماري', 'Listing Title')}
              </label>
              <input
                type="text"
                placeholder={t(
                  'مثال: شقة نيلية مشمسة 3 غرف بالزمالك — تشطيب الترا مودرن',
                  'e.g. Sunlit 3-Bedroom Nile View Apartment in Zamalek'
                )}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('الوصف التفصيلي والمرافق', 'Detailed Description & Amenities')}
              </label>
              <textarea
                rows={3}
                placeholder={t(
                  'اذكر الطابق، نوع التشطيب، التكييفات، المرافق، وقرب الوحدة من الجامعات أو المحاور الرئيسية...',
                  'Describe floor level, finishing quality, HVAC, parking, and nearby landmarks...'
                )}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('المحافظة', 'Governorate')}
              </label>
              <select
                value={governorate}
                onChange={(e) => handleGovernorateChange(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white"
              >
                {EGYPT_GOVERNORATES.map((g) => (
                  <option key={g.name} value={g.name}>
                    {govLabel(g.name)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('الحي / المنطقة الصناعية أو السكنية', 'District / Zone')}
              </label>
              <input
                type="text"
                placeholder={t('مثال: التجمع الخامس — حي اللوتس', 'e.g. Fifth Settlement — Lotus')}
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {category === 'industrial_factory'
                    ? t('المكاتب / العنابر', 'Halls / Offices')
                    : category === 'hotel_room'
                      ? t('الأجنحة / الغرف', 'Suites / Rooms')
                      : t('الغرف', 'Rooms')}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={bedroomsText}
                  onKeyDown={(e) => e.stopPropagation()}
                  onChange={(e) => setBedroomsText(normalizeNumericInput(e.target.value).slice(0, 2))}
                  onBlur={() => {
                    if (!bedroomsText.trim()) setBedroomsText('0');
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-start"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('الحمامات', 'Baths')}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={bathroomsText}
                  onKeyDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBathroomsText(normalizeNumericInput(e.target.value).slice(0, 2))
                  }
                  onBlur={() => {
                    if (!bathroomsText.trim() || Number(bathroomsText) < 1) {
                      setBathroomsText('1');
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-start"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('المساحة م²', 'Area m²')}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={areaSqmText}
                  onKeyDown={(e) => e.stopPropagation()}
                  onChange={(e) => setAreaSqmText(normalizeNumericInput(e.target.value).slice(0, 6))}
                  onBlur={() => {
                    if (!areaSqmText.trim() || Number(areaSqmText) < 18) {
                      setAreaSqmText('18');
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-start"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('نوع الفرش والتجهيز', 'Furnishing Level')}
              </label>
              <select
                value={furnishing}
                onChange={(e) => setFurnishing(e.target.value as FurnishingType)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white"
              >
                {(['furnished', 'semi_furnished', 'unfurnished'] as FurnishingType[]).map(
                  (f) => (
                    <option key={f} value={f}>
                      {furnishingLabel(f)}
                    </option>
                  )
                )}
              </select>
            </div>

            {category !== 'whole_house' && category !== 'industrial_factory' && (
              <div className="md:col-span-2 flex flex-wrap items-center gap-5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <span className="text-xs font-bold text-slate-800">
                  {t('مرافق مميزة بالوحدة:', 'Included Property Amenities:')}
                </span>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={houseHasGardenOrRoof}
                    onChange={(e) => setHouseHasGardenOrRoof(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-700"
                  />
                  <span>{t('حديقة خاصة أو روف / تراس', 'Private Garden or Roof / Terrace')}</span>
                </label>

                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={houseHasPrivateGarage}
                    onChange={(e) => setHouseHasPrivateGarage(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-700"
                  />
                  <span>{t('جراج سيارات خاص', 'Private Car Garage')}</span>
                </label>
              </div>
            )}
          </div>

            {/* 4. Interactive Map Pin Picker */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-slate-800 inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-blue-700" />
                  <span>
                    {t('تحديد موقع الوحدة على خريطة مصر (اضغط أو اسحب الدبوس لتغيير الموقع)', 'Click or drag pin to set location')}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={locatingGps}
                    onClick={() => {
                      setErrorMsg(null);
                      setGpsStatusMsg(null);
                      if (!navigator.geolocation) {
                        setErrorMsg(
                          t(
                            'المتصفح لا يدعم تحديد الموقع التلقائي، يمكنك الضغط على الخريطة أو إدخال الإحداثيات يدوياً.',
                            'Geolocation is not supported by your browser.'
                          )
                        );
                        return;
                      }
                      setLocatingGps(true);
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          const newLat = Number(pos.coords.latitude.toFixed(5));
                          const newLng = Number(pos.coords.longitude.toFixed(5));
                          setLat(newLat);
                          setLng(newLng);
                          setMapPanTarget({ lat: newLat, lng: newLng, zoom: 15, nonce: Date.now() });
                          setLocatingGps(false);
                          setGpsStatusMsg(
                            t('تم تحديد موقعك الحالي بنجاح ✓', 'Current GPS location set ✓')
                          );
                        },
                        (geoErr) => {
                          setLocatingGps(false);
                          if (geoErr?.code === 1) {
                            setErrorMsg(
                              t(
                                'تم رفض إذن الموقع في المتصفح. اضغط على أيقونة القفل بجانب رابط الموقع واسمح بـ Location.',
                                'Location permission denied. Enable Location in browser site settings.'
                              )
                            );
                          } else {
                            setErrorMsg(
                              t(
                                'تعذر التقاط إشارة الـ GPS حالياً. تأكد من تفعيل الموقع أو اضغط على الخريطة لتحديد مكان الوحدة.',
                                'Could not capture GPS signal. Click on the map to pin your unit.'
                              )
                            );
                          }
                        },
                        { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
                      );
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 disabled:opacity-60 text-blue-700 font-bold rounded-lg border border-blue-200 text-[11px] transition-colors"
                  >
                    <span>
                      {locatingGps
                        ? t('⏳ جاري تحديد موقعك...', '⏳ Locating...')
                        : `📍 ${t('موقعي الحالي', 'Current GPS')}`}
                    </span>
                  </button>
                  {gpsStatusMsg && (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                      {gpsStatusMsg}
                    </span>
                  )}
                  <span className="font-mono tabular-nums text-slate-700 font-bold bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    {typeof lat === 'number' ? lat.toFixed(4) : lat}, {typeof lng === 'number' ? lng.toFixed(4) : lng}
                  </span>
                </div>
              </div>

              {/* Manual coordinate inputs in case the user wants to paste coords */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    {t('خط العرض (Latitude)', 'Latitude')}
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={lat}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) {
                        setLat(val);
                        setMapPanTarget({ lat: val, lng, zoom: 13, nonce: Date.now() });
                      }
                    }}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    {t('خط الطول (Longitude)', 'Longitude')}
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={lng}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) {
                        setLng(val);
                        setMapPanTarget({ lat, lng: val, zoom: 13, nonce: Date.now() });
                      }
                    }}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono text-xs"
                  />
                </div>
              </div>

              <LeafletLocationPicker
                lat={lat}
                lng={lng}
                onLocationChange={(newLat, newLng) => {
                  setLat(newLat);
                  setLng(newLng);
                }}
                cameraTarget={mapPanTarget}
              />
            </div>

          {/* 5. Photos Upload Section (1 to 6 Photos from Device Only) */}
          <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-blue-700 shrink-0" />
                  <h3 className="text-sm font-bold text-slate-900">
                    {t('صور الوحدة من جهازك (من ١ إلى ٦ صور)', 'Property Photos from Device (1 to 6)')}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t(
                    'ارفع صوراً حقيقية واضحة لوحدتك من جهازك. يمكنك تحديد صورة الغلاف أو حذف أي صورة قبل الحفظ.',
                    'Upload clear photos from your device. Set a cover photo or delete any photo before saving.'
                  )}
                </p>
              </div>

              <span className="font-mono text-xs font-bold px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-700">
                {customImages.length} / 6 {t('صور', 'photos')}
              </span>
            </div>

            {/* Custom Photos Grid & Dropzone */}
            <div className="space-y-3">
              {customImages.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {customImages.map((img) => (
                    <div
                      key={img.id}
                      className={`relative aspect-[4/3] rounded-xl overflow-hidden border-2 bg-slate-100 group transition-all ${
                        img.isCover
                          ? 'border-blue-700 ring-2 ring-blue-600/30 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <img
                        src={img.url}
                        alt="Unit"
                        className="w-full h-full object-cover"
                      />

                      {img.isCover ? (
                        <div className="absolute top-1.5 start-1.5 bg-blue-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shadow-xs">
                          <Star className="w-3 h-3 fill-current text-amber-300" />
                          <span>{t('الغلاف', 'Cover')}</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSetCover(img.id)}
                          className="absolute top-1.5 start-1.5 bg-slate-900/80 hover:bg-slate-900 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-md opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          {t('تعيين غلاف', 'Set Cover')}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveCustomImage(img.id)}
                        title={t('حذف الصورة', 'Delete photo')}
                        className="absolute top-1.5 end-1.5 bg-rose-600 hover:bg-rose-700 text-white p-1.5 rounded-md shadow-xs opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {customImages.length < 6 && (
                <label className="border-2 border-dashed border-blue-200 hover:border-blue-500 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-center gap-3 cursor-pointer bg-white hover:bg-blue-50/40 transition-colors min-h-[88px]">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="text-center sm:text-start">
                    <span className="text-xs sm:text-sm font-bold text-slate-800 block">
                      {isUploadingCustomImage
                        ? t('جاري رفع الصور بأمان...', 'Uploading photos...')
                        : t('اختر صوراً من جهازك أو الموبايل (JPEG / PNG)', 'Choose photos from your device (JPEG / PNG)')}
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      {t(
                        `يمكنك اختيار حتى ${6 - customImages.length} صور إضافية دفعة واحدة`,
                        `Select up to ${6 - customImages.length} more photos at once`
                      )}
                    </span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={isUploadingCustomImage}
                    onChange={handleMultipleImagesUpload}
                    className="hidden"
                  />
                </label>
              )}

              {customImageError && (
                <div className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{customImageError}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (validateStep1()) setStep(2);
              }}
              className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold rounded-xl transition-colors"
            >
              {t('التالي: توثيق مستندات الملكية', 'Next: Ownership & Legal Dossier')}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Legal Ownership Dossier */}
      {step === 2 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <Lock className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 leading-relaxed">
              <strong className="text-slate-900 block mb-0.5">
                {t(
                  'عزل كامل للبيانات الشخصية ومستندات الملكية (PII Isolation)',
                  'Strict PII & Legal Document Isolation'
                )}
              </strong>
              {t(
                'تُحفظ بيانات الرقم القومي وعقد الملكية في خزينة فرعية معزولة لا يطلع عليها سوى المالك وإدارة المراجعة القانونية بالمنصة.',
                'Your National ID, exact address, and SHA-256 document hashes are stored in an isolated private subcollection accessible only to you and legal reviewers.'
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('اسم المالك أو الممثل القانوني', 'Landlord Legal Display Name')}
              </label>
              <input
                type="text"
                value={ownerDisplayName}
                onChange={(e) => setOwnerDisplayName(e.target.value)}
                placeholder={t('مثال: م. طارق المنشاوي', 'e.g. Eng. Tarek El-Menshawy')}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('الرقم القومي المصري (14 رقماً)', 'Egyptian National ID (14 Digits)')}
              </label>
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                maxLength={14}
                value={nationalIdNumber}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) =>
                  setNationalIdNumber(normalizeNumericInput(e.target.value).slice(0, 14))
                }
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono tabular-nums text-start"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('رقم الموبايل المصري الموثق', 'Egyptian Mobile Number')}
              </label>
              <input
                type="tel"
                inputMode="tel"
                dir="ltr"
                maxLength={11}
                value={ownerPhone}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => setOwnerPhone(normalizeNumericInput(e.target.value).slice(0, 11))}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono tabular-nums text-start"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('رقم الشهر العقاري / السجل الصناعي أو الفندقي', 'Property Registry / License No.')}
              </label>
              <input
                type="text"
                value={propertyRegistryNumber}
                onChange={(e) => setPropertyRegistryNumber(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('العنوان القانوني التفصيلي بالعقد', 'Exact Legal Address on Deed')}
              </label>
              <input
                type="text"
                value={exactAddress}
                onChange={(e) => setExactAddress(e.target.value)}
                placeholder={t(
                  'رقم العقار، الشارع، الدور، رقم الوحدة كما في العقد الرسمي',
                  'Building number, street, floor, unit number as written on title deed'
                )}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('حساب التحويل البنكي (IBAN أو InstaPay) لصرف الإيجار', 'IBAN or InstaPay Handle for Escrow Payout')}
              </label>
              <input
                type="text"
                value={ownerIbanOrInstapay}
                onChange={(e) => setOwnerIbanOrInstapay(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono"
              />
            </div>

            <div className="border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <FileCheck2 className="w-4 h-4 text-blue-700" />
                <span>{t('عقد الملكية / التوكيل الرسمي (بصمة SHA-256)', 'Title Deed Document (SHA-256)')}</span>
              </div>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => setTitleDeedFile(e.target.files?.[0] || null)}
                className="text-xs text-slate-600 file:me-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-800 file:font-semibold"
              />
            </div>

            <div className="border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <FileCheck2 className="w-4 h-4 text-blue-700" />
                <span>{t('إيصال مرافق حديث (كهرباء / غاز / مياه)', 'Recent Utility Bill (SHA-256)')}</span>
              </div>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => setUtilityBillFile(e.target.files?.[0] || null)}
                className="text-xs text-slate-600 file:me-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-800 file:font-semibold"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
            >
              {t('السابق', 'Back')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (validateStep2()) setStep(3);
              }}
              className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold rounded-xl transition-colors"
            >
              {t('التالي: مراجعة العمولة والتوقيع الرقمي', 'Next: Commission & Digital Mandate')}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Mandate & Submission */}
      {step === 3 && (
        <form
          onSubmit={handleSubmitListing}
          className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5"
        >
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <span>
                {t(
                  'ملخص التسعير وعمولة الوساطة الموحدة لمرة واحدة',
                  'Pricing & One-Time Brokerage Commission Summary'
                )}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <div className="text-slate-500">{t('تصنيف الوحدة', 'Unit Classification')}</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  {categoryLabel(category)}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <div className="text-slate-500">{t('العملة الأساسية المختارة', 'Base Currency')}</div>
                <div className="font-mono tabular-nums text-sm font-bold text-blue-700 mt-0.5">
                  {formatCurrencyValue(baseMonthlyInput, baseCurrency, lang)} / {t('شهر', 'mo')}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <div className="text-slate-500">{t('القيمة المعتمدة بالجنيه', 'Escrow EGP Value')}</div>
                <div className="font-mono tabular-nums text-sm font-bold text-slate-900 mt-0.5">
                  {formatNumber(computedMonthlyRentEgp)} {t('ج.م / شهر', 'EGP / mo')}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <div className="text-slate-500">
                  {t(
                    `عمولة قسم ${categoryLabel(category)} (${formatNumber(
                      effectiveCommissionRatePct
                    )}% مرة واحدة)`,
                    `Category Commission (${formatNumber(effectiveCommissionRatePct)}%)`
                  )}
                </div>
                <div className="font-mono tabular-nums text-sm font-bold text-emerald-700 mt-0.5">
                  {formatNumber(oneTimeCommissionSample)} {t('ج.م', 'EGP')}
                </div>
              </div>
            </div>
          </div>

          {/* Commission Payment Gateway Step */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {t('سداد عمولة المنصة لنشر الوحدة', 'Pay Platform Commission to Publish')}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  {t(
                    'اختر وسيلة الدفع المناسبة وسدّد العمولة المحددة من الإدارة لتفعيل إعلانك فوراً.',
                    'Choose your payment method and settle the admin-configured commission to publish.'
                  )}
                </p>
              </div>
              <div className="bg-white border border-blue-200 rounded-xl px-3.5 py-2 text-end">
                <span className="text-[10px] text-slate-500 block">
                  {t('المبلغ المطلوب سداده', 'Amount Due')}
                </span>
                <span className="font-mono font-extrabold text-base text-blue-700">
                  {formatNumber(oneTimeCommissionSample)} {t('ج.م', 'EGP')}
                </span>
              </div>
            </div>

            {oneTimeCommissionSample > 0 ? (
              <div className="space-y-4">
                <PaymobGatewayBox
                  purpose="listing_commission"
                  amountEgp={oneTimeCommissionSample}
                  selectedMethod={commissionPaymentMethod}
                  onSelectMethod={setCommissionPaymentMethod}
                  userId={currentUser?.uid}
                  userEmail={currentUser?.email}
                  userName={ownerDisplayName || currentUser?.displayName}
                  userPhone={ownerPhone}
                  apartmentTitle={title || 'عرض وحدة على إيجار'}
                  onReferenceReady={(ref, _method, isLive) => {
                    setCommissionPaymentRef(ref);
                    if (isLive) setCommissionPaidConfirmed(true);
                  }}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end pt-2 border-t border-blue-200/70">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t('الرقم المرجعي للعملية / إثبات السداد', 'Payment / Transaction Reference')}
                    </label>
                    <input
                      type="text"
                      value={commissionPaymentRef}
                      onChange={(e) => setCommissionPaymentRef(e.target.value)}
                      placeholder={t('يُملأ تلقائياً بعد الدفع أو أدخل رقم التحويل', 'Auto-filled after Paymob or enter ref')}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono"
                    />
                  </div>

                  <label className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 min-h-[44px] text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={commissionPaidConfirmed}
                      onChange={(e) => setCommissionPaidConfirmed(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-700"
                    />
                    <span>
                      {t('تم سداد مبلغ العمولة بالكامل وتأكيد التحويل', 'I confirm full commission payment')}
                    </span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs font-semibold text-emerald-800">
                {t('نسبة العمولة الحالية 0% — يمكنك النشر مجاناً بدون رسوم.', 'Commission is currently 0% — free publishing enabled.')}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('التوقيع الرقمي بالاسم الثلاثي المطابق للبطاقة', 'Full Legal Digital Signature')}
            </label>
            <input
              type="text"
              required
              value={digitalSignatureName}
              onChange={(e) => setDigitalSignatureName(e.target.value)}
              placeholder={t('اكتب اسمك الكامل للتوقيع الإلكتروني', 'Type your full legal name')}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm"
            />
          </div>

          <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={exclusivityAccepted}
              onChange={(e) => setExclusivityAccepted(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-700"
            />
            <span>
              {t(
                `أقر بصحة مستندات الملكية المرفقة وأوافق على تفويض منصة إيجار لتحصيل القيمة الإيجارية في حساب الضمان بعمولة القسم المعتمدة لمرة واحدة فقط (${formatNumber(
                  effectiveCommissionRatePct
                )}%) وحذف الإعلان تلقائياً فور التعاقد.`,
                `I certify ownership of this unit and authorize Ejar Escrow with the category one-time brokerage commission (${formatNumber(
                  effectiveCommissionRatePct
                )}%) and automatic listing lock upon rental.`
              )}
            </span>
          </label>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
            >
              {t('السابق', 'Back')}
            </button>
            <button
              type="submit"
              disabled={submitting || isBanned || isListingsPaused}
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {submitting
                  ? t('جاري التسجيل والتشفير...', 'Submitting Dossier...')
                  : currentUser
                    ? t('اعتماد ونشر الوحدة الآن', 'Submit Verified Listing')
                    : t('تسجيل الدخول بحساب جوجل وإرسال الوحدة', 'Sign In & Submit Unit')}
              </span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

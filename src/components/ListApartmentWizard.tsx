import React, { useState, useMemo, useEffect } from 'react';
import { User } from 'firebase/auth';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
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
} from 'lucide-react';
import {
  db,
  logFirestoreDiagnostic,
  OperationType,
  PLATFORM_ADMIN_EMAIL,
} from '../lib/firebase';
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
} from '../lib/validation';
import { createSupabaseApartment } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { ApartmentImage } from './ApartmentImage';
import {
  VirtualTour360Viewer,
  compressPanoramaImageToDataUrl,
} from './VirtualTour360Viewer';

interface ListApartmentWizardProps {
  currentUser: User | null;
  commissionRatePct: number;
  platformSettings?: PlatformSettingsRecord;
  banRecord?: BannedUserRecord | null;
  onRequestSignIn: () => Promise<void>;
  onSuccess: () => void;
}

const IMAGE_KEYS = Object.keys(APARTMENT_IMAGES) as ImageKey[];
const PRESET_360_KEYS = Object.keys(PANORAMA_360_PRESETS) as Array<
  Exclude<Panorama360PresetKey, 'none'>
>;

const WizardMapCameraController: React.FC<{
  target: { lat: number; lng: number; zoom: number; nonce: number } | null;
}> = ({ target }) => {
  const map = useMap();
  useEffect(() => {
    if (!map || !target) return;
    map.panTo({ lat: target.lat, lng: target.lng });
    map.setZoom(target.zoom);
  }, [map, target]);
  return null;
};

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

  const isAdmin = Boolean(currentUser?.email === PLATFORM_ADMIN_EMAIL);
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

  // Step 3: Exclusive Mandate & Digital Signature
  const [digitalSignatureName, setDigitalSignatureName] = useState('');
  const [exclusivityAccepted, setExclusivityAccepted] = useState(false);

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
      const dataUrl = await compressPanoramaImageToDataUrl(file);
      setPanorama360DataUrl(dataUrl);
      setPanoramaFileName(file.name);
      setPanoramaSourceMode('upload');
      setHasVirtualTour(true);
    } catch {
      setErrorMsg(
        t(
          'تعذر معالجة صورة الجولة 360°. يرجى اختيار صورة JPEG أو PNG صالحة.',
          'Could not process the 360° panorama image. Please choose a valid JPEG or PNG.'
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
        currentUser.email === PLATFORM_ADMIN_EMAIL ? 'verified' : 'pending_review';

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
        hasVirtualTour: Boolean(hasVirtualTour || virtualTourUrl.trim() !== ''),
        verificationStatus,
        availabilityStatus: 'available',
        commissionRatePct: effectiveCommissionRatePct,
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

      const batch = writeBatch(db);
      batch.set(doc(db, 'apartments', apartmentId), aptPayload);
      batch.set(doc(db, 'apartments', apartmentId, 'legalDocs', 'dossier'), {
        ownerId: currentUser.uid,
        apartmentId,
        nationalIdNumber: nationalIdNumber.trim(),
        ownerPhone: ownerPhone.trim(),
        exactAddress: exactAddress.trim().slice(0, 250),
        propertyRegistryNumber: propertyRegistryNumber.trim().slice(0, 60),
        titleDeedFileName: deedName.length >= 3 ? deedName : 'deed.pdf',
        titleDeedSha256: deedHash,
        utilityBillFileName: utilityName.length >= 3 ? utilityName : 'utility.pdf',
        utilityBillSha256: utilityHash,
        ownerIbanOrInstapay: ownerIbanOrInstapay.trim().slice(0, 80),
        digitalSignatureName: digitalSignatureName.trim().slice(0, 80),
        exclusivityClauseAccepted: true,
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      try {
        await createSupabaseApartment(
          normalizeApartmentRecord(
            {
              ...aptPayload,
              ownerPhone: ownerPhone.trim(),
            },
            apartmentId,
            true
          )
        );
      } catch (supaErr) {
        setSubmitting(false);
        setErrorMsg(
          supaErr instanceof Error
            ? supaErr.message
            : t('تعذر حفظ الوحدة في Supabase', 'Could not save the unit in Supabase')
        );
        return;
      }

      setSubmitting(false);
      onSuccess();
    } catch (err) {
      setSubmitting(false);
      logFirestoreDiagnostic(err, OperationType.CREATE, `apartments/${apartmentId}`);
      setErrorMsg(
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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header & 3-Step Progress Bar */}
      <div className="space-y-3">
        <div className="text-xs font-semibold text-blue-700">
          {t(
            'بوابة تسجيل الملاك وتوثيق الملكية العقارية',
            'Verified Landlord Onboarding & Legal Dossier'
          )}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
          {t(
            'اعرض وحدتك (شقة · منزل كامل · فندق · مصنع · سكن طلاب) بالعملة والجولة 360°',
            'List Your Unit (Apartment · Whole House · Hotel · Factory · Student) with 360° Tour'
          )}
        </h1>

        <div className="grid grid-cols-3 gap-2 pt-2">
          {[
            { num: 1, label: t('1. المواصفات والعملة وجولة 360°', '1. Specs, Currency & 360° Tour') },
            { num: 2, label: t('2. مستندات الملكية والهوية', '2. Title Deed & National ID') },
            { num: 3, label: t('3. عقد التفويض والعمولة الموحدة', '3. Mandate & One-Time Fee') },
          ].map((s) => (
            <div
              key={s.num}
              className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-colors ${
                step === s.num
                  ? 'bg-blue-700 text-white border-blue-700'
                  : step > s.num
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-white text-slate-500 border-slate-200'
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
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-blue-700" />
                <span>
                  {t('تحديد موقع الوحدة على خريطة مصر (اضغط لتعديل الدبوس)', 'Click Map to Pin Exact Location')}
                </span>
              </span>
              <span className="font-mono tabular-nums text-slate-500">
                {lat.toFixed(4)}, {lng.toFixed(4)}
              </span>
            </div>
            <div className="h-56 rounded-xl overflow-hidden border border-slate-200">
              <Map
                mapId="DEMO_MAP_ID"
                defaultCenter={{ lat: 30.0444, lng: 31.2357 }}
                defaultZoom={12}
                gestureHandling="greedy"
                keyboardShortcuts={false}
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                onClick={(ev) => {
                  if (ev.detail.latLng) {
                    setLat(ev.detail.latLng.lat);
                    setLng(ev.detail.latLng.lng);
                  }
                }}
                className="w-full h-full"
              >
                <WizardMapCameraController target={mapPanTarget} />
                <AdvancedMarker position={{ lat, lng }} />
              </Map>
            </div>
          </div>

          {/* 5. Cover Image Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              {t('الصورة الرئيسية للوحدة', 'Primary Architectural Photo')}
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
              {IMAGE_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setImageKey(k)}
                  className={`relative aspect-[16/10] rounded-xl overflow-hidden border-2 transition-all ${
                    imageKey === k
                      ? 'border-blue-700 ring-2 ring-blue-600/30'
                      : 'border-slate-200 opacity-80 hover:opacity-100'
                  }`}
                >
                  <ApartmentImage
                    imageKey={k}
                    alt={APARTMENT_IMAGES[k].label}
                    className="w-full h-full"
                  />
                </button>
              ))}
            </div>
          </div>

          {/* 6. 360° Virtual Tour & Panorama Upload Section */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Compass className="w-4 h-4 text-blue-700" />
                  <span>
                    {t(
                      'جولة افتراضية تفاعلية وصور بانوراما 360 درجة (اختياري)',
                      '360° Virtual Tour & Equirectangular Panorama (Optional)'
                    )}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {t(
                    'ارفع صورة بانوراما 360° لوحدتك أو اختر نموذجاً تفاعلياً أو أضف رابط جولة خارجية لتمكين المستأجرين من معاينة الوحدة بالكامل.',
                    'Upload a 360° panoramic image, choose a preset scene, or attach an external virtual tour link.'
                  )}
                </p>
              </div>

              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasVirtualTour}
                  onChange={(e) => setHasVirtualTour(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <span className="text-xs font-bold text-slate-800">
                  {t('تفعيل عارض 360° التفاعلي', 'Enable Interactive 360° Viewer')}
                </span>
              </label>
            </div>

            {hasVirtualTour && (
              <div className="space-y-4 pt-2 border-t border-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPanoramaSourceMode('upload')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      panoramaSourceMode === 'upload'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {t('رفع صورة 360° من جهازي', 'Upload Custom 360° Photo')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanoramaSourceMode('preset')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      panoramaSourceMode === 'preset'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {t('اختيار مشهد بانوراما 360° جاهز', 'Choose Curated 360° Scene')}
                  </button>
                </div>

                {panoramaSourceMode === 'upload' ? (
                  <div className="bg-white border border-dashed border-slate-300 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-xs text-slate-600">
                      <div className="font-semibold text-slate-900">
                        {panoramaFileName
                          ? `${t('تم تجهيز:', 'Loaded:')} ${panoramaFileName}`
                          : t(
                              'اختر صورة بانورامية بزاوية 360° (JPEG / PNG)',
                              'Select an equirectangular 360° panorama photo (JPEG / PNG)'
                            )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {t(
                          'يتم ضغط الصورة تلقائياً في المتصفح لحفظها بأمان وسرعة عالية.',
                          'Automatically optimized client-side for instant interactive 360° panning.'
                        )}
                      </div>
                    </div>
                    <label className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap shrink-0">
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {compressingPanorama
                          ? t('جاري المعالجة...', 'Processing...')
                          : t('رفع صورة 360°', 'Upload 360° Image')}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePanoramaUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {PRESET_360_KEYS.map((pk) => (
                      <button
                        key={pk}
                        type="button"
                        onClick={() => setPanorama360Key(pk)}
                        className={`p-3 rounded-xl border text-start text-xs font-semibold transition-colors ${
                          panorama360Key === pk
                            ? 'bg-blue-50 border-blue-600 text-blue-900'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {lang === 'ar'
                          ? PANORAMA_360_PRESETS[pk].labelAr
                          : PANORAMA_360_PRESETS[pk].labelEn}
                      </button>
                    ))}
                  </div>
                )}

                {previewPanoramaSrc && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-slate-700">
                      {t('معاينة حية للجولة الافتراضية 360°:', 'Live 360° Virtual Tour Preview:')}
                    </div>
                    <VirtualTour360Viewer
                      imageSrc={previewPanoramaSrc}
                      unitTitle={title || t('معاينة الوحدة 360°', '360° Unit Preview')}
                      externalTourUrl={virtualTourUrl || undefined}
                      compact
                    />
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t(
                  'رابط جولة افتراضية خارجية (Matterport / Kuula — اختياري)',
                  'External Virtual Tour Link (https://... Optional)'
                )}
              </label>
              <input
                type="url"
                placeholder="https://my.matterport.com/show/?m=..."
                value={virtualTourUrl}
                onChange={(e) => setVirtualTourUrl(e.target.value)}
                className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono"
              />
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

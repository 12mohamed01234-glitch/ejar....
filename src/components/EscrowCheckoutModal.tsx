import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  X,
  CreditCard,
  Smartphone,
  Building,
  Receipt,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Wallet,
  Unlock,
  Phone,
  MessageCircle,
  Key,
  Upload,
  Copy,
  Check,
  AlertTriangle,
  Clock,
  FileCheck2,
  ExternalLink,
} from 'lucide-react';
import {
  db,
  logFirestoreDiagnostic,
  OperationType,
  isPlatformAdminEmail,
} from '../lib/firebase';
import {
  ApartmentRecord,
  BannedUserRecord,
  PaymentChannelMode,
  PaymentMethodType,
  PaymentTransactionRecord,
  PaymentTransactionStatus,
  PlatformSettingsRecord,
  RentalRequestRecord,
  RentalUnitType,
  SHOWCASE_APARTMENTS,
  SupportedCurrency,
  TenantWalletRecord,
  VALIDATION_LIMITS,
  buildChatMessageId,
  buildChatThreadId,
  buildLiveCurrencyRates,
  buildNotificationId,
  computeEjarEscrowPricing,
  computeTextSha256,
  convertFromEgp,
  formatEgp,
  generatePaymentReferenceCode,
  getCategoryCommissionPct,
  normalizeNumericInput,
  resolveUnlockedApartmentContact,
} from '../lib/validation';
import {
  createSupabaseBooking,
  createSupabasePaymentTransaction,
  uploadSupabaseFile,
} from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { PaymobGatewayBox } from './PaymobGatewayBox';
import { PolicyType } from './LegalPolicyModal';
import {
  fetchPaymentGatewayStatus,
  GatewayPaymentMethod,
  PaymentGatewayStatus,
} from '../lib/payments';

interface EscrowCheckoutModalProps {
  apartment: ApartmentRecord | null;
  activeRentalRequest?: RentalRequestRecord | null;
  commissionRatePct: number;
  platformSettings?: PlatformSettingsRecord;
  banRecord?: BannedUserRecord | null;
  tenantWallet?: TenantWalletRecord | null;
  onDeductWallet?: (amountEgp: number, apartmentId: string, apartmentTitle: string) => Promise<void>;
  currentUser: User | null;
  onRequestSignIn: () => Promise<void>;
  onClose: () => void;
  onApartmentRentedAndDeleted: (apartmentId: string) => void;
  onBookingCompleted: (status?: PaymentTransactionStatus) => void;
  onRentalRequestSubmitted: () => void;
  onOpenPolicy?: (type: PolicyType) => void;
}

export const EscrowCheckoutModal: React.FC<EscrowCheckoutModalProps> = ({
  apartment,
  activeRentalRequest = null,
  commissionRatePct,
  platformSettings,
  banRecord = null,
  tenantWallet = null,
  onDeductWallet,
  currentUser,
  onRequestSignIn,
  onClose,
  onApartmentRentedAndDeleted,
  onBookingCompleted,
  onRentalRequestSubmitted: _onRentalRequestSubmitted,
  onOpenPolicy,
}) => {
  const {
    t,
    formatNumber,
    categorySingularLabel,
    rentalUnitLabel,
  } = useI18n();

  const defaultRentalUnit: RentalUnitType =
    activeRentalRequest &&
    !(activeRentalRequest.rentalUnit === 'day' && apartment?.category !== 'hotel_room')
      ? activeRentalRequest.rentalUnit
      : apartment?.category === 'hotel_room' && (apartment.dailyRateEgp ?? 0) > 0
        ? 'day'
        : apartment?.category === 'student_housing' &&
            (apartment.studentBedsCount ?? 0) > 0 &&
            (apartment.studentPricePerBedEgp ?? 0) > 0
          ? 'student_bed'
          : 'month';

  const [rentalUnit, setRentalUnit] = useState<RentalUnitType>(defaultRentalUnit);
  const [unitsCountText, setUnitsCountText] = useState<string>(
    String(activeRentalRequest ? activeRentalRequest.unitsCount : 3)
  );
  const [bedsBookedText, setBedsBookedText] = useState<string>(
    String(
      activeRentalRequest
        ? activeRentalRequest.bedsBooked
        : defaultRentalUnit === 'student_bed'
          ? 1
          : 0
    )
  );
  const unitsCount = Number(unitsCountText) || 0;
  const bedsBooked = Number(bedsBookedText) || 0;
  const paymentCurrency: SupportedCurrency = 'EGP';

  const [gatewayStatus, setGatewayStatus] = useState<PaymentGatewayStatus | null>(null);
  const [checkoutMode, setCheckoutMode] = useState<PaymentChannelMode>('manual_transfer');
  const [paymobMethod, setPaymobMethod] = useState<GatewayPaymentMethod>('card_meeza');
  const [manualChannel, setManualChannel] = useState<'instapay' | 'mobile_wallet'>('instapay');
  const [payerReferenceNote, setPayerReferenceNote] = useState('');
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [gatewayPaymentRef, setGatewayPaymentRef] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const proofInputRef = useRef<HTMLInputElement | null>(null);

  const [receiptData, setReceiptData] = useState<{
    bookingId: string;
    apartmentTitle: string;
    referenceCode: string;
    amountEgp: number;
    totalRentEgp: number;
    landlordRemainingEgp: number;
    durationLabel: string;
    channelMode: PaymentChannelMode;
    paymentMethodLabel: string;
    status: PaymentTransactionStatus;
    bookingStatus: PaymentTransactionRecord['bookingStatus'];
    proofUrl?: string;
    payerReferenceNote?: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void fetchPaymentGatewayStatus().then((st) => {
      if (!active) return;
      setGatewayStatus(st);
      const anyLive = Boolean(
        st.providers.card_meeza || st.providers.mobile_wallet || st.providers.fawry
      );
      if (anyLive) {
        setCheckoutMode('paymob_live');
        if (st.providers.card_meeza) setPaymobMethod('card_meeza');
        else if (st.providers.mobile_wallet) setPaymobMethod('mobile_wallet');
        else if (st.providers.fawry) setPaymobMethod('fawry');
      } else {
        setCheckoutMode('manual_transfer');
      }
    });
    return () => {
      active = false;
    };
  }, [apartment?.id]);

  useEffect(() => {
    if (!apartment) return;
    const nextUnit: RentalUnitType =
      activeRentalRequest &&
      !(activeRentalRequest.rentalUnit === 'day' && apartment.category !== 'hotel_room')
        ? activeRentalRequest.rentalUnit
        : apartment.category === 'hotel_room' && apartment.dailyRateEgp > 0
          ? 'day'
          : apartment.category === 'student_housing' &&
              apartment.studentBedsCount > 0 &&
              apartment.studentPricePerBedEgp > 0
            ? 'student_bed'
            : 'month';
    setRentalUnit(nextUnit);
    setUnitsCountText(String(activeRentalRequest ? activeRentalRequest.unitsCount : 3));
    setBedsBookedText(
      String(
        activeRentalRequest
          ? activeRentalRequest.bedsBooked
          : nextUnit === 'student_bed'
            ? 1
            : 0
      )
    );
    setGatewayPaymentRef(null);
    setPayerReferenceNote('');
    setProofUrl(null);
    setErrorMsg(null);
    setReceiptData(null);
  }, [apartment?.id, activeRentalRequest?.id]);

  if (!apartment) return null;

  const isHotelRoom = apartment.category === 'hotel_room';
  const canRentDaily =
    isHotelRoom && apartment.dailyRateEgp > 0 && apartment.billingMode === 'daily_or_monthly';
  const canRentStudentBed =
    apartment.studentBedsCount >= 1 && apartment.studentPricePerBedEgp >= 500;

  const effectiveBedsBooked =
    rentalUnit === 'student_bed'
      ? Math.max(1, Math.min(apartment.studentBedsCount || 1, bedsBooked || 1))
      : 0;

  const activeRentalUnit: RentalUnitType =
    rentalUnit === 'day' && !isHotelRoom ? 'month' : rentalUnit;

  const unitPriceEgp =
    activeRentalUnit === 'day'
      ? apartment.dailyRateEgp
      : activeRentalUnit === 'student_bed'
        ? apartment.studentPricePerBedEgp * effectiveBedsBooked
        : apartment.monthlyRentEgp;

  const effectiveCommissionRatePct = getCategoryCommissionPct(
    apartment.category,
    platformSettings ?? { commissionRatePct: apartment.commissionRatePct || commissionRatePct }
  );
  const safeUnitsCount = Math.max(1, Math.min(365, Math.round(unitsCount || 1)));
  const totalRentEgp = unitPriceEgp;

  /* ===== معادلة الحساب الديناميكية المرتبطة بإعدادات لوحة الأدمن =====
   * rate = النسبة المئوية المعتمدة لهذا القسم في لوحة الأدمن (مثلاً 10% أو 12%)
   * المستحق دفعه أونلاين الآن (من الشهر الأول فقط): onlineAmount = monthlyRent * (rate / 100)
   * المتبقي للمالك عند المقابلة والاستلام (من الشهر الأول): ownerRemainingFirstMonth = monthlyRent - onlineAmount
   */
  const escrowPricing = computeEjarEscrowPricing(unitPriceEgp, effectiveCommissionRatePct);
  const ratePct = escrowPricing.commissionRatePct;
  const remainingPct = escrowPricing.remainingRatePct;
  const onlineDueTotalEgp = escrowPricing.onlineDueTotalEgp;
  const remainingOnHandoverEgp = escrowPricing.remainingFirstMonthEgp;
  const platformCommissionEgp = escrowPricing.onlineDueTotalEgp;
  const landlordNetEgp = remainingOnHandoverEgp;

  const isAdmin = isPlatformAdminEmail(currentUser?.email);
  const isBanned = Boolean(banRecord && !isAdmin);
  const isBookingsPaused = Boolean(
    platformSettings && !platformSettings.allowNewBookings && !isAdmin
  );
  const liveCurrencyRates = buildLiveCurrencyRates(platformSettings);
  const exchangeRateToEgp = liveCurrencyRates[paymentCurrency] || 1;
  const paidAmountInCurrency = convertFromEgp(
    onlineDueTotalEgp,
    paymentCurrency,
    liveCurrencyRates
  );

  const durationSummaryLabel =
    activeRentalUnit === 'day'
      ? t(`${safeUnitsCount} ليلة`, `${safeUnitsCount} nights`)
      : activeRentalUnit === 'student_bed'
        ? t(
            `${effectiveBedsBooked} سرير × ${safeUnitsCount} شهر`,
            `${effectiveBedsBooked} bed(s) × ${safeUnitsCount} mo`
          )
        : t(`${safeUnitsCount} شهر`, `${safeUnitsCount} months`);

  const handleRentalUnitChange = (nextUnit: RentalUnitType) => {
    setRentalUnit(nextUnit);
    if (nextUnit === 'student_bed') {
      setBedsBookedText((prev) => {
        const cur = Number(prev) || 0;
        return String(cur >= 1 ? Math.min(apartment.studentBedsCount, cur) : 1);
      });
      setUnitsCountText((prev) => {
        const cur = Number(prev) || 0;
        return String(cur >= 1 && cur <= 12 ? cur : 3);
      });
    } else {
      setBedsBookedText('0');
      setUnitsCountText('3');
    }
  };

  const handleCopy = (val: string, key: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setUploadingProof(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
      const cleanUid = (currentUser?.uid || 'guest').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = `payment_proofs/${cleanUid}_${Date.now()}.${ext}`;
      const { publicUrl } = await uploadSupabaseFile('kyc-documents', filePath, file);
      setProofUrl(publicUrl);
    } catch (err) {
      console.error('[EscrowCheckoutModal] Proof upload failed:', err);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : t('فشل رفع صورة إثبات التحويل إلى التخزين السحابي.', 'Failed to upload transfer proof.')
      );
    } finally {
      setUploadingProof(false);
      if (e.target) e.target.value = '';
    }
  };

  const hasLivePaymob = Boolean(
    gatewayStatus?.providers.card_meeza ||
      gatewayStatus?.providers.mobile_wallet ||
      gatewayStatus?.providers.fawry
  );

  const handleConfirmEscrowPayment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    if (!currentUser) {
      await onRequestSignIn();
      return;
    }

    if (isBanned || isBookingsPaused) {
      setErrorMsg(
        isBanned
          ? t(
              `تم تقييد حسابك من قِبل إدارة المنصة: ${banRecord?.reason || ''}`,
              `Account restricted: ${banRecord?.reason || ''}`
            )
          : t(
              'الحجوزات الجديدة متوقفة مؤقتاً بقرار من إدارة الموقع.',
              'New bookings are temporarily paused by administration.'
            )
      );
      return;
    }

    if (checkoutMode === 'wallet_balance' && (tenantWallet?.balanceEgp ?? 0) < onlineDueTotalEgp) {
      setErrorMsg(
        t(
          `رصيد المحفظة الحالي (${formatEgp(tenantWallet?.balanceEgp ?? 0)}) غير كافٍ لسداد النسبة المطلوبة (${formatNumber(ratePct)}% = ${formatEgp(onlineDueTotalEgp)} ج.م). يمكنك اختيار التحويل اليدوي مع إثبات التحويل أو إرسال طلب حجز مبدئي.`,
          `Insufficient wallet balance for the ${formatNumber(ratePct)}% online payment.`
        )
      );
      return;
    }

    if (checkoutMode === 'manual_transfer') {
      if (!proofUrl && payerReferenceNote.trim().length < 4) {
        setErrorMsg(
          t(
            'يرجى إرفاق صورة إثبات التحويل أو إدخال الرقم المرجعي لعملية التحويل (4 أحرف على الأقل).',
            'Please upload a transfer receipt screenshot or enter the transfer reference number.'
          )
        );
        return;
      }
    }

    if (checkoutMode === 'paymob_live') {
      if (!hasLivePaymob) {
        setErrorMsg(
          t(
            'بوابة Paymob غير متصلة حالياً. يرجى استخدام التحويل اليدوي مع إثبات التحويل أو طلب الحجز المبدئي.',
            'Paymob gateway is not connected. Please use manual transfer or booking request.'
          )
        );
        return;
      }
      if (!gatewayPaymentRef) {
        setErrorMsg(
          t(
            'يرجى إتمام خطوة الدفع عبر Paymob أعلاه أولاً قبل تأكيد الحجز.',
            'Please complete the Paymob step above first.'
          )
        );
        return;
      }
    }

    setProcessing(true);

    const activePaymentMethod: PaymentMethodType | 'booking_request' =
      checkoutMode === 'wallet_balance'
        ? 'wallet_balance'
        : checkoutMode === 'manual_transfer'
          ? manualChannel
          : checkoutMode === 'paymob_live'
            ? paymobMethod
            : 'booking_request';

    const txStatus: PaymentTransactionStatus =
      checkoutMode === 'wallet_balance'
        ? 'confirmed'
        : checkoutMode === 'paymob_live'
          ? paymobMethod === 'fawry'
            ? 'pending_verification'
            : 'confirmed'
          : checkoutMode === 'manual_transfer'
            ? 'pending_verification'
            : 'pending_approval';

    const bookingStatusValue: PaymentTransactionRecord['bookingStatus'] =
      txStatus === 'confirmed'
        ? 'escrow_paid'
        : txStatus === 'pending_verification'
          ? 'pending_verification'
          : 'pending_approval';

    const dbBookingStatus: 'escrow_paid' | 'awaiting_payment' | 'pending_approval' =
      txStatus === 'confirmed'
        ? 'escrow_paid'
        : txStatus === 'pending_verification'
          ? 'awaiting_payment'
          : 'pending_approval';

    const refPrefix =
      checkoutMode === 'manual_transfer'
        ? 'EJAR-TRF'
        : checkoutMode === 'booking_request'
          ? 'EJAR-REQ'
          : checkoutMode === 'wallet_balance'
            ? 'EJAR-WAL'
            : 'EJAR-PMB';

    const referenceCode = gatewayPaymentRef || generatePaymentReferenceCode(refPrefix);
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const bookingId =
      txStatus === 'confirmed'
        ? apartment.id
        : `bk_${apartment.id}_${Date.now().toString().slice(-5)}`;

    try {
      let aptSnap = await getDoc(doc(db, 'apartments', apartment.id)).catch(() => null);
      let targetLandlordId = aptSnap?.exists()
        ? String(aptSnap.data().ownerId || apartment.ownerId)
        : apartment.ownerId;

      if (!aptSnap?.exists() && isPlatformAdminEmail(currentUser.email)) {
        targetLandlordId = currentUser.uid;
        const seedBatch = writeBatch(db);
        const seedHash = await computeTextSha256(apartment.id);
        const seedAptPayload: Record<string, unknown> = {
          ownerId: currentUser.uid,
          ownerDisplayName: apartment.ownerDisplayName,
          category: apartment.category,
          billingMode: apartment.billingMode,
          dailyRateEgp: apartment.dailyRateEgp,
          monthlyRentEgp: apartment.monthlyRentEgp,
          studentBedsCount: apartment.studentBedsCount,
          studentPricePerBedEgp: apartment.studentPricePerBedEgp,
          title: apartment.title,
          description: apartment.description,
          governorate: apartment.governorate,
          district: apartment.district,
          lat: apartment.lat,
          lng: apartment.lng,
          bedrooms: apartment.bedrooms,
          bathrooms: apartment.bathrooms,
          areaSqm: apartment.areaSqm,
          furnishing: apartment.furnishing,
          imageKey: apartment.imageKey,
          verificationStatus: 'verified',
          availabilityStatus: 'available',
          commissionRatePct: effectiveCommissionRatePct,
          mandateAccepted: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (apartment.baseCurrency) seedAptPayload.baseCurrency = apartment.baseCurrency;
        if (typeof apartment.baseMonthlyPrice === 'number') {
          seedAptPayload.baseMonthlyPrice = apartment.baseMonthlyPrice;
        }
        if (typeof apartment.baseDailyPrice === 'number') {
          seedAptPayload.baseDailyPrice = apartment.baseDailyPrice;
        }
        if (typeof apartment.baseStudentBedPrice === 'number') {
          seedAptPayload.baseStudentBedPrice = apartment.baseStudentBedPrice;
        }
        if (typeof apartment.houseHasGardenOrRoof === 'boolean') {
          seedAptPayload.houseHasGardenOrRoof = apartment.houseHasGardenOrRoof;
        }
        if (typeof apartment.houseHasPrivateGarage === 'boolean') {
          seedAptPayload.houseHasPrivateGarage = apartment.houseHasPrivateGarage;
        }
        if (apartment.category === 'whole_house') {
          seedAptPayload.houseApartmentsCount = Math.max(
            1,
            Math.min(60, Math.round(apartment.houseApartmentsCount || 2))
          );
          seedAptPayload.houseFloorsCount = Math.max(
            1,
            Math.min(20, Math.round(apartment.houseFloorsCount || 2))
          );
          if (apartment.houseSpecsSummary) {
            seedAptPayload.houseSpecsSummary = apartment.houseSpecsSummary.slice(0, 240);
          }
        }
        if (typeof apartment.hasVirtualTour === 'boolean') {
          seedAptPayload.hasVirtualTour = apartment.hasVirtualTour;
        }
        if (apartment.panorama360Key) seedAptPayload.panorama360Key = apartment.panorama360Key;

        seedBatch.set(doc(db, 'apartments', apartment.id), seedAptPayload);
        seedBatch.set(doc(db, 'apartments', apartment.id, 'legalDocs', 'dossier'), {
          ownerId: currentUser.uid,
          apartmentId: apartment.id,
          nationalIdNumber: '28801010104455',
          ownerPhone: '01022334455',
          exactAddress: `${apartment.district} — وحدة موثقة بسجل منصة إيجار`,
          propertyRegistryNumber: `REG-${apartment.id.slice(-6).toUpperCase()}`,
          titleDeedFileName: `${apartment.id}_deed.pdf`,
          titleDeedSha256: seedHash,
          utilityBillFileName: `${apartment.id}_utility.pdf`,
          utilityBillSha256: seedHash,
          ownerIbanOrInstapay: 'verified.landlord@instapay',
          digitalSignatureName: `${apartment.ownerDisplayName} الموثق`.slice(0, 80),
          exclusivityClauseAccepted: true,
          createdAt: serverTimestamp(),
        });
        await seedBatch.commit().catch(() => undefined);
        aptSnap = await getDoc(doc(db, 'apartments', apartment.id)).catch(() => null);
      } else if (
        !aptSnap?.exists() &&
        !apartment.isPersistedInDb &&
        !SHOWCASE_APARTMENTS.some((s) => s.id === apartment.id)
      ) {
        setProcessing(false);
        setErrorMsg(
          t(
            'تعذر العثور على هذه الوحدة في السجل النشط حالياً.',
            'Could not find this unit in active listings.'
          )
        );
        return;
      }

      const tenantName = (currentUser.displayName?.trim() || 'مستأجر موثق').slice(0, 80);
      const safeTenantName = tenantName.length >= 2 ? tenantName : 'مستأجر موثق';
      const landlordName = (apartment.ownerDisplayName?.trim() || 'مالك عقار موثق').slice(0, 80);
      const safeLandlordName = landlordName.length >= 2 ? landlordName : 'مالك عقار موثق';
      const safeTitle =
        apartment.title.trim().slice(0, 120).length >= 5
          ? apartment.title.trim().slice(0, 120)
          : 'وحدة عقارية موثقة على إيجار';
      const safeGov =
        apartment.governorate.trim().slice(0, 50).length >= 2
          ? apartment.governorate.trim().slice(0, 50)
          : 'القاهرة';
      const safeDistrict =
        apartment.district.trim().slice(0, 80).length >= 2
          ? apartment.district.trim().slice(0, 80)
          : safeGov;
      const safeLat = Math.max(
        VALIDATION_LIMITS.LAT_MIN,
        Math.min(VALIDATION_LIMITS.LAT_MAX, apartment.lat)
      );
      const safeLng = Math.max(
        VALIDATION_LIMITS.LNG_MIN,
        Math.min(VALIDATION_LIMITS.LNG_MAX, apartment.lng)
      );

      const isConfirmedPaid = txStatus === 'confirmed';
      const firestorePaymentMethod: PaymentMethodType =
        activePaymentMethod === 'booking_request' ? 'instapay' : activePaymentMethod;

      if (isConfirmedPaid && checkoutMode === 'wallet_balance' && onDeductWallet) {
        await onDeductWallet(onlineDueTotalEgp, apartment.id, apartment.title);
      }

      // 1. Save Real Payment / Proof Transaction Record to Supabase `public.payments`
      await createSupabasePaymentTransaction({
        id: paymentId,
        referenceCode,
        userId: currentUser.uid,
        userDisplayName: safeTenantName,
        landlordId: targetLandlordId,
        landlordDisplayName: safeLandlordName,
        apartmentId: apartment.id,
        apartmentTitle: safeTitle,
        bookingId,
        amountEgp: checkoutMode === 'booking_request' ? 0 : onlineDueTotalEgp,
        totalRentEgp,
        landlordRemainingEgp: remainingOnHandoverEgp,
        paymentMethod: activePaymentMethod,
        channelMode: checkoutMode,
        status: txStatus,
        bookingStatus: bookingStatusValue,
        proofUrl: proofUrl || undefined,
        payerReferenceNote: payerReferenceNote.trim() || undefined,
        isDemo: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });

      // 2. Save Booking Record to Supabase `public.bookings`
      await createSupabaseBooking({
        id: bookingId,
        apartmentId: apartment.id,
        apartmentTitle: safeTitle,
        category: apartment.category,
        governorate: safeGov,
        district: safeDistrict,
        lat: safeLat,
        lng: safeLng,
        tenantId: currentUser.uid,
        tenantDisplayName: safeTenantName,
        landlordId: targetLandlordId,
        landlordDisplayName: safeLandlordName,
        rentalUnit: activeRentalUnit,
        unitPriceEgp,
        unitsCount: safeUnitsCount,
        bedsBooked: effectiveBedsBooked,
        leaseMonths: safeUnitsCount,
        monthlyRentEgp: apartment.monthlyRentEgp,
        commissionRatePct: effectiveCommissionRatePct,
        totalRentEgp,
        platformCommissionEgp,
        landlordNetEgp,
        paymentCurrency,
        exchangeRateToEgp,
        paidAmountInCurrency,
        paymentMethod: firestorePaymentMethod,
        paymentReference: referenceCode,
        status: dbBookingStatus,
        createdAtMs: Date.now(),
        escrowAmountEgp: onlineDueTotalEgp,
        commissionAmountEgp: onlineDueTotalEgp,
      });

      // 3. Secondary Sync & Notifications to Firestore (best-effort)
      try {
        const rentalBatch = writeBatch(db);
        if (isConfirmedPaid) {
          rentalBatch.set(doc(db, 'bookings', bookingId), {
            apartmentId: apartment.id,
            apartmentTitle: safeTitle,
            category: apartment.category,
            governorate: safeGov,
            district: safeDistrict,
            lat: safeLat,
            lng: safeLng,
            tenantId: currentUser.uid,
            tenantDisplayName: safeTenantName,
            landlordId: targetLandlordId,
            landlordDisplayName: safeLandlordName,
            rentalUnit: activeRentalUnit,
            unitPriceEgp,
            unitsCount: safeUnitsCount,
            bedsBooked: effectiveBedsBooked,
            leaseMonths: safeUnitsCount,
            monthlyRentEgp: apartment.monthlyRentEgp,
            commissionRatePct: effectiveCommissionRatePct,
            totalRentEgp,
            platformCommissionEgp,
            landlordNetEgp,
            paymentCurrency,
            exchangeRateToEgp,
            paidAmountInCurrency,
            paymentMethod: firestorePaymentMethod,
            paymentReference: referenceCode,
            status: 'escrow_paid',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          if (aptSnap?.exists()) {
            rentalBatch.delete(doc(db, 'apartments', apartment.id));
          }
        } else {
          const reqId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          rentalBatch.set(doc(db, 'rentalRequests', reqId), {
            apartmentId: apartment.id,
            apartmentTitle: safeTitle,
            category: apartment.category,
            governorate: safeGov,
            district: safeDistrict,
            tenantId: currentUser.uid,
            tenantDisplayName: safeTenantName,
            landlordId: targetLandlordId,
            landlordDisplayName: safeLandlordName,
            rentalUnit: activeRentalUnit,
            unitPriceEgp,
            unitsCount: safeUnitsCount,
            bedsBooked: effectiveBedsBooked,
            commissionRatePct: effectiveCommissionRatePct,
            totalRentEgp,
            platformCommissionEgp,
            landlordNetEgp,
            paymentCurrency,
            exchangeRateToEgp,
            paidAmountInCurrency,
            status: txStatus === 'pending_verification' ? 'awaiting_payment' : 'pending_approval',
            statusNote:
              txStatus === 'pending_verification'
                ? `تم إرسال إثبات تحويل بمبلغ ${formatEgp(onlineDueTotalEgp)} ج.م — مرجع ${referenceCode} (بانتظار التحقق).`
                : `طلب حجز مبدئي — مرجع ${referenceCode} (بانتظار موافقة المالك وترتيب السداد).`,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        if (
          isConfirmedPaid &&
          activeRentalRequest &&
          (activeRentalRequest.status === 'pending_approval' ||
            activeRentalRequest.status === 'awaiting_payment')
        ) {
          rentalBatch.update(doc(db, 'rentalRequests', activeRentalRequest.id), {
            status: 'approved',
            paymentCurrency,
            exchangeRateToEgp,
            paidAmountInCurrency,
            statusNote: `تمت الموافقة النهائية وسداد الضمان برقم مرجعي ${referenceCode}.`,
            updatedAt: serverTimestamp(),
          });
        }

        const tenantApprovedNotifId = buildNotificationId('ntf_ap_t');
        rentalBatch.set(doc(db, 'notifications', tenantApprovedNotifId), {
          recipientId: currentUser.uid,
          actorId: currentUser.uid,
          actorDisplayName: safeTenantName,
          recipientRole: 'tenant',
          statusType: isConfirmedPaid
            ? 'approved'
            : txStatus === 'pending_verification'
              ? 'awaiting_payment'
              : 'pending_approval',
          relatedEntityType: isConfirmedPaid ? 'booking' : 'rental_request',
          relatedEntityId: bookingId,
          apartmentId: apartment.id,
          apartmentTitle: safeTitle,
          governorate: safeGov,
          amountEgp: onlineDueTotalEgp,
          title: isConfirmedPaid
            ? 'تم تأكيد الدفع وتوثيق الحجز بنجاح ✓'
            : txStatus === 'pending_verification'
              ? 'تم تسجيل طلب التحويل — بانتظار المراجعة'
              : 'تم إرسال طلب حجز مبدئي للمالك',
          message: isConfirmedPaid
            ? `تم سداد ${formatEgp(onlineDueTotalEgp)} ج.م (${ratePct}% من الشهر الأول) لوحدة «${safeTitle}» برقم مرجعي ${referenceCode}.`
            : txStatus === 'pending_verification'
              ? `تم استلام بيانات وإثبات التحويل (${formatEgp(onlineDueTotalEgp)} ج.م — نسبة ${ratePct}%) برقم مرجعي ${referenceCode} وجارٍ المراجعة.`
              : `تم إرسال طلب حجز مبدئي لوحدة «${safeTitle}» برقم مرجعي ${referenceCode}.`,
          isRead: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (targetLandlordId !== 'showcase_owner' && targetLandlordId !== currentUser.uid) {
          const landlordApprovedNotifId = buildNotificationId('ntf_ap_l');
          rentalBatch.set(doc(db, 'notifications', landlordApprovedNotifId), {
            recipientId: targetLandlordId,
            actorId: currentUser.uid,
            actorDisplayName: safeTenantName,
            recipientRole: 'landlord',
            statusType: isConfirmedPaid ? 'approved' : 'pending_approval',
            relatedEntityType: isConfirmedPaid ? 'booking' : 'rental_request',
            relatedEntityId: bookingId,
            apartmentId: apartment.id,
            apartmentTitle: safeTitle,
            governorate: safeGov,
            amountEgp: landlordNetEgp,
            title: isConfirmedPaid
              ? 'تم تأكيد حجز ودفع وحدتك'
              : txStatus === 'pending_verification'
                ? 'طلب حجز جديد مع إثبات تحويل قيد المراجعة'
                : 'طلب حجز مبدئي جديد على وحدتك',
            message: isConfirmedPaid
              ? `أكد ${safeTenantName} حجز «${safeTitle}» (مرجع ${referenceCode})؛ المتبقي لك عند المقابلة ${formatEgp(landlordNetEgp)} ج.م.`
              : `أرسل ${safeTenantName} طلباً على «${safeTitle}» (مرجع ${referenceCode}) بحالة ${txStatus === 'pending_verification' ? 'تحويل قيد المراجعة' : 'طلب مبدئي'}.`,
            isRead: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        if (isConfirmedPaid) {
          const chatId = buildChatThreadId(currentUser.uid, apartment.id);
          const chatSnap = await getDoc(doc(db, 'chatThreads', chatId)).catch(() => null);
          if (chatSnap?.exists() && !chatSnap.data()?.commissionPaid) {
            rentalBatch.update(doc(db, 'chatThreads', chatId), {
              status: 'unlocked',
              commissionPaid: true,
              commissionPaymentMethod: firestorePaymentMethod,
              commissionPaymentRef: referenceCode,
              commissionPaidByUid: currentUser.uid,
              commissionPaidAt: serverTimestamp(),
              bookingId,
              lastMessagePreview: 'تم تأكيد السداد — الشات مفتوح وأرقام الهاتف ظاهرة',
              lastMessageAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            rentalBatch.set(doc(db, 'chatThreads', chatId, 'messages', buildChatMessageId()), {
              threadId: chatId,
              tenantId: currentUser.uid,
              landlordId: targetLandlordId,
              senderId: currentUser.uid,
              senderRole: 'system',
              senderDisplayName: 'بوابة الدفع والضمان',
              body: `تم تأكيد السداد (مرجع ${referenceCode}) — تم فتح المحادثة وإظهار أرقام الهاتف تلقائياً.`,
              isSystemNotice: true,
              createdAt: serverTimestamp(),
            });
          }
        }

        await rentalBatch.commit();
      } catch (fsErr) {
        console.warn('[Firestore secondary booking sync notice]:', fsErr);
      }

      if (isConfirmedPaid) {
        onApartmentRentedAndDeleted(apartment.id);
      }

      const methodReadable =
        checkoutMode === 'wallet_balance'
          ? t('رصيد المحفظة', 'Wallet Balance')
          : checkoutMode === 'manual_transfer'
            ? manualChannel === 'instapay'
              ? t('تحويل يدوي — InstaPay', 'Manual Transfer — InstaPay')
              : t('تحويل يدوي — محفظة إلكترونية', 'Manual Transfer — Mobile Wallet')
            : checkoutMode === 'paymob_live'
              ? `Paymob (${paymobMethod})`
              : t('طلب حجز مبدئي', 'Preliminary Booking Request');

      setReceiptData({
        bookingId,
        apartmentTitle: apartment.title,
        referenceCode,
        amountEgp: checkoutMode === 'booking_request' ? 0 : onlineDueTotalEgp,
        totalRentEgp,
        landlordRemainingEgp: remainingOnHandoverEgp,
        durationLabel: durationSummaryLabel,
        channelMode: checkoutMode,
        paymentMethodLabel: methodReadable,
        status: txStatus,
        bookingStatus: bookingStatusValue,
        proofUrl: proofUrl || undefined,
        payerReferenceNote: payerReferenceNote.trim() || undefined,
      });
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.WRITE, `bookings/${bookingId}`);
      setErrorMsg(
        err instanceof Error && err.message
          ? err.message
          : t(
              'تعذر تسجيل العملية في قاعدة البيانات حالياً. يرجى المحاولة مرة أخرى.',
              'Could not record transaction right now. Please try again.'
            )
      );
    } finally {
      setProcessing(false);
    }
  };

  const statusLabel = (s: PaymentTransactionStatus) => {
    switch (s) {
      case 'confirmed':
        return t('مدفوع ومؤكد ✓', 'Paid & Confirmed ✓');
      case 'settled':
        return t('تم الاستلام والتسوية ✓', 'Settled & Completed ✓');
      case 'pending_verification':
        return t('بانتظار مراجعة إثبات التحويل ⏳', 'Pending Transfer Verification ⏳');
      case 'pending_approval':
        return t('طلب حجز مبدئي — بانتظار موافقة المالك ⏳', 'Preliminary Request — Pending Approval ⏳');
      case 'rejected':
        return t('مرفوض', 'Rejected');
    }
  };

  const bookingStatusLabel = (bs: PaymentTransactionRecord['bookingStatus']) => {
    switch (bs) {
      case 'escrow_paid':
        return t('محجوز ومؤكد بالضمان', 'Confirmed in Escrow');
      case 'completed':
        return t('تم التسليم واستلام المفتاح', 'Handover Completed');
      case 'pending_verification':
        return t('معلق لحين مراجعة التحويل', 'Pending Transfer Verification');
      case 'pending_approval':
        return t('طلب مبدئي بانتظار المالك', 'Pending Landlord Approval');
      case 'cancelled':
        return t('ملغي', 'Cancelled');
    }
  };

  const merchantIpa = gatewayStatus?.merchantInstaPayAddress || 'ejar.escrow@instapay';
  const merchantWallet = gatewayStatus?.merchantWalletNumber || '01099887766';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-xl">
        {/* Top Modal Header */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 px-5 py-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
              <Lock className="w-3.5 h-3.5" />
              <span>{t('إتمام الحجز وتسجيل الدفع', 'Booking & Payment Checkout')}</span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="text-slate-500">{categorySingularLabel(apartment.category)}</span>
            </div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate mt-0.5">
              {apartment.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('إغلاق', 'Close')}
            className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Receipt / Operation Summary After Submission */}
        {receiptData ? (
          <div className="p-6 space-y-5">
            <div
              className={`flex items-start gap-3 rounded-xl p-4 border ${
                receiptData.status === 'confirmed'
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-amber-50 border-amber-200'
              }`}
            >
              {receiptData.status === 'confirmed' ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <Clock className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0 space-y-1">
                <h3
                  className={`text-sm font-bold ${
                    receiptData.status === 'confirmed' ? 'text-emerald-950' : 'text-amber-950'
                  }`}
                >
                  {receiptData.status === 'confirmed'
                    ? t('تم تأكيد الدفع وحجز الوحدة بنجاح', 'Payment Confirmed & Unit Booked')
                    : receiptData.status === 'pending_verification'
                      ? t('تم تسجيل طلب التحويل وإرفاق الإثبات للمراجعة', 'Transfer Logged — Awaiting Verification')
                      : t('تم إرسال طلب الحجز المبدئي بنجاح', 'Preliminary Booking Request Submitted')}
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono font-bold text-slate-900 select-all">
                    {t('الرقم المرجعي:', 'Ref:')} {receiptData.referenceCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(receiptData.referenceCode, 'receipt_ref')}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {copiedKey === 'receipt_ref' ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedKey === 'receipt_ref' ? t('تم النسخ', 'Copied') : t('نسخ', 'Copy')}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Only unlock private address & phone if payment is ACTUALLY confirmed */}
            {receiptData.status === 'confirmed' ? (
              (() => {
                const unlocked = resolveUnlockedApartmentContact(apartment, true);
                return (
                  <div className="bg-emerald-50/80 border border-emerald-300 rounded-2xl p-4 text-xs space-y-3">
                    <div className="flex items-center gap-2 text-emerald-950 font-bold text-sm">
                      <Unlock className="w-5 h-5 text-emerald-700" />
                      <span>{t('تم فك قفل العنوان ورقم المالك بنجاح!', 'Exact Address & Landlord Phone Unlocked!')}</span>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-emerald-200 space-y-1">
                      <span className="text-[10px] text-slate-500 block">{t('العنوان التفصيلي:', 'Exact Address:')}</span>
                      <span className="font-bold text-slate-900 block leading-relaxed">{unlocked.exactAddress}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="bg-white p-2.5 rounded-xl border border-emerald-200 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-500 block">{t('هاتف المالك:', 'Landlord Phone:')}</span>
                          <span className="font-mono font-bold text-slate-900">{unlocked.landlordPhone}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <a
                            href={`tel:${unlocked.landlordPhone}`}
                            className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg transition-colors"
                            title="اتصال"
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                          <a
                            href={`https://wa.me/2${unlocked.landlordPhone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                            title="واتساب"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>

                      <div className="bg-white p-2.5 rounded-xl border border-emerald-200 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-500 block">{t('كود الاستلام:', 'Handover Code:')}</span>
                          <span className="font-mono font-bold text-emerald-700">{unlocked.checkInPasscode}</span>
                        </div>
                        <Key className="w-4 h-4 text-emerald-600" />
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 leading-relaxed">
                {receiptData.status === 'pending_verification'
                  ? t(
                      'تم حفظ العملية وإثبات التحويل في قاعدة البيانات. سيتم مراجعة التحويل وتأكيد الحجز وفك قفل بيانات المالك فور التحقق، ويمكنك متابعة الحالة في «عقودي ومعاملاتي».',
                      'Your transfer proof is saved. Contact details unlock once the transfer is verified.'
                    )
                  : t(
                      'تم إرسال طلب الحجز المبدئي للمالك وحفظه برقم مرجعي في سجل معاملاتك. يمكنك متابعة الرد وإتمام الدفع من «عقودي ومعاملاتي».',
                      'Your preliminary booking request has been logged. Track landlord response in My Contracts.'
                    )}
              </div>
            )}

            {/* Clear Receipt Summary Box */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-2.5 text-xs bg-white">
              <div className="font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center justify-between">
                <span>{t('ملخص وإيصال العملية', 'Transaction Receipt Summary')}</span>
                <span className="font-mono text-[11px] text-blue-700">{receiptData.referenceCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('الوحدة', 'Unit')}</span>
                <span className="font-semibold text-slate-900">{receiptData.apartmentTitle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  {activeRentalUnit === 'day'
                    ? t('قيمة الليلة الفندقية', 'Nightly Rate')
                    : activeRentalUnit === 'student_bed'
                      ? t('قيمة الإيجار الشهري (للسراير)', 'Monthly Rent (Selected Beds)')
                      : t('قيمة الإيجار الشهري', 'Monthly Rent')}
                </span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {formatNumber(unitPriceEgp)} {t('ج.م', 'EGP')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  {activeRentalUnit === 'day'
                    ? t('مدة الإقامة المختارة', 'Selected Stay')
                    : t('عدد الشهور المختارة', 'Selected Months')}
                </span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {receiptData.durationLabel}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('وسيلة / مسار العملية', 'Method')}</span>
                <span className="font-semibold text-slate-800">{receiptData.paymentMethodLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('حالة العملية', 'Transaction Status')}</span>
                <span
                  className={`font-bold ${
                    receiptData.status === 'confirmed' ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {statusLabel(receiptData.status)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('حالة الحجز', 'Booking Status')}</span>
                <span className="font-semibold text-slate-900">
                  {bookingStatusLabel(receiptData.bookingStatus)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-100">
                <span className="text-slate-600 font-semibold">
                  {receiptData.channelMode === 'booking_request'
                    ? t(`المستحق أونلاين عند التفعيل (${formatNumber(ratePct)}%)`, `${formatNumber(ratePct)}% Due Upon Confirmation`)
                    : t(`المستحق أونلاين (${formatNumber(ratePct)}% من الشهر الأول)`, `Online Paid (${formatNumber(ratePct)}% of 1st Month)`)}
                </span>
                <span className="font-mono tabular-nums font-bold text-blue-700">
                  {formatNumber(
                    receiptData.channelMode === 'booking_request'
                      ? onlineDueTotalEgp
                      : receiptData.amountEgp
                  )}{' '}
                  {t('ج.م', 'EGP')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  {t(
                    `المتبقي للمالك عند المقابلة والاستلام (${formatNumber(remainingPct)}% من الشهر الأول)`,
                    `Due to Landlord on Handover (${formatNumber(remainingPct)}% of 1st Month)`
                  )}
                </span>
                <span className="font-mono tabular-nums font-semibold text-emerald-700">
                  {formatNumber(receiptData.landlordRemainingEgp)} {t('ج.م', 'EGP')}
                </span>
              </div>

              {receiptData.proofUrl && (
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-slate-500">{t('إثبات التحويل المرفق:', 'Uploaded Proof:')}</span>
                  <a
                    href={receiptData.proofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                  >
                    <span>{t('عرض صورة الإيصال', 'View Receipt Image')}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => onBookingCompleted(receiptData.status)}
              className="w-full py-3 px-4 bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold rounded-xl transition-colors"
            >
              {t('مراجعة سجل معاملاتي وعقودي', 'View My Transactions & Contracts')}
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {isBanned && (
              <div className="bg-rose-50 border border-rose-300 rounded-xl p-3 text-xs font-semibold text-rose-900">
                {t(
                  `حسابك مقيد حالياً من الحجز — السبب: ${banRecord?.reason}`,
                  `Your account is restricted from booking — Reason: ${banRecord?.reason}`
                )}
              </div>
            )}

            {isBookingsPaused && !isBanned && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs font-semibold text-amber-950">
                {t(
                  'أوقفت إدارة الموقع استقبال الحجوزات مؤقتاً.',
                  'New bookings are temporarily paused.'
                )}
              </div>
            )}

            {errorMsg && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs font-semibold text-rose-800">
                {errorMsg}
              </div>
            )}

            {/* 1. Duration & Contract Mode Selector (Monthly only for non-hotels; Daily allowed ONLY for hotel_room) */}
            {!activeRentalRequest && (
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {(canRentDaily || canRentStudentBed) ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleRentalUnitChange('month')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                          activeRentalUnit === 'month'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        {rentalUnitLabel('month')} ({formatNumber(apartment.monthlyRentEgp)} {t('ج.م', 'EGP')})
                      </button>

                      {canRentDaily && (
                        <button
                          type="button"
                          onClick={() => handleRentalUnitChange('day')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                            activeRentalUnit === 'day'
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          {rentalUnitLabel('day')} ({formatNumber(apartment.dailyRateEgp)} {t('ج.م', 'EGP')})
                        </button>
                      )}

                      {canRentStudentBed && (
                        <button
                          type="button"
                          onClick={() => handleRentalUnitChange('student_bed')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                            activeRentalUnit === 'student_bed'
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          {rentalUnitLabel('student_bed')} ({formatNumber(apartment.studentPricePerBedEgp)} {t('ج.م', 'EGP')})
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white">
                      {t('إيجار شهري:', 'Monthly Lease:')} {formatNumber(apartment.monthlyRentEgp)} {t('ج.م / شهر', 'EGP / mo')}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                    {activeRentalUnit === 'day' ? t('عدد الليالي:', 'Nights:') : t('عدد الشهور:', 'Months:')}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    value={unitsCountText}
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setUnitsCountText(normalizeNumericInput(e.target.value).slice(0, 3))
                    }
                    onBlur={() => {
                      const maxAllowed = activeRentalUnit === 'day' ? 90 : 36;
                      const num = Number(unitsCountText);
                      if (!unitsCountText.trim() || num < 1) {
                        setUnitsCountText('1');
                      } else if (num > maxAllowed) {
                        setUnitsCountText(String(maxAllowed));
                      }
                    }}
                    className="w-16 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />

                  {activeRentalUnit === 'student_bed' && (
                    <>
                      <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                        {t('السراير:', 'Beds:')}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        value={bedsBookedText}
                        onKeyDown={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setBedsBookedText(normalizeNumericInput(e.target.value).slice(0, 2))
                        }
                        onBlur={() => {
                          const maxBeds = Math.max(1, apartment.studentBedsCount || 1);
                          const num = Number(bedsBookedText);
                          if (!bedsBookedText.trim() || num < 1) {
                            setBedsBookedText('1');
                          } else if (num > maxBeds) {
                            setBedsBookedText(String(maxBeds));
                          }
                        }}
                        className="w-16 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </>
                  )}
                </div>
              </div>
            )}

            {/* 2. Clean Payment Summary Card (No multi-month multiplication, 100% Admin-Dynamic Rate) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5 text-xs shadow-2xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>
                  {activeRentalUnit === 'day'
                    ? t('قيمة الليلة الفندقية (أساس الشهر/الإقامة)', 'Nightly Room Rate')
                    : activeRentalUnit === 'student_bed'
                      ? t('قيمة الإيجار الشهري للسراير المختارة', 'Monthly Rent (Selected Beds)')
                      : t('قيمة الإيجار الشهري', 'Monthly Rent')}
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {formatNumber(unitPriceEgp)} {t('ج.م', 'EGP')}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-600">
                <span>
                  {activeRentalUnit === 'day'
                    ? t('مدة الإقامة المختارة', 'Selected Stay Duration')
                    : t('عدد الشهور المختارة', 'Selected Lease Months')}
                </span>
                <span className="font-mono font-semibold text-slate-900">
                  {durationSummaryLabel}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-600 pt-2 border-t border-slate-100">
                <div>
                  <span className="font-semibold text-slate-800">
                    {t(
                      `نسبة العمولة/المقدم المعتمدة من الإدارة (${formatNumber(ratePct)}%)`,
                      `Admin-Configured Rate (${formatNumber(ratePct)}%)`
                    )}
                  </span>
                  <span className="block text-[10px] text-slate-500">
                    {activeRentalUnit === 'day'
                      ? t('تُحتسب من قيمة الليلة الأولى فقط', 'Calculated on the 1st night only')
                      : t('تُحتسب وتُخصم من إيجار الشهر الأول فقط', 'Calculated & deducted from 1st month only')}
                  </span>
                </div>
                <span className="font-mono font-bold text-blue-700 shrink-0">
                  {formatNumber(onlineDueTotalEgp)} {t('ج.م', 'EGP')}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-600">
                <div>
                  <span className="font-semibold text-slate-800">
                    {t('المتبقي للمالك عند المقابلة والاستلام', 'Due to Landlord on Handover')}
                  </span>
                  <span className="block text-[10px] text-slate-500">
                    {t(
                      `المتبقي من الشهر الأول (${formatNumber(remainingPct)}%) بعد خصم نسبة الـ ${formatNumber(ratePct)}%`,
                      `Remaining from 1st month (${formatNumber(remainingPct)}%) after ${formatNumber(ratePct)}% deduction`
                    )}
                  </span>
                </div>
                <span className="font-mono font-bold text-emerald-700 shrink-0">
                  {formatNumber(remainingOnHandoverEgp)} {t('ج.م', 'EGP')}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 bg-blue-50/70 -mx-1 px-3 py-2.5 rounded-xl">
                <div>
                  <span className="text-sm font-bold text-slate-900 block">
                    {t(
                      `المستحق دفعه أونلاين الآن (${formatNumber(ratePct)}% من الشهر الأول)`,
                      `Due Online Now (${formatNumber(ratePct)}% of 1st Month)`
                    )}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {t(
                      `يمثل نسبة المنصة/مقدم الشهر الأول بناءً على إعدادات لوحة الأدمن (${formatNumber(ratePct)}%)`,
                      `Platform commission/1st-month advance based on Admin setting (${formatNumber(ratePct)}%)`
                    )}
                  </span>
                </div>
                <span className="font-mono text-lg font-extrabold text-blue-700 shrink-0">
                  {formatNumber(onlineDueTotalEgp)} {t('ج.م', 'EGP')}
                </span>
              </div>
            </div>

            {/* Honest Gateway Connection Notice when Paymob keys are NOT connected */}
            {gatewayStatus && !hasLivePaymob && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-950 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-bold block">
                    {t(
                      'بوابة البطاقات الإلكترونية (Paymob) غير متصلة حالياً بمفاتيح التاجر.',
                      'Live Paymob card gateway is currently offline (merchant credentials not connected).'
                    )}
                  </span>
                  <span className="text-amber-900">
                    {t(
                      'اختر بصدق بين: تسجيل تحويل يدوي موثق مع إرفاق الإثبات، أو الدفع من رصيد المحفظة، أو إرسال طلب حجز مبدئي للمالك.',
                      'Choose honestly between verified manual transfer with proof upload, wallet balance, or a preliminary booking request.'
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* 3. Honest Payment / Booking Channels */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-800">
                {t('اختر طريقة الإتمام المتاحة', 'Select Available Checkout Method')}
              </label>

              <div className={`grid grid-cols-1 ${hasLivePaymob ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-2`}>
                {hasLivePaymob && (
                  <button
                    type="button"
                    onClick={() => {
                      setCheckoutMode('paymob_live');
                      setGatewayPaymentRef(null);
                      setErrorMsg(null);
                    }}
                    className={`p-3 rounded-xl border text-start transition-all flex flex-col gap-1 ${
                      checkoutMode === 'paymob_live'
                        ? 'bg-blue-50 border-blue-700 ring-2 ring-blue-600/20'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <CreditCard className="w-4 h-4 text-blue-600" />
                      {checkoutMode === 'paymob_live' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-700" />}
                    </div>
                    <span className="text-xs font-bold text-slate-900">{t('بوابة Paymob المباشرة', 'Live Paymob')}</span>
                    <span className="text-[10px] text-slate-500">{t('بطاقة · محفظة · فوري', 'Card · Wallet · Fawry')}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setCheckoutMode('manual_transfer');
                    setErrorMsg(null);
                  }}
                  className={`p-3 rounded-xl border text-start transition-all flex flex-col gap-1 ${
                    checkoutMode === 'manual_transfer'
                      ? 'bg-blue-50 border-blue-700 ring-2 ring-blue-600/20'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Receipt className="w-4 h-4 text-emerald-600" />
                    {checkoutMode === 'manual_transfer' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-700" />}
                  </div>
                  <span className="text-xs font-bold text-slate-900">{t('تحويل مع إرفاق الإثبات', 'Transfer + Proof')}</span>
                  <span className="text-[10px] text-slate-500">{t('InstaPay أو محفظة كاش', 'InstaPay / Cash Wallet')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCheckoutMode('wallet_balance');
                    setErrorMsg(null);
                  }}
                  className={`p-3 rounded-xl border text-start transition-all flex flex-col gap-1 ${
                    checkoutMode === 'wallet_balance'
                      ? 'bg-blue-50 border-blue-700 ring-2 ring-blue-600/20'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Wallet className="w-4 h-4 text-indigo-600" />
                    {checkoutMode === 'wallet_balance' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-700" />}
                  </div>
                  <span className="text-xs font-bold text-slate-900">{t('رصيد المحفظة', 'Wallet Balance')}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {formatNumber(tenantWallet?.balanceEgp ?? 0)} {t('ج.م', 'EGP')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCheckoutMode('booking_request');
                    setErrorMsg(null);
                  }}
                  className={`p-3 rounded-xl border text-start transition-all flex flex-col gap-1 ${
                    checkoutMode === 'booking_request'
                      ? 'bg-blue-50 border-blue-700 ring-2 ring-blue-600/20'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <FileCheck2 className="w-4 h-4 text-slate-600" />
                    {checkoutMode === 'booking_request' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-700" />}
                  </div>
                  <span className="text-xs font-bold text-slate-900">{t('طلب حجز مبدئي', 'Booking Request')}</span>
                  <span className="text-[10px] text-slate-500">{t('تأكيد المالك قبل الدفع', 'Confirm before paying')}</span>
                </button>
              </div>

              {/* MODE A: Live Paymob (only shown if backend keys exist) */}
              {checkoutMode === 'paymob_live' && hasLivePaymob && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {gatewayStatus?.providers.card_meeza && (
                      <button
                        type="button"
                        onClick={() => {
                          setPaymobMethod('card_meeza');
                          setGatewayPaymentRef(null);
                        }}
                        className={`py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 ${
                          paymobMethod === 'card_meeza'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>{t('بطاقة / ميزة', 'Card')}</span>
                      </button>
                    )}
                    {gatewayStatus?.providers.mobile_wallet && (
                      <button
                        type="button"
                        onClick={() => {
                          setPaymobMethod('mobile_wallet');
                          setGatewayPaymentRef(null);
                        }}
                        className={`py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 ${
                          paymobMethod === 'mobile_wallet'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>{t('محفظة ذكية', 'Wallet')}</span>
                      </button>
                    )}
                    {gatewayStatus?.providers.fawry && (
                      <button
                        type="button"
                        onClick={() => {
                          setPaymobMethod('fawry');
                          setGatewayPaymentRef(null);
                        }}
                        className={`py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 ${
                          paymobMethod === 'fawry'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>Fawry</span>
                      </button>
                    )}
                  </div>

                  <PaymobGatewayBox
                    hideChannelSelector
                    purpose="booking"
                    amountEgp={Math.round(onlineDueTotalEgp)}
                    selectedMethod={paymobMethod}
                    onSelectMethod={setPaymobMethod}
                    userId={currentUser?.uid}
                    userEmail={currentUser?.email}
                    userName={currentUser?.displayName}
                    apartmentId={apartment.id}
                    apartmentTitle={apartment.title}
                    onReferenceReady={(ref, _m, isLive) => {
                      if (isLive) {
                        setGatewayPaymentRef(ref);
                        setErrorMsg(null);
                      }
                    }}
                  />

                  {gatewayPaymentRef && (
                    <button
                      type="button"
                      disabled={processing || isBanned || isBookingsPaused}
                      onClick={() => void handleConfirmEscrowPayment()}
                      className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {processing
                          ? t('جاري تسجيل العملية...', 'Recording Transaction...')
                          : t('تأكيد إتمام الدفع وإصدار الإيصال', 'Confirm Payment & Issue Receipt')}
                      </span>
                    </button>
                  )}
                </div>
              )}

              {/* MODE B: Manual Transfer with Official Receiving Details + Proof Upload */}
              {checkoutMode === 'manual_transfer' && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">
                      {t('بيانات التحويل الرسمية للمنصة', 'Official Platform Receiving Accounts')}
                    </span>
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => setManualChannel('instapay')}
                        className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                          manualChannel === 'instapay'
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        InstaPay
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualChannel('mobile_wallet')}
                        className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                          manualChannel === 'mobile_wallet'
                            ? 'bg-rose-600 text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {t('محفظة كاش', 'Cash Wallet')}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-500 block">
                          {t('عنوان InstaPay المعتمد:', 'InstaPay Address (IPA):')}
                        </span>
                        <span className="font-mono font-bold text-slate-900 select-all">
                          {merchantIpa}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(merchantIpa, 'ipa')}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700"
                      >
                        {copiedKey === 'ipa' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-500 block">
                          {t('محفظة الاستلام (فودافون/أورنج/اتصالات/وي):', 'Cash Wallet Number:')}
                        </span>
                        <span className="font-mono font-bold text-slate-900 select-all">
                          {merchantWallet}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(merchantWallet, 'wal')}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700"
                      >
                        {copiedKey === 'wal' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {t('الرقم المرجعي للتحويل أو رقم الهاتف المحوّل منه', 'Transfer Reference / Sender Phone')}
                    </label>
                    <input
                      type="text"
                      value={payerReferenceNote}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) => setPayerReferenceNote(e.target.value)}
                      placeholder={t('مثال: رقم عملية إنستاباي أو 010xxxxxxxx', 'e.g. InstaPay ref or sender number')}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-semibold text-slate-700">
                      {t('إرفاق صورة / سكرين شوت إثبات التحويل (يُحفظ في Supabase Storage)', 'Attach Transfer Receipt Proof (Supabase Storage)')}
                    </label>
                    <input
                      ref={proofInputRef}
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleProofUpload}
                      className="hidden"
                    />
                    {proofUrl ? (
                      <div className="bg-white border border-emerald-300 rounded-xl p-2.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="font-semibold text-emerald-800 truncate">
                            {t('تم رفع إثبات التحويل بنجاح ✓', 'Transfer proof uploaded ✓')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a
                            href={proofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-700 font-semibold hover:underline"
                          >
                            {t('معاينة', 'View')}
                          </a>
                          <button
                            type="button"
                            onClick={() => setProofUrl(null)}
                            className="text-rose-600 font-semibold hover:underline"
                          >
                            {t('حذف', 'Remove')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={uploadingProof}
                        onClick={() => proofInputRef.current?.click()}
                        className="w-full py-3 px-4 bg-white hover:bg-blue-50/50 border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl text-slate-700 font-semibold flex items-center justify-center gap-2 transition-colors"
                      >
                        <Upload className="w-4 h-4 text-blue-700" />
                        <span>
                          {uploadingProof
                            ? t('جاري رفع إثبات التحويل...', 'Uploading proof...')
                            : t('اضغط لرفع سكرين شوت التحويل أو الإيصال', 'Click to upload transfer screenshot / receipt')}
                        </span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={processing || uploadingProof || isBanned || isBookingsPaused}
                    onClick={() => void handleConfirmEscrowPayment()}
                    className="w-full py-3 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      {processing
                        ? t('جاري تسجيل المعاملة...', 'Recording Transaction...')
                        : t(
                            `تسجيل التحويل وإرسال الإثبات للمراجعة (${formatNumber(onlineDueTotalEgp)} ج.م)`,
                            `Submit Transfer & Proof for Review (${formatNumber(onlineDueTotalEgp)} EGP)`
                          )}
                    </span>
                  </button>
                </div>
              )}

              {/* MODE C: Instant Wallet Balance Payment */}
              {checkoutMode === 'wallet_balance' && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-bold text-blue-950">
                      <span>{t('الرصيد المتاح في محفظتك:', 'Available Wallet Balance:')}</span>
                      <span className="font-mono text-sm">{formatEgp(tenantWallet?.balanceEgp ?? 0)}</span>
                    </div>
                    {(tenantWallet?.balanceEgp ?? 0) >= onlineDueTotalEgp ? (
                      <p className="text-emerald-700 font-semibold">
                        {t(
                          `رصيدك يغطي نسبة الـ ${formatNumber(ratePct)}% المطلوبة — سيتم الخصم وتأكيد الحجز وفك قفل العنوان وهاتف المالك فوراً.`,
                          `Balance covers the ${formatNumber(ratePct)}% due — booking and contact unlock will execute immediately.`
                        )}
                      </p>
                    ) : (
                      <p className="text-amber-800 font-semibold">
                        {t(
                          `ينقصك ${formatEgp(onlineDueTotalEgp - (tenantWallet?.balanceEgp ?? 0))} في المحفظة. يمكنك اختيار «تحويل مع إرفاق الإثبات» أو «طلب حجز مبدئي».`,
                          `Short by ${formatEgp(onlineDueTotalEgp - (tenantWallet?.balanceEgp ?? 0))}. Use Transfer + Proof or Booking Request.`
                        )}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={
                      processing ||
                      isBanned ||
                      isBookingsPaused ||
                      (tenantWallet?.balanceEgp ?? 0) < onlineDueTotalEgp
                    }
                    onClick={() => void handleConfirmEscrowPayment()}
                    className="w-full py-3 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      {processing
                        ? t('جاري تنفيذ الدفع...', 'Processing Payment...')
                        : t(
                            `تأكيد الدفع من المحفظة (${formatNumber(onlineDueTotalEgp)} ج.م)`,
                            `Pay from Wallet (${formatNumber(onlineDueTotalEgp)} EGP)`
                          )}
                    </span>
                  </button>
                </div>
              )}

              {/* MODE D: Preliminary Booking Request (without immediate online payment) */}
              {checkoutMode === 'booking_request' && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 text-xs">
                  <p className="text-slate-700 leading-relaxed">
                    {t(
                      `سيتم إرسال طلب حجز مبدئي للمالك وتسجيله برقم مرجعي في سجل معاملاتك بانتظار موافقة المالك، وبعد الموافقة يمكنك إتمام السداد (${formatNumber(ratePct)}% من الشهر الأول) أو التحويل.`,
                      `Submits a preliminary booking request with a reference number. Complete the ${formatNumber(ratePct)}% transfer once the landlord approves.`
                    )}
                  </p>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {t('ملاحظة للمالك (اختياري)', 'Note for Landlord (Optional)')}
                    </label>
                    <input
                      type="text"
                      value={payerReferenceNote}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) => setPayerReferenceNote(e.target.value)}
                      placeholder={t('مثال: موعد المعاينة المفضل أو استفسار بسيط', 'e.g. Preferred viewing time')}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={processing || isBanned || isBookingsPaused}
                    onClick={() => void handleConfirmEscrowPayment()}
                    className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <FileCheck2 className="w-4 h-4" />
                    <span>
                      {processing
                        ? t('جاري إرسال الطلب...', 'Submitting Request...')
                        : t('إرسال طلب حجز مبدئي وتسجيل المرجع', 'Send Preliminary Booking Request')}
                    </span>
                  </button>
                </div>
              )}

              {onOpenPolicy && (
                <p className="text-[11px] text-slate-500 text-center pt-1">
                  {t('بمتابعة الحجز والدفع، فإنك توافق على', 'By proceeding, you agree to our')}{' '}
                  <button
                    type="button"
                    onClick={() => onOpenPolicy('terms')}
                    className="text-blue-700 font-semibold underline hover:text-blue-900"
                  >
                    {t('الشروط والأحكام', 'Terms & Conditions')}
                  </button>
                  {', '}
                  <button
                    type="button"
                    onClick={() => onOpenPolicy('privacy')}
                    className="text-blue-700 font-semibold underline hover:text-blue-900"
                  >
                    {t('سياسة الخصوصية', 'Privacy Policy')}
                  </button>
                  {' '}{t('و', 'and')}{' '}
                  <button
                    type="button"
                    onClick={() => onOpenPolicy('cancellation')}
                    className="text-blue-700 font-semibold underline hover:text-blue-900"
                  >
                    {t('سياسة الإلغاء والاسترداد', 'Cancellation & Refund Policy')}
                  </button>
                  .
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

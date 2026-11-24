import React, { useState, useEffect } from 'react';
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
  Clock,
  FileCheck2,
  ArrowRightLeft,
  Wallet,
  Unlock,
  Phone,
  MessageCircle,
  Key,
} from 'lucide-react';
import {
  db,
  logFirestoreDiagnostic,
  OperationType,
  PLATFORM_ADMIN_EMAIL,
} from '../lib/firebase';
import {
  ApartmentRecord,
  BannedUserRecord,
  PaymentMethodType,
  PlatformSettingsRecord,
  RentalRequestRecord,
  RentalUnitType,
  SHOWCASE_APARTMENTS,
  SUPPORTED_CURRENCIES,
  SupportedCurrency,
  TenantWalletRecord,
  VALIDATION_LIMITS,
  buildChatMessageId,
  buildChatThreadId,
  buildLiveCurrencyRates,
  buildNotificationId,
  computeOneTimeCommission,
  computeTextSha256,
  convertFromEgp,
  formatCurrencyValue,
  formatEgp,
  getCategoryCommissionPct,
  normalizeArabicDigits,
  normalizeNumericInput,
  resolveUnlockedApartmentContact,
} from '../lib/validation';
import { createSupabaseBooking } from '../lib/supabase';
import { useI18n } from '../lib/i18n';

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
  onBookingCompleted: () => void;
  onRentalRequestSubmitted: () => void;
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
  onRentalRequestSubmitted,
}) => {
  const {
    lang,
    t,
    formatNumber,
    categorySingularLabel,
    rentalUnitLabel,
    paymentMethodLabel,
    currencyLabel,
  } = useI18n();

  const defaultRentalUnit: RentalUnitType = activeRentalRequest
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
  const [paymentCurrency, setPaymentCurrency] = useState<SupportedCurrency>(
    activeRentalRequest?.paymentCurrency || apartment?.baseCurrency || 'EGP'
  );
  const [requestInitialStatus, setRequestInitialStatus] = useState<
    'awaiting_payment' | 'pending_approval'
  >('awaiting_payment');

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('card_meeza');
  const [cardNumber, setCardNumber] = useState('5078 0300 4412 8890');
  const [cardExpiry, setCardExpiry] = useState('08/29');
  const [cardCvv, setCardCvv] = useState('412');
  const [instapayHandle, setInstapayHandle] = useState('tenant.egypt@instapay');
  const [walletPhone, setWalletPhone] = useState('01011223344');
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('849201');
  const [processing, setProcessing] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<{
    bookingId: string;
    apartmentTitle: string;
    reference: string;
    totalEgp: number;
    commissionEgp: number;
    landlordNetEgp: number;
    paymentCurrency: SupportedCurrency;
    paidAmountInCurrency: number;
    exchangeRateToEgp: number;
    durationLabel: string;
  } | null>(null);

  useEffect(() => {
    if (!apartment) return;
    const nextUnit: RentalUnitType = activeRentalRequest
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
    setPaymentCurrency(
      activeRentalRequest?.paymentCurrency || apartment.baseCurrency || 'EGP'
    );
    setOtpStep(false);
    setErrorMsg(null);
    setReceiptData(null);
  }, [apartment?.id, activeRentalRequest?.id]);

  if (!apartment) return null;

  const canRentDaily = apartment.dailyRateEgp > 0 && apartment.billingMode === 'daily_or_monthly';
  const canRentStudentBed =
    apartment.studentBedsCount >= 1 && apartment.studentPricePerBedEgp >= 500;

  const effectiveBedsBooked =
    rentalUnit === 'student_bed'
      ? Math.max(1, Math.min(apartment.studentBedsCount || 1, bedsBooked || 1))
      : 0;

  const unitPriceEgp =
    rentalUnit === 'day'
      ? apartment.dailyRateEgp
      : rentalUnit === 'student_bed'
        ? apartment.studentPricePerBedEgp * effectiveBedsBooked
        : apartment.monthlyRentEgp;

  const effectiveCommissionRatePct = getCategoryCommissionPct(
    apartment.category,
    platformSettings ?? { commissionRatePct: apartment.commissionRatePct || commissionRatePct }
  );
  const safeUnitsCount = Math.max(1, Math.min(365, Math.round(unitsCount || 1)));
  const totalRentEgp = unitPriceEgp * safeUnitsCount;
  const platformCommissionEgp = computeOneTimeCommission(
    unitPriceEgp,
    effectiveCommissionRatePct
  );
  const landlordNetEgp = totalRentEgp - platformCommissionEgp;

  const isAdmin = Boolean(currentUser?.email === PLATFORM_ADMIN_EMAIL);
  const isBanned = Boolean(banRecord && !isAdmin);
  const isBookingsPaused = Boolean(
    platformSettings && !platformSettings.allowNewBookings && !isAdmin
  );
  const liveCurrencyRates = buildLiveCurrencyRates(platformSettings);
  const tenantDiscountPct = platformSettings?.tenantDiscountPct ?? 0;
  const escrowProtectionFeePct = platformSettings?.escrowProtectionFeePct ?? 0;

  const exchangeRateToEgp = liveCurrencyRates[paymentCurrency] || 1;
  const paidAmountInCurrency = convertFromEgp(
    totalRentEgp,
    paymentCurrency,
    liveCurrencyRates
  );
  const commissionInCurrency = convertFromEgp(
    platformCommissionEgp,
    paymentCurrency,
    liveCurrencyRates
  );
  const landlordNetInCurrency = convertFromEgp(
    landlordNetEgp,
    paymentCurrency,
    liveCurrencyRates
  );
  const promotionalRebateEgp =
    tenantDiscountPct > 0
      ? Math.round((platformCommissionEgp * tenantDiscountPct) / 100)
      : 0;

  /* ===== جدية الحجز 10% / المتبقي 90% عند الاستلام ===== */
  const earnestDepositEgp = Math.round(totalRentEgp * 0.10);
  const remainingOnHandoverEgp = totalRentEgp - earnestDepositEgp;

  const durationSummaryLabel =
    rentalUnit === 'day'
      ? t(`${safeUnitsCount} يوم`, `${safeUnitsCount} nights`)
      : rentalUnit === 'student_bed'
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

  const handleCreateRentalRequest = async () => {
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
    if (isBookingsPaused) {
      setErrorMsg(
        t(
          'إتمام الحجوزات الجديدة متوقف مؤقتاً بقرار من إدارة الموقع.',
          'New bookings are temporarily paused by platform administration.'
        )
      );
      return;
    }

    setSubmittingRequest(true);
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      let aptExistsInDb = false;
      let dbOwnerId = apartment.ownerId;
      try {
        const snap = await getDoc(doc(db, 'apartments', apartment.id));
        if (snap.exists()) {
          aptExistsInDb = true;
          dbOwnerId = String(snap.data().ownerId || apartment.ownerId);
        }
      } catch (readErr) {
        logFirestoreDiagnostic(readErr, OperationType.GET, `apartments/${apartment.id}`);
      }

      const isShowcase = SHOWCASE_APARTMENTS.some((s) => s.id === apartment.id);
      if (!aptExistsInDb && !isShowcase) {
        setSubmittingRequest(false);
        setErrorMsg(
          t(
            'تعذر العثور على هذه الوحدة في السجل النشط حالياً.',
            'Unit could not be found in the active registry.'
          )
        );
        return;
      }

      const targetLandlordId = aptExistsInDb ? dbOwnerId : 'showcase_owner';
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
          : 'وسط البلد';

      const currencyInfoNote =
        paymentCurrency !== 'EGP'
          ? ` (${formatCurrencyValue(paidAmountInCurrency, paymentCurrency, 'en')})`
          : '';

      const statusNote =
        requestInitialStatus === 'awaiting_payment'
          ? `بانتظار الدفع — إجمالي العقد ${formatEgp(totalRentEgp)} ج.م${currencyInfoNote} جاهز للسداد في بوابة الضمان.`
          : `طلب إيجار قيد مراجعة المالك${currencyInfoNote} وبانتظار الموافقة لفتح الدفع.`;

      const batch = writeBatch(db);
      batch.set(doc(db, 'rentalRequests', requestId), {
        apartmentId: apartment.id,
        apartmentTitle: safeTitle,
        category: apartment.category,
        governorate: safeGov,
        district: safeDistrict,
        tenantId: currentUser.uid,
        tenantDisplayName: safeTenantName,
        landlordId: targetLandlordId,
        landlordDisplayName: safeLandlordName,
        rentalUnit,
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
        status: requestInitialStatus,
        statusNote: statusNote.slice(0, 300),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const tenantNotifId = buildNotificationId('ntf_t');
      batch.set(doc(db, 'notifications', tenantNotifId), {
        recipientId: currentUser.uid,
        actorId: currentUser.uid,
        actorDisplayName: safeTenantName,
        recipientRole: 'tenant',
        statusType: requestInitialStatus,
        relatedEntityType: 'rental_request',
        relatedEntityId: requestId,
        apartmentId: apartment.id,
        apartmentTitle: safeTitle,
        governorate: safeGov,
        amountEgp: totalRentEgp,
        title:
          requestInitialStatus === 'awaiting_payment'
            ? 'بانتظار الدفع — تم تسجيل طلب الإيجار بنجاح'
            : 'قيد المراجعة — تم إرسال طلب الإيجار للمالك',
        message:
          requestInitialStatus === 'awaiting_payment'
            ? `طلبك لوحدة «${safeTitle}» مسجل الآن بحالة بانتظار الدفع بقيمة ${formatEgp(totalRentEgp)} ج.م${currencyInfoNote}.`
            : `تم إرسال طلب استئجار «${safeTitle}» إلى ${safeLandlordName} للموافقة قبل تفعيل السداد.`,
        isRead: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (targetLandlordId !== 'showcase_owner' && targetLandlordId !== currentUser.uid) {
        const landlordNotifId = buildNotificationId('ntf_l');
        batch.set(doc(db, 'notifications', landlordNotifId), {
          recipientId: targetLandlordId,
          actorId: currentUser.uid,
          actorDisplayName: safeTenantName,
          recipientRole: 'landlord',
          statusType: requestInitialStatus,
          relatedEntityType: 'rental_request',
          relatedEntityId: requestId,
          apartmentId: apartment.id,
          apartmentTitle: safeTitle,
          governorate: safeGov,
          amountEgp: totalRentEgp,
          title:
            requestInitialStatus === 'pending_approval'
              ? 'طلب إيجار جديد بانتظار موافقتك'
              : 'طلب إيجار جديد بانتظار دفع المستأجر',
          message: `قدّم ${safeTenantName} طلب إيجار على «${safeTitle}» بإجمالي ${formatEgp(totalRentEgp)} ج.م وصافي مستحقاتك ${formatEgp(landlordNetEgp)} ج.م.`,
          isRead: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      setSubmittingRequest(false);
      onRentalRequestSubmitted();
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.CREATE, `rentalRequests/${requestId}`);
      setErrorMsg(
        t(
          'تعذر تسجيل طلب الإيجار في السحابة حالياً. يرجى التأكد من الاتصال وتأكيد جلستك والمحاولة مرة أخرى.',
          'Could not submit your rental request right now. Please verify your connection and session and try again.'
        )
      );
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleProceedToOtp = async (e: React.FormEvent) => {
    e.preventDefault();
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
    setOtpStep(true);
  };

  const handleConfirmEscrowPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!currentUser) {
      await onRequestSignIn();
      return;
    }

    if (otpCode.trim().length < 4) {
      setErrorMsg(
        t(
          'يرجى إدخال رمز التحقق البنكي المكون من 6 أرقام.',
          'Please enter the 6-digit bank verification OTP code.'
        )
      );
      return;
    }

    setProcessing(true);
    const bookingId = apartment.id;
    const paymentReference = `EJAR-${Date.now().toString().slice(-6)}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;

    try {
      let aptSnap = await getDoc(doc(db, 'apartments', apartment.id));
      let targetLandlordId = aptSnap.exists()
        ? String(aptSnap.data().ownerId || apartment.ownerId)
        : apartment.ownerId;

      if (!aptSnap.exists() && currentUser.email === PLATFORM_ADMIN_EMAIL) {
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
        await seedBatch.commit();
        aptSnap = await getDoc(doc(db, 'apartments', apartment.id));
      } else if (!aptSnap.exists()) {
        setProcessing(false);
        setOtpStep(false);
        setErrorMsg(
          t(
            'هذه وحدة عرض نموذجية لم يُثبتها مالك المنصة بعد للسداد المباشر. اضغط على «حفظ كطلب إيجار (بانتظار الدفع)» أدناه لتتبع حالة الطلب بعملتك المختارة في لوحة عقودي، أو احجز أي وحدة مسجلة.',
            'This showcase unit has not yet been seeded into live escrow by the platform admin. Click "Save as Rental Request" below to track your multi-currency request in My Contracts, or book any user-listed unit.'
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

      const rentalBatch = writeBatch(db);
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
        rentalUnit,
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
        paymentMethod,
        paymentReference,
        status: 'escrow_paid',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      rentalBatch.delete(doc(db, 'apartments', apartment.id));

      if (
        activeRentalRequest &&
        (activeRentalRequest.status === 'pending_approval' ||
          activeRentalRequest.status === 'awaiting_payment')
      ) {
        rentalBatch.update(doc(db, 'rentalRequests', activeRentalRequest.id), {
          status: 'approved',
          paymentCurrency,
          exchangeRateToEgp,
          paidAmountInCurrency,
          statusNote: `تمت الموافقة النهائية وسداد الضمان برقم مرجعي ${paymentReference}.`,
          updatedAt: serverTimestamp(),
        });
      }

      const tenantApprovedNotifId = buildNotificationId('ntf_ap_t');
      rentalBatch.set(doc(db, 'notifications', tenantApprovedNotifId), {
        recipientId: currentUser.uid,
        actorId: currentUser.uid,
        actorDisplayName: safeTenantName,
        recipientRole: 'tenant',
        statusType: 'approved',
        relatedEntityType: 'booking',
        relatedEntityId: bookingId,
        apartmentId: apartment.id,
        apartmentTitle: safeTitle,
        governorate: safeGov,
        amountEgp: totalRentEgp,
        title: 'تمت الموافقة وتوثيق عقد الإيجار بالضمان',
        message: `تمت الموافقة النهائية على إيجار «${safeTitle}» وإيداع ${formatEgp(totalRentEgp)} ج.م (${formatCurrencyValue(
          paidAmountInCurrency,
          paymentCurrency,
          'en'
        )}) في حساب الضمان برقم مرجعي ${paymentReference}.`,
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
          statusType: 'approved',
          relatedEntityType: 'booking',
          relatedEntityId: bookingId,
          apartmentId: apartment.id,
          apartmentTitle: safeTitle,
          governorate: safeGov,
          amountEgp: landlordNetEgp,
          title: 'تمت الموافقة وسداد عقد إيجار وحدتك بالضمان',
          message: `قام ${safeTenantName} بسداد إيجار «${safeTitle}»؛ صافي مستحقاتك المحفوظة في الضمان ${formatEgp(landlordNetEgp)} ج.م لحين تسليم المفتاح.`,
          isRead: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const chatId = buildChatThreadId(currentUser.uid, apartment.id);
      const chatSnap = await getDoc(doc(db, 'chatThreads', chatId)).catch(() => null);
      if (chatSnap?.exists() && !chatSnap.data()?.commissionPaid) {
        rentalBatch.update(doc(db, 'chatThreads', chatId), {
          status: 'unlocked',
          commissionPaid: true,
          commissionPaymentMethod: paymentMethod,
          commissionPaymentRef: paymentReference,
          commissionPaidByUid: currentUser.uid,
          commissionPaidAt: serverTimestamp(),
          bookingId,
          lastMessagePreview: 'تم سداد العقد والعمولة بالضمان — الشات مفتوح وأرقام الهاتف ظاهرة',
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
          body: `تم سداد العقد ونسبة الموقع بالضمان (مرجع ${paymentReference}) — تم فتح المحادثة وإظهار أرقام الهاتف تلقائياً.`,
          isSystemNotice: true,
          createdAt: serverTimestamp(),
        });
        if (targetLandlordId === 'showcase_owner') {
          rentalBatch.set(doc(db, 'chatThreads', chatId, 'contactExchange', 'landlord'), {
            threadId: chatId,
            tenantId: currentUser.uid,
            landlordId: 'showcase_owner',
            userId: 'showcase_owner',
            role: 'landlord',
            phoneNumber: '01000000123',
            updatedAt: serverTimestamp(),
          });
        }
      }

      await rentalBatch.commit();

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
        rentalUnit,
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
        paymentMethod,
        paymentReference,
        status: 'escrow_paid',
        createdAtMs: Date.now(),
        escrowAmountEgp: platformCommissionEgp,
        commissionAmountEgp: platformCommissionEgp,
      });

      if (paymentMethod === 'wallet_balance' && onDeductWallet) {
        await onDeductWallet(totalRentEgp, apartment.id, apartment.title);
      }

      onApartmentRentedAndDeleted(apartment.id);

      setReceiptData({
        bookingId,
        apartmentTitle: apartment.title,
        reference: paymentReference,
        totalEgp: totalRentEgp,
        commissionEgp: platformCommissionEgp,
        landlordNetEgp,
        paymentCurrency,
        paidAmountInCurrency,
        exchangeRateToEgp,
        durationLabel: durationSummaryLabel,
      });
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.WRITE, `bookings/${bookingId}`);
      setOtpStep(false);
      setErrorMsg(
        err instanceof Error && err.message
          ? err.message
          : t(
              'تعذر إتمام السداد وتوثيق عقد الضمان حالياً. يرجى التأكد من أن الوحدة ما زالت متاحة ومن تفعيل جلستك ثم المحاولة مجدداً.',
              'Could not complete escrow payment right now. Please ensure the unit is still available and your session is active, then try again.'
            )
      );
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-xl">
        {/* Top Modal Header */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 px-5 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Lock className="w-3.5 h-3.5 text-blue-700" />
              <span>{t('بوابة الضمان العقاري وتحويل العملات', 'Escrow Checkout & Multi-Currency FX')}</span>
              <span aria-hidden="true">·</span>
              <span>{categorySingularLabel(apartment.category)}</span>
            </div>
            <h2 className="text-base font-bold text-slate-900 truncate mt-0.5">
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

        {/* Receipt View After Successful Escrow Settlement */}
        {receiptData ? (
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-emerald-950">
                  {t(
                    'تم إيداع مبلغ العقد في حساب الضمان وحذف الإعلان تلقائياً لمنع التكرار',
                    'Escrow Deposit Confirmed & Listing Automatically Locked'
                  )}
                </h3>
                <p className="text-xs text-emerald-800 mt-0.5 font-mono tabular-nums">
                  {t('المرجع البنكي:', 'Reference:')} {receiptData.reference}
                </p>
              </div>
            </div>

            {/* Unlocked Contact & Address Card (Requirement 6) */}
            {(() => {
              const unlocked = resolveUnlockedApartmentContact(apartment, true);
              return (
                <div className="bg-emerald-50/80 border border-emerald-300 rounded-2xl p-4 text-xs space-y-3">
                  <div className="flex items-center gap-2 text-emerald-950 font-bold text-sm">
                    <Unlock className="w-5 h-5 text-emerald-700" />
                    <span>{t('تم فك تشفير العنوان وهاتف المالك المباشر رسمياً!', 'Exact Address & Direct Landlord Phone Unlocked!')}</span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-emerald-200 space-y-1">
                    <span className="text-[10px] text-slate-500 block">{t('العنوان التفصيلي للوحدة:', 'Exact Detailed Address:')}</span>
                    <span className="font-bold text-slate-900 block leading-relaxed">{unlocked.exactAddress}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-200 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-500 block">{t('رقم هاتف المالك المباشر:', 'Landlord Mobile:')}</span>
                        <span className="font-mono font-bold text-slate-900">{unlocked.landlordPhone}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <a
                          href={`tel:${unlocked.landlordPhone}`}
                          className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg transition-colors"
                          title="اتصال هاتفي"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                        <a
                          href={`https://wa.me/2${unlocked.landlordPhone}`}
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
                        <span className="text-[10px] text-slate-500 block">{t('كود استلام المفتاح:', 'Check-in Code:')}</span>
                        <span className="font-mono font-bold text-emerald-700">{unlocked.checkInPasscode}</span>
                      </div>
                      <Key className="w-4 h-4 text-emerald-600" />
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="border border-slate-200 rounded-xl p-4 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('الوحدة محل التعاقد', 'Contracted Unit')}</span>
                <span className="font-semibold text-slate-900">{receiptData.apartmentTitle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('المدة المتفق عليها', 'Duration')}</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {receiptData.durationLabel}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  {t('المبلغ المسدد بعملة الدفع', 'Paid Amount in Selected Currency')}
                </span>
                <span className="font-mono tabular-nums font-bold text-blue-700">
                  {formatCurrencyValue(
                    receiptData.paidAmountInCurrency,
                    receiptData.paymentCurrency,
                    lang
                  )}
                </span>
              </div>
              {receiptData.paymentCurrency !== 'EGP' && (
                <div className="flex justify-between">
                  <span className="text-slate-500">
                    {t('سعر الصرف المعتمد مقابل الجنيه', 'Applied FX Rate to EGP')}
                  </span>
                  <span className="font-mono tabular-nums text-slate-700">
                    1 {receiptData.paymentCurrency} = {receiptData.exchangeRateToEgp}{' '}
                    {t('ج.م', 'EGP')}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-slate-100">
                <span className="text-slate-500">
                  {t('المعادل الرسمي المحفوظ بالضمان', 'Escrow Settlement Value (EGP)')}
                </span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {formatNumber(receiptData.totalEgp)} {t('ج.م', 'EGP')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  {t(
                    `عمولة قسم ${categorySingularLabel(apartment.category)} (${formatNumber(
                      effectiveCommissionRatePct
                    )}% مرة واحدة)`,
                    `${categorySingularLabel(apartment.category)} Fee (${formatNumber(
                      effectiveCommissionRatePct
                    )}%)`
                  )}
                </span>
                <span className="font-mono tabular-nums text-slate-700">
                  {formatNumber(receiptData.commissionEgp)} {t('ج.م', 'EGP')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  {t('صافي مستحقات المالك عند التسليم', 'Landlord Net Payout on Handover')}
                </span>
                <span className="font-mono tabular-nums font-semibold text-emerald-700">
                  {formatNumber(receiptData.landlordNetEgp)} {t('ج.م', 'EGP')}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onBookingCompleted}
              className="w-full py-3 px-4 bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold rounded-xl transition-colors"
            >
              {t('الانتقال إلى عقودي وإدارة التسليم', 'Go to My Contracts & Key Handover')}
            </button>
          </div>
        ) : (
          <div className="p-5 sm:p-6 space-y-5">
            {isBanned && (
              <div className="bg-rose-50 border border-rose-300 rounded-xl p-3.5 text-xs font-semibold text-rose-900 leading-relaxed">
                {t(
                  `حسابك مقيد حالياً من إتمام الحجوزات — السبب: ${banRecord?.reason}`,
                  `Your account is restricted from booking — Reason: ${banRecord?.reason}`
                )}
              </div>
            )}

            {isBookingsPaused && !isBanned && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 text-xs font-semibold text-amber-950 leading-relaxed">
                {t(
                  'أوقفت إدارة الموقع استقبال الحجوزات الجديدة مؤقتاً — سيتاح الحجز فور إعادة التفعيل.',
                  'New bookings are temporarily paused by site administration.'
                )}
              </div>
            )}

            {errorMsg && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 leading-relaxed">
                {errorMsg}
              </div>
            )}

            {/* Step 1: Leasing Mode & Duration */}
            {!activeRentalRequest && (
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-800">
                  {t('نظام التعاقد والمدة', 'Leasing Mode & Duration')}
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleRentalUnitChange('month')}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                      rentalUnit === 'month'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {rentalUnitLabel('month')} ({formatNumber(apartment.monthlyRentEgp)}{' '}
                    {t('ج.م', 'EGP')})
                  </button>

                  {canRentDaily && (
                    <button
                      type="button"
                      onClick={() => handleRentalUnitChange('day')}
                      className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                        rentalUnit === 'day'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {rentalUnitLabel('day')} ({formatNumber(apartment.dailyRateEgp)}{' '}
                      {t('ج.م', 'EGP')})
                    </button>
                  )}

                  {canRentStudentBed && (
                    <button
                      type="button"
                      onClick={() => handleRentalUnitChange('student_bed')}
                      className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                        rentalUnit === 'student_bed'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {rentalUnitLabel('student_bed')} (
                      {formatNumber(apartment.studentPricePerBedEgp)} {t('ج.م', 'EGP')})
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">
                      {rentalUnit === 'day'
                        ? t('عدد الأيام / الليالي', 'Number of Nights')
                        : t('عدد الشهور', 'Number of Months')}
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
                        const maxAllowed = rentalUnit === 'day' ? 90 : 36;
                        const num = Number(unitsCountText);
                        if (!unitsCountText.trim() || num < 1) {
                          setUnitsCountText('1');
                        } else if (num > maxAllowed) {
                          setUnitsCountText(String(maxAllowed));
                        }
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-start focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  {rentalUnit === 'student_bed' && (
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        {t(
                          `عدد السراير المطلوبة (بحد أقصى ${apartment.studentBedsCount})`,
                          `Beds Needed (Max ${apartment.studentBedsCount})`
                        )}
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
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-start focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Approved Payment Currency (Strictly Egyptian Pounds EGP) */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>
                    {t(
                      'عملة الدفع والتعاقد المعتمدة: الجنيه المصري (EGP / ج.م)',
                      'Approved Payment Currency: Egyptian Pound (EGP)'
                    )}
                  </span>
                </div>
                <span className="text-[11px] text-emerald-800 font-semibold bg-emerald-100/70 px-2 py-0.5 rounded-full">
                  {t('وفقاً للوائح البنك المركزي المصري', 'Official Egyptian Currency')}
                </span>
              </div>
              <p className="text-[11px] text-slate-600">
                {t(
                  'تتم كافة المعاملات المالية والحجوزات وحماية الضمان بالجنيه المصري (ج.م) حصراً دون أي عملات أجنبية.',
                  'All financial transactions, escrow guarantees, and contracts are settled strictly in Egyptian Pounds.'
                )}
              </p>

              {/* Financial Breakdown in Both Selected Currency & EGP */}
              <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">
                    {t('إجمالي قيمة العقد المطلوبة الآن', 'Total Contract Escrow Due')} (
                    {durationSummaryLabel})
                  </span>
                  <div className="text-end font-mono tabular-nums">
                    <div className="text-base font-bold text-blue-700">
                      {formatCurrencyValue(paidAmountInCurrency, paymentCurrency, lang)}
                    </div>
                    {paymentCurrency !== 'EGP' && (
                      <div className="text-[11px] text-slate-500">
                        ≈ {formatNumber(totalRentEgp)} {t('ج.م', 'EGP')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-slate-600">
                  <span>
                    {t(
                      `منها عمولة قسم ${categorySingularLabel(apartment.category)} لمرة واحدة (${formatNumber(
                        effectiveCommissionRatePct
                      )}%)`,
                      `Includes ${categorySingularLabel(apartment.category)} One-Time Fee (${formatNumber(
                        effectiveCommissionRatePct
                      )}%)`
                    )}
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {formatCurrencyValue(commissionInCurrency, paymentCurrency, lang)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span>
                    {t('صافي مستحقات المالك المحفوظة بالضمان', 'Landlord Net Escrow Payout')}
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-emerald-700">
                    {formatCurrencyValue(landlordNetInCurrency, paymentCurrency, lang)}
                  </span>
                </div>

                {tenantDiscountPct > 0 && (
                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-emerald-800 font-semibold">
                    <span>
                      {t(
                        `خصم ترويجي معتمد من الإدارة (${formatNumber(tenantDiscountPct)}%)`,
                        `Active Admin Promotional Rebate (${formatNumber(tenantDiscountPct)}%)`
                      )}
                    </span>
                    <span className="font-mono tabular-nums">
                      -{formatNumber(promotionalRebateEgp)} {t('ج.م استرداد فوري', 'EGP rebate')}
                    </span>
                  </div>
                )}

                {escrowProtectionFeePct > 0 && (
                  <div className="flex items-center justify-between text-slate-600">
                    <span>
                      {t(
                        `نسبة خدمة حماية الضمان المعتمدة (${formatNumber(escrowProtectionFeePct)}%)`,
                        `Escrow Protection Coverage Rate (${formatNumber(escrowProtectionFeePct)}%)`
                      )}
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-slate-800">
                      {formatNumber(escrowProtectionFeePct)}%
                    </span>
                  </div>
                )}

                {/* Earnest Deposit 10% / Remaining 90% */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 space-y-1.5 mt-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-emerald-900">
                      {t('جدية الحجز 10% / المتبقي 90% عند الاستلام', 'Earnest Deposit 10% / Remaining 90% on Handover')}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold">
                      {t('إلزامي', 'Required')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-blue-50 p-1.5 rounded border border-blue-200">
                      <span className="text-[10px] text-blue-700 block">
                        {t('10% تُدفع الآن أونلاين', '10% Paid Online Now')}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-blue-700 block">
                        {formatCurrencyValue(convertFromEgp(earnestDepositEgp, paymentCurrency, liveCurrencyRates), paymentCurrency, lang)}
                      </span>
                    </div>
                    <div className="bg-emerald-50 p-1.5 rounded border border-emerald-200">
                      <span className="text-[10px] text-emerald-700 block">
                        {t('90% عند استلام الوحدة', '90% on Unit Handover')}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-emerald-700 block">
                        {formatCurrencyValue(convertFromEgp(remainingOnHandoverEgp, paymentCurrency, liveCurrencyRates), paymentCurrency, lang)}
                      </span>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 italic">
                    {t('يتم دفع الـ 90% للمالك مباشرة عند استلام الوحدة ومطابقة المواصفات.', 'The 90% is paid to the landlord directly upon key handover and unit inspection.')}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3: Payment Channel Form OR Bank OTP Confirmation */}
            {!otpStep ? (
              <form onSubmit={handleProceedToOtp} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    {t('وسيلة السداد المعتمدة', 'Payment Method')}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {(
                      [
                        { id: 'wallet_balance', icon: Wallet, label: t('رصيد المحفظة', 'Wallet Balance') },
                        { id: 'card_meeza', icon: CreditCard, label: t('بطاقة / ميزة', 'Card / Meeza') },
                        { id: 'instapay', icon: Building, label: 'InstaPay' },
                        { id: 'mobile_wallet', icon: Smartphone, label: t('محفظة ذكية', 'Mobile Wallet') },
                        { id: 'fawry', icon: Receipt, label: 'Fawry Pay' },
                      ] as const
                    ).map((m) => {
                      const Icon = m.icon;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setPaymentMethod(m.id)}
                          className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap ${
                            paymentMethod === m.id
                              ? 'bg-blue-50 border-blue-600 text-blue-800'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {paymentMethodLabel(paymentMethod)}
                  </div>
                </div>

                {paymentMethod === 'wallet_balance' && (
                  <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs space-y-2">
                    <div className="flex items-center justify-between font-bold text-blue-950">
                      <span>{t('الرصيد المتاح في محفظتك لجدية الحجز:', 'Available Wallet Deposit Balance:')}</span>
                      <span className="font-mono text-sm">{formatEgp(tenantWallet?.balanceEgp ?? 0)}</span>
                    </div>
                    {(tenantWallet?.balanceEgp ?? 0) >= totalRentEgp ? (
                      <p className="text-emerald-700 font-semibold">
                        {t('رصيدك يغطي المبلغ المطلوب بالكامل. سيتم الخصم وتأكيد الحجز وتفعيل العقد فوراً.', 'Balance covers full amount. Booking will be confirmed immediately.')}
                      </p>
                    ) : (
                      <p className="text-amber-800">
                        {t(
                          `الرصيد المتاح يغطي جزءاً من الحجز. يمكنك شحن الرصيد المتبقي (${formatEgp(totalRentEgp - (tenantWallet?.balanceEgp ?? 0))}) من المحفظة أو الدفع ببطاقة بنكية / إنستاباي.`,
                          `Partial balance available. Top up remaining balance or pay via card/InstaPay.`
                        )}
                      </p>
                    )}
                  </div>
                )}

                {paymentMethod === 'card_meeza' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-3">
                      <label className="block text-xs text-slate-600 mb-1">
                        {t('رقم البطاقة البنكية', 'Card Number')}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        required
                        value={cardNumber}
                        onKeyDown={(e) => e.stopPropagation()}
                        onChange={(e) => setCardNumber(normalizeArabicDigits(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-start"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-slate-600 mb-1">
                        {t('تاريخ الانتهاء', 'Expiry (MM/YY)')}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        required
                        value={cardExpiry}
                        onKeyDown={(e) => e.stopPropagation()}
                        onChange={(e) => setCardExpiry(normalizeArabicDigits(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-start"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">CVV</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        required
                        value={cardCvv}
                        onKeyDown={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setCardCvv(normalizeNumericInput(e.target.value).slice(0, 4))
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-start"
                      />
                    </div>
                  </div>
                )}

                {paymentMethod === 'instapay' && (
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">
                      {t('عنوان الدفع الفوري (IPA)', 'InstaPay Address (IPA)')}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      required
                      value={instapayHandle}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) => setInstapayHandle(normalizeArabicDigits(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono text-start"
                    />
                  </div>
                )}

                {paymentMethod === 'mobile_wallet' && (
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">
                      {t('رقم المحفظة الإلكترونية المصرية', 'Egyptian Mobile Wallet Number')}
                    </label>
                    <input
                      type="tel"
                      inputMode="tel"
                      dir="ltr"
                      required
                      value={walletPhone}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setWalletPhone(normalizeNumericInput(e.target.value).slice(0, 11))
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-start"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isBanned || isBookingsPaused}
                  className="w-full py-3 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {t('سداد في حساب الضمان:', 'Pay into Escrow:')}{' '}
                    {formatCurrencyValue(paidAmountInCurrency, paymentCurrency, lang)}
                  </span>
                </button>
              </form>
            ) : (
              <form
                onSubmit={handleConfirmEscrowPayment}
                className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 space-y-3"
              >
                <div className="text-xs font-bold text-slate-900">
                  {t(
                    'التأكيد البنكي ثلاثي الأبعاد (3D-Secure OTP)',
                    '3D-Secure Bank OTP Verification'
                  )}
                </div>
                <p className="text-xs text-slate-600">
                  {t(
                    `أدخل رمز التحقق لتفويض إيداع ${formatCurrencyValue(
                      paidAmountInCurrency,
                      paymentCurrency,
                      lang
                    )} في حساب الضمان:`,
                    `Enter the 6-digit OTP to authorize ${formatCurrencyValue(
                      paidAmountInCurrency,
                      paymentCurrency,
                      lang
                    )} into escrow:`
                  )}
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  maxLength={6}
                  required
                  value={otpCode}
                  onKeyDown={(e) => e.stopPropagation()}
                  onChange={(e) => setOtpCode(normalizeNumericInput(e.target.value).slice(0, 6))}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-center text-base font-bold font-mono tracking-widest"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={processing}
                    className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
                  >
                    {processing
                      ? t('جاري التوثيق...', 'Settling Escrow...')
                      : t('تأكيد السداد النهائي وإصدار العقد', 'Confirm Final Escrow Payment')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOtpStep(false)}
                    className="py-2.5 px-3 bg-white border border-slate-200 text-xs font-semibold text-slate-700 rounded-lg"
                  >
                    {t('رجوع', 'Back')}
                  </button>
                </div>
              </form>
            )}

            {/* Save Transparent Rental Request Option (For Awaiting Payment / Landlord Approval Tracking) */}
            {!activeRentalRequest && (
              <div className="pt-4 border-t border-slate-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 inline-flex items-center gap-1.5">
                    <FileCheck2 className="w-4 h-4 text-blue-700" />
                    <span>
                      {t(
                        'أو سجّل طلب إيجار رسمي لمتابعة حالته في «عقودي»',
                        'Or Submit a Tracked Rental Request in "My Contracts"'
                      )}
                    </span>
                  </span>
                  <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setRequestInitialStatus('awaiting_payment')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-colors whitespace-nowrap ${
                        requestInitialStatus === 'awaiting_payment'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600'
                      }`}
                    >
                      {t('بانتظار الدفع', 'Awaiting Payment')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRequestInitialStatus('pending_approval')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-colors whitespace-nowrap ${
                        requestInitialStatus === 'pending_approval'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600'
                      }`}
                    >
                      {t('موافقة المالك أولاً', 'Landlord Approval')}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={submittingRequest || isBanned || isBookingsPaused}
                  onClick={handleCreateRentalRequest}
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 border border-slate-300 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Clock className="w-3.5 h-3.5 text-slate-600" />
                  <span>
                    {submittingRequest
                      ? t('جاري تسجيل الطلب...', 'Submitting Request...')
                      : requestInitialStatus === 'awaiting_payment'
                        ? t(
                            'حفظ كطلب إيجار (بانتظار الدفع) مع إشعار فوري',
                            'Save as Rental Request (Awaiting Payment)'
                          )
                        : t(
                            'إرسال طلب للمالك للموافقة مع تفعيل الإشعارات',
                            'Send Request for Landlord Approval'
                          )}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

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
  isPlatformAdminEmail,
} from '../lib/firebase';
import {
  ApartmentRecord,
  BannedUserRecord,
  PaymentMethodType,
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
  getCategoryCommissionPct,
  normalizeNumericInput,
  resolveUnlockedApartmentContact,
} from '../lib/validation';
import { createSupabaseBooking } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { PaymobGatewayBox } from './PaymobGatewayBox';
import { GatewayPaymentMethod } from '../lib/payments';

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
}) => {
  const {
    t,
    formatNumber,
    categorySingularLabel,
    rentalUnitLabel,
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
  const paymentCurrency: SupportedCurrency = 'EGP';

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('card_meeza');
  const [gatewayPaymentRef, setGatewayPaymentRef] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<{
    bookingId: string;
    apartmentTitle: string;
    reference: string;
    totalEgp: number;
    commissionEgp: number;
    landlordNetEgp: number;
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
    setGatewayPaymentRef(null);
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

  /* ===== نظام الـ 20% الموحد لضمان المنصة =====
   * المستأجر يسدد 20% أونلاين بالضمان:
   *  - 10% عمولة المستأجر الرسمية للمنصة
   *  - 10% دفعة مقدمة من إيجار الشهر الأول (عمولة المالك محصلة مقدماً للمنصة وتخصم عند مقابلة المالك)
   * المتبقي للمالك عند المقابلة واستلام المفتاح والتوقيع:
   *  - 90% فقط من الإيجار (خصم الـ 10% المدفوعة مقدماً)
   */
  const escrowPricing = computeEjarEscrowPricing(unitPriceEgp);
  const onlineDueTotalEgp = escrowPricing.onlineDueTotalEgp;
  const remainingOnHandoverEgp = totalRentEgp - escrowPricing.landlordCommissionEgp;
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

    if (paymentMethod === 'wallet_balance' && (tenantWallet?.balanceEgp ?? 0) < onlineDueTotalEgp) {
      setErrorMsg(
        t(
          `رصيد المحفظة الحالي (${formatEgp(tenantWallet?.balanceEgp ?? 0)}) غير كافٍ لسداد مبلغ الـ 20% (${formatEgp(onlineDueTotalEgp)}). يرجى شحن المحفظة أو الدفع عبر البطاقة / إنستاباي.`,
          `Insufficient wallet balance for the 20% online payment.`
        )
      );
      return;
    }

    if (paymentMethod !== 'wallet_balance' && !gatewayPaymentRef) {
      setErrorMsg(
        t(
          'يرجى إتمام خطوة الدفع عبر البوابة أعلاه أولاً قبل تأكيد الحجز.',
          'Please complete the payment step through the gateway above first.'
        )
      );
      return;
    }

    setProcessing(true);
    const bookingId = apartment.id;
    const paymentReference =
      gatewayPaymentRef ||
      `EJAR-${Date.now().toString().slice(-6)}-${Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase()}`;

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
      if (aptSnap?.exists()) {
        rentalBatch.delete(doc(db, 'apartments', apartment.id));
      }

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
        amountEgp: onlineDueTotalEgp,
        title: 'تمت الموافقة وتوثيق عقد الإيجار بالضمان',
        message: `تمت الموافقة النهائية على إيجار «${safeTitle}» وإيداع ${formatEgp(onlineDueTotalEgp)} ج.م (20% بالضمان) برقم مرجعي ${paymentReference}.`,
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
        escrowAmountEgp: onlineDueTotalEgp,
        commissionAmountEgp: onlineDueTotalEgp,
      });

      if (paymentMethod === 'wallet_balance' && onDeductWallet) {
        await onDeductWallet(onlineDueTotalEgp, apartment.id, apartment.title);
      }

      onApartmentRentedAndDeleted(apartment.id);

      setReceiptData({
        bookingId,
        apartmentTitle: apartment.title,
        reference: paymentReference,
        totalEgp: onlineDueTotalEgp,
        commissionEgp: escrowPricing.tenantCommissionEgp,
        landlordNetEgp: remainingOnHandoverEgp,
        durationLabel: durationSummaryLabel,
      });
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.WRITE, `bookings/${bookingId}`);
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

  const gatewayChannels: Array<{
    id: PaymentMethodType;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    sublabel: string;
    accent: string;
  }> = [
    {
      id: 'card_meeza',
      icon: CreditCard,
      label: t('بطاقة / ميزة', 'Card / Meeza'),
      sublabel: 'Visa · Mastercard · Meeza',
      accent: 'text-blue-600',
    },
    {
      id: 'mobile_wallet',
      icon: Smartphone,
      label: t('محفظة إلكترونية', 'Mobile Wallet'),
      sublabel: t('فودافون · أورنج · اتصالات · وي', 'Vodafone · Orange · Etisalat · WE'),
      accent: 'text-rose-600',
    },
    {
      id: 'fawry',
      icon: Receipt,
      label: t('فوري باي (Fawry)', 'Fawry Pay'),
      sublabel: t('كود دفع فوري رقمي', 'Instant Fawry Code'),
      accent: 'text-amber-600',
    },
    {
      id: 'instapay',
      icon: Building,
      label: t('إنستاباي (InstaPay)', 'InstaPay'),
      sublabel: t('تحويل لحظي IPA', 'Instant IPA Transfer'),
      accent: 'text-emerald-600',
    },
    {
      id: 'wallet_balance',
      icon: Wallet,
      label: t('رصيد المحفظة', 'Wallet Balance'),
      sublabel: `${formatNumber(tenantWallet?.balanceEgp ?? 0)} ${t('ج.م', 'EGP')}`,
      accent: 'text-indigo-600',
    },
  ];

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
              <span>{t('بوابة الدفع وإتمام الحجز الآمن', 'Secure Payment Gateway')}</span>
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

        {/* Receipt View After Successful Settlement */}
        {receiptData ? (
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-emerald-950">
                  {t('تم تأكيد الدفع وإتمام الحجز بنجاح', 'Payment Confirmed & Booking Locked')}
                </h3>
                <p className="text-xs text-emerald-800 mt-0.5 font-mono tabular-nums">
                  {t('المرجع:', 'Ref:')} {receiptData.reference}
                </p>
              </div>
            </div>

            {(() => {
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
            })()}

            <div className="border border-slate-200 rounded-xl p-4 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('الوحدة', 'Unit')}</span>
                <span className="font-semibold text-slate-900">{receiptData.apartmentTitle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('المدة', 'Duration')}</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {receiptData.durationLabel}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-100">
                <span className="text-slate-600 font-semibold">
                  {t('المسدد أونلاين الآن (20%)', 'Paid Online Now (20%)')}
                </span>
                <span className="font-mono tabular-nums font-bold text-blue-700">
                  {formatNumber(receiptData.totalEgp)} {t('ج.م', 'EGP')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  {t('المتبقي للمالك عند المقابلة والاستلام (90%)', 'Due to Landlord on Handover (90%)')}
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
              {t('الانتقال إلى عقودي', 'Go to My Contracts')}
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

            {/* 1. Compact Duration Selector */}
            {!activeRentalRequest && (
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRentalUnitChange('month')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                      rentalUnit === 'month'
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
                        rentalUnit === 'day'
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
                        rentalUnit === 'student_bed'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {rentalUnitLabel('student_bed')} ({formatNumber(apartment.studentPricePerBedEgp)} {t('ج.م', 'EGP')})
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                    {rentalUnit === 'day' ? t('عدد الليالي:', 'Nights:') : t('عدد الشهور:', 'Months:')}
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
                    className="w-16 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />

                  {rentalUnit === 'student_bed' && (
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

            {/* 2. Clean Payment Summary Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5 text-xs shadow-2xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>
                  {t('قيمة الإيجار الكلية', 'Total Rent')} ({durationSummaryLabel})
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {formatNumber(totalRentEgp)} {t('ج.م', 'EGP')}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-600">
                <span>
                  {t('المتبقي للمالك عند المقابلة والاستلام', 'Due to Landlord on Handover')}
                </span>
                <span className="font-mono font-bold text-emerald-700">
                  {formatNumber(remainingOnHandoverEgp)} {t('ج.م', 'EGP')}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2.5 border-t border-slate-100">
                <div>
                  <span className="text-sm font-bold text-slate-900 block">
                    {t('المطلوب دفعه الآن أونلاين (20%)', 'Due Online Now (20%)')}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {t(
                      '10% عمولة المنصة + 10% مقدم إيجار يُخصم من أول شهر عند مقابلة المالك',
                      '10% platform fee + 10% advance deducted from 1st month on handover'
                    )}
                  </span>
                </div>
                <span className="font-mono text-lg font-extrabold text-blue-700 shrink-0">
                  {formatNumber(onlineDueTotalEgp)} {t('ج.م', 'EGP')}
                </span>
              </div>
            </div>

            {/* 3. Unified Payment Gateway Section */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-800">
                {t('اختر وسيلة الدفع', 'Select Payment Method')}
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {gatewayChannels.map((ch) => {
                  const Icon = ch.icon;
                  const active = paymentMethod === ch.id;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => {
                        setPaymentMethod(ch.id);
                        setGatewayPaymentRef(null);
                        setErrorMsg(null);
                      }}
                      className={`p-2.5 rounded-xl border text-start transition-all flex flex-col gap-1 min-h-[72px] ${
                        active
                          ? 'bg-blue-50 border-blue-700 ring-2 ring-blue-600/20 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <Icon className={`w-4 h-4 ${ch.accent}`} />
                        {active && <CheckCircle2 className="w-3.5 h-3.5 text-blue-700" />}
                      </div>
                      <span className="text-xs font-bold text-slate-900 leading-tight">{ch.label}</span>
                      <span className="text-[10px] text-slate-500 leading-tight truncate">{ch.sublabel}</span>
                    </button>
                  );
                })}
              </div>

              {paymentMethod === 'wallet_balance' ? (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-bold text-blue-950">
                      <span>{t('الرصيد المتاح في محفظتك:', 'Available Wallet Balance:')}</span>
                      <span className="font-mono text-sm">{formatEgp(tenantWallet?.balanceEgp ?? 0)}</span>
                    </div>
                    {(tenantWallet?.balanceEgp ?? 0) >= onlineDueTotalEgp ? (
                      <p className="text-emerald-700 font-semibold">
                        {t(
                          'رصيدك كافٍ — سيتم الخصم وتأكيد الحجز وفك قفل العنوان وهاتف المالك فوراً.',
                          'Balance sufficient — booking and contact unlock will execute immediately.'
                        )}
                      </p>
                    ) : (
                      <p className="text-amber-800 font-semibold">
                        {t(
                          `ينقصك ${formatEgp(onlineDueTotalEgp - (tenantWallet?.balanceEgp ?? 0))} في المحفظة. اشحن المحفظة أو اختر الدفع بالبطاقة / إنستاباي.`,
                          `Short by ${formatEgp(onlineDueTotalEgp - (tenantWallet?.balanceEgp ?? 0))}. Top up or pay via card/InstaPay.`
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
              ) : (
                <div className="space-y-3">
                  <PaymobGatewayBox
                    hideChannelSelector
                    purpose="booking"
                    amountEgp={Math.round(onlineDueTotalEgp)}
                    selectedMethod={paymentMethod as GatewayPaymentMethod}
                    onSelectMethod={(m) => setPaymentMethod(m)}
                    userId={currentUser?.uid}
                    userEmail={currentUser?.email}
                    userName={currentUser?.displayName}
                    apartmentId={apartment.id}
                    apartmentTitle={apartment.title}
                    onReferenceReady={(ref) => {
                      setGatewayPaymentRef(ref);
                      setErrorMsg(null);
                    }}
                  />

                  {gatewayPaymentRef && (
                    <button
                      type="button"
                      disabled={processing || isBanned || isBookingsPaused}
                      onClick={() => void handleConfirmEscrowPayment()}
                      className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {processing
                          ? t('جاري تأكيد الحجز...', 'Confirming Booking...')
                          : t(
                              'تأكيد إتمام الدفع وإصدار العقد وفك قفل المالك',
                              'Confirm Payment & Unlock Landlord Contact'
                            )}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

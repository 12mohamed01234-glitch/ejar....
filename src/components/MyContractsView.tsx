import React, { useState, useMemo, useEffect } from 'react';
import { User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import {
  Bell,
  BellRing,
  CheckCheck,
  CheckCircle2,
  Clock,
  XCircle,
  TrendingDown,
  FileText,
  UserCheck,
  Building2,
  Heart,
  Trash2,
  Star,
  PlusCircle,
  Tag,
  Scale,
  X,
  Check,
  Minus,
  SlidersHorizontal,
  Lock,
  Unlock,
  ShieldAlert,
  MessageSquareLock,
} from 'lucide-react';
import { db, logFirestoreDiagnostic, OperationType } from '../lib/firebase';
import {
  ApartmentRecord,
  BookingRecord,
  ChatThreadRecord,
  FavoriteRecord,
  NotificationRecord,
  NotificationStatusType,
  PlatformSettingsRecord,
  RentalRequestRecord,
  ReviewRecord,
  SHOWCASE_APARTMENTS,
  TenantCategory,
  TenantVerificationRecord,
  VALIDATION_LIMITS,
  buildBookingDemandSignalWritePayload,
  buildLiveCurrencyRates,
  buildNotificationId,
  computeFileSha256,
  computeTextSha256,
  convertFromEgp,
  formatCurrencyValue,
  formatEgp,
  getCategoryCommissionPct,
  normalizeNumericInput,
  snapRentToMultipleOf10,
  snapToMultipleOf10,
} from '../lib/validation';
import { useI18n } from '../lib/i18n';
import { ApartmentImage } from './ApartmentImage';

interface MyContractsViewProps {
  currentUser: User | null;
  commissionRatePct: number;
  platformSettings?: PlatformSettingsRecord;
  myNotifications: NotificationRecord[];
  myTenantRequests: RentalRequestRecord[];
  myLandlordRequests: RentalRequestRecord[];
  myTenantVerification: TenantVerificationRecord | null;
  myApartments: ApartmentRecord[];
  myTenantBookings: BookingRecord[];
  myLandlordBookings: BookingRecord[];
  myFavorites: FavoriteRecord[];
  myChatThreads: ChatThreadRecord[];
  priceAlertApartmentIds: Set<string>;
  availableApartments: ApartmentRecord[];
  allReviews: ReviewRecord[];
  togglingFavoriteId: string | null;
  onRequestSignIn: () => Promise<void>;
  onOpenListingWizard: () => void;
  onExploreMap: () => void;
  onOpenReviewModal: (booking: BookingRecord) => void;
  onRemoveFavorite: (fav: FavoriteRecord) => void;
  onTogglePriceAlert: (apt: ApartmentRecord) => void;
  onSelectApartment: (apt: ApartmentRecord) => void;
  onRentApartment: (apt: ApartmentRecord, activeReq?: RentalRequestRecord) => void;
  onOpenChatForApartment: (apt: ApartmentRecord) => void;
  onOpenChatThread: (thread: ChatThreadRecord) => void;
}

type ContractsSubTab =
  | 'notifications'
  | 'chats'
  | 'tenant_contracts'
  | 'tenant_kyc'
  | 'landlord_hub'
  | 'favorites';

export const MyContractsView: React.FC<MyContractsViewProps> = ({
  currentUser,
  commissionRatePct,
  platformSettings,
  myNotifications,
  myTenantRequests,
  myLandlordRequests,
  myTenantVerification,
  myApartments,
  myTenantBookings,
  myLandlordBookings,
  myFavorites,
  myChatThreads,
  priceAlertApartmentIds,
  availableApartments,
  allReviews,
  togglingFavoriteId,
  onRequestSignIn,
  onOpenListingWizard,
  onExploreMap,
  onOpenReviewModal,
  onRemoveFavorite,
  onTogglePriceAlert,
  onSelectApartment,
  onRentApartment,
  onOpenChatForApartment,
  onOpenChatThread,
}) => {
  const {
    lang,
    t,
    formatNumber,
    formatTimeAgo,
    govLabel,
    categorySingularLabel,
    furnishingLabel,
    tenantCategoryLabel,
    requestStatusLabel,
    notificationStatusLabel,
  } = useI18n();

  const [subTab, setSubTab] = useState<ContractsSubTab>('notifications');
  const [notifFilter, setNotifFilter] = useState<'all' | NotificationStatusType>('all');

  // Tenant KYC Form State
  const [tenantCategory, setTenantCategory] = useState<TenantCategory>(
    myTenantVerification?.tenantCategory || 'family'
  );
  const [fullLegalName, setFullLegalName] = useState(currentUser?.displayName || '');
  const [nationalIdNumber, setNationalIdNumber] = useState('30101010105566');
  const [tenantPhone, setTenantPhone] = useState('01098765432');
  const [occupationOrUniversity, setOccupationOrUniversity] = useState('');
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [supportingDocFile, setSupportingDocFile] = useState<File | null>(null);
  const [submittingKyc, setSubmittingKyc] = useState(false);
  const [kycMessage, setKycMessage] = useState<string | null>(null);

  // Landlord Inline Price Update State (to trigger Price Drop Alerts cleanly)
  const [editingPriceAptId, setEditingPriceAptId] = useState<string | null>(null);
  const [draftMonthlyText, setDraftMonthlyText] = useState<string>('15000');
  const [draftDailyText, setDraftDailyText] = useState<string>('0');
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Favorites Unit Comparison State (up to 3 units)
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [isCompareDrawerOpen, setIsCompareDrawerOpen] = useState(false);
  const [compareOnlyDiffs, setCompareOnlyDiffs] = useState(false);
  const [compareNotice, setCompareNotice] = useState<string | null>(null);

  useEffect(() => {
    if (myTenantVerification?.tenantCategory) {
      setTenantCategory(myTenantVerification.tenantCategory);
    }
  }, [myTenantVerification?.tenantCategory]);

  useEffect(() => {
    if (currentUser?.displayName && !fullLegalName.trim()) {
      setFullLegalName(currentUser.displayName);
    }
  }, [currentUser?.displayName, fullLegalName]);

  useEffect(() => {
    const validIds = new Set(myFavorites.map((f) => f.apartmentId));
    setCompareIds((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [myFavorites]);

  useEffect(() => {
    if (compareIds.length === 0 && isCompareDrawerOpen) {
      setIsCompareDrawerOpen(false);
    }
  }, [compareIds.length, isCompareDrawerOpen]);

  useEffect(() => {
    if (!isCompareDrawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsCompareDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isCompareDrawerOpen]);

  const unreadCount = useMemo(
    () => myNotifications.filter((n) => !n.isRead).length,
    [myNotifications]
  );

  const filteredNotifications = useMemo(() => {
    if (notifFilter === 'all') return myNotifications;
    return myNotifications.filter((n) => n.statusType === notifFilter);
  }, [myNotifications, notifFilter]);

  const liveApartmentById = useMemo(() => {
    const map = new Map<string, ApartmentRecord>();
    availableApartments.forEach((a) => map.set(a.id, a));
    myApartments.forEach((a) => map.set(a.id, a));
    return map;
  }, [availableApartments, myApartments]);

  const showcaseApartmentById = useMemo(() => {
    const map = new Map<string, ApartmentRecord>();
    SHOWCASE_APARTMENTS.forEach((a) => map.set(a.id, a));
    return map;
  }, []);

  const comparisonUnits = useMemo(() => {
    const favByAptId = new Map(myFavorites.map((f) => [f.apartmentId, f]));
    return compareIds
      .map((aptId) => {
        const fav = favByAptId.get(aptId);
        if (!fav) return null;
        const liveApt = liveApartmentById.get(aptId) || null;
        const metaApt = liveApt || showcaseApartmentById.get(aptId) || null;
        const category = metaApt?.category || fav.category || 'family_apartment';
        const monthlyRentEgp = liveApt?.monthlyRentEgp ?? fav.monthlyRentEgp;
        const dailyRateEgp = liveApt?.dailyRateEgp ?? fav.dailyRateEgp ?? metaApt?.dailyRateEgp ?? 0;
        const areaSqm = liveApt?.areaSqm ?? fav.areaSqm;
        const bedrooms = liveApt?.bedrooms ?? fav.bedrooms;
        const bathrooms = liveApt?.bathrooms ?? fav.bathrooms;
        const furnishing = liveApt?.furnishing ?? fav.furnishing;
        const studentBedsCount =
          liveApt?.studentBedsCount ?? fav.studentBedsCount ?? metaApt?.studentBedsCount ?? 0;
        const studentPricePerBedEgp =
          liveApt?.studentPricePerBedEgp ??
          fav.studentPricePerBedEgp ??
          metaApt?.studentPricePerBedEgp ??
          0;
        const pricePerSqm =
          areaSqm > 0 && monthlyRentEgp > 0 ? Math.round(monthlyRentEgp / areaSqm) : 0;
        const unitReviews = allReviews.filter(
          (r) => r.apartmentId === aptId && r.visibilityStatus === 'published'
        );
        const avgRating =
          unitReviews.length > 0
            ? Number(
                (
                  unitReviews.reduce((s, r) => s + (r.rating || 5), 0) / unitReviews.length
                ).toFixed(1)
              )
            : null;
        const effectiveCommissionPct = platformSettings
          ? getCategoryCommissionPct(category, platformSettings)
          : liveApt?.commissionRatePct ?? commissionRatePct;

        return {
          apartmentId: aptId,
          fav,
          liveApt,
          isAvailableNow: Boolean(liveApt && liveApt.availabilityStatus === 'available'),
          title: liveApt?.title || fav.title,
          governorate: liveApt?.governorate || fav.governorate,
          district: liveApt?.district || fav.district,
          imageKey: liveApt?.imageKey || fav.imageKey,
          category,
          monthlyRentEgp,
          dailyRateEgp,
          areaSqm,
          pricePerSqm,
          bedrooms,
          bathrooms,
          furnishing,
          studentBedsCount,
          studentPricePerBedEgp,
          houseApartmentsCount: metaApt?.houseApartmentsCount ?? null,
          houseFloorsCount: metaApt?.houseFloorsCount ?? null,
          hasPrivateGarage: Boolean(metaApt?.houseHasPrivateGarage),
          hasGardenOrRoof: Boolean(metaApt?.houseHasGardenOrRoof),
          hasVirtualTour: Boolean(metaApt?.hasVirtualTour || metaApt?.virtualTourUrl),
          isVerified: metaApt ? metaApt.verificationStatus === 'verified' : false,
          priceAlertActive: priceAlertApartmentIds.has(aptId),
          effectiveCommissionPct,
          avgRating,
          reviewCount: unitReviews.length,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [
    compareIds,
    myFavorites,
    liveApartmentById,
    showcaseApartmentById,
    allReviews,
    platformSettings,
    commissionRatePct,
    priceAlertApartmentIds,
  ]);

  const handleToggleCompare = (apartmentId: string) => {
    setCompareNotice(null);
    setCompareIds((prev) => {
      if (prev.includes(apartmentId)) {
        return prev.filter((id) => id !== apartmentId);
      }
      if (prev.length >= 3) {
        setCompareNotice(
          t(
            'الحد الأقصى للمقارنة 3 وحدات في المرة الواحدة — قم بإلغاء تحديد وحدة أولاً.',
            'You can compare up to 3 units at once — deselect one unit first.'
          )
        );
        return prev;
      }
      return [...prev, apartmentId];
    });
  };

  if (!currentUser) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <FileText className="w-10 h-10 text-blue-700 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900">
          {t(
            'سجّل الدخول لعرض إشعارات الطلبات وعقود الضمان والمفضلة',
            'Sign In to View Rental Notifications, Escrow Contracts & Favorites'
          )}
        </h2>
        <p className="text-xs text-slate-500">
          {t(
            'تتيح لك لوحة عقودي متابعة حالة طلبات الإيجار، توثيق هويتك كمستأجر، وتلقي تنبيهات انخفاض أسعار الشقق المفضلة.',
            'Track rental request statuses, verify your tenant identity, and receive instant price-drop notifications.'
          )}
        </p>
        <button
          type="button"
          onClick={onRequestSignIn}
          className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl"
        >
          {t('تسجيل الدخول بحساب جوجل', 'Sign In with Google')}
        </button>
      </div>
    );
  }

  const handleMarkNotificationRead = async (notif: NotificationRecord) => {
    if (notif.isRead) return;
    setActionError(null);
    try {
      await updateDoc(doc(db, 'notifications', notif.id), {
        isRead: true,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.UPDATE, `notifications/${notif.id}`);
      setActionError(
        t('تعذر تحديث حالة قراءة الإشعار حالياً.', 'Could not mark notification as read right now.')
      );
    }
  };

  const handleMarkAllRead = async () => {
    const unread = myNotifications.filter((n) => !n.isRead);
    if (unread.length === 0) return;
    setActionError(null);
    try {
      const batch = writeBatch(db);
      unread.forEach((n) => {
        batch.update(doc(db, 'notifications', n.id), {
          isRead: true,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.WRITE, 'notifications (mark all read)');
      setActionError(
        t('تعذر تحديث الإشعارات حالياً.', 'Could not mark all notifications as read right now.')
      );
    }
  };

  const handleLandlordApproveRequest = async (req: RentalRequestRecord) => {
    const actorName = (currentUser.displayName?.trim() || 'مالك العقار').slice(0, 80);
    const safeActor = actorName.length >= 2 ? actorName : 'مالك العقار';
    const notifId = buildNotificationId('ntf_l_ap');

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'rentalRequests', req.id), {
        status: 'awaiting_payment',
        statusNote: 'تمت موافقة المالك على طلبك — بانتظار الدفع في بوابة الضمان.',
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'notifications', notifId), {
        recipientId: req.tenantId,
        actorId: currentUser.uid,
        actorDisplayName: safeActor,
        recipientRole: 'tenant',
        statusType: 'awaiting_payment',
        relatedEntityType: 'rental_request',
        relatedEntityId: req.id,
        apartmentId: req.apartmentId,
        apartmentTitle: req.apartmentTitle.slice(0, 120),
        governorate: req.governorate,
        amountEgp: req.totalRentEgp,
        title: 'تمت الموافقة المبدئية — طلبك بانتظار الدفع الآن',
        message: `وافق ${safeActor} على طلب إيجار «${req.apartmentTitle}». يمكنك الآن إتمام السداد في حساب الضمان بقيمة ${formatEgp(
          req.totalRentEgp
        )} ج.م.`,
        isRead: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setActionError(null);
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.UPDATE, `rentalRequests/${req.id}`);
      setActionError(
        t(
          'تعذر اعتماد طلب الإيجار حالياً. يرجى التأكد من جلستك والمحاولة مرة أخرى.',
          'Could not approve rental request right now. Please verify your session and retry.'
        )
      );
    }
  };

  const handleCancelRentalRequest = async (
    req: RentalRequestRecord,
    byRole: 'tenant' | 'landlord'
  ) => {
    const actorName = (currentUser.displayName?.trim() || 'مستخدم إيجار').slice(0, 80);
    const safeActor = actorName.length >= 2 ? actorName : 'مستخدم إيجار';

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'rentalRequests', req.id), {
        status: 'cancelled',
        statusNote:
          byRole === 'landlord'
            ? 'تم إلغاء الطلب من قِبل المالك.'
            : 'تم إلغاء طلب الإيجار بناءً على رغبة المستأجر.',
        updatedAt: serverTimestamp(),
      });

      // Notify tenant (always valid recipient)
      const selfOrTenantNotifId = buildNotificationId('ntf_cn');
      batch.set(doc(db, 'notifications', selfOrTenantNotifId), {
        recipientId: req.tenantId,
        actorId: currentUser.uid,
        actorDisplayName: safeActor,
        recipientRole: 'tenant',
        statusType: 'cancelled',
        relatedEntityType: 'rental_request',
        relatedEntityId: req.id,
        apartmentId: req.apartmentId,
        apartmentTitle: req.apartmentTitle.slice(0, 120),
        governorate: req.governorate,
        amountEgp: req.totalRentEgp,
        title: 'تم إلغاء طلب الإيجار',
        message: `تم تحديث حالة طلب إيجار «${req.apartmentTitle}» إلى (تم إلغاء الطلب) دون خصم أي مبالغ.`,
        isRead: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (
        byRole === 'tenant' &&
        req.landlordId !== 'showcase_owner' &&
        req.landlordId !== currentUser.uid
      ) {
        const landlordNotifId = buildNotificationId('ntf_cn_l');
        batch.set(doc(db, 'notifications', landlordNotifId), {
          recipientId: req.landlordId,
          actorId: currentUser.uid,
          actorDisplayName: safeActor,
          recipientRole: 'landlord',
          statusType: 'cancelled',
          relatedEntityType: 'rental_request',
          relatedEntityId: req.id,
          apartmentId: req.apartmentId,
          apartmentTitle: req.apartmentTitle.slice(0, 120),
          governorate: req.governorate,
          amountEgp: req.totalRentEgp,
          title: 'إشعار بإلغاء طلب إيجار',
          message: `قام ${safeActor} بإلغاء طلب الإيجار المسجل على «${req.apartmentTitle}».`,
          isRead: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      setActionError(null);
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.UPDATE, `rentalRequests/${req.id}`);
      setActionError(
        t(
          'تعذر إلغاء طلب الإيجار حالياً. يرجى المحاولة مرة أخرى.',
          'Could not cancel rental request right now. Please retry.'
        )
      );
    }
  };

  const handleConfirmKeyHandover = async (booking: BookingRecord) => {
    setActionError(null);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'bookings', booking.id), {
        status: 'completed',
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(db, 'bookingDemandSignals', booking.id),
        buildBookingDemandSignalWritePayload(
          booking,
          {
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          liveApartmentById
        )
      );
      await batch.commit();
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.UPDATE, `bookings/${booking.id}`);
      setActionError(
        t(
          'تعذر تأكيد استلام المفتاح وصرف الضمان حالياً. يرجى المحاولة مجدداً.',
          'Could not confirm key handover right now. Please try again.'
        )
      );
    }
  };

  const handleSubmitTenantKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    setKycMessage(null);

    if (fullLegalName.trim().length < 4) {
      setKycMessage(t('يرجى كتابة الاسم الرباعي الكامل.', 'Please enter your full legal name.'));
      return;
    }
    if (!VALIDATION_LIMITS.NATIONAL_ID_PATTERN.test(nationalIdNumber.trim())) {
      setKycMessage(
        t(
          'الرقم القومي المصري يجب أن يتكون من 14 رقماً ويبدأ بـ 2 أو 3.',
          'National ID must be 14 digits starting with 2 or 3.'
        )
      );
      return;
    }
    if (!VALIDATION_LIMITS.EGYPT_PHONE_PATTERN.test(tenantPhone.trim())) {
      setKycMessage(
        t('يرجى إدخال رقم موبايل مصري صحيح (11 رقماً).', 'Enter a valid 11-digit Egyptian phone.')
      );
      return;
    }
    if (occupationOrUniversity.trim().length < 3) {
      setKycMessage(
        t(
          'يرجى كتابة اسم الجامعة والكلية (للطلاب) أو جهة العمل / السجل التجاري.',
          'Please enter your university/faculty or employer.'
        )
      );
      return;
    }

    setSubmittingKyc(true);
    try {
      const idHash = idCardFile
        ? await computeFileSha256(idCardFile)
        : await computeTextSha256(`${currentUser.uid}_id_${nationalIdNumber}`);
      const supHash = supportingDocFile
        ? await computeFileSha256(supportingDocFile)
        : await computeTextSha256(`${currentUser.uid}_sup_${occupationOrUniversity}`);

      const idName = (idCardFile?.name || 'national_id_card.jpg').slice(0, 120);
      const supName = (supportingDocFile?.name || 'enrollment_or_hr_letter.pdf').slice(0, 120);
      const displayName = fullLegalName.trim().slice(0, 80);

      const batch = writeBatch(db);
      const pubRef = doc(db, 'tenantVerifications', currentUser.uid);
      const privRef = doc(db, 'tenantVerifications', currentUser.uid, 'privateDocs', 'kyc');
      const existingPrivSnap = myTenantVerification
        ? await getDoc(privRef).catch(() => null)
        : null;

      if (!myTenantVerification) {
        batch.set(pubRef, {
          userId: currentUser.uid,
          tenantDisplayName: displayName,
          tenantCategory,
          verificationStatus: 'pending_review',
          reviewNote: '',
          submittedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.update(pubRef, {
          tenantDisplayName: displayName,
          tenantCategory,
          verificationStatus: 'pending_review',
          reviewNote: '',
          updatedAt: serverTimestamp(),
        });
      }

      if (!existingPrivSnap || !existingPrivSnap.exists()) {
        batch.set(privRef, {
          userId: currentUser.uid,
          fullLegalName: displayName,
          nationalIdNumber: nationalIdNumber.trim(),
          tenantPhone: tenantPhone.trim(),
          occupationOrUniversity: occupationOrUniversity.trim().slice(0, 120),
          idCardFileName: idName.length >= 3 ? idName : 'id_card.jpg',
          idCardSha256: idHash,
          supportingDocFileName: supName.length >= 3 ? supName : 'proof.pdf',
          supportingDocSha256: supHash,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.update(privRef, {
          fullLegalName: displayName,
          nationalIdNumber: nationalIdNumber.trim(),
          tenantPhone: tenantPhone.trim(),
          occupationOrUniversity: occupationOrUniversity.trim().slice(0, 120),
          idCardFileName: idName.length >= 3 ? idName : 'id_card.jpg',
          idCardSha256: idHash,
          supportingDocFileName: supName.length >= 3 ? supName : 'proof.pdf',
          supportingDocSha256: supHash,
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      setKycMessage(
        t(
          'تم إرسال بيانات الهوية والمستندات بنجاح لفريق المشروع لمراجعتها.',
          'Identity KYC submitted successfully for team verification.'
        )
      );
    } catch (err) {
      logFirestoreDiagnostic(
        err,
        OperationType.WRITE,
        `tenantVerifications/${currentUser.uid}`
      );
      setKycMessage(
        t(
          'تعذر إرسال بيانات توثيق الهوية حالياً. يرجى التأكد من البيانات وجلستك والمحاولة مرة أخرى.',
          'Could not submit KYC documents right now. Please verify your entries and session, then retry.'
        )
      );
    } finally {
      setSubmittingKyc(false);
    }
  };

  const handleSaveLandlordPriceUpdate = async (apt: ApartmentRecord) => {
    const parsedMonthly = Number(draftMonthlyText) || apt.monthlyRentEgp;
    const parsedDaily = Number(draftDailyText) || apt.dailyRateEgp || VALIDATION_LIMITS.DAILY_RATE_MIN;
    const nextMonthly = snapRentToMultipleOf10(parsedMonthly);
    const nextDaily =
      (apt.category === 'hotel_room' || apt.category === 'whole_house') &&
      apt.billingMode === 'daily_or_monthly'
        ? snapToMultipleOf10(
            parsedDaily,
            VALIDATION_LIMITS.DAILY_RATE_MIN,
            VALIDATION_LIMITS.DAILY_RATE_MAX
          )
        : 0;

    setSavingPriceId(apt.id);
    setActionError(null);
    try {
      const updatePayload: Record<string, unknown> = {
        monthlyRentEgp: nextMonthly,
        dailyRateEgp: nextDaily,
        updatedAt: serverTimestamp(),
      };
      if (apt.baseCurrency && apt.baseCurrency !== 'EGP') {
        const liveRates = buildLiveCurrencyRates(platformSettings);
        updatePayload.baseMonthlyPrice = convertFromEgp(nextMonthly, apt.baseCurrency, liveRates);
        if (nextDaily > 0) {
          updatePayload.baseDailyPrice = convertFromEgp(nextDaily, apt.baseCurrency, liveRates);
        }
      }
      await updateDoc(doc(db, 'apartments', apt.id), updatePayload);
      setEditingPriceAptId(null);
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.UPDATE, `apartments/${apt.id}`);
      setActionError(
        t(
          'تعذر حفظ السعر الجديد للوحدة حالياً. يرجى المحاولة مرة أخرى.',
          'Could not save the updated listing price right now. Please try again.'
        )
      );
    } finally {
      setSavingPriceId(null);
    }
  };

  const getNotifIcon = (statusType: NotificationStatusType) => {
    switch (statusType) {
      case 'approved':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
      case 'chat_unlocked':
        return <Unlock className="w-4 h-4 text-emerald-600 shrink-0" />;
      case 'awaiting_payment':
        return <Clock className="w-4 h-4 text-amber-600 shrink-0" />;
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-rose-600 shrink-0" />;
      case 'price_drop':
        return <TrendingDown className="w-4 h-4 text-blue-700 shrink-0" />;
      default:
        return <Bell className="w-4 h-4 text-slate-600 shrink-0" />;
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-blue-700">
            {t(
              'مركز الشفافية التعاقدية والإشعارات وتوثيق الهوية',
              'Transparent Contracts, Status Notifications & KYC Hub'
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-0.5">
            {t('عقودي وإشعارات الطلبات والمفضلة', 'My Contracts, Notifications & Saved Units')}
          </h1>
        </div>

        <button
          type="button"
          onClick={onOpenListingWizard}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl whitespace-nowrap shrink-0"
        >
          <PlusCircle className="w-4 h-4" />
          <span>{t('إضافة وحدة جديدة', 'List New Unit')}</span>
        </button>
      </div>

      {/* Sub-Navigation Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            {
              id: 'notifications',
              icon: Bell,
              label: `${t('مركز الإشعارات', 'Notifications')} (${formatNumber(unreadCount)})`,
            },
            {
              id: 'chats',
              icon: MessageSquareLock,
              label: `${t('المحادثات الآمنة', 'Safe Chats')} (${formatNumber(myChatThreads.length)})`,
            },
            {
              id: 'tenant_contracts',
              icon: FileText,
              label: `${t('طلباتي وعقودي كمستأجر', 'My Leases & Requests')} (${formatNumber(
                myTenantRequests.length + myTenantBookings.length
              )})`,
            },
            {
              id: 'tenant_kyc',
              icon: UserCheck,
              label: t('توثيق هوية المستأجر', 'Tenant Identity (KYC)'),
            },
            {
              id: 'landlord_hub',
              icon: Building2,
              label: `${t('وحداتي وطلبات الملاك', 'Landlord Units')} (${formatNumber(
                myApartments.length + myLandlordRequests.length
              )})`,
            },
            {
              id: 'favorites',
              icon: Heart,
              label: `${t('المفضلة وتنبيهات الأسعار', 'Favorites & Price Alerts')} (${formatNumber(
                myFavorites.length
              )})`,
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {actionError && (
        <div
          role="alert"
          className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs font-semibold text-rose-900 flex items-center justify-between gap-3"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-700 hover:text-rose-950 font-bold shrink-0"
          >
            {t('إغلاق', 'Dismiss')}
          </button>
        </div>
      )}

      {/* 1. TRANSPARENT NOTIFICATION CENTER */}
      {subTab === 'notifications' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  'all',
                  'approved',
                  'awaiting_payment',
                  'pending_approval',
                  'chat_unlocked',
                  'cancelled',
                  'price_drop',
                ] as const
              ).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setNotifFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    notifFilter === st
                      ? 'bg-blue-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st === 'all'
                    ? t('الكل', 'All')
                    : notificationStatusLabel(st)}
                </button>
              ))}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap"
              >
                <CheckCheck className="w-4 h-4" />
                <span>{t('تحديد الكل كمقروء', 'Mark All as Read')}</span>
              </button>
            )}
          </div>

          {filteredNotifications.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Bell className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">
                {t('لا توجد إشعارات في هذا التصنيف حالياً', 'No notifications in this category yet')}
              </p>
              <p className="text-xs text-slate-500">
                {t(
                  'ستظهر هنا تحديثات حالة طلبات الإيجار (تمت الموافقة · بانتظار الدفع · تم إلغاء الطلب) وتنبيهات انخفاض الأسعار فوراً.',
                  'Rental status updates and saved unit price-drop alerts appear here in real time.'
                )}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredNotifications.map((ntf) => {
                const linkedApt = liveApartmentById.get(ntf.apartmentId);
                return (
                  <div
                    key={ntf.id}
                    onClick={() => handleMarkNotificationRead(ntf)}
                    className={`py-4 px-3 rounded-xl transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      ntf.isRead ? 'bg-white' : 'bg-blue-50/40'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{getNotifIcon(ntf.statusType)}</div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-bold text-slate-800">
                            {notificationStatusLabel(ntf.statusType)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{govLabel(ntf.governorate)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatTimeAgo(ntf.createdAtMs)}
                          </span>
                          {!ntf.isRead && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-semibold text-blue-700">
                                {t('جديد', 'New')}
                              </span>
                            </>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-slate-900">{ntf.title}</h4>
                        <p className="text-xs text-slate-600 leading-relaxed">{ntf.message}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono tabular-nums text-xs font-bold text-slate-900">
                        {formatNumber(ntf.amountEgp)} {t('ج.م', 'EGP')}
                      </span>
                      {linkedApt && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectApartment(linkedApt);
                          }}
                          className="px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg whitespace-nowrap"
                        >
                          {t('عرض الوحدة', 'View Unit')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 1B. PRIVACY-GATED SAFE CHATS INBOX */}
      {subTab === 'chats' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {t(
                  'المحادثات المحمية بالخصوصية بين المستأجر والمالك',
                  'Privacy-Protected Tenant & Landlord Chats'
                )}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t(
                  'تُمنع مشاركة أرقام الهواتف داخل الشات مع تنبيه بالحظر من التطبيق — وبدفع نسبة الموقع يُفتح الشات ويظهر رقم الهاتف للطرفين.',
                  'Phone numbers are blocked with ban warnings until site commission is paid — paying unlocks full chat and verified contact numbers.'
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={onExploreMap}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl whitespace-nowrap shrink-0"
            >
              <span>{t('استكشاف وحدة جديدة للمراسلة', 'Explore Units to Chat')}</span>
            </button>
          </div>

          {myChatThreads.length === 0 ? (
            <div className="py-10 text-center space-y-2.5">
              <MessageSquareLock className="w-9 h-9 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-800">
                {t('لا توجد محادثات نشطة بعد', 'No Active Chats Yet')}
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {t(
                  'افتح تفاصيل أي وحدة سكنية أو تجارية من الخريطة واضغط «محادثة المالك» لبدء محادثة آمنة.',
                  'Open any unit from the map and click "Chat with Landlord" to start a protected conversation.'
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {myChatThreads.map((thread) => {
                const amLandlord = currentUser.uid === thread.landlordId;
                const counterpartyName = amLandlord
                  ? thread.tenantDisplayName
                  : thread.landlordDisplayName;
                const isFlagged = thread.status === 'flagged_violation';
                const totalStrikes = thread.tenantViolationCount + thread.landlordViolationCount;

                return (
                  <div
                    key={thread.id}
                    className={`border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      isFlagged
                        ? 'border-rose-200 bg-rose-50/40'
                        : thread.commissionPaid
                          ? 'border-emerald-200 bg-emerald-50/30'
                          : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {isFlagged ? (
                          <span className="inline-flex items-center gap-1 font-bold text-rose-700">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>{t('معلقة لمخالفة الخصوصية', 'Flagged Violation')}</span>
                          </span>
                        ) : thread.commissionPaid ? (
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                            <Unlock className="w-3.5 h-3.5" />
                            <span>{t('مفتوحة (أرقام الهاتف ظاهرة)', 'Unlocked · Phones Visible')}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                            <Lock className="w-3.5 h-3.5" />
                            <span>{t('مقيدة (أرقام الهاتف محجوبة)', 'Locked Pre-Commission')}</span>
                          </span>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-600 font-semibold">
                          {amLandlord ? t('المستأجر:', 'Tenant:') : t('المالك:', 'Landlord:')}{' '}
                          {counterpartyName}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-500">{govLabel(thread.governorate)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-500 font-mono tabular-nums">
                          {formatTimeAgo(thread.lastMessageAtMs)}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-slate-900 truncate">
                        {thread.apartmentTitle}
                      </h4>

                      <p className="text-xs text-slate-600 truncate">
                        {thread.lastMessagePreview}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono tabular-nums text-slate-500">
                        <span>
                          {t('نسبة الموقع لفتح الهاتف:', 'Site Commission:')}{' '}
                          <strong className="text-blue-700">
                            {formatNumber(thread.commissionAmountEgp)} {t('ج.م', 'EGP')}
                          </strong>
                        </span>
                        {totalStrikes > 0 && (
                          <span className="text-rose-700 font-bold">
                            {t('تنبيهات مخالفة:', 'Violations:')} {formatNumber(totalStrikes)}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenChatThread(thread)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap shrink-0"
                    >
                      <MessageSquareLock className="w-3.5 h-3.5" />
                      <span>
                        {thread.commissionPaid || amLandlord
                          ? t('فتح المحادثة', 'Open Chat')
                          : t('فتح الشات / دفع النسبة', 'Open Chat / Pay Fee')}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. TENANT RENTAL REQUESTS & ESCROW CONTRACTS */}
      {subTab === 'tenant_contracts' && (
        <div className="space-y-6">
          {/* Active & Historical Rental Requests */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              {t('طلبات الإيجار المسجلة وحالتها الحية', 'Tracked Rental Requests')}
            </h2>

            {myTenantRequests.length === 0 ? (
              <p className="text-xs text-slate-500">
                {t(
                  'لا توجد طلبات إيجار مسجلة بعد. يمكنك اختيار أي وحدة من الخريطة وحفظ طلب إيجار أو السداد المباشر.',
                  'No rental requests yet. Select any unit on the map to submit a rental request or pay directly.'
                )}
              </p>
            ) : (
              <div className="space-y-3">
                {myTenantRequests.map((req) => {
                  const targetApt = liveApartmentById.get(req.apartmentId);
                  return (
                    <div
                      key={req.id}
                      className="border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="text-xs text-slate-500">
                          <span className="font-bold text-blue-700">
                            {requestStatusLabel(req.status)}
                          </span>{' '}
                          · {categorySingularLabel(req.category)} · {govLabel(req.governorate)} ·{' '}
                          {formatTimeAgo(req.updatedAtMs)}
                        </div>
                        <h4 className="text-sm font-bold text-slate-900">{req.apartmentTitle}</h4>
                        <div className="text-xs text-slate-600">{req.statusNote}</div>
                        <div className="text-xs font-mono tabular-nums text-slate-800">
                          {formatNumber(req.totalRentEgp)} {t('ج.م', 'EGP')}
                          {req.paymentCurrency &&
                            req.paymentCurrency !== 'EGP' &&
                            req.paidAmountInCurrency && (
                              <span className="text-blue-700 ms-2">
                                (
                                {formatCurrencyValue(
                                  req.paidAmountInCurrency,
                                  req.paymentCurrency,
                                  lang
                                )}
                                )
                              </span>
                            )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {targetApt && (
                          <button
                            type="button"
                            onClick={() => onOpenChatForApartment(targetApt)}
                            className="inline-flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg whitespace-nowrap"
                          >
                            <MessageSquareLock className="w-3.5 h-3.5 text-blue-700" />
                            <span>{t('محادثة المالك', 'Chat')}</span>
                          </button>
                        )}
                        {req.status === 'awaiting_payment' && targetApt && (
                          <button
                            type="button"
                            onClick={() => onRentApartment(targetApt, req)}
                            className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg whitespace-nowrap"
                          >
                            {t('إتمام الدفع بالضمان', 'Complete Escrow Payment')}
                          </button>
                        )}
                        {(req.status === 'pending_approval' ||
                          req.status === 'awaiting_payment') && (
                          <button
                            type="button"
                            onClick={() => handleCancelRentalRequest(req, 'tenant')}
                            className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg whitespace-nowrap"
                          >
                            {t('إلغاء الطلب', 'Cancel Request')}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Settled Escrow Bookings */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              {t('عقود الضمان الموثقة واستلام المفاتيح', 'Active & Completed Escrow Contracts')}
            </h2>

            {myTenantBookings.length === 0 ? (
              <p className="text-xs text-slate-500">
                {t('لم تقم بإتمام عقود ضمان مدفوعة بعد.', 'No settled escrow bookings yet.')}
              </p>
            ) : (
              <div className="space-y-3">
                {myTenantBookings.map((bk) => {
                  const hasReview = allReviews.some(
                    (r) => r.bookingId === bk.id && r.tenantId === currentUser.uid
                  );
                  return (
                    <div
                      key={bk.id}
                      className="border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="text-xs text-slate-500 font-mono tabular-nums">
                          {bk.paymentReference} ·{' '}
                          <span className="font-sans font-bold text-emerald-700">
                            {bk.status === 'completed'
                              ? t('تم استلام المفتاح وصرف الضمان', 'Key Handover Completed')
                              : t('محفوظ في حساب الضمان', 'Protected in Escrow')}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900">{bk.apartmentTitle}</h4>
                        <div className="text-xs font-mono tabular-nums text-slate-700">
                          {formatNumber(bk.totalRentEgp)} {t('ج.م', 'EGP')}
                          {bk.paymentCurrency &&
                            bk.paymentCurrency !== 'EGP' &&
                            bk.paidAmountInCurrency && (
                              <span className="text-blue-700 ms-2">
                                (
                                {formatCurrencyValue(
                                  bk.paidAmountInCurrency,
                                  bk.paymentCurrency,
                                  lang
                                )}
                                )
                              </span>
                            )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {bk.status === 'escrow_paid' && (
                          <button
                            type="button"
                            onClick={() => handleConfirmKeyHandover(bk)}
                            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg whitespace-nowrap"
                          >
                            {t('تأكيد استلام المفتاح ومطابقة الوحدة', 'Confirm Key Handover')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenReviewModal(bk)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-800 rounded-lg whitespace-nowrap"
                        >
                          <Star className="w-3.5 h-3.5 text-amber-500" />
                          <span>
                            {hasReview
                              ? t('تعديل تقييمي', 'Edit Review')
                              : t('تقييم المالك والوحدة', 'Rate Landlord')}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. TENANT KYC IDENTITY UPLOAD & VERIFICATION */}
      {subTab === 'tenant_kyc' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 max-w-3xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {t(
                  'توثيق هوية المستأجر لدى فريق المشروع (عائلي · طلاب · شركات)',
                  'Tenant Identity Verification (Family · Student · Corporate)'
                )}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t(
                  'ارفع بيانات بطاقة الرقم القومي وإثبات القيد الجامعي أو العمل ليراجعها فريق المنصة ويعتمد هويتك.',
                  'Submit your National ID and university/employment proof for verification by the project team.'
                )}
              </p>
            </div>

            {myTenantVerification && (
              <span className="text-xs font-bold text-blue-700">
                {t('الحالة الحالية:', 'Current Status:')} {myTenantVerification.verificationStatus}
              </span>
            )}
          </div>

          {myTenantVerification?.reviewNote && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700">
              <strong className="text-slate-900">
                {t('ملاحظة فريق المراجعة:', 'Reviewer Note:')}
              </strong>{' '}
              {myTenantVerification.reviewNote}
            </div>
          )}

          {kycMessage && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-xs font-semibold text-blue-900">
              {kycMessage}
            </div>
          )}

          <form onSubmit={handleSubmitTenantKyc} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {(['family', 'student', 'corporate'] as TenantCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setTenantCategory(cat)}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-colors ${
                    tenantCategory === cat
                      ? 'bg-blue-50 border-blue-600 text-blue-900'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  {tenantCategoryLabel(cat)}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('الاسم الرباعي المطابق للرقم القومي', 'Full Legal Name')}
                </label>
                <input
                  type="text"
                  required
                  value={fullLegalName}
                  onChange={(e) => setFullLegalName(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('الرقم القومي المصري (14 رقماً)', 'National ID (14 Digits)')}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  maxLength={14}
                  required
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
                  {t('رقم الموبايل المصري', 'Egyptian Mobile Number')}
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  maxLength={11}
                  required
                  value={tenantPhone}
                  onKeyDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setTenantPhone(normalizeNumericInput(e.target.value).slice(0, 11))
                  }
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono tabular-nums text-start"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tenantCategory === 'student'
                    ? t('اسم الجامعة والكلية والفرقة الدراسية', 'University & Faculty')
                    : tenantCategory === 'corporate'
                      ? t('اسم الشركة ورقم السجل التجاري', 'Company & Commercial Reg.')
                      : t('الوظيفة وجهة العمل الحالية', 'Occupation & Employer')}
                </label>
                <input
                  type="text"
                  required
                  value={occupationOrUniversity}
                  onChange={(e) => setOccupationOrUniversity(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div className="border border-slate-200 rounded-xl p-3 space-y-1.5">
                <div className="text-xs font-bold text-slate-800">
                  {t('صورة بطاقة الرقم القومي السارية', 'National ID Scan')}
                </div>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setIdCardFile(e.target.files?.[0] || null)}
                  className="text-xs text-slate-600"
                />
              </div>

              <div className="border border-slate-200 rounded-xl p-3 space-y-1.5">
                <div className="text-xs font-bold text-slate-800">
                  {tenantCategory === 'student'
                    ? t('كارنيه الجامعة / إثبات القيد', 'University Student ID')
                    : t('مفردات مرتب / سجل تجاري', 'HR Letter / Commercial Reg.')}
                </div>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setSupportingDocFile(e.target.files?.[0] || null)}
                  className="text-xs text-slate-600"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submittingKyc}
              className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl"
            >
              {submittingKyc
                ? t('جاري رفع وتشفير البيانات...', 'Submitting...')
                : t('إرسال البيانات لفريق المراجعة والاعتماد', 'Submit Identity for Review')}
            </button>
          </form>
        </div>
      )}

      {/* 4. LANDLORD HUB: INCOMING REQUESTS & LIVE PRICE UPDATE / DISCOUNT */}
      {subTab === 'landlord_hub' && (
        <div className="space-y-6">
          {/* Incoming Tenant Requests */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              {t('طلبات المستأجرين الواردة على وحداتي', 'Incoming Tenant Rental Requests')}
            </h2>

            {myLandlordRequests.length === 0 ? (
              <p className="text-xs text-slate-500">
                {t('لا توجد طلبات واردة على وحداتك حالياً.', 'No incoming requests yet.')}
              </p>
            ) : (
              <div className="space-y-3">
                {myLandlordRequests.map((req) => (
                  <div
                    key={req.id}
                    className="border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="text-xs text-slate-500">
                        <span className="font-bold text-blue-700">
                          {requestStatusLabel(req.status)}
                        </span>{' '}
                        · {req.tenantDisplayName} · {formatTimeAgo(req.updatedAtMs)}
                      </div>
                      <h4 className="text-sm font-bold text-slate-900">{req.apartmentTitle}</h4>
                      <div className="text-xs font-mono tabular-nums text-emerald-700">
                        {t('صافي مستحقاتك:', 'Your Net Payout:')}{' '}
                        {formatNumber(req.landlordNetEgp)} {t('ج.م', 'EGP')} (
                        {t(
                          `بعد خصم عمولة مرة واحدة ${commissionRatePct}%`,
                          `after ${commissionRatePct}% one-time fee`
                        )}
                        )
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {(() => {
                        const existingThread = myChatThreads.find(
                          (th) => th.apartmentId === req.apartmentId && th.tenantId === req.tenantId
                        );
                        return existingThread ? (
                          <button
                            type="button"
                            onClick={() => onOpenChatThread(existingThread)}
                            className="inline-flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg whitespace-nowrap"
                          >
                            <MessageSquareLock className="w-3.5 h-3.5 text-blue-700" />
                            <span>{t('فتح الشات', 'Open Chat')}</span>
                          </button>
                        ) : null;
                      })()}
                      {req.status === 'pending_approval' && (
                        <button
                          type="button"
                          onClick={() => handleLandlordApproveRequest(req)}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg whitespace-nowrap"
                        >
                          {t('موافقة وإشعار المستأجر للدفع', 'Approve & Notify Tenant')}
                        </button>
                      )}
                      {(req.status === 'pending_approval' ||
                        req.status === 'awaiting_payment') && (
                        <button
                          type="button"
                          onClick={() => handleCancelRentalRequest(req, 'landlord')}
                          className="px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg whitespace-nowrap"
                        >
                          {t('إلغاء الطلب', 'Decline / Cancel')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Landlord Listed Units + Inline Price Update / Discount Trigger */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {t(
                    'وحداتي المعروضة وتعديل / تخفيض الأسعار',
                    'My Listed Units & Live Price Adjustment'
                  )}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t(
                    'عند تخفيض السعر اليومي أو الشهري لأي وحدة، يتلقى جميع المهتمين المفعلين لتنبيه السعر إشعاراً فورياً.',
                    'Lowering daily or monthly rent automatically notifies users subscribed to Price Drop Alerts.'
                  )}
                </p>
              </div>
            </div>

            {myApartments.length === 0 ? (
              <p className="text-xs text-slate-500">
                {t('لم تقم بعرض وحدات باسم حسابك بعد.', 'You have no active listed units yet.')}
              </p>
            ) : (
              <div className="space-y-3">
                {myApartments.map((apt) => {
                  const isEditing = editingPriceAptId === apt.id;
                  return (
                    <div
                      key={apt.id}
                      className="border border-slate-200 rounded-xl p-4 space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="text-xs text-slate-500">
                            {categorySingularLabel(apt.category)} · {govLabel(apt.governorate)} ·{' '}
                            <span className="font-semibold text-slate-800">
                              {apt.verificationStatus}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-slate-900">{apt.title}</h4>
                          <div className="text-xs font-mono tabular-nums text-blue-700 mt-0.5">
                            {formatNumber(apt.monthlyRentEgp)} {t('ج.م / شهر', 'EGP / mo')}
                            {apt.dailyRateEgp > 0 &&
                              ` · ${formatNumber(apt.dailyRateEgp)} ${t('ج.م / يوم', 'EGP / night')}`}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) {
                              setEditingPriceAptId(null);
                            } else {
                              setEditingPriceAptId(apt.id);
                              setDraftMonthlyText(String(apt.monthlyRentEgp));
                              setDraftDailyText(String(apt.dailyRateEgp || 0));
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0"
                        >
                          <Tag className="w-3.5 h-3.5 text-blue-700" />
                          <span>
                            {isEditing
                              ? t('إغلاق التعديل', 'Cancel')
                              : t('تعديل / تخفيض السعر', 'Update / Discount Price')}
                          </span>
                        </button>
                      </div>

                      {isEditing && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-end gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              {t('السعر الشهري الجديد (ج.م)', 'New Monthly Rent (EGP)')}
                            </label>
                            <input
                              type="text"
                              inputMode="numeric"
                              dir="ltr"
                              value={draftMonthlyText}
                              onKeyDown={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                setDraftMonthlyText(normalizeNumericInput(e.target.value))
                              }
                              onBlur={() => {
                                if (!draftMonthlyText.trim()) {
                                  setDraftMonthlyText(String(apt.monthlyRentEgp));
                                }
                              }}
                              className="w-40 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono tabular-nums text-start"
                            />
                          </div>

                          {(apt.category === 'hotel_room' || apt.category === 'whole_house') &&
                            apt.billingMode === 'daily_or_monthly' && (
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                  {t('السعر اليومي الجديد (ج.م)', 'New Daily Rate (EGP)')}
                                </label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  dir="ltr"
                                  value={draftDailyText}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    setDraftDailyText(normalizeNumericInput(e.target.value))
                                  }
                                  onBlur={() => {
                                    if (!draftDailyText.trim()) {
                                      setDraftDailyText(String(apt.dailyRateEgp || 300));
                                    }
                                  }}
                                  className="w-36 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono tabular-nums text-start"
                                />
                              </div>
                            )}

                          <button
                            type="button"
                            disabled={savingPriceId === apt.id}
                            onClick={() => handleSaveLandlordPriceUpdate(apt)}
                            className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg whitespace-nowrap"
                          >
                            {savingPriceId === apt.id
                              ? t('جاري الحفظ...', 'Saving...')
                              : t('حفظ السعر الجديد', 'Save New Price')}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {myLandlordBookings.length > 0 && (
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <h3 className="text-xs font-bold text-slate-800">
                  {t('سجل عقود الضمان المحصلة لوحداتي', 'Settled Landlord Escrow Leases')}
                </h3>
                {myLandlordBookings.map((lb) => (
                  <div
                    key={lb.id}
                    className="text-xs flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
                  >
                    <span>
                      {lb.apartmentTitle} — {lb.tenantDisplayName}
                    </span>
                    <span className="font-mono tabular-nums font-bold text-emerald-700">
                      +{formatNumber(lb.landlordNetEgp)} {t('ج.م', 'EGP')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. SAVED FAVORITES & PRICE DROP ALERTS */}
      {subTab === 'favorites' && (
        <div className="space-y-4">
          {myFavorites.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
              <Heart className="w-8 h-8 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-900">
                {t('قائمة المفضلة وتنبيهات الأسعار فارغة', 'No Saved Units Yet')}
              </h3>
              <p className="text-xs text-slate-500">
                {t(
                  'احفظ أي شقة أو وحدة فندقية من الخريطة وفعّل «تنبيه السعر» ليصلك إشعار فوري عند أي تخفيض في الإيجار.',
                  'Save any unit from the map and enable Price Alert to receive instant notifications on rent drops.'
                )}
              </p>
              <button
                type="button"
                onClick={onExploreMap}
                className="px-4 py-2 bg-blue-700 text-white text-xs font-bold rounded-lg"
              >
                {t('استكشاف الخريطة الآن', 'Explore Map')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Unit Comparison Selection & Trigger Bar */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Scale className="w-4 h-4 text-blue-700 shrink-0" />
                    <span className="font-bold text-slate-900">
                      {t('مقارنة الوحدات المحفوظة', 'Compare Saved Units')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums font-semibold text-blue-700">
                      {formatNumber(compareIds.length)} / {formatNumber(3)}{' '}
                      {t('مختارة', 'selected')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {compareIds.length === 0
                      ? t(
                          'اختر وحدتين أو 3 وحدات من المفضلة لمقارنة الأسعار والمساحة والغرف والمرافق جنباً إلى جنب.',
                          'Select 2 or 3 saved units to compare price, area, rooms, and amenities side by side.'
                        )
                      : compareIds.length === 1
                        ? t(
                            'تم اختيار وحدة واحدة — اختر وحدة أخرى على الأقل لفتح جدول المقارنة.',
                            '1 unit selected — pick at least 1 more unit to open the comparison table.'
                          )
                        : t(
                            'جاهز للمقارنة — افتح جدول المقارنة الجانبي لاستعراض الفروق التفصيلية.',
                            'Ready to compare — open the side-by-side comparison table to review all differences.'
                          )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {compareIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setCompareIds([]);
                        setCompareNotice(null);
                      }}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0"
                    >
                      {t('إلغاء التحديد', 'Clear Selection')}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={compareIds.length < 2}
                    onClick={() => setIsCompareDrawerOpen(true)}
                    className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-colors whitespace-nowrap shrink-0 ${
                      compareIds.length >= 2
                        ? 'bg-blue-700 hover:bg-blue-800 text-white'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Scale className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {t('عرض جدول المقارنة', 'Compare Units')} ({formatNumber(compareIds.length)})
                    </span>
                  </button>
                </div>
              </div>

              {compareNotice && (
                <div
                  role="status"
                  className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-amber-950 flex items-center justify-between gap-3"
                >
                  <span>{compareNotice}</span>
                  <button
                    type="button"
                    onClick={() => setCompareNotice(null)}
                    className="text-amber-800 hover:text-amber-950 font-bold shrink-0"
                  >
                    {t('حسناً', 'Dismiss')}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-5">
                {myFavorites.map((fav) => {
                  const liveApt = liveApartmentById.get(fav.apartmentId);
                  const alertActive = priceAlertApartmentIds.has(fav.apartmentId);
                  const currentMonthly = liveApt?.monthlyRentEgp ?? fav.monthlyRentEgp;
                  const baselineMonthly = fav.baselineMonthlyRentEgp ?? fav.monthlyRentEgp;
                  const hasDropped = currentMonthly < baselineMonthly;
                  const isSelectedForCompare = compareIds.includes(fav.apartmentId);

                  return (
                    <div
                      key={fav.id}
                      className={`bg-white rounded-xl sm:rounded-2xl overflow-hidden flex flex-col justify-between min-w-0 transition-shadow ${
                        isSelectedForCompare
                          ? 'border-2 border-blue-700 shadow-sm'
                          : 'border border-slate-200'
                      }`}
                    >
                      <div>
                        <div className="relative aspect-[16/10] bg-slate-100">
                          <ApartmentImage
                            imageKey={fav.imageKey}
                            alt={fav.title}
                            className="w-full h-full"
                          />
                          <button
                            type="button"
                            aria-pressed={isSelectedForCompare}
                            onClick={() => handleToggleCompare(fav.apartmentId)}
                            className={`absolute top-2 start-2 sm:top-3 sm:start-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border backdrop-blur-md transition-colors whitespace-nowrap ${
                              isSelectedForCompare
                                ? 'bg-blue-700 border-blue-700 text-white'
                                : 'bg-white/92 border-slate-200 text-slate-800 hover:bg-white'
                            }`}
                          >
                            {isSelectedForCompare ? (
                              <Check className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <Scale className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                            )}
                            <span>
                              {isSelectedForCompare
                                ? t('محددة للمقارنة', 'Selected')
                                : t('أضف للمقارنة', 'Compare')}
                            </span>
                          </button>

                          {liveApt && (
                            <button
                              type="button"
                              disabled={togglingFavoriteId === fav.apartmentId}
                              onClick={() => onTogglePriceAlert(liveApt)}
                              aria-label={t('تنبيه انخفاض السعر', 'Price Drop Alert')}
                              className={`absolute top-2 end-2 sm:top-3 sm:end-3 inline-flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-[11px] font-semibold border backdrop-blur-md ${
                                alertActive
                                  ? 'bg-amber-50/95 border-amber-300 text-amber-900'
                                  : 'bg-white/90 border-slate-200 text-slate-700'
                              }`}
                            >
                              {alertActive ? (
                                <BellRing className="w-3.5 h-3.5 text-amber-600" />
                              ) : (
                                <Bell className="w-3.5 h-3.5 text-slate-500" />
                              )}
                              <span className="hidden sm:inline">
                                {alertActive
                                  ? t('تنبيه السعر مفعل', 'Alert On')
                                  : t('تفعيل تنبيه السعر', 'Enable Alert')}
                              </span>
                            </button>
                          )}
                        </div>

                        <div className="p-2.5 sm:p-4 space-y-1.5 sm:space-y-2">
                          <div className="text-[11px] sm:text-xs text-slate-500 truncate">
                            {govLabel(fav.governorate)} · {fav.district}
                          </div>
                          <h3 className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-2">
                            {fav.title}
                          </h3>
                          <div className="flex flex-wrap items-baseline gap-1 sm:gap-2 font-mono tabular-nums">
                            <span className="text-sm sm:text-lg font-bold text-slate-900">
                              {formatNumber(currentMonthly)}
                            </span>
                            <span className="text-[10px] sm:text-xs font-sans text-slate-500">
                              {t('ج.م / شهر', 'EGP / mo')}
                            </span>
                            {hasDropped && (
                              <span className="text-[11px] sm:text-xs text-emerald-700 line-through">
                                {formatNumber(baselineMonthly)}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono tabular-nums truncate">
                            {formatNumber(liveApt?.areaSqm ?? fav.areaSqm)} {t('م²', 'm²')} ·{' '}
                            {formatNumber(liveApt?.bedrooms ?? fav.bedrooms)}{' '}
                            {t('غرف', 'beds')} ·{' '}
                            {formatNumber(liveApt?.bathrooms ?? fav.bathrooms)}{' '}
                            {t('حمام', 'baths')}
                          </div>
                        </div>
                      </div>

                      <div className="p-2.5 sm:p-4 pt-0 flex items-center gap-1.5 sm:gap-2">
                        {liveApt && (
                          <>
                            <button
                              type="button"
                              onClick={() => onSelectApartment(liveApt)}
                              className="flex-1 py-1.5 sm:py-2 px-2 sm:px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] sm:text-xs font-semibold rounded-lg whitespace-nowrap"
                            >
                              {t('التفاصيل', 'Details')}
                            </button>
                            <button
                              type="button"
                              onClick={() => onRentApartment(liveApt)}
                              className="flex-1 py-1.5 sm:py-2 px-2 sm:px-3 bg-blue-700 hover:bg-blue-800 text-white text-[11px] sm:text-xs font-semibold rounded-lg whitespace-nowrap"
                            >
                              {t('احجز', 'Rent')}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemoveFavorite(fav)}
                          aria-label={t('إزالة من المفضلة', 'Remove from Favorites')}
                          className="p-1.5 sm:p-2 border border-slate-200 hover:bg-rose-50 hover:text-rose-700 rounded-lg text-slate-500 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SIDE-BY-SIDE UNIT COMPARISON DRAWER */}
      {isCompareDrawerOpen && comparisonUnits.length > 0 && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            aria-hidden="true"
            onClick={() => setIsCompareDrawerOpen(false)}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
          />

          <aside
            role="dialog"
            aria-modal="true"
            aria-label={t('جدول مقارنة الوحدات الجانبي', 'Side-by-Side Unit Comparison Table')}
            className="relative z-10 w-full max-w-5xl bg-white h-full border-s border-slate-200 shadow-2xl flex flex-col"
          >
            {/* Drawer Header */}
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-xs text-blue-700 font-semibold">
                  <Scale className="w-4 h-4 shrink-0" />
                  <span>{t('مقارنة الوحدات الجانبية', 'Side-by-Side Unit Comparison')}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-slate-600">
                    {formatNumber(comparisonUnits.length)} / {formatNumber(3)}{' '}
                    {t('وحدات', 'units')}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  {t(
                    'مقارنة تفصيلية للسعر والمساحة وعدد الغرف والمرافق',
                    'Detailed Comparison of Price, Area, Rooms & Amenities'
                  )}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  aria-pressed={compareOnlyDiffs}
                  onClick={() => setCompareOnlyDiffs((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                    compareOnlyDiffs
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {compareOnlyDiffs
                      ? t('عرض كل الصفوف', 'Show All Rows')
                      : t('الاختلافات فقط', 'Differences Only')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsCompareDrawerOpen(false)}
                  aria-label={t('إغلاق المقارنة', 'Close Comparison')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  <X className="w-4 h-4 shrink-0" />
                  <span>{t('إغلاق', 'Close')}</span>
                </button>
              </div>
            </div>

            {/* Scrollable Side-by-Side Comparison Matrix */}
            <div className="flex-1 overflow-auto p-4 sm:p-6">
              {(() => {
                const monthlyValues = comparisonUnits
                  .map((u) => u.monthlyRentEgp)
                  .filter((v) => v > 0);
                const minMonthlyRent = monthlyValues.length > 0 ? Math.min(...monthlyValues) : 0;

                const sqmPriceValues = comparisonUnits
                  .map((u) => u.pricePerSqm)
                  .filter((v) => v > 0);
                const minPricePerSqm = sqmPriceValues.length > 0 ? Math.min(...sqmPriceValues) : 0;

                const areaValues = comparisonUnits.map((u) => u.areaSqm);
                const maxAreaSqm = areaValues.length > 0 ? Math.max(...areaValues) : 0;

                const bedroomValues = comparisonUnits.map((u) => u.bedrooms);
                const maxBedrooms = bedroomValues.length > 0 ? Math.max(...bedroomValues) : 0;

                const bathroomValues = comparisonUnits.map((u) => u.bathrooms);
                const maxBathrooms = bathroomValues.length > 0 ? Math.max(...bathroomValues) : 0;

                const isDistinct = (keys: Array<string | number | boolean>): boolean =>
                  new Set(keys.map(String)).size > 1;

                const showWholeHouseRow = comparisonUnits.some(
                  (u) => u.category === 'whole_house' || u.houseApartmentsCount
                );
                const showDailyRow = comparisonUnits.some((u) => u.dailyRateEgp > 0);
                const showStudentRow = comparisonUnits.some(
                  (u) => u.category === 'student_housing' || u.studentBedsCount > 0
                );

                const rows: Array<{
                  id: string;
                  group: string;
                  label: string;
                  diffKeyValues: Array<string | number | boolean>;
                  renderCell: (unit: (typeof comparisonUnits)[number]) => React.ReactNode;
                }> = [
                  {
                    id: 'category',
                    group: t('نظرة عامة', 'Overview'),
                    label: t('التصنيف العقاري', 'Category'),
                    diffKeyValues: comparisonUnits.map((u) => u.category),
                    renderCell: (u) => (
                      <span className="font-semibold text-slate-900">
                        {categorySingularLabel(u.category)}
                      </span>
                    ),
                  },
                  {
                    id: 'location',
                    group: t('نظرة عامة', 'Overview'),
                    label: t('المحافظة والمنطقة', 'Location'),
                    diffKeyValues: comparisonUnits.map((u) => `${u.governorate}-${u.district}`),
                    renderCell: (u) => (
                      <span className="text-slate-700">
                        {govLabel(u.governorate)} · {u.district}
                      </span>
                    ),
                  },
                  {
                    id: 'monthly_rent',
                    group: t('السعر والتكلفة', 'Pricing'),
                    label: t('الإيجار الشهري', 'Monthly Rent'),
                    diffKeyValues: comparisonUnits.map((u) => u.monthlyRentEgp),
                    renderCell: (u) => {
                      const isBest =
                        comparisonUnits.length > 1 &&
                        minMonthlyRent > 0 &&
                        u.monthlyRentEgp === minMonthlyRent;
                      const diff = u.monthlyRentEgp - minMonthlyRent;
                      return (
                        <div className="space-y-0.5 font-mono tabular-nums">
                          <div className="flex flex-wrap items-baseline gap-1.5">
                            <span
                              className={`text-sm font-bold ${
                                isBest ? 'text-emerald-700' : 'text-slate-900'
                              }`}
                            >
                              {formatNumber(u.monthlyRentEgp)} {t('ج.م', 'EGP')}
                            </span>
                            {isBest && (
                              <span className="text-[11px] font-sans font-bold text-emerald-700">
                                · {t('الأقل سعراً', 'Lowest')}
                              </span>
                            )}
                          </div>
                          {diff > 0 && comparisonUnits.length > 1 && (
                            <div className="text-[11px] text-slate-500">
                              +{formatNumber(diff)} {t('ج.م مقارنة بالأقل', 'EGP above lowest')}
                            </div>
                          )}
                        </div>
                      );
                    },
                  },
                  {
                    id: 'price_per_sqm',
                    group: t('السعر والتكلفة', 'Pricing'),
                    label: t('متوسط سعر المتر شهرياً', 'Monthly Price / m²'),
                    diffKeyValues: comparisonUnits.map((u) => u.pricePerSqm),
                    renderCell: (u) => {
                      const isBest =
                        comparisonUnits.length > 1 &&
                        minPricePerSqm > 0 &&
                        u.pricePerSqm === minPricePerSqm;
                      return (
                        <span
                          className={`font-mono tabular-nums font-semibold ${
                            isBest ? 'text-emerald-700' : 'text-slate-800'
                          }`}
                        >
                          {u.pricePerSqm > 0
                            ? `${formatNumber(u.pricePerSqm)} ${t('ج.م/م²', 'EGP/m²')}`
                            : '—'}
                        </span>
                      );
                    },
                  },
                  ...(showDailyRow
                    ? [
                        {
                          id: 'daily_rate',
                          group: t('السعر والتكلفة', 'Pricing'),
                          label: t('سعر الإيجار اليومي', 'Daily Rate'),
                          diffKeyValues: comparisonUnits.map((u) => u.dailyRateEgp),
                          renderCell: (u: (typeof comparisonUnits)[number]) => (
                            <span className="font-mono tabular-nums text-slate-800 font-semibold">
                              {u.dailyRateEgp > 0
                                ? `${formatNumber(u.dailyRateEgp)} ${t('ج.م/يوم', 'EGP/night')}`
                                : t('شهري فقط', 'Monthly only')}
                            </span>
                          ),
                        },
                      ]
                    : []),
                  ...(showStudentRow
                    ? [
                        {
                          id: 'student_beds',
                          group: t('السعر والتكلفة', 'Pricing'),
                          label: t('سراير الطلاب وسعر السرير', 'Student Beds & Price/Bed'),
                          diffKeyValues: comparisonUnits.map(
                            (u) => `${u.studentBedsCount}-${u.studentPricePerBedEgp}`
                          ),
                          renderCell: (u: (typeof comparisonUnits)[number]) =>
                            u.studentBedsCount > 0 ? (
                              <span className="font-mono tabular-nums text-slate-800 font-semibold">
                                {formatNumber(u.studentBedsCount)} {t('سرير', 'beds')} ·{' '}
                                {formatNumber(u.studentPricePerBedEgp)} {t('ج.م/سرير', 'EGP/bed')}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            ),
                        },
                      ]
                    : []),
                  {
                    id: 'commission',
                    group: t('السعر والتكلفة', 'Pricing'),
                    label: t('عمولة المنصة', 'Platform Commission'),
                    diffKeyValues: comparisonUnits.map((u) => u.effectiveCommissionPct),
                    renderCell: (u) => (
                      <span className="font-mono tabular-nums text-blue-700 font-semibold">
                        {formatNumber(u.effectiveCommissionPct)}%
                      </span>
                    ),
                  },
                  {
                    id: 'area',
                    group: t('المساحة والغرف', 'Area & Rooms'),
                    label: t('المساحة الإجمالية', 'Total Area'),
                    diffKeyValues: comparisonUnits.map((u) => u.areaSqm),
                    renderCell: (u) => {
                      const isBest = comparisonUnits.length > 1 && u.areaSqm === maxAreaSqm;
                      return (
                        <div className="font-mono tabular-nums">
                          <span
                            className={`text-sm font-bold ${
                              isBest ? 'text-blue-700' : 'text-slate-900'
                            }`}
                          >
                            {formatNumber(u.areaSqm)} {t('م²', 'm²')}
                          </span>
                          {isBest && (
                            <span className="text-[11px] font-sans font-bold text-blue-700 ms-1.5">
                              · {t('الأكبر مساحة', 'Largest')}
                            </span>
                          )}
                        </div>
                      );
                    },
                  },
                  {
                    id: 'bedrooms',
                    group: t('المساحة والغرف', 'Area & Rooms'),
                    label: t('عدد الغرف', 'Bedrooms'),
                    diffKeyValues: comparisonUnits.map((u) => u.bedrooms),
                    renderCell: (u) => {
                      const isBest =
                        comparisonUnits.length > 1 && u.bedrooms === maxBedrooms && maxBedrooms > 0;
                      return (
                        <span
                          className={`font-mono tabular-nums font-bold ${
                            isBest ? 'text-blue-700' : 'text-slate-900'
                          }`}
                        >
                          {formatNumber(u.bedrooms)} {t('غرفة', 'bedrooms')}
                        </span>
                      );
                    },
                  },
                  {
                    id: 'bathrooms',
                    group: t('المساحة والغرف', 'Area & Rooms'),
                    label: t('عدد الحمامات', 'Bathrooms'),
                    diffKeyValues: comparisonUnits.map((u) => u.bathrooms),
                    renderCell: (u) => {
                      const isBest =
                        comparisonUnits.length > 1 &&
                        u.bathrooms === maxBathrooms &&
                        maxBathrooms > 0;
                      return (
                        <span
                          className={`font-mono tabular-nums font-semibold ${
                            isBest ? 'text-blue-700' : 'text-slate-800'
                          }`}
                        >
                          {formatNumber(u.bathrooms)} {t('حمام', 'bathrooms')}
                        </span>
                      );
                    },
                  },
                  ...(showWholeHouseRow
                    ? [
                        {
                          id: 'house_structure',
                          group: t('المساحة والغرف', 'Area & Rooms'),
                          label: t('الشقق والأدوار بالمنزل', 'House Apartments & Floors'),
                          diffKeyValues: comparisonUnits.map(
                            (u) => `${u.houseApartmentsCount || 0}-${u.houseFloorsCount || 0}`
                          ),
                          renderCell: (u: (typeof comparisonUnits)[number]) =>
                            u.houseApartmentsCount || u.houseFloorsCount ? (
                              <span className="font-mono tabular-nums text-slate-800">
                                {formatNumber(u.houseApartmentsCount || 1)}{' '}
                                {t('شقق', 'apts')} · {formatNumber(u.houseFloorsCount || 1)}{' '}
                                {t('أدوار', 'floors')}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            ),
                        },
                      ]
                    : []),
                  {
                    id: 'furnishing',
                    group: t('المرافق والتجهيزات', 'Amenities'),
                    label: t('حالة التجهيز والفرش', 'Furnishing'),
                    diffKeyValues: comparisonUnits.map((u) => u.furnishing),
                    renderCell: (u) => (
                      <span className="font-semibold text-slate-800">
                        {furnishingLabel(u.furnishing)}
                      </span>
                    ),
                  },
                  {
                    id: 'private_garage',
                    group: t('المرافق والتجهيزات', 'Amenities'),
                    label: t('جراج خاص', 'Private Garage'),
                    diffKeyValues: comparisonUnits.map((u) => u.hasPrivateGarage),
                    renderCell: (u) =>
                      u.hasPrivateGarage ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>{t('متوفر', 'Available')}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <Minus className="w-3.5 h-3.5 shrink-0" />
                          <span>{t('غير متوفر', 'Not listed')}</span>
                        </span>
                      ),
                  },
                  {
                    id: 'garden_roof',
                    group: t('المرافق والتجهيزات', 'Amenities'),
                    label: t('حديقة خاصة أو روف', 'Garden or Roof'),
                    diffKeyValues: comparisonUnits.map((u) => u.hasGardenOrRoof),
                    renderCell: (u) =>
                      u.hasGardenOrRoof ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>{t('متوفر', 'Available')}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <Minus className="w-3.5 h-3.5 shrink-0" />
                          <span>{t('غير متوفر', 'Not listed')}</span>
                        </span>
                      ),
                  },
                  {
                    id: 'virtual_tour',
                    group: t('المرافق والتجهيزات', 'Amenities'),
                    label: t('جولة افتراضية 360°', '360° Virtual Tour'),
                    diffKeyValues: comparisonUnits.map((u) => u.hasVirtualTour),
                    renderCell: (u) =>
                      u.hasVirtualTour ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-blue-700">
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>{t('معاينة 360° متاحة', '360° Tour Ready')}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <Minus className="w-3.5 h-3.5 shrink-0" />
                          <span>{t('غير متاحة', 'Not available')}</span>
                        </span>
                      ),
                  },
                  {
                    id: 'verification',
                    group: t('المرافق والتجهيزات', 'Amenities'),
                    label: t('توثيق الملكية والسمعة', 'Verification & Rating'),
                    diffKeyValues: comparisonUnits.map(
                      (u) => `${u.isVerified}-${u.avgRating ?? 'none'}`
                    ),
                    renderCell: (u) => (
                      <div className="space-y-0.5 text-slate-700">
                        <div className="font-semibold">
                          {u.isVerified
                            ? t('ملكية موثقة ✓', 'Title Verified ✓')
                            : t('قيد المراجعة', 'Pending Review')}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500">
                          {u.avgRating !== null
                            ? `${formatNumber(u.avgRating, 1)} ★ (${formatNumber(u.reviewCount)})`
                            : t('لا توجد تقييمات بعد', 'No reviews yet')}
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: 'price_alert',
                    group: t('المرافق والتجهيزات', 'Amenities'),
                    label: t('تنبيه انخفاض السعر', 'Price Drop Alert'),
                    diffKeyValues: comparisonUnits.map((u) => u.priceAlertActive),
                    renderCell: (u) =>
                      u.priceAlertActive ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
                          <BellRing className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>{t('مفعل', 'Active')}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">{t('غير مفعل', 'Off')}</span>
                      ),
                  },
                ];

                const displayedRows = compareOnlyDiffs
                  ? rows.filter((r) => isDistinct(r.diffKeyValues))
                  : rows;

                return (
                  <div className="border border-slate-200 rounded-2xl overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/80 align-top">
                          <th className="w-44 sm:w-52 p-4 text-start font-bold text-slate-700 align-bottom">
                            {t('وجه المقارنة', 'Comparison Criteria')}
                          </th>
                          {comparisonUnits.map((u) => (
                            <th
                              key={u.apartmentId}
                              className="p-3.5 text-start align-top border-s border-slate-200 min-w-[190px]"
                            >
                              <div className="space-y-2.5">
                                <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-slate-100">
                                  <ApartmentImage
                                    imageKey={u.imageKey}
                                    alt={u.title}
                                    className="w-full h-full"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleToggleCompare(u.apartmentId)}
                                    aria-label={t('إزالة من المقارنة', 'Remove from comparison')}
                                    className="absolute top-2 end-2 p-1.5 rounded-lg bg-white/95 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="space-y-1">
                                  <div className="text-[11px] font-medium text-slate-500">
                                    {govLabel(u.governorate)} · {u.district}
                                  </div>
                                  <div className="text-sm font-bold text-slate-900 line-clamp-2 leading-snug">
                                    {u.title}
                                  </div>
                                </div>
                                {u.liveApt ? (
                                  <div className="flex items-center gap-1.5 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsCompareDrawerOpen(false);
                                        onSelectApartment(u.liveApt!);
                                      }}
                                      className="flex-1 py-1.5 px-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 text-[11px] font-semibold rounded-lg whitespace-nowrap"
                                    >
                                      {t('التفاصيل', 'Details')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsCompareDrawerOpen(false);
                                        onRentApartment(u.liveApt!);
                                      }}
                                      className="flex-1 py-1.5 px-2.5 bg-blue-700 hover:bg-blue-800 text-white text-[11px] font-semibold rounded-lg whitespace-nowrap"
                                    >
                                      {t('احجز', 'Rent')}
                                    </button>
                                  </div>
                                ) : (
                                  <div className="text-[11px] font-semibold text-amber-700 pt-1">
                                    {t('غير متاحة للحجز حالياً', 'Currently unavailable')}
                                  </div>
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {displayedRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={comparisonUnits.length + 1}
                              className="p-8 text-center text-slate-500"
                            >
                              {t(
                                'الوحدات المختارة متطابقة في جميع المعايير المعروضة — عطّل خيار «الاختلافات فقط» لرؤية الجدول بالكامل.',
                                'Selected units match across all attributes — turn off "Differences Only" to view the full matrix.'
                              )}
                            </td>
                          </tr>
                        ) : (
                          displayedRows.map((row) => (
                            <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="p-3.5 font-semibold text-slate-700 bg-slate-50/50 align-middle">
                                <div className="text-[10px] font-medium text-slate-400">
                                  {row.group}
                                </div>
                                <div>{row.label}</div>
                              </td>
                              {comparisonUnits.map((unit) => (
                                <td
                                  key={`${row.id}-${unit.apartmentId}`}
                                  className="p-3.5 border-s border-slate-100 align-middle"
                                >
                                  {row.renderCell(unit)}
                                </td>
                              ))}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

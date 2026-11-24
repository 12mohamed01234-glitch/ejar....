import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { X, Star, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { db, logFirestoreDiagnostic, OperationType } from '../lib/firebase';
import { BookingRecord, LandlordVerdict, ReviewRecord } from '../lib/validation';
import { useI18n } from '../lib/i18n';

interface TenantReviewModalProps {
  booking: BookingRecord | null;
  existingReview: ReviewRecord | null;
  currentUser: User | null;
  onClose: () => void;
  onSubmitted?: () => void;
}

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

export const TenantReviewModal: React.FC<TenantReviewModalProps> = ({
  booking,
  existingReview,
  currentUser,
  onClose,
  onSubmitted,
}) => {
  const { t, verdictLabel } = useI18n();
  const [rating, setRating] = useState<number>(5);
  const [landlordRating, setLandlordRating] = useState<number>(5);
  const [landlordVerdict, setLandlordVerdict] = useState<LandlordVerdict>('trusted');
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (existingReview) {
      setRating(existingReview.rating);
      setLandlordRating(existingReview.landlordRating);
      setLandlordVerdict(existingReview.landlordVerdict);
      setComment(existingReview.comment);
    } else {
      setRating(5);
      setLandlordRating(5);
      setLandlordVerdict('trusted');
      setComment('');
    }
    setErrorMsg(null);
    setSavedSuccess(false);
  }, [booking, existingReview]);

  if (!booking || !currentUser) return null;

  const landlordName =
    booking.landlordDisplayName?.trim() || t('مالك الوحدة الموثق', 'Verified Landlord');
  const trimmedComment = comment.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (trimmedComment.length < 10) {
      setErrorMsg(
        t(
          'يرجى كتابة تجربتك في 10 أحرف على الأقل لمساعدة المستأجرين القادمين.',
          'Please write at least 10 characters describing your rental experience.'
        )
      );
      return;
    }
    if (trimmedComment.length > 800) {
      setErrorMsg(
        t(
          'يرجى ألا يتجاوز التقييم النصي 800 حرف.',
          'Review comment must not exceed 800 characters.'
        )
      );
      return;
    }

    setSubmitting(true);
    const reviewId = booking.id;
    const tenantName = (
      currentUser.displayName?.trim() ||
      booking.tenantDisplayName ||
      'مستأجر موثق'
    ).slice(0, 80);

    try {
      if (existingReview && existingReview.isPersistedInDb) {
        await updateDoc(doc(db, 'reviews', reviewId), {
          rating,
          landlordRating,
          landlordVerdict,
          comment: trimmedComment.slice(0, 800),
          tenantDisplayName: tenantName.length >= 2 ? tenantName : 'مستأجر موثق',
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'reviews', reviewId), {
          bookingId: booking.id,
          apartmentId: booking.apartmentId,
          apartmentTitle: booking.apartmentTitle.slice(0, 120),
          governorate: booking.governorate.slice(0, 50),
          landlordId: booking.landlordId,
          landlordDisplayName:
            landlordName.length >= 2 ? landlordName.slice(0, 80) : 'مالك عقار موثق',
          tenantId: currentUser.uid,
          tenantDisplayName: tenantName.length >= 2 ? tenantName : 'مستأجر موثق',
          rating,
          landlordRating,
          landlordVerdict,
          comment: trimmedComment.slice(0, 800),
          visibilityStatus: 'published',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setSavedSuccess(true);
      onSubmitted?.();
    } catch (err) {
      logFirestoreDiagnostic(
        err,
        existingReview?.isPersistedInDb ? OperationType.UPDATE : OperationType.CREATE,
        `reviews/${reviewId}`
      );
      setErrorMsg(
        t(
          'تعذر حفظ التقييم حالياً. يرجى التأكد من اتصالك وصلاحية جلستك والمحاولة مرة أخرى.',
          'Could not save your review right now. Please check your connection and session and try again.'
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tenant-review-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-xl">
        {/* Mobile Sheet Grab Handle */}
        <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mt-3 sm:hidden" />

        <div className="sticky top-0 z-10 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 bg-white/95 backdrop-blur-md flex items-center justify-between gap-3">
          <div>
            <h2
              id="tenant-review-modal-title"
              className="font-display text-sm sm:text-base font-bold text-slate-900"
            >
              {existingReview
                ? t('تعديل تقييم الشقة وحساب المالك', 'Edit Unit & Landlord Review')
                : t('تقييم الشقة ومصداقية حساب المالك', 'Rate Unit & Landlord Trust')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {t(
                `يُحفظ دائماً على حساب المالك (${landlordName}) في منصة إيجار`,
                `Permanently recorded on landlord profile (${landlordName})`
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-xl hover:bg-slate-100 cursor-pointer"
            aria-label={t('إغلاق نافذة التقييم', 'Close review dialog')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {savedSuccess ? (
          <div className="p-6 sm:p-8 text-center space-y-4">
            <CheckCircle2 className="w-11 h-11 text-emerald-600 mx-auto" />
            <h3 className="font-display text-xl font-bold text-slate-900">
              {t(
                'تم تسجيل تقييمك على حساب المالك بنجاح',
                'Your Verified Review Has Been Published'
              )}
            </h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              {t(
                `تقييمك الموثق أصبح جزءاً دائماً من سجل حساب المالك (${landlordName}) على إيجار لمساعدة جميع المستأجرين في معرفة مدى التزامه ومصداقيته.`,
                `Your review is now permanently linked to ${landlordName}'s account on Ejar to help future tenants verify reliability.`
              )}
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                {t('إغلاق والعودة', 'Close & Return')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
            <div className="pb-4 border-b border-slate-200 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-slate-500">{t('الوحدة المستأجرة: ', 'Rented Unit: ')}</span>
                <strong className="text-slate-900">{booking.apartmentTitle}</strong>
              </div>
              <div>
                <span className="text-slate-500">{t('حساب العارض: ', 'Landlord: ')}</span>
                <strong className="text-slate-900">{landlordName}</strong>
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-medium">
                {errorMsg}
              </div>
            )}

            {/* 1. Apartment Quality Star Rating */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-900">
                  {t('تقييم الوحدة ومطابقتها للوصف', 'Unit Quality & Accuracy')}
                </label>
                <div
                  className="flex items-center gap-1"
                  role="radiogroup"
                  aria-label={t('تقييم الوحدة', 'Unit rating')}
                >
                  {STAR_VALUES.map((val) => {
                    const active = val <= rating;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setRating(val)}
                        aria-label={`${val}`}
                        className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <Star
                          className={`w-6 h-6 ${
                            active
                              ? 'fill-amber-400 text-amber-500'
                              : 'fill-transparent text-slate-300'
                          }`}
                        />
                      </button>
                    );
                  })}
                  <span className="ms-1 font-mono tabular-nums text-xs font-bold text-slate-900">
                    {rating}/5
                  </span>
                </div>
              </div>

              {/* 2. Landlord Account Honesty Star Rating */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-900">
                  {t('تقييم تعامل وأمانة حساب المالك', 'Landlord Honesty & Commitment')}
                </label>
                <div
                  className="flex items-center gap-1"
                  role="radiogroup"
                  aria-label={t('تقييم حساب المالك', 'Landlord rating')}
                >
                  {STAR_VALUES.map((val) => {
                    const active = val <= landlordRating;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setLandlordRating(val)}
                        aria-label={`${val}`}
                        className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <Star
                          className={`w-6 h-6 ${
                            active
                              ? 'fill-blue-600 text-blue-700'
                              : 'fill-transparent text-slate-300'
                          }`}
                        />
                      </button>
                    );
                  })}
                  <span className="ms-1 font-mono tabular-nums text-xs font-bold text-blue-700">
                    {landlordRating}/5
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Direct Landlord Account Verdict */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-900">
                {t(
                  'شهادتك على حساب عارض الشقة (هل المالك ملتزم ومضمون؟)',
                  'Your Verdict on the Landlord Account'
                )}
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
                {(['trusted', 'acceptable', 'unreliable'] as const).map((verdict) => {
                  const isActive = landlordVerdict === verdict;
                  return (
                    <button
                      key={verdict}
                      type="button"
                      onClick={() => setLandlordVerdict(verdict)}
                      className={`min-h-[40px] py-2 px-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-white text-blue-700 font-semibold shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {verdict === 'trusted' && t('تمام وموثوق', 'Trusted')}
                      {verdict === 'acceptable' && t('تعامل مقبول', 'Acceptable')}
                      {verdict === 'unreliable' && t('غير ملتزم', 'Unreliable')}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500">
                {t('الحالة المختارة: ', 'Selected verdict: ')}
                {verdictLabel(landlordVerdict)}
              </p>
            </div>

            {/* 4. Written Experience Review */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="review-comment-input"
                  className="text-xs font-semibold text-slate-900"
                >
                  {t(
                    'التقييم النصي وتفاصيل تجربتك مع المالك والشقة',
                    'Written Experience Review'
                  )}
                </label>
                <span className="font-mono tabular-nums text-[11px] text-slate-400">
                  {trimmedComment.length}/800
                </span>
              </div>
              <textarea
                id="review-comment-input"
                rows={4}
                maxLength={800}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t(
                  'اكتب تجربتك بكل صراحة: هل الشقة كانت مطابقة للصور؟ كيف كان التزام المالك بتسليم المفتاح والمرافق؟',
                  'Share your honest experience: did the unit match the listing photos, and was key handover smooth?'
                )}
                className="w-full p-3 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-700 leading-relaxed"
              />
            </div>

            <div className="pt-2 pb-2 sm:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" />
                <span>
                  {t(
                    'تقييم مستأجر حقيقي موثق بعقد ضمان إيجار',
                    'Verified tenant review backed by an Ejar escrow contract'
                  )}
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {submitting
                  ? t('جاري الحفظ...', 'Saving...')
                  : existingReview
                    ? t('حفظ تعديل التقييم', 'Update Review')
                    : t('نشر التقييم على حساب المالك', 'Publish Review')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

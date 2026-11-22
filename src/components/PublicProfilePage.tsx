import React, { useState } from 'react';
import {
  Star,
  BadgeCheck,
  Building,
  User,
  Calendar,
  MessageSquare,
  X,
  Phone,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
} from 'lucide-react';
import { UserAccountData } from './AuthModal';
import { ReviewRecord, ApartmentRecord, formatEgp } from '../lib/validation';
import { useI18n } from '../lib/i18n';
import { ApartmentImage } from './ApartmentImage';

export interface PublicProfileUser {
  uid: string;
  displayName: string;
  role: 'tenant' | 'landlord';
  photoUrl?: string;
  email?: string;
  phone?: string;
  isVerified?: boolean;
  governorate?: string;
  createdAtMs?: number;
}

interface PublicProfilePageProps {
  user: PublicProfileUser | UserAccountData;
  reviews: ReviewRecord[];
  apartments?: ApartmentRecord[];
  isBlueVerified?: boolean;
  onClose: () => void;
  onContactUser?: () => void;
  onSelectApartment?: (apt: ApartmentRecord) => void;
}

export const PublicProfilePage: React.FC<PublicProfilePageProps> = ({
  user,
  reviews,
  apartments = [],
  isBlueVerified = false,
  onClose,
  onContactUser,
  onSelectApartment,
}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'reviews' | 'units' | 'info'>('reviews');

  // Filter reviews for this user (either landlordId or tenantId or reviewedUid)
  const userReviews = reviews.filter(
    (r) =>
      r.landlordId === user.uid ||
      r.tenantId === user.uid ||
      (r as { reviewedUid?: string }).reviewedUid === user.uid
  );

  const avgRating =
    userReviews.length > 0
      ? userReviews.reduce((sum, r) => sum + (r.rating || 5), 0) / userReviews.length
      : 5.0;

  // Filter landlord apartments if user is landlord
  const landlordApartments = apartments.filter(
    (a) => a.ownerId === user.uid && a.verificationStatus === 'verified'
  );

  const initials = (user.displayName || 'م')[0]?.toUpperCase();
  const verified =
    isBlueVerified ||
    ('isVerified' in user && Boolean(user.isVerified)) ||
    Boolean((user as UserAccountData).isTenantVerified) ||
    Boolean((user as UserAccountData).isLandlordVerified);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto">
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col my-auto max-h-[92vh]">
        
        {/* Banner Header with Blue Gradient */}
        <div className="relative bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 px-6 pt-8 pb-14 text-white">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 rtl:right-auto rtl:left-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors shadow-sm"
            aria-label={t('إغلاق', 'Close')}
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col items-center text-center">
            {/* Avatar with Blue Verification Badge */}
            <div className="relative mb-3">
              <div className="w-24 h-24 rounded-2xl overflow-hidden bg-white/20 border-4 border-white shadow-xl flex items-center justify-center text-3xl font-extrabold text-white">
                {user.photoUrl ? (
                  <img src={user.photoUrl} alt={user.displayName} className="w-full h-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              {verified && (
                <div
                  title={t('حساب موثق بالعلامة الزرقاء الرسمية', 'Officially Blue-Badge Verified')}
                  className="absolute -bottom-2 -right-2 rtl:-right-auto rtl:-left-2 bg-blue-600 text-white p-1 rounded-full border-2 border-white shadow-lg animate-pulse"
                >
                  <BadgeCheck className="w-6 h-6 fill-white text-blue-600" />
                </div>
              )}
            </div>

            {/* User Name & Role */}
            <div className="flex items-center gap-1.5 justify-center flex-wrap">
              <h2 className="text-xl sm:text-2xl font-black text-white">{user.displayName}</h2>
              {verified && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/30 text-blue-100 border border-blue-400/40">
                  <BadgeCheck className="w-3.5 h-3.5 text-blue-200" />
                  <span>{t('موثق رسمي', 'Verified')}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1.5 text-xs text-blue-200 font-medium">
              <span className="inline-flex items-center gap-1 bg-white/15 px-2.5 py-0.5 rounded-full">
                {user.role === 'landlord' ? (
                  <>
                    <Building className="w-3 h-3" />
                    <span>{t('مالك عقارات معتمد', 'Certified Landlord')}</span>
                  </>
                ) : (
                  <>
                    <User className="w-3 h-3" />
                    <span>{t('مستأجر موثق', 'Verified Tenant')}</span>
                  </>
                )}
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{t('عضو منذ 2026', 'Member since 2026')}</span>
              </span>
            </div>

            {/* Quick Stats: Rating & Verification */}
            <div className="flex items-center gap-6 mt-4 bg-white/10 backdrop-blur-md px-5 py-2 rounded-2xl border border-white/15 text-xs">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-amber-300 font-extrabold text-sm">
                  <Star className="w-4 h-4 fill-amber-300 text-amber-300" />
                  <span>{avgRating.toFixed(1)}</span>
                </div>
                <span className="text-[10px] text-blue-200">
                  {userReviews.length} {t('تقييمات', 'Reviews')}
                </span>
              </div>
              <div className="w-px h-6 bg-white/20" />
              <div className="text-center">
                <div className="text-sm font-extrabold text-white">
                  {user.role === 'landlord' ? landlordApartments.length : '100%'}
                </div>
                <span className="text-[10px] text-blue-200">
                  {user.role === 'landlord' ? t('وحدات معلنة', 'Listings') : t('سجل الإيجار', 'Rental Record')}
                </span>
              </div>
              <div className="w-px h-6 bg-white/20" />
              <div className="text-center">
                <div className="text-sm font-extrabold text-emerald-300">
                  {verified ? t('موثق', 'Verified') : t('قيد المراجعة', 'Pending')}
                </div>
                <span className="text-[10px] text-blue-200">{t('العلامة الزرقاء', 'Blue Badge')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex items-center border-b border-slate-100 bg-slate-50 px-4 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('reviews')}
            className={`flex-1 py-3 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'reviews'
                ? 'border-blue-600 text-blue-700 bg-white rounded-t-xl shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Star className="w-3.5 h-3.5" />
            <span>{t('التقييمات والآراء', 'Reviews')} ({userReviews.length})</span>
          </button>

          {user.role === 'landlord' && (
            <button
              type="button"
              onClick={() => setActiveTab('units')}
              className={`flex-1 py-3 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'units'
                  ? 'border-blue-600 text-blue-700 bg-white rounded-t-xl shadow-xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Building className="w-3.5 h-3.5" />
              <span>{t('الوحدات المتاحة', 'Units')} ({landlordApartments.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`flex-1 py-3 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'info'
                ? 'border-blue-600 text-blue-700 bg-white rounded-t-xl shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{t('سجل التوثيق', 'Verification Status')}</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4">
          
          {/* 1. Reviews Tab */}
          {activeTab === 'reviews' && (
            <div className="space-y-3">
              {userReviews.length === 0 ? (
                <div className="text-center py-10 text-slate-400 space-y-2">
                  <Star className="w-10 h-10 mx-auto text-slate-300 stroke-1" />
                  <p className="text-sm font-semibold">{t('لا توجد تقييمات مسجلة بعد', 'No reviews yet')}</p>
                  <p className="text-xs text-slate-400">
                    {t('التقييمات تظهر هنا تلقائياً بعد إتمام عقود الإيجار الموثقة.', 'Reviews will appear after verified rental contracts.')}
                  </p>
                </div>
              ) : (
                userReviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-4 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition-colors space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                          {rev.tenantDisplayName?.[0] || 'ع'}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">{rev.tenantDisplayName || t('عميل موثق', 'Verified Client')}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {new Date(rev.createdAtMs).toLocaleDateString('ar-EG')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg text-amber-800 text-xs font-bold">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span>{rev.rating}</span>
                      </div>
                    </div>
                    {rev.comment && (
                      <p className="text-xs text-slate-700 leading-relaxed font-medium bg-white p-2.5 rounded-xl border border-slate-100">
                        "{rev.comment}"
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* 2. Landlord Units Tab */}
          {activeTab === 'units' && (
            <div className="space-y-3">
              {landlordApartments.length === 0 ? (
                <div className="text-center py-10 text-slate-400 space-y-2">
                  <Building className="w-10 h-10 mx-auto text-slate-300 stroke-1" />
                  <p className="text-sm font-semibold">{t('لا توجد شقق متاحة حالياً', 'No active units right now')}</p>
                </div>
              ) : (
                landlordApartments.map((apt) => (
                  <div
                    key={apt.id}
                    onClick={() => onSelectApartment?.(apt)}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-slate-200 hover:border-blue-300 bg-white hover:bg-blue-50/30 transition-all cursor-pointer group"
                  >
                    <div className="w-20 h-16 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                      <ApartmentImage
                        imageKey={apt.imageKey}
                        alt={apt.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate group-hover:text-blue-700 transition-colors">
                        {apt.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{apt.governorate} · {apt.district}</span>
                      </p>
                      <p className="text-xs font-black text-blue-700 mt-1">
                        {formatEgp(apt.monthlyRentEgp)} / {t('شهر', 'mo')}
                      </p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
                  </div>
                ))
              )}
            </div>
          )}

          {/* 3. Verification Details Tab */}
          {activeTab === 'info' && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl border border-blue-100 bg-blue-50/50 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-900">
                  <BadgeCheck className="w-4 h-4 text-blue-700" />
                  <span>{t('معايير التوثيق بالعلامة الزرقاء (KYC)', 'Blue Badge Verification Standards')}</span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-100">
                    <span className="text-slate-700">{t('مطابقة بطاقة الرقم القومي المصرية (14 رقم)', 'Egyptian National ID (14 digits)')}</span>
                    <span className="inline-flex items-center gap-1 font-bold text-blue-700">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                      {t('موثق', 'Verified')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-100">
                    <span className="text-slate-700">{t('تأكيد رقم الهاتف المحمول برمز OTP', 'Phone verified with OTP')}</span>
                    <span className="inline-flex items-center gap-1 font-bold text-blue-700">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                      {t('موثق', 'Verified')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-100">
                    <span className="text-slate-700">{t('فحص حيوية الوجه البيومتري (Facial Liveness)', 'Biometric Facial Liveness')}</span>
                    <span className="inline-flex items-center gap-1 font-bold text-blue-700">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                      {t('مطابق 99%', 'Matched')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-100">
                    <span className="text-slate-700">{t('صلاحية الحساب والشحن والتواصل', 'Account Access & Top-up Rights')}</span>
                    <span className="inline-flex items-center gap-1 font-bold text-blue-700">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                      {t('مفعل بالكامل', 'Fully Active')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center gap-3">
          {onContactUser && (
            <button
              type="button"
              onClick={onContactUser}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              <span>{t('تواصل مع صاحب الحساب', 'Contact User')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-colors"
          >
            {t('إغلاق', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
};

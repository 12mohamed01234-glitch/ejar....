import React, { useState, useMemo } from 'react';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Trash2,
  X,
  CreditCard,
  Wallet,
  ShieldAlert,
  AlertTriangle,
  Home,
  MessageSquare,
  Clock,
  ExternalLink,
} from 'lucide-react';
import {
  NotificationRecord,
  NotificationStatusType,
  formatArabicTimestamp,
  formatEgp,
} from '../lib/validation';
import { useI18n } from '../lib/i18n';

interface NotificationsInboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationRecord[];
  onMarkAsRead: (notifId: string) => Promise<void> | void;
  onMarkAllAsRead: () => Promise<void> | void;
  onClearAll?: () => Promise<void> | void;
  onOpenBookingTab?: () => void;
  onOpenWalletModal?: () => void;
  onOpenChatForApartment?: (apartmentId: string) => void;
}

type NotifCategoryFilter = 'all' | 'payments_bookings' | 'security_warnings' | 'contracts_listings';

export const NotificationsInboxModal: React.FC<NotificationsInboxModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  onOpenBookingTab,
  onOpenWalletModal,
}) => {
  const { lang, t, formatNumber } = useI18n();
  const [filter, setFilter] = useState<NotifCategoryFilter>('all');

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notif) => {
      if (filter === 'all') return true;
      if (filter === 'payments_bookings') {
        return (
          notif.statusType === 'booking_confirmed' ||
          notif.statusType === 'payment_received' ||
          notif.statusType === 'wallet_deposit' ||
          notif.statusType === 'awaiting_payment' ||
          notif.relatedEntityType === 'booking' ||
          notif.relatedEntityType === 'wallet'
        );
      }
      if (filter === 'security_warnings') {
        return (
          notif.statusType === 'ai_warning' ||
          notif.statusType === 'account_ban' ||
          notif.statusType === 'cancelled' ||
          notif.relatedEntityType === 'security' ||
          notif.title.includes('تحذير') ||
          notif.title.includes('حظر') ||
          notif.title.includes('أمان') ||
          notif.message.includes('الذكاء الاصطناعي')
        );
      }
      if (filter === 'contracts_listings') {
        return (
          notif.statusType === 'approved' ||
          notif.statusType === 'listing_published' ||
          notif.statusType === 'chat_unlocked' ||
          notif.relatedEntityType === 'apartment' ||
          notif.relatedEntityType === 'rental_request'
        );
      }
      return true;
    });
  }, [notifications, filter]);

  if (!isOpen) return null;

  const getStatusBadge = (statusType: NotificationStatusType, title: string, message: string) => {
    const isSecurity =
      statusType === 'ai_warning' ||
      statusType === 'account_ban' ||
      title.includes('تحذير') ||
      title.includes('حظر') ||
      message.includes('الذكاء الاصطناعي');

    const isFinancial =
      statusType === 'wallet_deposit' ||
      statusType === 'payment_received' ||
      statusType === 'booking_confirmed' ||
      title.includes('سداد') ||
      title.includes('إيداع') ||
      title.includes('الضمان');

    if (isSecurity) {
      return {
        icon: <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />,
        bg: 'bg-rose-50 text-rose-800 border-rose-200',
        label: t('أمان ورقابة المنصة', 'Platform Safety'),
        borderAccent: 'border-r-4 border-r-rose-500',
      };
    }
    if (isFinancial) {
      return {
        icon: <Wallet className="w-4 h-4 text-emerald-600 shrink-0" />,
        bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        label: t('مدفوعات ومحفظة', 'Payments & Wallet'),
        borderAccent: 'border-r-4 border-r-emerald-500',
      };
    }
    if (statusType === 'approved' || statusType === 'chat_unlocked') {
      return {
        icon: <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />,
        bg: 'bg-blue-50 text-blue-800 border-blue-200',
        label: t('حجوزات وعقود', 'Bookings & Contracts'),
        borderAccent: 'border-r-4 border-r-blue-500',
      };
    }
    return {
      icon: <Home className="w-4 h-4 text-indigo-600 shrink-0" />,
      bg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
      label: t('إعلانات المنصة', 'Listings & Info'),
      borderAccent: 'border-r-4 border-r-indigo-500',
    };
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notifications-inbox-title"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-gradient-to-r from-slate-50 via-white to-blue-50/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100/80 text-blue-700 flex items-center justify-center relative shadow-xs">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-600 border-2 border-white rounded-full animate-pulse" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="notifications-inbox-title" className="text-lg font-bold text-slate-900">
                  {t('صندوق إشعارات المنصة', 'Notifications Inbox')}
                </h2>
                {unreadCount > 0 ? (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-800 font-mono">
                    {formatNumber(unreadCount)} {t('جديد', 'new')}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-600">
                    {t('الكل مقروء', 'All read')}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {t(
                  'مركز التنبيهات الفورية لحسابك: الحجوزات، سداد الأموال، وقرارات وتحذيرات المنصة.',
                  'Real-time alerts for bookings, payments, and platform security decisions.'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label={t('إغلاق', 'Close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Tabs & Quick Actions */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                filter === 'all'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {t('الكل', 'All')} ({formatNumber(notifications.length)})
            </button>
            <button
              type="button"
              onClick={() => setFilter('payments_bookings')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all ${
                filter === 'payments_bookings'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>{t('حجوزات وسداد', 'Bookings & Payments')}</span>
            </button>
            <button
              type="button"
              onClick={() => setFilter('security_warnings')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all ${
                filter === 'security_warnings'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{t('أمان وتحذيرات', 'Safety Alerts')}</span>
            </button>
            <button
              type="button"
              onClick={() => setFilter('contracts_listings')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all ${
                filter === 'contracts_listings'
                  ? 'bg-indigo-700 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>{t('عقود ووحدات', 'Contracts & Units')}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 ms-auto">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void onMarkAllAsRead()}
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>{t('تعيين الكل كمقروء', 'Mark all read')}</span>
              </button>
            )}
            {notifications.length > 0 && onClearAll && (
              <button
                type="button"
                onClick={() => void onClearAll()}
                title={t('مسح الإشعارات', 'Clear notifications')}
                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Notifications List Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-3 sm:p-4 space-y-2.5">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-16 px-4 space-y-3">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-slate-100 text-slate-400 flex items-center justify-center">
                <Bell className="w-8 h-8 stroke-1" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                {t('لا توجد إشعارات في هذا التصنيف', 'No notifications in this filter')}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                {t(
                  'عند حدوث أي حجز رسمي، أو سداد رسوم، أو شحن محفظة، أو توجيه تنبيه أمني، ستصلك رسالة فورية إلى صندوق الإشعارات هنا.',
                  'When bookings, escrow payments, wallet top-ups, or security notices occur, you will receive real-time notifications here.'
                )}
              </p>
            </div>
          ) : (
            filteredNotifications.map((notif) => {
              const badge = getStatusBadge(notif.statusType, notif.title, notif.message);
              return (
                <div
                  key={notif.id}
                  onClick={() => {
                    if (!notif.isRead) void onMarkAsRead(notif.id);
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                    badge.borderAccent
                  } ${
                    notif.isRead
                      ? 'bg-white border-slate-200/80 hover:border-slate-300'
                      : 'bg-blue-50/40 border-blue-200 hover:bg-blue-50/70 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Status Icon */}
                      <div className="p-2.5 rounded-xl bg-slate-100 shrink-0 mt-0.5">
                        {badge.icon}
                      </div>

                      {/* Content */}
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${badge.bg}`}
                          >
                            {badge.label}
                          </span>
                          {notif.amountEgp > 0 && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 text-slate-800">
                              {formatEgp(notif.amountEgp)} ج.م
                            </span>
                          )}
                          {!notif.isRead && (
                            <span className="w-2 h-2 rounded-full bg-blue-600 inline-block animate-pulse" />
                          )}
                        </div>

                        <h4
                          className={`text-sm font-bold text-slate-900 leading-snug ${
                            !notif.isRead ? 'text-blue-950 font-black' : ''
                          }`}
                        >
                          {notif.title}
                        </h4>

                        <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                          {notif.message}
                        </p>

                        {/* Extra Context Pills */}
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-500">
                          {notif.apartmentTitle && (
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-700 bg-slate-100/80 px-2 py-0.5 rounded">
                              <Home className="w-3 h-3 text-slate-500" />
                              <span className="truncate max-w-[200px]">{notif.apartmentTitle}</span>
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 text-slate-400 font-mono">
                            <Clock className="w-3 h-3" />
                            <span>{formatArabicTimestamp(notif.createdAtMs)}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {!notif.isRead && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void onMarkAsRead(notif.id);
                          }}
                          title={t('تحديد كمقروء', 'Mark read')}
                          className="text-[11px] font-bold text-blue-700 hover:underline"
                        >
                          {t('تحديد كمقروء', 'Mark read')}
                        </button>
                      )}

                      {/* Quick jump actions based on type */}
                      {(notif.relatedEntityType === 'booking' || notif.title.includes('حجز')) && onOpenBookingTab && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                            onOpenBookingTab();
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
                        >
                          <span>{t('عرض الحجز', 'View Booking')}</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}

                      {(notif.relatedEntityType === 'wallet' || notif.title.includes('محفظة') || notif.title.includes('إيداع')) && onOpenWalletModal && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                            onOpenWalletModal();
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors"
                        >
                          <span>{t('فتح المحفظة', 'Open Wallet')}</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>
            {t('منصة إيجار مصر — جميع الإشعارات فورية وموثقة سحابياً', 'Ejar Egypt — All notifications are real-time & cloud synced')}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold transition-colors"
          >
            {t('إغلاق', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationsInboxModal;

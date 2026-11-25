import React, { useState } from 'react';
import {
  CreditCard,
  Smartphone,
  Receipt,
  Zap,
  ShieldCheck,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import {
  createRealPaymobCheckout,
  CreateCheckoutResponse,
  GatewayPaymentMethod,
  GatewayPaymentPurpose,
} from '../lib/payments';
import { useI18n } from '../lib/i18n';

interface PaymobGatewayBoxProps {
  purpose: GatewayPaymentPurpose;
  amountEgp: number;
  selectedMethod: GatewayPaymentMethod;
  onSelectMethod: (method: GatewayPaymentMethod) => void;
  hideChannelSelector?: boolean;
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  userPhone?: string | null;
  apartmentId?: string;
  apartmentTitle?: string;
  onReferenceReady?: (ref: string, method: GatewayPaymentMethod, isLivePaymob: boolean) => void;
}

export const PaymobGatewayBox: React.FC<PaymobGatewayBoxProps> = ({
  purpose,
  amountEgp,
  selectedMethod,
  onSelectMethod,
  hideChannelSelector = false,
  userId,
  userEmail,
  userName,
  userPhone,
  apartmentId,
  apartmentTitle,
  onReferenceReady,
}) => {
  const { t, formatNumber } = useI18n();

  const [walletPhone, setWalletPhone] = useState(userPhone || '');
  const [loading, setLoading] = useState(false);
  const [gatewayResp, setGatewayResp] = useState<CreateCheckoutResponse | null>(null);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (val: string, key: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleStartPaymob = async () => {
    setGatewayError(null);
    setGatewayResp(null);

    if (selectedMethod === 'mobile_wallet') {
      const cleanPhone = walletPhone.replace(/[^0-9]/g, '');
      if (!/^01[0125][0-9]{8}$/.test(cleanPhone)) {
        setGatewayError(
          t(
            'يرجى إدخال رقم محفظة إلكترونية مصري صحيح (11 رقماً يبدأ بـ 010 أو 011 أو 012 أو 015)',
            'Please enter a valid 11-digit Egyptian mobile wallet number'
          )
        );
        return;
      }
    }

    setLoading(true);
    try {
      const resp = await createRealPaymobCheckout({
        purpose,
        amountEgp,
        paymentMethod: selectedMethod,
        walletPhone: walletPhone.replace(/[^0-9]/g, ''),
        userId: userId || undefined,
        userEmail: userEmail || undefined,
        userName: userName || undefined,
        userPhone: userPhone || undefined,
        apartmentId,
        apartmentTitle,
      });

      if (resp.error) {
        setGatewayError(resp.error);
        return;
      }

      setGatewayResp(resp);

      if (resp.mode === 'paymob_live') {
        const ref = resp.fawryReference || resp.orderId || `PAYMOB-${Date.now()}`;
        onReferenceReady?.(ref, selectedMethod, true);
        if (resp.redirectUrl && resp.flowType === 'wallet_redirect') {
          window.open(resp.redirectUrl, '_blank', 'noopener,noreferrer');
        }
      } else if (resp.mode === 'direct_instapay' && resp.orderId) {
        onReferenceReady?.(resp.orderId, selectedMethod, false);
      }
    } catch {
      setGatewayError(
        t('حدث خطأ أثناء الاتصال ببوابة الدفع، حاول مرة أخرى.', 'Error connecting to payment gateway.')
      );
    } finally {
      setLoading(false);
    }
  };

  const channels: Array<{
    id: GatewayPaymentMethod;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    sublabel: string;
    accent: string;
  }> = [
    {
      id: 'card_meeza',
      icon: CreditCard,
      label: t('بطاقة بنكية / ميزة', 'Card / Meeza'),
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
      sublabel: t('كود دفع فوري رقمي', 'Instant Fawry Bill Code'),
      accent: 'text-amber-600',
    },
    {
      id: 'instapay',
      icon: Zap,
      label: t('إنستاباي (InstaPay)', 'InstaPay'),
      sublabel: t('تحويل بنكي لحظي IPA', 'Instant IPA Transfer'),
      accent: 'text-emerald-600',
    },
  ];

  return (
    <div className="space-y-3">
      {/* Channels Selector (hidden when parent modal provides a unified selector) */}
      {!hideChannelSelector && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {channels.map((ch) => {
            const Icon = ch.icon;
            const active = selectedMethod === ch.id;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => {
                  onSelectMethod(ch.id);
                  setGatewayResp(null);
                  setGatewayError(null);
                }}
                className={`p-3 rounded-xl border text-start transition-all flex flex-col gap-1 min-h-[76px] ${
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
                <span className="text-[10px] text-slate-500 leading-tight">{ch.sublabel}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Wallet Phone Input when Mobile Wallet selected */}
      {selectedMethod === 'mobile_wallet' && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1.5">
          <label className="block text-xs font-bold text-slate-800">
            {t(
              'رقم المحفظة الإلكترونية (فودافون كاش / أورنج / اتصالات / وي باي)',
              'Mobile Wallet Number (Vodafone / Orange / Etisalat / WE)'
            )}
          </label>
          <input
            type="tel"
            inputMode="tel"
            dir="ltr"
            maxLength={11}
            value={walletPhone}
            onChange={(e) => setWalletPhone(e.target.value)}
            placeholder="01012345678"
            className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-700"
          />
        </div>
      )}

      {/* Launch Real Paymob Action Button */}
      <button
        type="button"
        disabled={loading || amountEgp <= 0}
        onClick={() => void handleStartPaymob()}
        className="w-full min-h-[44px] px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t('جاري الاتصال ببوابة Paymob...', 'Connecting to Paymob Gateway...')}</span>
          </>
        ) : (
          <>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>
              {selectedMethod === 'instapay'
                ? t(`عرض بيانات الدفع عبر InstaPay (${formatNumber(amountEgp)} ج.م)`, `Show InstaPay Details (${formatNumber(amountEgp)} EGP)`)
                : t(`دفع آمن عبر بوابة Paymob (${formatNumber(amountEgp)} ج.م)`, `Pay via Paymob Gateway (${formatNumber(amountEgp)} EGP)`)}
            </span>
          </>
        )}
      </button>

      {gatewayError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{gatewayError}</span>
        </div>
      )}

      {/* Live Paymob Card / Meeza Iframe */}
      {gatewayResp?.mode === 'paymob_live' && gatewayResp.iframeUrl && (
        <div className="bg-white border-2 border-blue-600 rounded-2xl overflow-hidden shadow-md space-y-2">
          <div className="bg-blue-700 text-white px-4 py-2 flex items-center justify-between text-xs font-bold">
            <span>{t('بوابة Paymob الآمنة للبطاقات البنكية وميزة', 'Paymob Secure Card / Meeza Checkout')}</span>
            <a
              href={gatewayResp.iframeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline"
            >
              <span>{t('فتح في نافذة مستقلة', 'Open in new tab')}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
          <iframe
            src={gatewayResp.iframeUrl}
            title="Paymob Card Checkout"
            className="w-full h-[460px] border-0 bg-white"
          />
        </div>
      )}

      {/* Live Paymob Mobile Wallet Redirect Link */}
      {gatewayResp?.mode === 'paymob_live' && gatewayResp.redirectUrl && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 space-y-2.5 text-xs">
          <div className="font-bold text-emerald-950">
            {t('تم إرسال طلب الدفع للمحفظة الإلكترونية بنجاح ✓', 'Mobile Wallet Payment Request Created ✓')}
          </div>
          <p className="text-emerald-800 leading-relaxed">
            {t(
              'اضغط على الزر بالأسفل لإدخال رمز التأكيد (PIN / OTP) وإتمام خصم المبلغ من محفظتك بأمان:',
              'Click below to enter your wallet OTP/PIN and authorize payment:'
            )}
          </p>
          <a
            href={gatewayResp.redirectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl"
          >
            <span>{t('إتمام الدفع عبر رابط المحفظة', 'Complete Wallet Payment')}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Live Paymob Fawry Reference Code */}
      {gatewayResp?.mode === 'paymob_live' && gatewayResp.fawryReference && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2 text-xs">
          <div className="font-bold text-amber-950">
            {t('تم إصدار كود دفع فوري (Fawry) الخاص بطلبك ✓', 'Official Fawry Payment Reference Issued ✓')}
          </div>
          <div className="flex items-center justify-between bg-white border border-amber-200 rounded-lg px-3 py-2">
            <span className="font-mono text-lg font-extrabold text-slate-900 select-all">
              {gatewayResp.fawryReference}
            </span>
            <button
              type="button"
              onClick={() => handleCopy(gatewayResp.fawryReference!, 'fawry')}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-900 rounded-md font-bold"
            >
              {copiedKey === 'fawry' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'fawry' ? t('تم النسخ', 'Copied') : t('نسخ الكود', 'Copy')}</span>
            </button>
          </div>
          <p className="text-amber-800">
            {t(
              'توجّه لأي ماكينة فوري أو تطبيق myFawry واختر خدمة Paymob وأدخل هذا الكود لإتمام السداد فوراً.',
              'Pay using this code at any Fawry POS or myFawry app.'
            )}
          </p>
        </div>
      )}

      {/* Direct InstaPay OR Unconfigured Paymob Keys Notice */}
      {(gatewayResp?.mode === 'direct_instapay' || gatewayResp?.mode === 'unconfigured') && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5 text-xs">
          {gatewayResp.mode === 'unconfigured' && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-950 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {t(
                    'مطلوب إضافة مفاتيح Paymob في إعدادات Vercel للتشغيل المباشر:',
                    'Add Paymob Env Vars in Vercel to enable live gateway checkout:'
                  )}
                </span>
              </div>
              {gatewayResp.missingEnvVars && gatewayResp.missingEnvVars.length > 0 && (
                <div className="font-mono text-[11px] bg-white/80 px-2 py-1 rounded border border-amber-200 text-slate-800">
                  {gatewayResp.missingEnvVars.join(' , ')}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] text-slate-500 block">
                  {t('حساب InstaPay المعتمد:', 'Official InstaPay IPA:')}
                </span>
                <span className="font-mono font-bold text-slate-900 select-all">
                  {gatewayResp.merchantInstaPayAddress || 'ejar.escrow@instapay'}
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleCopy(gatewayResp.merchantInstaPayAddress || 'ejar.escrow@instapay', 'ipa')
                }
                className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-md text-slate-700"
              >
                {copiedKey === 'ipa' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] text-slate-500 block">
                  {t('محفظة التحويل (فودافون/كاش):', 'Cash Wallet Number:')}
                </span>
                <span className="font-mono font-bold text-slate-900 select-all">
                  {gatewayResp.merchantWalletNumber || '01099887766'}
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleCopy(gatewayResp.merchantWalletNumber || '01099887766', 'wal')
                }
                className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-md text-slate-700"
              >
                {copiedKey === 'wal' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

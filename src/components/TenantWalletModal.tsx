import React, { useState, useRef } from 'react';
import {
  X,
  Wallet,
  ShieldCheck,
  CreditCard,
  Smartphone,
  Zap,
  Receipt,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Sparkles,
  Info,
  Lock,
  RefreshCw,
  Upload,
  Image as ImageIcon,
  Eye,
  Copy,
  Check,
  AlertCircle,
  FileCheck,
} from 'lucide-react';
import {
  PaymentMethodType,
  TenantWalletRecord,
  WalletTransactionRecord,
  formatEgp,
  normalizeNumericInput,
  MIN_SERIOUSNESS_DEPOSIT_EGP,
} from '../lib/validation';
import { useI18n } from '../lib/i18n';

interface TenantWalletModalProps {
  isOpen: boolean;
  wallet: TenantWalletRecord;
  currentUserUid: string | null;
  currentUserDisplayName?: string | null;
  onClose: () => void;
  onDeposit: (
    amountEgp: number,
    method: PaymentMethodType,
    reference: string,
    receiptScreenshotUrl?: string
  ) => Promise<void>;
  onApproveDeposit?: (txId: string) => Promise<void>;
}

export function generateMockReceiptDataUrl(amountEgp: number, methodLabel: string, ref: string): string {
  const dateStr = new Date().toLocaleString('ar-EG');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="460" viewBox="0 0 400 460" fill="#fff">
    <rect width="400" height="460" rx="16" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
    <rect width="400" height="65" rx="16" fill="#1e3a8a"/>
    <text x="200" y="40" font-family="sans-serif" font-size="16" font-weight="bold" fill="#fff" text-anchor="middle">إيصال تحويل إلكتروني معتمد — إيجار</text>
    <circle cx="200" cy="110" r="26" fill="#10b981"/>
    <path d="M190 110l7 7 15-15" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <text x="200" y="155" font-family="sans-serif" font-size="13" fill="#64748b" text-anchor="middle">تم إرسال التحويل الإلكتروني بنجاح</text>
    <text x="200" y="195" font-family="sans-serif" font-size="28" font-weight="bold" fill="#0f172a" text-anchor="middle">${amountEgp.toLocaleString()} ج.م</text>
    <line x1="30" y1="215" x2="370" y2="215" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="6"/>
    <text x="40" y="250" font-family="sans-serif" font-size="12" fill="#64748b">طريقة الدفع:</text>
    <text x="360" y="250" font-family="sans-serif" font-size="12" font-weight="bold" fill="#0f172a" text-anchor="end">${methodLabel}</text>
    <text x="40" y="285" font-family="sans-serif" font-size="12" fill="#64748b">حساب المستلم:</text>
    <text x="360" y="285" font-family="sans-serif" font-size="12" font-weight="bold" fill="#1e3a8a" text-anchor="end">منصة إيجار الموثقة</text>
    <text x="40" y="320" font-family="sans-serif" font-size="12" fill="#64748b">الرقم المرجعي:</text>
    <text x="360" y="320" font-family="monospace" font-size="12" font-weight="bold" fill="#0f172a" text-anchor="end">${ref}</text>
    <text x="40" y="355" font-family="sans-serif" font-size="12" fill="#64748b">التاريخ والوقت:</text>
    <text x="360" y="355" font-family="sans-serif" font-size="11" fill="#475569" text-anchor="end">${dateStr}</text>
    <rect x="30" y="380" width="340" height="50" rx="8" fill="#ecfdf5" stroke="#a7f3d0"/>
    <text x="200" y="410" font-family="sans-serif" font-size="11" fill="#065f46" text-anchor="middle" font-weight="bold">عملية دفع موثقة عبر بوابة الدفع الإلكتروني المعتمدة</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const PRESET_AMOUNTS = [500, 1000, 2500, 5000, 10000];

export const TenantWalletModal: React.FC<TenantWalletModalProps> = ({
  isOpen,
  wallet,
  currentUserUid,
  currentUserDisplayName,
  onClose,
  onDeposit,
  onApproveDeposit,
}) => {
  const { lang, t, formatNumber, formatTimeAgo, paymentMethodLabel } = useI18n();

  const [selectedPreset, setSelectedPreset] = useState<number>(MIN_SERIOUSNESS_DEPOSIT_EGP);
  const [customAmountText, setCustomAmountText] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('instapay');

  // Interactive Payment Fields
  const [mobileWalletNumber, setMobileWalletNumber] = useState<string>('01012345678');
  const [instapayHandle, setInstapayHandle] = useState<string>('user@instapay');
  const [cardHolder, setCardHolder] = useState<string>(currentUserDisplayName || 'مستأجر موثق');
  const [cardNumber, setCardNumber] = useState<string>('5078 0300 4412 8890');

  // Screenshot & Gateway State
  const [receiptScreenshot, setReceiptScreenshot] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewLightboxUrl, setPreviewLightboxUrl] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [approvingTxId, setApprovingTxId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [successInfo, setSuccessInfo] = useState<{
    amount: number;
    reference: string;
    method: PaymentMethodType;
  } | null>(null);
  const [txFilter, setTxFilter] = useState<'all' | 'deposit' | 'deduction'>('all');

  if (!isOpen) return null;

  const filteredTransactions = wallet.transactions.filter((tx) => {
    if (txFilter === 'deposit') return tx.type === 'deposit' || tx.type === 'refund';
    if (txFilter === 'deduction') return tx.type === 'booking_deduction';
    return true;
  });

  const effectiveAmount = customAmountText
    ? Math.max(100, Math.min(100000, Number(customAmountText) || 0))
    : selectedPreset;

  const handleSelectPreset = (amount: number) => {
    setSelectedPreset(amount);
    setCustomAmountText('');
  };

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = normalizeNumericInput(e.target.value);
    setCustomAmountText(clean);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError(t('يرجى اختيار ملف صورة صالح (PNG, JPG, JPEG)', 'Please choose a valid image file'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setReceiptScreenshot(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUseMockReceipt = () => {
    setUploadError(null);
    const ref = `DEP-${Math.random().toString(36).substring(2, 7).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    const mock = generateMockReceiptDataUrl(effectiveAmount, paymentMethodLabel(paymentMethod), ref);
    setReceiptScreenshot(mock);
  };

  const handleExecuteDeposit = async () => {
    if (effectiveAmount < 100) return;
    if (!receiptScreenshot) {
      setUploadError(
        t(
          'يرجى إرفاق سكرين شوت أو صورة إيصال التحويل لتأكيد العملية قبل الإرسال.',
          'Please attach transfer receipt screenshot to confirm operation.'
        )
      );
      return;
    }
    setIsProcessing(true);
    setUploadError(null);
    setSuccessInfo(null);

    const ref = `DEP-${Math.random().toString(36).substring(2, 7).toUpperCase()}-${Date.now().toString().slice(-4)}`;

    try {
      await new Promise((res) => setTimeout(res, 800));
      await onDeposit(effectiveAmount, paymentMethod, ref, receiptScreenshot);
      setSuccessInfo({
        amount: effectiveAmount,
        reference: ref,
        method: paymentMethod,
      });
      setReceiptScreenshot(null);
      setCustomAmountText('');
    } catch {
      // Handled in caller
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmApproval = async (txId: string) => {
    if (!onApproveDeposit) return;
    setApprovingTxId(txId);
    try {
      await onApproveDeposit(txId);
    } finally {
      setApprovingTxId(null);
    }
  };

  const hasActiveDeposit = wallet.balanceEgp >= 500;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-amber-300">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>{t('محفظة المستأجر ورصيد جدية الحجز', 'Tenant Wallet & Deposit Balance')}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {t('ضمان آمن 100%', '100% Secure Escrow')}
                </span>
              </h2>
              <p className="text-xs text-blue-200/80">
                {t(
                  'رصيد حر يمنحك صلاحية تصفح الشقق والدردشة مع أصحابها ولا يُخصم إلا عند تثبيت الحجز',
                  'Flexible deposit to chat & explore, only deducted on confirmed booking'
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto no-scrollbar">
          {/* Card Presentation */}
          <div className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 text-white shadow-xl border border-slate-800">
            <div className="absolute top-0 right-0 -mt-8 -mr-8 w-44 h-44 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-44 h-44 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-6 rounded bg-amber-400/80 flex items-center justify-center">
                  <div className="w-4 h-3 border border-amber-900 rounded-sm" />
                </div>
                <span className="text-xs font-mono tracking-widest text-slate-300 uppercase">
                  MEFTAH MISR WALLET
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-amber-300 bg-amber-400/10 px-2.5 py-1 rounded-full border border-amber-400/20">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t('رصيد جدية الحجز التفاعلي', 'Interactive Booking Deposit')}</span>
              </div>
            </div>

            <div className="relative space-y-1 mb-6">
              <span className="text-xs font-medium text-slate-400">
                {t('الرصيد المتاح في المحفظة', 'Available Wallet Balance')}
              </span>
              <div className="text-3xl sm:text-4xl font-extrabold font-mono text-white tracking-tight flex items-baseline gap-2">
                <span>{formatEgp(wallet.balanceEgp)}</span>
                <span className="text-xs font-normal text-slate-400">
                  {t('ج.م صالح لجميع الشقق', 'EGP for all listings')}
                </span>
              </div>
            </div>

            <div className="relative pt-4 border-t border-slate-800 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] mb-0.5">
                  {t('الرصيد المتاح', 'Available Balance')}
                </span>
                <span className="font-mono text-emerald-400 font-bold text-sm">
                  {formatEgp(wallet.balanceEgp)}
                </span>
              </div>

              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] mb-0.5">
                  {t('الرصيد المعلق (الضمان)', 'Pending / In Escrow')}
                </span>
                <span className="font-mono text-amber-300 font-bold text-sm">
                  {formatEgp(wallet.lockedEscrowEgp)}
                </span>
              </div>

              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] mb-0.5">
                  {t('المدفوع / المسحوب', 'Spent / Withdrawn')}
                </span>
                <span className="font-mono text-slate-300 font-bold text-sm">
                  {formatEgp(
                    wallet.transactions
                      .filter((t) => t.type === 'booking_deduction')
                      .reduce((acc, curr) => acc + curr.amountEgp, 0)
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Deposit Status Notice */}
          {hasActiveDeposit ? (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold">
                  {t(
                    'رصيد جدية الحجز نشط — تم منحك الصلاحية الكاملة!',
                    'Booking deposit active — full permissions granted!'
                  )}
                </span>
                <p className="text-emerald-800/90 leading-relaxed">
                  {t(
                    'يمكنك الآن بدء محادثات الشات الداخلي مع أصحاب العقارات، واستعراض الجولات الافتراضية 360°. هذا المبلغ محفوظ في محفظتك ولن يُخصم أو يُربط بشقة إلا عند اختيارك الشقة المناسبة وتأكيد الحجز النهائي.',
                    'You can freely chat with landlords and inspect listings. The balance stays in your wallet and will not be deducted until you execute final booking.'
                  )}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold">
                  {t(
                    'يلزم شحن رصيد جدية الحجز لتفعيل التواصل بالشات',
                    'A booking deposit is required to enable direct chat with landlords'
                  )}
                </span>
                <p className="text-amber-800 leading-relaxed">
                  {t(
                    'لحماية أصحاب العقارات من الحسابات غير الجادة وضمان جودة التجربة، يتطلب فتح الشات توفر رصيد جدية حجز (مثل 1,000 ج.م أو 10%). المبلغ لا يُخصم ويظل ملكك بالكامل حتى تقرر حجز شقة بعينها.',
                    'To protect landlords from unverified inquiries, chatting requires a refundable deposit balance. It remains 100% yours until final booking confirmation.'
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Success Box if just deposited */}
          {successInfo && (
            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs space-y-2 animate-in fade-in duration-300">
              <div className="flex items-center gap-2 font-bold text-sm text-blue-800">
                <CheckCircle2 className="w-5 h-5 text-blue-600" />
                <span>{t('تم شحن المحفظة بنجاح!', 'Wallet Credited Successfully!')}</span>
              </div>
              <p className="text-blue-700">
                {t(
                  `تمت إضافة مبلغ ${formatEgp(successInfo.amount)} إلى رصيدك التفاعلي عبر ${paymentMethodLabel(successInfo.method)}. رقم الإيصال: ${successInfo.reference}`,
                  `Added ${formatEgp(successInfo.amount)} to your active balance via ${paymentMethodLabel(successInfo.method)}. Receipt: ${successInfo.reference}`
                )}
              </p>
            </div>
          )}

          {/* Deposit Section */}
          <div className="space-y-4 pt-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center justify-between">
              <span>{t('شحن رصيد إضافي في المحفظة', 'Top Up Wallet Balance')}</span>
              <span className="text-xs font-normal text-slate-500">
                {t('حد أدنى: 100 ج.م', 'Minimum: 100 EGP')}
              </span>
            </h3>

            {/* Presets */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {PRESET_AMOUNTS.map((amt) => {
                const isSelected = !customAmountText && selectedPreset === amt;
                return (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => handleSelectPreset(amt)}
                    className={`py-2.5 px-3 rounded-xl border text-center transition-all text-xs font-bold ${
                      isSelected
                        ? 'bg-blue-700 border-blue-700 text-white shadow-md shadow-blue-500/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-blue-400'
                    }`}
                  >
                    <span>{formatNumber(amt)} ج.م</span>
                    {amt === MIN_SERIOUSNESS_DEPOSIT_EGP && (
                      <span className="block text-[9px] font-normal opacity-90 mt-0.5">
                        {t('موصى به', 'Recommended')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Custom Amount */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {t('أو أدخل مبلغاً مخصصاً (ج.م):', 'Or enter custom amount (EGP):')}
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={customAmountText}
                  onChange={handleCustomAmountChange}
                  placeholder={t('مثال: 1500', 'e.g. 1500')}
                  className="w-full h-11 px-4 text-sm font-bold font-mono rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <span className="absolute inset-y-0 left-4 rtl:left-auto rtl:right-auto rtl:left-4 flex items-center text-xs font-bold text-slate-400 pointer-events-none">
                  EGP
                </span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2 pt-2">
              <label className="block text-xs font-semibold text-slate-700">
                {t('وسيلة الدفع المصرية المعتمدة:', 'Select Payment Method:')}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('instapay')}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                    paymentMethod === 'instapay'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/30'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Zap className="w-4 h-4 text-emerald-600" />
                  <span className="text-[11px] font-bold">إنستاباي (InstaPay)</span>
                  <span className="text-[9px] text-emerald-700">تحويل فوري 0% عمولة</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('mobile_wallet')}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                    paymentMethod === 'mobile_wallet'
                      ? 'bg-rose-50 border-rose-500 text-rose-900 ring-2 ring-rose-500/30'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Smartphone className="w-4 h-4 text-rose-600" />
                  <span className="text-[11px] font-bold">فودافون / أورنج كاش</span>
                  <span className="text-[9px] text-rose-700">محفظة إلكترونية</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('card_meeza')}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                    paymentMethod === 'card_meeza'
                      ? 'bg-blue-50 border-blue-600 text-blue-900 ring-2 ring-blue-600/30'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <CreditCard className="w-4 h-4 text-blue-600" />
                  <span className="text-[11px] font-bold">فيزا / ميزة / كارت</span>
                  <span className="text-[9px] text-blue-700">بطاقة بنكية مباشرة</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('fawry')}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                    paymentMethod === 'fawry'
                      ? 'bg-amber-50 border-amber-500 text-amber-900 ring-2 ring-amber-500/30'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Receipt className="w-4 h-4 text-amber-600" />
                  <span className="text-[11px] font-bold">منافذ فوري باي</span>
                  <span className="text-[9px] text-amber-700">كود دفع مرجعي</span>
                </button>
              </div>
            </div>

            {/* Official Gateway Transfer Instructions & Details */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>{t('بيانات بوابة التحويل الإلكتروني المعتمدة للمنصة:', 'Official Platform Gateway Information:')}</span>
                </span>
                <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-100/60 px-2 py-0.5 rounded-full">
                  {t('حساب تجاري رسمي', 'Official Account')}
                </span>
              </div>

              {paymentMethod === 'instapay' && (
                <div className="p-3 bg-white border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 block">{t('معرف إنستاباي المعتمد (IPA):', 'Platform InstaPay IPA:')}</span>
                      <span className="font-mono font-bold text-sm text-slate-900 select-all">meftahmisr@instapay</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy('meftahmisr@instapay', 'instapay')}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] flex items-center gap-1 border border-emerald-200 transition-colors"
                    >
                      {copiedKey === 'instapay' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'instapay' ? t('تم النسخ', 'Copied') : t('نسخ المعرف', 'Copy IPA')}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {t(
                      'افتح تطبيق InstaPay على هاتفك وأرسل المبلغ لمعرف المنصة meftahmisr@instapay ثم التقط سكرين شوت للإيصال وارفعه بالأسفل.',
                      'Send via InstaPay app to meftahmisr@instapay then upload the transfer confirmation screenshot below.'
                    )}
                  </p>
                </div>
              )}

              {paymentMethod === 'mobile_wallet' && (
                <div className="p-3 bg-white border border-rose-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 block">{t('رقم محفظة كاش المعتمد (فودافون/أورنج/اتصالات/وي):', 'Cash Wallet Mobile:')}</span>
                      <span className="font-mono font-bold text-sm text-slate-900 select-all">01012345678</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy('01012345678', 'wallet')}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-[11px] flex items-center gap-1 border border-rose-200 transition-colors"
                    >
                      {copiedKey === 'wallet' ? <Check className="w-3.5 h-3.5 text-rose-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'wallet' ? t('تم النسخ', 'Copied') : t('نسخ الرقم', 'Copy Number')}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {t(
                      'حوّل المبلغ من أي محفظة هاتف محمول إلى رقم المنصة أعلاه، ثم التقط سكرين شوت لرسالة تأكيد التحويل وارفعها بالأسفل.',
                      'Transfer to platform cash number above, then upload the confirmation SMS/screen below.'
                    )}
                  </p>
                </div>
              )}

              {paymentMethod === 'card_meeza' && (
                <div className="p-3 bg-white border border-blue-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 block">{t('بوابة ميزة الإلكترونية والبطاقات البنكية:', 'Meeza & Bank Cards Gateway:')}</span>
                      <span className="font-mono font-bold text-xs text-blue-900">MEZ-EGYPT-GATEWAY-2026</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {t(
                      'ادفع عبر بوابة الدفع الإلكتروني الوطنية (بطاقات ميزة، فيزا، أو ماستركارد)، ثم ارفع سكرين شوت إشعار الخصم لتأكيد العملية.',
                      'Pay via national Meeza or bank card gateway, then upload the electronic transaction receipt below.'
                    )}
                  </p>
                </div>
              )}

              {paymentMethod === 'fawry' && (
                <div className="p-3 bg-white border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 block">{t('كود الخدمة المعتمد لدى فوري باي:', 'Fawry Pay Merchant Service Code:')}</span>
                      <span className="font-mono font-bold text-sm text-slate-900 select-all">982 410 721</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy('982410721', 'fawry')}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[11px] flex items-center gap-1 border border-amber-200 transition-colors"
                    >
                      {copiedKey === 'fawry' ? <Check className="w-3.5 h-3.5 text-amber-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'fawry' ? t('تم النسخ', 'Copied') : t('نسخ الكود', 'Copy Code')}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {t(
                      'ادفع في أقرب منفذ أو كشك فوري برقم الخدمة أعلاه، ثم صور إيصال السداد الورقي المطبوع وارفعه بالأسفل.',
                      'Pay at any Fawry kiosk with code above, then capture photo of paper receipt and upload below.'
                    )}
                  </p>
                </div>
              )}

              {/* Sender Details Input */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  {t('بيانات المحول (رقم هاتفك / معرف إنستاباي / اسمك):', 'Sender Reference Info:')}
                </label>
                <input
                  type="text"
                  value={instapayHandle}
                  onChange={(e) => setInstapayHandle(e.target.value)}
                  placeholder={t('مثال: 01012345678 أو ahmed@instapay', 'e.g. 01012345678')}
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </div>

            {/* MANDATORY RECEIPT SCREENSHOT UPLOAD */}
            <div className="space-y-2 p-4 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/40">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-blue-700" />
                  <span>{t('إرفاق سكرين شوت أو صورة إيصال التحويل (مطلوب لتأكيد العملية):', 'Upload Transfer Receipt Screenshot (Required):')}</span>
                </label>
                <button
                  type="button"
                  onClick={handleUseMockReceipt}
                  className="text-[11px] text-blue-700 font-bold hover:underline inline-flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t('توليد إيصال تجريبي للاختبار', 'Generate Test Receipt')}</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {receiptScreenshot ? (
                <div className="p-3 bg-white rounded-xl border border-blue-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={receiptScreenshot}
                      alt="Receipt Preview"
                      className="w-14 h-14 object-cover rounded-lg border border-slate-200 shadow-2xs cursor-pointer hover:opacity-90"
                      onClick={() => setPreviewLightboxUrl(receiptScreenshot)}
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5 text-emerald-700">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{t('تم إرفاق إيصال التحويل بنجاح', 'Receipt Attached Successfully')}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 block">
                        {t('اضغط على الصورة لمعاينتها بحجم كامل', 'Click to view full preview')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewLightboxUrl(receiptScreenshot)}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{t('معاينة', 'View')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptScreenshot(null)}
                      className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-5 bg-white hover:bg-blue-50/50 rounded-xl border border-slate-200 text-center cursor-pointer transition-colors space-y-1.5"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mx-auto">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-bold text-slate-900">
                    {t('اضغط هنا لرفع سكرين شوت أو صورة الإيصال', 'Click to browse transfer screenshot / receipt')}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {t('يدعم صور PNG, JPG, JPEG أو سكرين شوت الموبايل', 'Supports mobile screenshots and camera photos')}
                  </p>
                </div>
              )}

              {uploadError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>

            {/* Execute Button */}
            <button
              type="button"
              disabled={isProcessing || effectiveAmount < 100}
              onClick={handleExecuteDeposit}
              className="w-full h-12 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-blue-700/20 flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{t('جاري رفع الإيصال وتسجيل العملية...', 'Submitting Receipt & Operation...')}</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>
                    {t(
                      `تأكيد إرسال إيصال شحن ${formatEgp(effectiveAmount)} في الحساب`,
                      `Submit Receipt & Credit ${formatEgp(effectiveAmount)}`
                    )}
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Transactions Log & Filters */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <span>{t('سجل المعاملات التفصيلي وتأكيد الإيصالات', 'Transaction History & Receipt Confirmations')}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {filteredTransactions.length} {t('معاملة', 'txs')}
                </span>
              </h4>

              {/* Transaction Filters */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setTxFilter('all')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    txFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('الكل', 'All')}
                </button>
                <button
                  type="button"
                  onClick={() => setTxFilter('deposit')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    txFilter === 'deposit' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('إيداعات (+)', 'Deposits')}
                </button>
                <button
                  type="button"
                  onClick={() => setTxFilter('deduction')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    txFilter === 'deduction' ? 'bg-white text-rose-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('حجوزات (-)', 'Bookings')}
                </button>
              </div>
            </div>

            {filteredTransactions.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 text-center text-xs text-slate-500">
                {t(
                  'لا توجد حركات رصيد مطابقة لهذا الفلتر.',
                  'No transactions found matching this filter.'
                )}
              </div>
            ) : (
              <div className="space-y-2.5 max-h-56 overflow-y-auto no-scrollbar pr-1">
                {filteredTransactions.map((tx) => {
                  const isPositive = tx.type === 'deposit' || tx.type === 'refund';
                  const isPending = tx.status === 'pending_confirmation';
                  const isConfirmed = tx.status === 'confirmed';

                  return (
                    <div
                      key={tx.id}
                      className={`p-3.5 rounded-2xl border transition-all text-xs space-y-2 ${
                        isPending
                          ? 'bg-amber-50/60 border-amber-200'
                          : 'bg-slate-50 border-slate-200/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              isPending
                                ? 'bg-amber-100 text-amber-700'
                                : isPositive
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {isPending ? (
                              <Clock className="w-4 h-4 animate-pulse" />
                            ) : isPositive ? (
                              <ArrowDownLeft className="w-4 h-4" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              <span>{tx.description}</span>
                              {isPending && (
                                <span className="px-2 py-0.5 rounded-md bg-amber-200/80 text-amber-900 text-[10px] font-bold">
                                  {t('⏳ بانتظار تأكيد الإيصال', 'Pending Receipt Review')}
                                </span>
                              )}
                              {isConfirmed && tx.receiptScreenshotUrl && (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-0.5">
                                  <Check className="w-3 h-3" />
                                  <span>{t('مؤكد ومضاف للرصيد', 'Confirmed & Credited')}</span>
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {formatTimeAgo(tx.createdAtMs)} {tx.referenceNumber && `· Ref: ${tx.referenceNumber}`}
                            </div>
                          </div>
                        </div>

                        <div className="text-end font-mono font-bold">
                          <span className={isPending ? 'text-amber-800' : isPositive ? 'text-emerald-700' : 'text-slate-900'}>
                            {isPositive ? '+' : '-'}{formatEgp(tx.amountEgp)}
                          </span>
                        </div>
                      </div>

                      {/* Receipt Screenshot Actions & Immediate Approval Confirmation Button */}
                      {(tx.receiptScreenshotUrl || isPending) && (
                        <div className="pt-2 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2">
                          {tx.receiptScreenshotUrl ? (
                            <button
                              type="button"
                              onClick={() => setPreviewLightboxUrl(tx.receiptScreenshotUrl!)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{t('معاينة صورة الإيصال المرفق', 'View Uploaded Receipt')}</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400">{t('إيداع مباشر', 'Direct deposit')}</span>
                          )}

                          {isPending && onApproveDeposit && (
                            <button
                              type="button"
                              disabled={approvingTxId === tx.id}
                              onClick={() => handleConfirmApproval(tx.id)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1 rounded-lg transition-colors shadow-2xs"
                              title="تأكيد وصول المبلغ واعتماد الإيداع فوراً ليسمع في رصيد المحفظة"
                            >
                              {approvingTxId === tx.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <FileCheck className="w-3.5 h-3.5" />
                              )}
                              <span>{t('تأكيد الإيصال وإيداع المبلغ بالرصيد الآن', 'Confirm & Credit to Wallet Now')}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Full Image Lightbox Modal for Receipt Preview */}
        {previewLightboxUrl && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative max-w-lg w-full bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-700">
              <div className="flex items-center justify-between p-4 bg-slate-900 text-white">
                <span className="font-bold text-sm flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-400" />
                  <span>{t('معاينة إيصال التحويل المعتمد', 'Transfer Receipt Preview')}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewLightboxUrl(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 bg-slate-100 flex items-center justify-center max-h-[70vh] overflow-auto">
                <img
                  src={previewLightboxUrl}
                  alt="Full Receipt"
                  className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-lg border border-slate-300"
                />
              </div>
              <div className="p-3 bg-white text-center border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setPreviewLightboxUrl(null)}
                  className="px-6 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs"
                >
                  {t('إغلاق المعاينة', 'Close Preview')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

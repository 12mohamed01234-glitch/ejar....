/**
 * LegalPolicyModal.tsx
 * Modal component that displays one of three legal policy sections:
 * - terms: Terms & Conditions
 * - privacy: Privacy Policy
 * - cancellation: Cancellation & Refund Policy
 */

import React from 'react';
import { X, Shield, FileText, RefreshCw, ChevronRight } from 'lucide-react';

export type PolicyType = 'terms' | 'privacy' | 'cancellation';

interface LegalPolicyModalProps {
  policyType: PolicyType | null;
  onClose: () => void;
  lang?: 'ar' | 'en';
}

function t(ar: string, en: string, lang: 'ar' | 'en' = 'ar') {
  return lang === 'ar' ? ar : en;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-5">
    <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-1.5">
      <ChevronRight className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
      {title}
    </h3>
    <div className="text-sm text-slate-600 leading-relaxed space-y-1.5 pr-5">{children}</div>
  </div>
);

const TermsContent: React.FC<{ lang: 'ar' | 'en' }> = ({ lang }) => (
  <div>
    <p className="text-xs text-slate-500 mb-4">{t('آخر تحديث: نوفمبر 2026', 'Last updated: November 2026', lang)}</p>

    <Section title={t('1. دور المنصة كوسيط فقط', '1. Platform Role — Intermediary Only', lang)}>
      <p>{t('منصة "إيجار" تعمل كوسيط عقاري إلكتروني مرخّص لتسهيل التواصل بين المُلّاك والمستأجرين في جمهورية مصر العربية. المنصة لا تمتلك أياً من الوحدات المُدرجة، ولا تُعدّ طرفاً في عقد الإيجار المبرم بين المالك والمستأجر.', '"Ejar" platform acts as a licensed electronic real-estate intermediary to facilitate communication between landlords and tenants across Egypt. The platform does not own any listed units and is not a party to the rental contract between landlord and tenant.', lang)}</p>
    </Section>

    <Section title={t('2. هيكل العمولة وضمان الحقوق', '2. Commission Structure & Rights Guarantee', lang)}>
      <p>{t('• يدفع المستأجر 20% من قيمة الإيجار الشهري الأول عند إتمام الحجز الإلكتروني.', '• The tenant pays 20% of the first month\'s rent upon completing the online booking.', lang)}</p>
      <p>{t('• هذا المبلغ يتكون من: 10% عمولة المنصة + 10% دفعة مقدمة تُخصم من إيجار الشهر الأول.', '• This amount consists of: 10% platform commission + 10% advance deducted from first month\'s rent.', lang)}</p>
      <p>{t('• عند الالتقاء الفعلي وتسليم الوحدة: يحصل المالك على 90% من إيجار الشهر الأول + كامل إيجار الأشهر التالية.', '• At physical handover: the landlord receives 90% of month-1 rent + full rent for subsequent months.', lang)}</p>
      <p>{t('• العمولة البالغة 10% تُدفع مرة واحدة فقط عن الشهر الأول بصرف النظر عن مدة العقد.', '• The 10% commission is paid once only on month 1 regardless of contract duration.', lang)}</p>
    </Section>

    <Section title={t('3. نظام الضمان (Escrow)', '3. Escrow Protection System', lang)}>
      <p>{t('تحتفظ المنصة بمبلغ الضمان (20%) لحين اكتمال عملية التسليم الموثقة بين الطرفين. لا يُفرج عن المبلغ إلا بعد تأكيد الطرفين للاستلام أو بقرار من إدارة المنصة بعد فحص أي نزاع.', 'The platform holds the escrow amount (20%) until the documented handover between both parties is complete. The amount is only released after both parties confirm receipt, or by platform administration following any dispute review.', lang)}</p>
    </Section>

    <Section title={t('4. التزامات المستخدم', '4. User Obligations', lang)}>
      <p>{t('• تقديم بيانات صحيحة ومطابقة للهوية الرسمية عند التسجيل والتحقق.', '• Provide accurate data matching official ID during registration and verification.', lang)}</p>
      <p>{t('• عدم تجاوز المنصة أو التواصل المباشر لإتمام عقود خارج النظام.', '• Do not bypass the platform or communicate directly to complete contracts outside the system.', lang)}</p>
      <p>{t('• الالتزام بقواعد الشات والتعامل الاحترافي مع الطرف الآخر.', '• Adhere to chat rules and maintain professional conduct with the other party.', lang)}</p>
      <p>{t('• عدم نشر معلومات تواصل شخصية (أرقام هواتف، عناوين) قبل إتمام الدفع.', '• Do not share personal contact information (phone numbers, addresses) before payment is complete.', lang)}</p>
    </Section>

    <Section title={t('5. فض النزاعات', '5. Dispute Resolution', lang)}>
      <p>{t('في حالة أي نزاع بين الطرفين، يمكن التواصل مع إدارة المنصة عبر: escrow.ejar@gmail.com. تلتزم الإدارة بالرد خلال 48 ساعة عمل. قرارات الإدارة في النزاعات المتعلقة بالضمان نهائية وملزمة وفق شروط هذه الاتفاقية.', 'In case of any dispute between parties, contact platform administration via: escrow.ejar@gmail.com. Administration commits to respond within 48 business hours. Administration decisions on escrow disputes are final and binding under these terms.', lang)}</p>
    </Section>
  </div>
);

const PrivacyContent: React.FC<{ lang: 'ar' | 'en' }> = ({ lang }) => (
  <div>
    <p className="text-xs text-slate-500 mb-4">{t('آخر تحديث: نوفمبر 2026', 'Last updated: November 2026', lang)}</p>

    <Section title={t('1. البيانات التي نجمعها', '1. Data We Collect', lang)}>
      <p>{t('• الاسم الكامل، رقم الهاتف، البريد الإلكتروني عند التسجيل.', '• Full name, phone number, email address upon registration.', lang)}</p>
      <p>{t('• رقم الهوية القومية (14 رقم) ومستندات التحقق من الهوية (KYC).', '• National ID number (14 digits) and identity verification documents (KYC).', lang)}</p>
      <p>{t('• بيانات الوحدات العقارية المُدرجة (الصور، الأسعار، الموقع).', '• Listed real-estate unit data (photos, prices, location).', lang)}</p>
      <p>{t('• بيانات الحجوزات والمعاملات المالية (المبالغ، حالة الدفع، رقم المرجع).', '• Booking and financial transaction data (amounts, payment status, reference code).', lang)}</p>
      <p>{t('• إثباتات التحويل البنكي المرفوعة.', '• Uploaded bank transfer proofs.', lang)}</p>
    </Section>

    <Section title={t('2. كيف نخزن بياناتك', '2. How We Store Your Data', lang)}>
      <p>{t('• مصادقة المستخدمين وبيانات الملفات الشخصية: Firebase Authentication وFirestore (Google).', '• User authentication and profile data: Firebase Authentication and Firestore (Google).', lang)}</p>
      <p>{t('• الملفات والصور ومستندات KYC: Supabase Storage (قاعدة بيانات آمنة بتشفير SSL).', '• Files, photos, and KYC documents: Supabase Storage (secure SSL-encrypted database).', lang)}</p>
      <p>{t('• سجلات المعاملات والمدفوعات: Supabase PostgreSQL وFirestore.', '• Transaction and payment records: Supabase PostgreSQL and Firestore.', lang)}</p>
    </Section>

    <Section title={t('3. مشاركة البيانات', '3. Data Sharing', lang)}>
      <p>{t('لا نبيع بياناتك الشخصية لأي طرف ثالث. البيانات تُستخدم فقط لتشغيل المنصة وإتمام المعاملات العقارية بين الأطراف المعنية. قد نشارك البيانات مع الجهات القانونية المختصة عند الطلب الرسمي وفق القانون المصري.', 'We do not sell your personal data to any third party. Data is used solely to operate the platform and complete real-estate transactions between relevant parties. We may share data with competent legal authorities upon official request in accordance with Egyptian law.', lang)}</p>
    </Section>

    <Section title={t('4. حقك في حذف بياناتك', '4. Your Right to Data Deletion', lang)}>
      <p>{t('يمكنك طلب حذف حسابك وجميع بياناتك بالتواصل مع escrow.ejar@gmail.com. سيتم معالجة الطلب خلال 7 أيام عمل. ملاحظة: سجلات المعاملات المكتملة قد تُحفظ لأغراض قانونية ومحاسبية لمدة لا تتجاوز 5 سنوات.', 'You can request deletion of your account and all data by contacting escrow.ejar@gmail.com. The request will be processed within 7 business days. Note: completed transaction records may be retained for legal and accounting purposes for up to 5 years.', lang)}</p>
    </Section>

    <Section title={t('5. ملفات تعريف الارتباط والتخزين المحلي', '5. Cookies & Local Storage', lang)}>
      <p>{t('تستخدم المنصة التخزين المحلي للمتصفح (localStorage) لحفظ تفضيلات اللغة والجلسة. لا نستخدم ملفات تتبع إعلانية خارجية.', 'The platform uses browser local storage (localStorage) to save language preferences and session data. We do not use external advertising tracking cookies.', lang)}</p>
    </Section>
  </div>
);

const CancellationContent: React.FC<{ lang: 'ar' | 'en' }> = ({ lang }) => (
  <div>
    <p className="text-xs text-slate-500 mb-4">{t('آخر تحديث: نوفمبر 2026', 'Last updated: November 2026', lang)}</p>

    <Section title={t('1. الحجوزات المؤكدة (Confirmed / Escrow Paid)', '1. Confirmed Bookings (Confirmed / Escrow Paid)', lang)}>
      <p>{t('بعد تأكيد الدفع والبدء في عملية الضمان، لا يمكن استرداد عمولة المنصة (10%) في أي حال.', 'After payment confirmation and start of the escrow process, the platform commission (10%) is non-refundable under any circumstances.', lang)}</p>
      <p>{t('• الدفعة المقدمة (10%) تُسترد فقط عند اكتمال التسليم الفعلي وخصمها من إيجار الشهر الأول.', '• The advance payment (10%) is only "recovered" upon actual handover when deducted from month-1 rent.', lang)}</p>
      <p>{t('• في حال إلغاء المالك للحجز بعد تأكيده: تُرد كامل المبالغ المدفوعة من المستأجر.', '• If the landlord cancels the booking after confirmation: all amounts paid by the tenant are fully refunded.', lang)}</p>
    </Section>

    <Section title={t('2. طلبات التحويل البنكي قيد المراجعة (Pending Verification)', '2. Pending Bank Transfer Requests (Pending Verification)', lang)}>
      <p>{t('إذا تم رفع إثبات تحويل ولم تُكتشف أي مشكلة، يمكن طلب الإلغاء خلال 24 ساعة من رفع الإثبات. استرداد المبلغ يستغرق من 3 إلى 7 أيام عمل بعد مراجعة الإدارة.', 'If a transfer proof was uploaded and no issue was found, cancellation can be requested within 24 hours of uploading the proof. Refund takes 3-7 business days after administration review.', lang)}</p>
    </Section>

    <Section title={t('3. طلبات الحجز الانتظاري (Pending Approval)', '3. Pending Approval Booking Requests', lang)}>
      <p>{t('الحجوزات في حالة "انتظار موافقة المالك" يمكن إلغاؤها في أي وقت قبل موافقة المالك بدون أي رسوم أو خصومات.', 'Bookings in "awaiting landlord approval" status can be cancelled at any time before landlord approval without any fees or deductions.', lang)}</p>
    </Section>

    <Section title={t('4. خصم الرصيد الافتراضي (رصيد المحفظة)', '4. Wallet Balance Deductions', lang)}>
      <p>{t('في حال الدفع من رصيد المحفظة وإلغاء الحجز: يُعاد الرصيد إلى المحفظة خلال 24 ساعة إذا كان الحجز في مرحلة الانتظار. بعد تأكيد المالك، يُطبق نفس شروط استرداد الحجوزات المؤكدة.', 'In case of payment from wallet balance and booking cancellation: balance is returned to wallet within 24 hours if booking is in pending stage. After landlord confirmation, the same refund terms as confirmed bookings apply.', lang)}</p>
    </Section>

    <Section title={t('5. التواصل لطلب الاسترداد', '5. Contact for Refund Requests', lang)}>
      <p>
        {t('لطلب الإلغاء أو الاسترداد، تواصل معنا عبر: ', 'To request cancellation or refund, contact us via: ', lang)}
        <span className="font-mono font-semibold text-blue-700">escrow.ejar@gmail.com</span>
      </p>
      <p>{t('اذكر رقم المرجع (reference_code) ورقم هاتفك المسجل في الطلب.', 'Include your reference code and the phone number registered in the request.', lang)}</p>
    </Section>
  </div>
);

const POLICY_META: Record<PolicyType, { icon: React.ReactNode; titleAr: string; titleEn: string; color: string }> = {
  terms: {
    icon: <FileText className="w-5 h-5" />,
    titleAr: 'الشروط والأحكام',
    titleEn: 'Terms & Conditions',
    color: 'text-blue-700 bg-blue-50 border-blue-200',
  },
  privacy: {
    icon: <Shield className="w-5 h-5" />,
    titleAr: 'سياسة الخصوصية',
    titleEn: 'Privacy Policy',
    color: 'text-purple-700 bg-purple-50 border-purple-200',
  },
  cancellation: {
    icon: <RefreshCw className="w-5 h-5" />,
    titleAr: 'سياسة الإلغاء والاسترداد',
    titleEn: 'Cancellation & Refund Policy',
    color: 'text-orange-700 bg-orange-50 border-orange-200',
  },
};

export const LegalPolicyModal: React.FC<LegalPolicyModalProps> = ({ policyType, onClose, lang = 'ar' }) => {
  if (!policyType) return null;

  const meta = POLICY_META[policyType];

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className={`flex items-center justify-between gap-3 px-5 py-4 border-b ${meta.color}`}>
          <div className="flex items-center gap-2 font-bold text-base" id="legal-modal-title">
            {meta.icon}
            <span>{lang === 'ar' ? meta.titleAr : meta.titleEn}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
            aria-label={t('إغلاق', 'Close', lang)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {policyType === 'terms' && <TermsContent lang={lang} />}
          {policyType === 'privacy' && <PrivacyContent lang={lang} />}
          {policyType === 'cancellation' && <CancellationContent lang={lang} />}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-5 py-3 bg-slate-50 text-center">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 transition-colors"
          >
            {t('فهمت وأوافق', 'Understood & Agree', lang)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LegalPolicyModal;

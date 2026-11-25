export type GatewayPaymentPurpose = 'booking' | 'wallet_deposit' | 'listing_commission';
export type GatewayPaymentMethod = 'card_meeza' | 'mobile_wallet' | 'fawry' | 'instapay';

export interface PaymentGatewayStatus {
  configured: boolean;
  providers: {
    card_meeza: boolean;
    mobile_wallet: boolean;
    fawry: boolean;
    instapay: boolean;
  };
  merchantInstaPayAddress: string;
  merchantWalletNumber: string;
}

export interface CreateCheckoutResponse {
  ok?: boolean;
  mode: 'paymob_live' | 'direct_instapay' | 'unconfigured';
  flowType: 'iframe' | 'wallet_redirect' | 'fawry_reference' | 'instapay_transfer';
  orderId?: string;
  merchantOrderId?: string;
  iframeUrl?: string;
  redirectUrl?: string;
  fawryReference?: string;
  merchantInstaPayAddress?: string;
  merchantWalletNumber?: string;
  missingEnvVars?: string[];
  message?: string;
  error?: string;
}

export async function fetchPaymentGatewayStatus(): Promise<PaymentGatewayStatus> {
  try {
    const res = await fetch('/api/payments/status');
    if (res.ok) {
      return (await res.json()) as PaymentGatewayStatus;
    }
  } catch {}
  return {
    configured: false,
    providers: {
      card_meeza: false,
      mobile_wallet: false,
      fawry: false,
      instapay: true,
    },
    merchantInstaPayAddress: 'ejar.escrow@instapay',
    merchantWalletNumber: '01099887766',
  };
}

export async function createRealPaymobCheckout(params: {
  purpose: GatewayPaymentPurpose;
  amountEgp: number;
  paymentMethod: GatewayPaymentMethod;
  walletPhone?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  userPhone?: string;
  apartmentId?: string;
  apartmentTitle?: string;
}): Promise<CreateCheckoutResponse> {
  try {
    const res = await fetch('/api/payments/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = (await res.json()) as CreateCheckoutResponse;
    if (!res.ok && data.error) {
      return {
        ok: false,
        mode: 'unconfigured',
        flowType: 'iframe',
        error: data.error,
      };
    }
    return data;
  } catch {
    return {
      ok: false,
      mode: 'unconfigured',
      flowType: 'instapay_transfer',
      merchantInstaPayAddress: 'ejar.escrow@instapay',
      merchantWalletNumber: '01099887766',
      message: 'تعذر الاتصال بخادم Paymob حالياً — يمكنك التحويل المباشر لحساب المنصة وتأكيد الرقم المرجعي.',
    };
  }
}

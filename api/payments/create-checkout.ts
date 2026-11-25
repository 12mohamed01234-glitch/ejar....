import type { IncomingMessage, ServerResponse } from 'node:http';

interface CheckoutRequestBody {
  purpose?: 'booking' | 'wallet_deposit' | 'listing_commission';
  amountEgp?: number;
  paymentMethod?: 'card_meeza' | 'mobile_wallet' | 'fawry' | 'instapay';
  walletPhone?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  userPhone?: string;
  apartmentId?: string;
  apartmentTitle?: string;
}

async function readJsonBody(req: IncomingMessage & { body?: unknown }): Promise<CheckoutRequestBody> {
  if (req.body && typeof req.body === 'object') {
    return req.body as CheckoutRequestBody;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? (JSON.parse(raw) as CheckoutRequestBody) : {};
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = await readJsonBody(req);
    const amountEgp = Math.round(Number(body.amountEgp) || 0);
    const paymentMethod = body.paymentMethod || 'card_meeza';
    const purpose = body.purpose || 'booking';

    if (amountEgp <= 0) {
      return sendJson(res, 400, { error: 'المبلغ يجب أن يكون أكبر من صفر' });
    }

    const merchantInstaPayAddress =
      process.env.MERCHANT_INSTAPAY_IPA?.trim() || 'ejar.escrow@instapay';
    const merchantWalletNumber =
      process.env.MERCHANT_WALLET_NUMBER?.trim() || '01099887766';

    // InstaPay uses direct IPA transfer / QR confirmation in Egypt
    if (paymentMethod === 'instapay') {
      return sendJson(res, 200, {
        ok: true,
        mode: 'direct_instapay',
        flowType: 'instapay_transfer',
        orderId: `IPA_${purpose}_${Date.now()}`,
        merchantInstaPayAddress,
        merchantWalletNumber,
        amountEgp,
      });
    }

    const apiKey = process.env.PAYMOB_API_KEY?.trim() || '';
    const integrationIdMap: Record<string, string | undefined> = {
      card_meeza: process.env.PAYMOB_CARD_INTEGRATION_ID?.trim(),
      mobile_wallet: process.env.PAYMOB_WALLET_INTEGRATION_ID?.trim(),
      fawry: process.env.PAYMOB_FAWRY_INTEGRATION_ID?.trim(),
    };
    const integrationId = integrationIdMap[paymentMethod] || '';
    const iframeId = process.env.PAYMOB_IFRAME_ID?.trim() || '';

    // If Paymob merchant credentials aren't added in Vercel yet, report clearly without crashing
    if (!apiKey || !integrationId || (paymentMethod === 'card_meeza' && !iframeId)) {
      return sendJson(res, 200, {
        ok: false,
        mode: 'unconfigured',
        flowType: paymentMethod === 'mobile_wallet' ? 'wallet_redirect' : paymentMethod === 'fawry' ? 'fawry_reference' : 'iframe',
        merchantInstaPayAddress,
        merchantWalletNumber,
        missingEnvVars: [
          !apiKey ? 'PAYMOB_API_KEY' : null,
          !integrationId
            ? paymentMethod === 'card_meeza'
              ? 'PAYMOB_CARD_INTEGRATION_ID'
              : paymentMethod === 'mobile_wallet'
                ? 'PAYMOB_WALLET_INTEGRATION_ID'
                : 'PAYMOB_FAWRY_INTEGRATION_ID'
            : null,
          paymentMethod === 'card_meeza' && !iframeId ? 'PAYMOB_IFRAME_ID' : null,
        ].filter(Boolean),
        message:
          'بوابة Paymob جاهزة ومربوطة بالكود، وتحتاج فقط لإضافة مفاتيح التاجر (Environment Variables) في لوحة تحكم Vercel لتفعيل السحب الفعلي.',
      });
    }

    // 1. Paymob Auth Token
    const authResp = await fetch('https://accept.paymob.com/api/auth/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey }),
    });
    const authJson = (await authResp.json()) as { token?: string; detail?: string };
    if (!authResp.ok || !authJson.token) {
      return sendJson(res, 502, {
        error: authJson.detail || 'فشل المصادقة مع بوابة Paymob — تحقق من PAYMOB_API_KEY',
      });
    }

    const amountCents = amountEgp * 100;
    const merchantOrderId = `ejar|${purpose}|${body.userId || 'guest'}|${body.apartmentId || 'none'}|${Date.now()}`;

    // 2. Paymob Order Registration
    const orderResp = await fetch('https://accept.paymob.com/api/ecommerce/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token: authJson.token,
        delivery_needed: false,
        amount_cents: amountCents,
        currency: 'EGP',
        merchant_order_id: merchantOrderId,
        items: [
          {
            name: (body.apartmentTitle || `Ejar ${purpose}`).slice(0, 50),
            amount_cents: amountCents,
            description: `Ejar Egypt - ${purpose}`,
            quantity: 1,
          },
        ],
      }),
    });
    const orderJson = (await orderResp.json()) as { id?: number; message?: string };
    if (!orderResp.ok || !orderJson.id) {
      return sendJson(res, 502, {
        error: orderJson.message || 'تعذر إنشاء طلب الدفع على Paymob',
      });
    }

    const fullName = (body.userName || 'Ejar User').trim();
    const parts = fullName.split(/\s+/);
    const firstName = parts[0] || 'Ejar';
    const lastName = parts.slice(1).join(' ') || 'Client';

    // 3. Paymob Payment Key
    const payKeyResp = await fetch('https://accept.paymob.com/api/acceptance/payment_keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token: authJson.token,
        amount_cents: amountCents,
        expiration: 3600,
        order_id: orderJson.id,
        currency: 'EGP',
        integration_id: Number(integrationId),
        billing_data: {
          apartment: 'NA',
          email: body.userEmail || 'client@ejar-egypt.com',
          floor: 'NA',
          first_name: firstName,
          street: 'NA',
          building: 'NA',
          phone_number: body.walletPhone || body.userPhone || '+201000000000',
          shipping_method: 'NA',
          postal_code: 'NA',
          city: 'Cairo',
          country: 'EG',
          last_name: lastName,
          state: 'Cairo',
        },
      }),
    });
    const payKeyJson = (await payKeyResp.json()) as { token?: string; detail?: string };
    if (!payKeyResp.ok || !payKeyJson.token) {
      return sendJson(res, 502, {
        error: payKeyJson.detail || 'تعذر توليد مفتاح الدفع من Paymob',
      });
    }

    const paymentToken = payKeyJson.token;

    // 4A. Card / Meeza Iframe
    if (paymentMethod === 'card_meeza') {
      return sendJson(res, 200, {
        ok: true,
        mode: 'paymob_live',
        flowType: 'iframe',
        orderId: String(orderJson.id),
        merchantOrderId,
        iframeUrl: `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentToken}`,
      });
    }

    // 4B. Mobile Wallets (Vodafone Cash, Orange Cash, Etisalat Cash, WE Pay)
    if (paymentMethod === 'mobile_wallet') {
      const cleanWalletPhone = (body.walletPhone || '').replace(/[^0-9]/g, '');
      if (!/^01[0125][0-9]{8}$/.test(cleanWalletPhone)) {
        return sendJson(res, 400, {
          error: 'يرجى إدخال رقم محفظة إلكترونية مصري صحيح مكون من 11 رقماً (010 / 011 / 012 / 015)',
        });
      }

      const walletResp = await fetch('https://accept.paymob.com/api/acceptance/payments/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: {
            identifier: cleanWalletPhone,
            subtype: 'WALLET',
          },
          payment_token: paymentToken,
        }),
      });
      const walletJson = (await walletResp.json()) as {
        redirect_url?: string;
        iframe_redirection_url?: string;
        data?: { message?: string };
        detail?: string;
      };

      const redirectUrl = walletJson.redirect_url || walletJson.iframe_redirection_url;
      if (!walletResp.ok || !redirectUrl) {
        return sendJson(res, 502, {
          error: walletJson.data?.message || walletJson.detail || 'تعذر بدء الدفع عبر المحفظة الإلكترونية من Paymob',
        });
      }

      return sendJson(res, 200, {
        ok: true,
        mode: 'paymob_live',
        flowType: 'wallet_redirect',
        orderId: String(orderJson.id),
        merchantOrderId,
        redirectUrl,
      });
    }

    // 4C. Fawry Kiosk Reference Code
    if (paymentMethod === 'fawry') {
      const fawryResp = await fetch('https://accept.paymob.com/api/acceptance/payments/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: {
            identifier: 'AGGREGATOR',
            subtype: 'AGGREGATOR',
          },
          payment_token: paymentToken,
        }),
      });
      const fawryJson = (await fawryResp.json()) as {
        id?: number;
        data?: { bill_reference?: number | string; message?: string };
        detail?: string;
      };

      const billRef = fawryJson.data?.bill_reference ? String(fawryJson.data.bill_reference) : '';
      if (!fawryResp.ok || !billRef) {
        return sendJson(res, 502, {
          error: fawryJson.data?.message || fawryJson.detail || 'تعذر إصدار كود دفع فوري من Paymob',
        });
      }

      return sendJson(res, 200, {
        ok: true,
        mode: 'paymob_live',
        flowType: 'fawry_reference',
        orderId: String(orderJson.id),
        merchantOrderId,
        fawryReference: billRef,
      });
    }

    return sendJson(res, 400, { error: 'وسيلة دفع غير مدعومة' });
  } catch (err) {
    return sendJson(res, 500, {
      error: err instanceof Error ? err.message : 'خطأ داخلي في بوابة الدفع',
    });
  }
}

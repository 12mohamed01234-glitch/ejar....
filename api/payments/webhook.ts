import type { IncomingMessage, ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function verifyPaymobHmac(obj: Record<string, any>, receivedHmac: string, hmacSecret: string): boolean {
  if (!hmacSecret || !receivedHmac) return false;
  const concatenated = [
    obj.amount_cents,
    obj.created_at,
    obj.currency,
    obj.error_occured,
    obj.has_parent_transaction,
    obj.id,
    obj.integration_id,
    obj.is_3d_secure,
    obj.is_auth,
    obj.is_capture,
    obj.is_refunded,
    obj.is_standalone_payment,
    obj.is_voided,
    obj.order?.id ?? obj.order,
    obj.owner,
    obj.pending,
    obj.source_data?.pan,
    obj.source_data?.sub_type,
    obj.source_data?.type,
    obj.success,
  ]
    .map((val) => (val === undefined || val === null ? '' : String(val)))
    .join('');

  const computed = crypto
    .createHmac('sha512', hmacSecret)
    .update(concatenated)
    .digest('hex');

  const bufA = Buffer.from(computed.toLowerCase(), 'utf8');
  const bufB = Buffer.from(receivedHmac.toLowerCase(), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export default async function handler(
  req: IncomingMessage & { body?: any; url?: string },
  res: ServerResponse
) {
  const urlObj = new URL(req.url || '/', 'http://localhost');

  // Transaction Response Callback (User redirected back to site after Paymob Checkout)
  if (req.method === 'GET') {
    const success = urlObj.searchParams.get('success') === 'true';
    const order = urlObj.searchParams.get('order') || '';
    const txId = urlObj.searchParams.get('id') || '';
    const target = `/?payment_status=${success ? 'success' : 'failed'}&order=${encodeURIComponent(
      order
    )}&tx=${encodeURIComponent(txId)}`;

    res.statusCode = 302;
    res.setHeader('Location', target);
    res.end();
    return;
  }

  // Transaction Processed Webhook (Server-to-Server from Paymob)
  if (req.method === 'POST') {
    try {
      let body = req.body;
      if (!body || typeof body !== 'object') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const raw = Buffer.concat(chunks).toString('utf8');
        body = raw ? JSON.parse(raw) : {};
      }

      const obj = body?.obj || body;
      const receivedHmac = urlObj.searchParams.get('hmac') || body?.hmac || '';
      const hmacSecret = process.env.PAYMOB_HMAC_SECRET?.trim() || '';

      if (!hmacSecret) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'Webhook HMAC secret not configured' }));
        return;
      }
      if (!verifyPaymobHmac(obj, receivedHmac, hmacSecret)) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: 'Invalid Paymob HMAC signature' }));
        return;
      }

      const isSuccess = obj?.success === true || obj?.success === 'true';
      const merchantOrderId = String(obj?.order?.merchant_order_id || '');
      const amountEgp = Math.round(Number(obj?.amount_cents || 0) / 100);
      const txId = String(obj?.id || '');

      if (isSuccess && merchantOrderId.startsWith('ejar|')) {
        const [, purpose, userId, apartmentId] = merchantOrderId.split('|');
        const supabaseUrl =
          process.env.VITE_SUPABASE_URL?.trim() || 'https://kaajbwzqamhaqvusiivm.supabase.co';
        const supabaseKey =
          process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
          process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
          'sb_publishable_g6yc8lyz7SIrdOfOgJuomA_djg99wiK';

        const sb = createClient(supabaseUrl, supabaseKey);

        if (purpose === 'wallet_deposit' && userId && userId !== 'guest') {
          const { data: w } = await sb
            .from('wallets')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();
          const newBal = Number(w?.balance_egp || 0) + amountEgp;
          const newTot = Number(w?.total_deposited_egp || 0) + amountEgp;
          const walletId = w?.id || `wallet_${userId}`;

          await sb.from('wallets').upsert(
            {
              id: walletId,
              user_id: userId,
              balance_egp: newBal,
              locked_escrow_egp: Number(w?.locked_escrow_egp || 0),
              total_deposited_egp: newTot,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          );

          await sb.from('wallet_transactions').upsert(
            {
              id: `tx_paymob_${txId}`,
              wallet_id: walletId,
              user_id: userId,
              type: 'deposit',
              amount_egp: amountEgp,
              payment_method: obj?.source_data?.type === 'wallet' ? 'mobile_wallet' : 'card_meeza',
              reference_number: `PAYMOB-${txId}`,
              status: 'completed',
              description: `شحن رصيد فوري عبر Paymob (${txId})`,
            },
            { onConflict: 'id' }
          );
        } else if (purpose === 'booking' && apartmentId && apartmentId !== 'none') {
          await sb.from('bookings').upsert(
            {
              id: `bk_paymob_${txId}`,
              apartment_id: apartmentId,
              apartment_title: 'حجز موثق عبر Paymob',
              tenant_id: userId || 'guest',
              landlord_id: 'verified_owner',
              total_rent_egp: amountEgp,
              escrow_amount_egp: amountEgp,
              status: 'escrow_paid',
              payment_method: obj?.source_data?.type === 'wallet' ? 'mobile_wallet' : 'card_meeza',
              reference_number: `PAYMOB-${txId}`,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          );
        }
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ received: true }));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Webhook error' }));
    }
    return;
  }

  res.statusCode = 405;
  res.end();
}

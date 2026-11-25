import type { IncomingMessage, ServerResponse } from 'node:http';

export default function handler(
  _req: IncomingMessage,
  res: ServerResponse
) {
  const apiKey = process.env.PAYMOB_API_KEY?.trim() || '';
  const cardIntegrationId = process.env.PAYMOB_CARD_INTEGRATION_ID?.trim() || '';
  const iframeId = process.env.PAYMOB_IFRAME_ID?.trim() || '';
  const walletIntegrationId = process.env.PAYMOB_WALLET_INTEGRATION_ID?.trim() || '';
  const fawryIntegrationId = process.env.PAYMOB_FAWRY_INTEGRATION_ID?.trim() || '';

  const payload = {
    configured: Boolean(apiKey),
    providers: {
      card_meeza: Boolean(apiKey && cardIntegrationId && iframeId),
      mobile_wallet: Boolean(apiKey && walletIntegrationId),
      fawry: Boolean(apiKey && fawryIntegrationId),
      instapay: true,
    },
    merchantInstaPayAddress: process.env.MERCHANT_INSTAPAY_IPA?.trim() || 'ejar.escrow@instapay',
    merchantWalletNumber: process.env.MERCHANT_WALLET_NUMBER?.trim() || '01099887766',
  };

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

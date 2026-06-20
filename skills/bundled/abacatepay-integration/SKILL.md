---
name: abacatepay-integration
description: "AbacatePay PIX payment integration for Brazilian SaaS - SDK usage, webhook processing, status monitoring"
version: 1.0.0
source: unknown
category: payments
---
# AbacatePay Payment Integration

## Purpose

Integrate PIX payments and subscription billing into Brazilian SaaS applications using the AbacatePay SDK for Next.js projects.

## Overview

**AbacatePay** is a Brazilian payment gateway specialized in PIX and credit card payments with developer-friendly APIs and competitive pricing.

### Fee Structure

- **PIX:** R$ 0.80 flat fee per transaction
- **Credit Card:** 3.5% + R$ 0.60 per transaction
- **No monthly fees**
- **No setup fees**

## Installation

```bash
npm install abacatepay-sdk
```

## Environment Variables

```bash
# .env.local
ABACATEPAY_API_KEY=your_api_key_here
ABACATEPAY_WEBHOOK_SECRET=your_webhook_secret_here
```

## PIX QR Code Payment

### Create PIX Payment

```typescript
// app/api/payments/pix/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { AbacatePaySDK } from 'abacatepay-sdk';

export async function POST(req: NextRequest) {
  const abacatepay = new AbacatePaySDK(process.env.ABACATEPAY_API_KEY!);

  try {
    const { amount, customerId, description } = await req.json();

    const pixPayment = await abacatepay.pixQrCode.create({
      amount: amount, // In centavos (R$ 10.00 = 1000)
      expiresIn: 3600, // 1 hour
      customer: {
        id: customerId,
        name: 'Customer Name',
        email: 'customer@example.com',
        taxId: '12345678900' // CPF
      },
      metadata: {
        orderId: 'order_123',
        productId: 'prod_456'
      },
      description
    });

    return NextResponse.json({
      qrCodeUrl: pixPayment.qrCodeUrl,
      qrCodeText: pixPayment.qrCodeText,
      pixId: pixPayment.id,
      expiresAt: pixPayment.expiresAt
    });
  } catch (error) {
    console.error('Error creating PIX payment:', error);
    return NextResponse.json(
      { error: 'Failed to create payment' },
      { status: 500 }
    );
  }
}
```

### Frontend Component

```typescript
// components/PixPaymentButton.tsx
'use client';

import { useState } from 'react';
import QRCode from 'react-qr-code';

export function PixPaymentButton({ amount, description }: {
  amount: number;
  description: string;
}) {
  const [pixData, setPixData] = useState<{
    qrCodeUrl: string;
    qrCodeText: string;
    pixId: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreatePayment = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/payments/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          customerId: 'user_123',
          description
        })
      });

      const data = await response.json();
      setPixData(data);
    } catch (error) {
      console.error('Payment error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {!pixData ? (
        <button onClick={handleCreatePayment} disabled={loading}>
          {loading ? 'Gerando...' : 'Pagar com PIX'}
        </button>
      ) : (
        <div>
          <h3>Escaneie o QR Code:</h3>
          <QRCode value={pixData.qrCodeText} size={256} />

          <div>
            <p>Ou copie o código PIX:</p>
            <input
              type="text"
              value={pixData.qrCodeText}
              readOnly
              onClick={(e) => e.currentTarget.select()}
            />
            <button onClick={() => navigator.clipboard.writeText(pixData.qrCodeText)}>
              Copiar
            </button>
          </div>

          <p>ID da transação: {pixData.pixId}</p>
        </div>
      )}
    </div>
  );
}
```

## Subscription Billing

### Create Recurring Charge

```typescript
// app/api/subscriptions/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { AbacatePaySDK } from 'abacatepay-sdk';

export async function POST(req: NextRequest) {
  const abacatepay = new AbacatePaySDK(process.env.ABACATEPAY_API_KEY!);

  try {
    const { planId, customerId, frequency } = await req.json();

    const subscription = await abacatepay.billing.create({
      frequency: frequency, // 'monthly', 'quarterly', 'yearly'
      amount: 4900, // R$ 49.00
      customer: {
        id: customerId,
        name: 'Customer Name',
        email: 'customer@example.com',
        taxId: '12345678900'
      },
      methods: ['pix', 'credit_card'],
      metadata: {
        planId,
        userId: customerId
      }
    });

    return NextResponse.json({
      subscriptionId: subscription.id,
      status: subscription.status,
      nextChargeDate: subscription.nextChargeDate
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    return NextResponse.json(
      { error: 'Failed to create subscription' },
      { status: 500 }
    );
  }
}
```

## Webhook Integration

### Webhook Handler

```typescript
// app/api/webhooks/abacatepay/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-abacatepay-signature');
  const payload = await req.text();

  // Verify webhook signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.ABACATEPAY_WEBHOOK_SECRET!)
    .update(payload)
    .digest('hex');

  if (signature !== expectedSignature) {
    console.error('Invalid webhook signature');
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 401 }
    );
  }

  const event = JSON.parse(payload);

  // Handle different event types
  switch (event.type) {
    case 'billing.paid': {
      const { billingId, customerId, amount, paidAt } = event.data;

      // Update subscription in database
      await updateSubscriptionStatus(billingId, 'active');

      // Send receipt email
      await sendReceiptEmail(customerId, amount, paidAt);

      break;
    }

    case 'billing.failed': {
      const { billingId, customerId, reason } = event.data;

      // Update subscription status
      await updateSubscriptionStatus(billingId, 'past_due');

      // Notify customer
      await sendPaymentFailedEmail(customerId, reason);

      break;
    }

    case 'billing.canceled': {
      const { billingId, customerId } = event.data;

      // Cancel subscription
      await updateSubscriptionStatus(billingId, 'canceled');

      // Send cancellation confirmation
      await sendCancellationEmail(customerId);

      break;
    }

    case 'pix.paid': {
      const { pixId, customerId, amount } = event.data;

      // Mark order as paid
      await markOrderAsPaid(pixId);

      // Send confirmation
      await sendPaymentConfirmation(customerId, amount);

      break;
    }

    case 'pix.expired': {
      const { pixId } = event.data;

      // Mark payment as expired
      await updatePixStatus(pixId, 'expired');

      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}

// Helper functions
async function updateSubscriptionStatus(billingId: string, status: string) {
  // Update in your database
}

async function sendReceiptEmail(customerId: string, amount: number, paidAt: string) {
  // Send email
}

async function sendPaymentFailedEmail(customerId: string, reason: string) {
  // Send email
}

async function sendCancellationEmail(customerId: string) {
  // Send email
}

async function markOrderAsPaid(pixId: string) {
  // Update order status
}

async function sendPaymentConfirmation(customerId: string, amount: number) {
  // Send email
}

async function updatePixStatus(pixId: string, status: string) {
  // Update status
}
```

### Webhook Event Types

```typescript
type AbacatePayWebhookEvent =
  | { type: 'billing.paid'; data: BillingPaidData }
  | { type: 'billing.failed'; data: BillingFailedData }
  | { type: 'billing.canceled'; data: BillingCanceledData }
  | { type: 'pix.paid'; data: PixPaidData }
  | { type: 'pix.expired'; data: PixExpiredData };

interface BillingPaidData {
  billingId: string;
  customerId: string;
  amount: number;
  paidAt: string;
  paymentMethod: 'pix' | 'credit_card';
}

interface BillingFailedData {
  billingId: string;
  customerId: string;
  reason: string;
  attemptedAt: string;
}

interface PixPaidData {
  pixId: string;
  customerId: string;
  amount: number;
  paidAt: string;
}
```

## Payment Status Checking

### Check PIX Status

```typescript
// app/api/payments/[pixId]/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { AbacatePaySDK } from 'abacatepay-sdk';

export async function GET(
  req: NextRequest,
  { params }: { params: { pixId: string } }
) {
  const abacatepay = new AbacatePaySDK(process.env.ABACATEPAY_API_KEY!);

  try {
    const pixStatus = await abacatepay.pixQrCode.check(params.pixId);

    return NextResponse.json({
      status: pixStatus.status, // 'PENDING', 'PAID', 'EXPIRED', 'CANCELLED'
      amount: pixStatus.amount,
      paidAt: pixStatus.paidAt
    });
  } catch (error) {
    console.error('Error checking PIX status:', error);
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 }
    );
  }
}
```

## Database Schema (Prisma)

```prisma
model Subscription {
  id                    String   @id @default(uuid())
  userId                String
  abacatePayBillingId   String   @unique
  planId                String
  status                String   // active, past_due, canceled
  amount                Int      // In centavos
  frequency             String   // monthly, quarterly, yearly
  nextChargeDate        DateTime
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  user                  User     @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([abacatePayBillingId])
}

model Payment {
  id                 String   @id @default(uuid())
  userId             String
  abacatePayPixId    String?  @unique
  abacatePayBillingId String?
  amount             Int      // In centavos
  status             String   // pending, paid, failed, expired
  method             String   // pix, credit_card
  paidAt             DateTime?
  createdAt          DateTime @default(now())
  user               User     @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([status])
}
```

## Testing

### Development Mode

```typescript
// AbacatePay provides test mode
const abacatepay = new AbacatePaySDK(
  process.env.NODE_ENV === 'production'
    ? process.env.ABACATEPAY_API_KEY!
    : process.env.ABACATEPAY_TEST_API_KEY!
);
```

### Simulate Payment (Test Mode)

```bash
# In test mode, you can simulate payment success
curl -X POST https://api.abacatepay.com/v1/test/pix/simulate \
  -H "Authorization: Bearer $TEST_API_KEY" \
  -d "pixId=pix_test_123"
```

## Best Practices

✅ **Verify webhook signatures** - Prevent fake webhooks
✅ **Idempotency** - Check if payment already processed
✅ **Handle duplicates** - Webhooks can be sent multiple times
✅ **Log all events** - For debugging and auditing
✅ **Retry logic** - For failed API calls
✅ **Test mode first** - Always test before production
✅ **Monitor expirations** - Clean up expired PIX codes
✅ **CPF validation** - Validate Brazilian tax ID format

## CPF/CNPJ Validation

```typescript
function isValidCPF(cpf: string): boolean {
  cpf = cpf.replace(/[^\d]/g, '');

  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cpf.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cpf.charAt(10))) return false;

  return true;
}
```

## Integration

Use with:
- `brazilian-financial-integration` - General Brazilian payment patterns
- `nextjs-stripe-integration` - Alternative payment provider
- `prisma-expert` - Database schema
- `zod-4` - Input validation (CPF, amount)
- `testing` - Webhook testing

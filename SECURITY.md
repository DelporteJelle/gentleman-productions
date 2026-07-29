# Security Measures

## Authentication Security

### ✅ Current Implementation

1. **HTTPS/TLS Encryption**

   - All traffic on Vercel is automatically encrypted with TLS
   - Passwords are encrypted in transit
   - `Secure` cookie flag ensures cookies only sent over HTTPS in production

2. **Password Security**

   - Passwords hashed with `bcrypt` (industry standard)
   - Never stored in plaintext
   - Server-side comparison prevents client-side attacks

3. **Secure Cookie Configuration**

   - `HttpOnly`: Prevents JavaScript access (XSS protection)
   - `Secure`: Only transmitted over HTTPS in production
   - `SameSite=Strict`: Maximum CSRF protection
   - 7-day expiration

4. **Rate Limiting**

   - Max 5 login attempts per IP per 15 minutes
   - Returns `429 Too Many Requests` with `Retry-After` header
   - Prevents brute force attacks

5. **Security Headers** (via middleware.ts)

   - `X-Frame-Options: DENY` - Prevents clickjacking
   - `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
   - `Strict-Transport-Security` - Enforces HTTPS
   - `Content-Security-Policy` - XSS protection
   - `Referrer-Policy` - Controls referer information

6. **Anti-Enumeration**
   - Generic "Invalid credentials" message prevents username enumeration
   - Same response time for valid/invalid users

## Recommended Additional Measures

### For Production at Scale

1. **Distributed Rate Limiting**

   ```bash
   npm install @upstash/redis @upstash/ratelimit
   ```

   Replace in-memory rate limiting with Redis for multi-instance deployments

2. **Account Lockout**

   - Lock account after 10 failed attempts
   - Require email verification to unlock
   - Implement in database

3. **2FA/MFA**

   - Add Time-based One-Time Password (TOTP)
   - Consider using libraries like `otplib`

4. **Session Management**

   - Implement session revocation
   - Track active sessions in database
   - Allow users to view/revoke sessions

5. **Password Requirements**

   - Minimum 12 characters
   - Mix of uppercase, lowercase, numbers, symbols
   - Check against common password lists (Have I Been Pwned API)

6. **Audit Logging**

   - Log all login attempts (success/failure)
   - Track IP addresses and user agents
   - Alert on suspicious patterns

7. **CAPTCHA**
   - Add reCAPTCHA or hCaptcha after 3 failed attempts
   - Prevents automated attacks

## Environment Variables Required

```env
DATABASE_URL=your_neon_database_url
JWT_SECRET=your_very_long_random_secret_at_least_32_chars
NODE_ENV=production

# Ticketing — all required wherever tickets are sold or scanned
TICKET_QR_SECRET=32_bytes_of_hex_identical_in_every_environment
MOLLIE_API_KEY=live_or_test_mollie_api_key
RESEND_API_KEY=your_resend_api_key
RESEND_FROM=tickets@yourdomain.example
NEXT_PUBLIC_BASE_URL=https://yourdomain.example
CRON_SECRET=32_bytes_of_hex_random_value
```

- `TICKET_QR_SECRET` — signs and verifies every ticket QR. Both sides **fail
  closed** without it: `POST /api/tickets/checkout` returns `503` (no order is
  created and no payment is taken) and `POST /api/tickets/scan` returns `500`.
  A deploy missing this variable therefore sells nothing rather than selling
  tickets it cannot issue. See "Ticket Security" below for rotation rules.
- `MOLLIE_API_KEY` — Mollie API key. `test_…` keys must never be used in
  production; `live_…` keys must never be used anywhere else.
- `RESEND_API_KEY` / `RESEND_FROM` — ticket delivery. `RESEND_FROM` must be a
  verified sender on the ticketing domain.
- `NEXT_PUBLIC_BASE_URL` — public origin, used to build the Mollie redirect and
  webhook URLs. A wrong value breaks payment confirmation. When it contains
  `localhost` the webhook URL is omitted (Mollie cannot reach it).
- `CRON_SECRET` — authenticates Vercel's daily call to
  `GET /api/tickets/cron/reconcile` (see `vercel.json`), which re-checks any
  order still `pending` with Mollie in case both the webhook and the
  confirm-page poll missed it (dropped webhook + interrupted redirect). Set
  the same value in the Vercel project's environment variables — Vercel then
  sends it automatically as `Authorization: Bearer $CRON_SECRET`. Without it,
  the route fails closed (503) rather than running unauthenticated. Admins can
  also trigger reconciliation for a single order immediately via the "Recheck
  payment" button on `/private/tickets` (`POST
  /api/tickets/admin/orders/[id]/recheck`), without waiting for the cron.

## Testing Security

1. **Test Rate Limiting**

   ```bash
   # Should block after 5 attempts
   for i in {1..6}; do curl -X POST https://yourdomain.com/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"test","password":"wrong"}'; done
   ```

2. **Test HTTPS Redirect**

   - Visit `http://yourdomain.com` (should redirect to `https://`)

3. **Check Security Headers**
   ```bash
   curl -I https://yourdomain.com
   ```

## Known Limitations

- **In-memory rate limiting**: Resets on server restart. Use Redis for production.
- **No distributed session management**: For multi-region deployment, use Redis or database-backed sessions.

## Why Passwords in JSON is Safe

Sending passwords in JSON over HTTPS is **standard practice** and secure because:

1. **TLS encrypts the entire request** - Not just the body, but headers too
2. **No plain text touches the network** - Encrypted before transmission
3. **Industry standard** - Used by Google, GitHub, AWS, etc.

**Client-side hashing is NOT recommended** because:

- Doesn't add security if you have HTTPS
- Makes the hash the "password" (just shifts the problem)
- Prevents server-side password policies
- Requires complex challenge-response protocols to be truly secure

## Migration Notes

If upgrading from previous version:

1. No breaking changes to database schema
2. Existing sessions remain valid
3. Rate limiting is automatic (no configuration needed)

## Ticket Security

### QR Ticket Tokens

Ticket QR codes contain `<ticket-uuid>.<base64url HMAC-SHA256>`, signed with
`TICKET_QR_SECRET`. The scanner (`/api/tickets/scan`) rejects any payload whose
signature does not verify, so knowing a ticket id is not sufficient to enter.

- `TICKET_QR_SECRET` must be a high-entropy random value (32 bytes hex) and must
  be **identical** in every environment that issues or scans tickets.
- Rotating the secret invalidates every ticket already emailed. Re-send tickets
  for all `sold` rows after any rotation, using the admin-only endpoint
  `POST /api/tickets/orders/<order-id>/resend` (one call per paid order — it
  re-signs with the current secret and re-attaches the PDFs). The same endpoint
  is the recovery path for a customer who lost their confirmation email.
  The confirmation page's own PDF download
  (`GET /api/tickets/orders/<order-id>/pdf`) re-signs on every request
  too, so it never needs a manual re-send after rotation.
- The scan endpoint is restricted to the admin role and is scoped to a single
  performance chosen by the operator.

# Rwanda-local bulk SMS gateways for a Node.js backend (as of Oct 2026)

Research date: 2026-10-10. About 17 tool calls in total. Several provider pages returned 404 or 403, or showed no prices. Those holes are listed under Gaps and were not filled from memory.

## Pindo: API, SDK, pricing, sender ID, reliability, company status

### Takeaway
Pindo is still online. It is a Kigali developer-focused platform covering SMS, USSD, voice/IVR, Verify and Campaign. Its REST API at `https://api.pindo.io/v1` is simple and uses a Bearer token, with single, bulk, verify and inbound endpoints. It has no official Node SDK; the only official client is a Python CLI. The headline price is "from $0.01 per SMS". The documentation domain has moved from docs.pindo.io, which no longer resolves, to docs.pindo.ai. Activity signals are thin: the last GitHub commit we saw was June 2025.

### Cited Findings
- Pindo describes itself as an "instant communication platform for businesses, optimized for developers". Its products are SMS with real-time delivery alerts and two-way messaging, USSD, voice calls, IVR, Verify (OTP) and Campaign (scheduled broadcasts). The homepage says it is "remotely operated from Kigali, Rwanda" and claims about 700 ms messaging response time and clients across East Africa. — [pindo.io](https://www.pindo.io)
- Pricing page (seen 2026-10-10): SMS "Starting at $0.01 Per SMS" in USD. Verify is "Starting at $0.002 Per Successful Verification". Campaign shows "Free" per channel transaction. A cost calculator uses MTN-RWA as its example network. The page lists no Airtel-specific rate, minimum top-up, free credits, payment methods or sender ID fee. — [pindo.io/pricing](https://www.pindo.io/pricing/)
- The documentation now lives at docs.pindo.ai, which gives the base URL `https://api.pindo.io` with messaging under `/v1`. It covers sending, bulk campaigns, receiving replies and OTP verification. — [docs.pindo.ai](https://docs.pindo.ai); the homepage links there ([pindo.io](https://www.pindo.io)). The old `docs.pindo.io` host failed DNS lookup (ENOTFOUND) on 2026-10-10.
- Endpoints, taken from the official CLI README:
  - `POST https://api.pindo.io/v1/sms/` sends one SMS. Body: `{to: "+250…", text, sender}`.
  - `POST https://api.pindo.io/v1/sms/bulk` sends in bulk. Body: `sender`, `text` and `recipients: [{phonenumber, name}]`; the name allows personalisation.
  - `/v1/sms/verify` generates a PIN.
  - `/v1/sms/inbounds` lists inbound messages.
  - Auth is `Authorization: Bearer <token>`. The `sender` field appears to be required on every request.
  — [github.com/pindoio/pindo-cli](https://github.com/pindoio/pindo-cli)
- The GitHub org `pindoio` has three repos. `pindo-cli` is Python, MIT-licensed, with 47 stars and was last updated 2025-06-24. `pindo-ai-docs` was last updated 2025-05-28. `blocjs` is a React UI kit last updated in 2020. There is no Node or JS SDK, so Node users call the REST API directly with fetch or axios. — [github.com/pindoio](https://github.com/pindoio)
- Pindo's site claims "real-time delivery alerts". We could not see the delivery-report webhook payload or status values because the docs subpage URL we tried returned 404. — [pindo.io](https://www.pindo.io); [docs.pindo.ai/sms (404)](https://docs.pindo.ai/sms)

### Inferences
- Isoko's existing Pindo driver is a reasonable integration: the API is a single JSON POST with a Bearer token, so an SDK adds little. The bulk endpoint's `recipients[].name` could support personalised activity digests.
- $0.01 per SMS is about RWF 14 at roughly 1,400 RWF/USD (our assumption; we did not check the exchange rate). That is in line with local reseller rates of RWF 10–12. It is far cheaper than the global aggregators, which charge $0.16–$0.33 per Rwanda SMS ([sent.dm summary](https://sent.dm/en/resources/sms-pricing/rwanda-sms-pricing)).
- Activity risk: the docs domain migration and GitHub commits stopping in mid-2025 point to a small team. Isoko should keep the driver abstraction (SMS_DRIVER) so it can switch providers cheaply.

### Gaps
- We found no published minimum top-up, free or test credit amount, or payment methods (MoMo or card) for Pindo. The pricing page doesn't show them.
- We found no Airtel Rwanda rate distinct from MTN.
- We could not verify the delivery-report webhook format or status values; the docs subpage returned 404.
- Who uses Pindo: we found no named customers in the press. We did not get to search The New Times, KT Press or Crunchbase.
- Pindo's sender ID approval process and turnaround are undocumented on the pages we reached.

## Other Rwanda-local gateways (Intouch, MTN direct, resellers; Mista/FDI/Kalisimbi/Hdev not found)

### Takeaway
The strongest Rwandan-registered alternative we confirmed is IntouchSMS (Intouch Communications Ltd, Kigali). It offers an HTTP API and SMPP, flat-rate prepaid credit and shortcode two-way messaging, but no public price list. MTN Rwanda sells bulk SMS directly with volume tiers from RWF 12/SMS; we saw these only second-hand. Resellers such as Hostraha (from RWF 10/unit) and Celcom Africa (RURA-compliant, billed in RWF) exist. We could find no web presence for "Mista", "FDI/BulkSMS Rwanda", "Kalisimbi" or "Hdev" as SMS gateways.

### Cited Findings
- **IntouchSMS** (Intouch Communications Ltd, 2nd Floor, Irembo House, Remera, Kigali):
  - Offers A2P bulk SMS for enterprises, government and NGOs.
  - Has an HTTP API, SMPP "up to 200 msgs/second" and a web portal with delivery reports and scheduling.
  - Says "Enable two-way messaging using your shortcode".
  - Has a reseller program and mentions USSD and a payment gateway.
  - Sales phone numbers are +250780880209 and +250788254137; tech support is +250788716074.
  — [intouchsms.co.rw](https://www.intouchsms.co.rw/)
- **IntouchSMS pricing page**:
  - "a flat rate for each SMS irrespective of destination network", "no set up fees or recurring monthly costs".
  - Unit cost falls with volume and prices include VAT.
  - Payment options are prepaid credits, postpaid (needs a commercial agreement) or an LPO from a registered organisation.
  - No RWF figures are published; buyers must contact sales.
  — [intouchsms.co.rw/pricing](https://www.intouchsms.co.rw/pricing)
- **MTN Rwanda Bulk SMS**:
  - Prepaid or postpaid, sent through MTN's SMSC to on-net and off-net numbers.
  - Volume tiers run from RWF 12/SMS for 1–100,000 messages down to RWF 2/SMS for 5,000,001–15,000,000; above 15M is a flat RWF 35,000,000.
  - Contact: customercare.rw@mtn.com, +250788310044.
  — search snippet of [mtn.co.rw/?p=50400](https://www.mtn.co.rw/?p=50400). The page itself returned 404 on 2026-10-10, so these figures are second-hand and the date is unknown.
- **Hostraha** sells bulk SMS units in Rwanda "from RWF 10 per unit". It also offers WhatsApp Business API, voice and long codes. Top-up is by mobile money, bank transfer or card in local currency. — search snippet of [hostraha.com](https://hostraha.com/solutions/bulk-sms) (page 404 on fetch); the top-up line came from a generic snippet in the same search, so its attribution is uncertain.
- **Celcom Africa** delivers to MTN Rwanda and Airtel Rwanda, is RURA-compliant and bills in RWF. — [celcomafrica.com/bulk-sms-rwanda](https://celcomafrica.com/bulk-sms-rwanda) (snippet only)
- **Africa's Talking** (Kenya-based, with a Rwanda presence) offers a bulk SMS API and says its Voice API "is now in Rwanda". Its pricing page returned 403. — [africastalking.com/sms/bulksms](https://africastalking.com/sms/bulksms). Telerivet names Africa's Talking as a Rwanda route option. — [Telerivet, 2026-02-11](https://www.telerivet.com/blog/rwanda-sms-compliance-rura-sender-id-law-058)
- **Global aggregators** (for comparison, not local):
  - Per-SMS rates for Rwanda: Twilio $0.3261, Plivo $0.1608, Sinch $0.2263, Infobip $0.2147, SMS.to €0.080, BudgetSMS €0.16–0.203. — [sent.dm Rwanda pricing](https://sent.dm/en/resources/sms-pricing/rwanda-sms-pricing). This is an aggregator summary; its title says 2023–2024 data, so treat it as stale.
  - Other listed providers: [D7](https://d7networks.com/sms/rwanda/), [EasySendSMS](https://www.easysendsms.com/gateway/Rwanda), [Releans](https://releans.com/sms/gateway/rwanda), [ForwardValueSMS](https://forwardvaluesms.com/Bulk-SMS-Provider-Rwanda.html).
- **Carrier throughput limits**: MTN 100 messages/s and Airtel 50 messages/s. Only telecom operators and licensed aggregators may provide bulk SMS under RURA rules. — [sent.dm compliance guide](https://sent.dm/en/resources/sms-compliance/rw-sms-guidance) (secondary)

### Inferences
- On price, Pindo (~RWF 14 equivalent) and local resellers (RWF 10–12) are in the same band. MTN direct only gets cheaper at volumes far beyond what a capstone sends, and it covers only MTN unless off-net terms apply.
- IntouchSMS is the most credible Pindo alternative for a Node backend. Opaque pricing and an LPO/commercial-agreement orientation suggest more friction for a student team.
- No provider we confirmed publishes a Node SDK. All integrations would be plain HTTP.

### Gaps
- **Mista, FDI/BulkSMS Rwanda, Kalisimbi, Hdev, "SMS Rwanda"**: none surfaced in searches. They may be small or rebranded, or the names may be inaccurate. We did not verify them.
- **Airtel Rwanda business SMS**: we found no public product page or pricing.
- **IntouchSMS**: RWF rates, API docs quality, sandbox and MoMo top-up are all unconfirmed.
- **MTN Rwanda**: we could not see the current tier table on MTN's own site because it returned 404.
- **Sandbox/test modes**: we found none documented for any local provider.

## Can a student or individual without a registered company send with a generic or shared sender ID?

### Takeaway
Probably not with a custom branded sender ID. Rwanda requires company documents, filed separately with MTN and Airtel. Generic sender IDs are rejected, and approval takes about three weeks. Whether a provider's own pre-approved shared sender ID (for example Pindo's) is available to unregistered individual accounts is undocumented.

### Cited Findings
- Sender ID registration requires a procuration letter on company letterhead (signed and stamped) and a certificate of company registration. It is filed separately with MTN Rwanda and Airtel Rwanda and takes about three weeks. Generic sender IDs are rejected; the ID must clearly be tied to the organisation's name. — [Telerivet blog, 2026-02-11](https://www.telerivet.com/blog/rwanda-sms-compliance-rura-sender-id-law-058)
- Business SMS needs a pre-registered alphanumeric sender ID with both operators. Numbers should be in E.164 format (+250…). — [sent.dm FAQ](https://www.sent.dm/resources/rw-sms-guidance)
- A secondary source mentions a RURA application with business registration, financial statements and a fee, with 30–60 days to approval. This appears to describe aggregator licensing rather than per-sender-ID registration, and it conflicts with Telerivet's three weeks. — [sent.dm compliance](https://sent.dm/en/resources/sms-compliance/rw-sms-guidance)
- Law 058/2021 on personal data protection (fully enforceable since October 2023) requires consent that is freely given, specific, informed and unambiguous. Penalties are RWF 2–5M or 1% of global turnover, and the supervisor is NCSA. — [Telerivet](https://www.telerivet.com/blog/rwanda-sms-compliance-rura-sender-id-law-058)

### Inferences
- For the capstone, the practical options are:
  - (a) use the provider's default or shared sender ID, if the provider allows it; confirm with Pindo and Intouch;
  - (b) register "IsokoTalent" (or similar) under the university or a sponsoring registered entity using its letterhead;
  - (c) demo with the `log` driver.
- Plan around three weeks of lead time for a branded ID.
- Isoko's notification preferences and opt-in support the Law 058/2021 consent requirement.

### Gaps
- No provider page we reached says whether individual (non-company) accounts can send, or which default sender is used. This needs a direct question to Pindo and Intouch support.

## Two-way SMS, inbound short codes and USSD

### Takeaway
Sources conflict. Telerivet (Feb 2026) says standard A2P SMS in Rwanda is one-way and that no short codes are currently available. Pindo advertises two-way messaging and has an `/v1/sms/inbounds` endpoint, and IntouchSMS advertises shortcode two-way messaging. Both Pindo and Intouch advertise USSD. Isoko should not depend on SMS replies (for example STOP keywords) unless a provider confirms an inbound number in writing.

### Cited Findings
- "Standard A2P SMS delivery in Rwanda is one-directional"; STOP replies don't work on standard A2P routes; "There are no short codes currently available in Rwanda". — [Telerivet, 2026-02-11](https://www.telerivet.com/blog/rwanda-sms-compliance-rura-sender-id-law-058)
- Pindo: "two-way messaging" and USSD products; the API has a `/v1/sms/inbounds` endpoint. — [pindo.io](https://www.pindo.io); [pindo-cli README](https://github.com/pindoio/pindo-cli)
- IntouchSMS: "Enable two-way messaging using your shortcode"; USSD is mentioned. — [intouchsms.co.rw](https://www.intouchsms.co.rw/)

### Inferences
- The conflict probably reflects Telerivet's view as a foreign platform using international A2P routes, whereas local aggregators may hold shortcodes or long numbers directly with MNOs. This is unverified.
- For opt-out, Isoko should rely on in-app or web preference settings (which it already has) rather than SMS keywords.

### Gaps
- Shortcode and USSD pricing, lead time and RURA approval steps for Pindo and Intouch are not published.

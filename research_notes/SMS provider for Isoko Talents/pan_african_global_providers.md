# Pan-African and Global SMS API Providers for Rwanda (MTN / Airtel), as of Oct 2026

Research date: 2026-10-10. All prices were seen on that date unless a different date is given. Rwanda's live networks are MTN Rwanda and Airtel Rwanda. Tigo Rwanda merged into Airtel in 2018, and Rwandatel no longer operates, but several price lists still carry rows for them.

## 1. Delivery to Rwanda, per-message price, and sender ID behaviour

### Takeaway
Every provider checked lists Rwanda as a destination. Africa's Talking is cheaper than the global providers by about 25-40 times: it charges local RWF tariffs of RWF 6-12 per SMS. Twilio, Plivo, Sinch and Prelude charge about US$0.12-0.33 per SMS. In Rwanda, MTN and Airtel accept only a pre-registered alphanumeric sender ID. Numeric or international sender IDs fail on both networks, and dynamic (unregistered) alphanumeric IDs are not supported.

### Cited Findings
**Africa's Talking (AT)**
- AT supports Rwanda for SMS (bulk and short code) and USSD — [AT community "AT HELP: Comprehensive"](https://community.africastalking.com/forum/help-18238/topic/at-help-comprehensive-94/); [helloduty USSD coverage 2026](https://helloduty.com/blogs/countries-supported-by-africas-talking-ussd-api)
- Rwanda bulk SMS price, tiered by how much you spend:
  - MTN: RWF 12 per SMS at Basic (RWF 0-99,999 spend), RWF 10 at Plus (100k-499,999), RWF 9 at Premium (500k-1.99M), RWF 8 at Max (2M+).
  - Airtel: RWF 10 / 8 / 7 / 6 for the same four tiers.
  - Incoming SMS: MTN RWF 7, Tigo/Airtel RWF 5.
  - Source: [africastalking.com/pricing](https://africastalking.com/pricing). I took these figures from the search-engine snippet of that page. A direct fetch returned HTTP 403, so they could not be confirmed against the live page.
- "In Rwanda, Sender IDs are currently free"; dedicated services are requested through the regulator RURA — [AT community help](https://community.africastalking.com/forum/help-18238/topic/at-help-comprehensive-94/)
- Shared default sender `AFRICASTKNG`: if you keep sending with the default after you have your own sender ID, AT can put the account on "risk hold" — [AT help: risk hold error](https://help.africastalking.com/en/articles/2258523-why-am-i-getting-the-risk-hold-error)

**Twilio**
- Rwanda: outbound SMS US$0.3261/msg, and alphanumeric sender also US$0.3261/msg. There is one flat rate with no MTN/Airtel split. Alphanumeric Sender IDs are free to obtain. Extra fees: failed-message processing US$0.001/msg and SMS-pumping protection US$0.025 — [Twilio pricing RW](https://www.twilio.com/en-us/sms/pricing/rw)
- Rwanda guidelines:
  - Alphanumeric sender ID is "Supported" but requires pre-registration, which takes about 3 weeks.
  - "Numeric International sender ID is not supported to the MTN and Airtel networks in Rwanda."
  - Domestic long codes are not supported, and short codes are not available.
  - Avoid generic sender IDs such as "InfoSMS" or "Verify".
  - Source: [Twilio Rwanda SMS guidelines](https://www.twilio.com/en-us/guidelines/rw/sms)

**Plivo**
- Outbound: US$0.2522/SMS to Airtel Rwanda and MTN Rwanda, and US$0.3525 to "TIGO Rwanda" (a stale row) — [Plivo pricing RW](https://www.plivo.com/sms/pricing/rw/)
- Conflict: aggregator sent.dm quotes older Plivo figures of $0.2089 for MTN, $0.2384 for Airtel and $0.2054 for all networks — [sent.dm Rwanda pricing](https://sent.dm/en/resources/sms-pricing/rwanda-sms-pricing). The live Plivo page is the more reliable source, so treat the sent.dm figures as out of date.

**Prelude (OTP-focused, global)**
- Rwanda SMS €0.1177/msg. "AlphaNumeric Sender IDs are available"; free registration is required. Lists carriers MTN, Tigo, Airtel and Rwandatel — [Prelude RW](https://prelude.so/countries/rw)

**BudgetSMS (low-cost wholesale)**
- About €0.16/SMS to MTN Rwanda and about €0.203 to other operators. This figure comes from a search snippet; I did not fetch the page — [BudgetSMS RW](https://www.budgetsms.net/sms-gateway-pricing/rw/rwanda/)

**Infobip**
- Public pricing comes from a calculator or sales; no Rwanda figure is shown in static page content — [Infobip SMS pricing](https://www.infobip.com/sms/pricing)

**Sinch**
- Rwanda is listed as "contact for pricing". An aggregator gives a historical figure of about US$0.2263/SMS (undated, unverified) — [sent.dm via search](https://sent.dm/en/resources/sms-pricing/rwanda-sms-pricing)

**Vonage**
- Its country-feature table lives in the support knowledge base and could not be retrieved — [Vonage country-specific features](https://developer.vonage.com/en/messaging/sms/guides/country-specific-features)
- PingOne's sender-ID-per-country page, as summarised by search, says that for Rwanda "Vonage does not have a registered SenderID" — [PingOne sender IDs per country](https://docs.pingidentity.com/pingone/settings/p1_senderid_per_country.html). This is second-hand; verify it.

**Bird (MessageBird)**
- A Rwanda destination page exists (found in search as a localized bird.com URL), but the en-us URL I tried returned 404, so no price was captured — [Bird RW (hi-in)](https://bird.com/hi-in/utpad/sms/destinations/rwanda)

**Termii**
- I found no evidence that Termii covers Rwanda. Searches turned up no Rwanda coverage or pricing.

**Market rules (aggregator, applies to all providers)**
- Rwanda requires global pre-registration of alphanumeric sender IDs, and dynamic use is not supported. MTN requires its own pre-registration, which takes about 3 weeks. RURA is the regulator. Opt-out keywords are expected in English and Kinyarwanda. Recommended sending window is 08:00-20:00 CAT — [sent.dm Rwanda compliance](https://sent.dm/en/resources/sms-compliance/rw-sms-guidance)
- Retail person-to-person SMS on MTN/Airtel costs about RWF 20-30 — [sent.dm Rwanda pricing](https://sent.dm/resources/rwanda-sms-pricing). Sent.dm's page is titled "2023-2024", so this figure may be dated.

### Inferences
- I have no sourced 2026 exchange rate. At roughly RWF 1,400-1,500 per US$1, AT's RWF 10-12 works out to about US$0.007-0.009 per SMS. Twilio's US$0.3261 is roughly 35-45 times that, and Plivo's US$0.2522 roughly 30 times. For a student marketplace sending notifications, global providers are hard to justify on cost alone.
- The sender-ID constraint is the same whichever provider you choose. Plan for about 3 weeks of sender-ID registration (MTN in particular) before production. Without a registered sender, MTN and Airtel can reject messages or have the sender overwritten.

### Gaps
- No live-page confirmation of AT's RWF prices (HTTP 403), and no "last updated" date for them.
- Infobip, Sinch, Vonage and Bird Rwanda per-message prices are not public or could not be fetched.
- I found no source that explicitly says a provider "overwrites" the sender ID in Rwanda. The sources only say that numeric or unregistered senders fail or are unsupported.

## 2. Sandbox / free trial without paying or a registered company

### Takeaway
Africa's Talking has the strongest free test path: a free sandbox plus a web and Android simulator that covers SMS, USSD, short codes, payments and voice, with no charges. In 2026 Twilio's trial is heavily restricted: sign-up country only, 5 verified numbers, templates only, and 30 days. Plivo advertises free trial credits with no card needed.

### Cited Findings
- AT sandbox:
  - It is "a free test environment that mirrors how users would interact with your application and our API", and tests are not charged.
  - Messages go to the simulator only, never to real phones.
  - The sandbox dashboard is orange; the live one is green.
  - Source: [AT help: sandbox vs live](https://help.africastalking.com/en/articles/2189460-what-are-the-sandbox-and-the-live-environments) (article dated 2019)
- The AT simulator can simulate SMS, USSD, short codes, payments and voice. It runs on the web and as an Android app — [AT simulator](https://developers.africastalking.com/simulator); [AT sandbox Android app listing](https://apppage.net/preview/com.africastalking.sandbox)
- Twilio free trial:
  - No credit card needed. Includes 100 SMS, 100 WhatsApp messages, 3,000 emails and 75 voice minutes, and expires after 30 days.
  - "SMS and voice are limited to your sign-up country."
  - Messages can go to at most 5 verified numbers, and trial messaging must use Twilio-provided templates.
  - Source: [Twilio free trial guide](https://www.twilio.com/docs/messaging/guides/how-to-use-your-free-trial-account)
- Plivo: "free trial credits with no credit card required" — [Plivo pricing RW](https://www.plivo.com/sms/pricing/rw/)
- Twilio Verify: "free trial with no credit card required" — [Twilio Verify pricing](https://www.twilio.com/en-us/verify/pricing)

### Inferences
- A Rwandan student could probably send a few real test SMS to their own verified Rwandan number with a Twilio trial, if they signed up from Rwanda. Because content is template-only, the trial cannot exercise Isoko's own message bodies.
- For a capstone demo with no spend, AT's sandbox and simulator fit best. It shows end-to-end SMS and USSD flows without a company or a top-up.

### Gaps
- I could not confirm whether AT or other providers require a registered company to go live in Rwanda.
- No current details were found on Infobip, Sinch or Vonage trial terms for Rwanda.

## 3. Node.js SDK, delivery reports, two-way SMS / short codes, USSD, OTP/Verify

### Takeaway
Twilio, Vonage, Plivo, Sinch and Africa's Talking all have Node SDKs that are actively maintained in 2026. Infobip's, Termii's and MessageBird's npm SDKs have not been updated since 2023. In Rwanda, two-way SMS, short codes and USSD are realistically available only through Africa's Talking: dedicated MTN short codes and USSD codes take about 6 weeks through RURA. Twilio explicitly does not support two-way SMS in Rwanda.

### Cited Findings
- npm registry figures were checked on 2026-10-10 against registry.npmjs.org and api.npmjs.org; weekly downloads cover 2026-10-02 to 2026-10-08.

  | Package | Latest version | Released | Weekly downloads |
  |---|---|---|---|
  | `africastalking` | 0.8.4 | 2026-10-09 | 15,267 |
  | `twilio` | 6.1.2 | 2026-09-28 | 6,411,425 |
  | `@vonage/server-sdk` | 3.30.1 | 2026-09-09 | 132,077 |
  | `plivo` | 4.79.0 | 2026-07-28 | 43,361 |
  | `@sinch/sdk-core` | 1.6.0 | 2026-09-23 | 13,312 |
  | `@infobip-api/sdk` | 0.3.2 | 2023-11-23 (stale) | 8,568 |
  | `termii-nodejs` | 1.1.4 | 2023-12-04 (stale) | 385 |
  | `messagebird` | 4.0.1 | 2023-01-25 (stale; Bird has rebranded) | 39,651 |

  Sources: [npm africastalking](https://www.npmjs.com/package/africastalking), [npm twilio](https://www.npmjs.com/package/twilio), [npm @vonage/server-sdk](https://www.npmjs.com/package/@vonage/server-sdk), [npm plivo](https://www.npmjs.com/package/plivo), [npm @sinch/sdk-core](https://www.npmjs.com/package/@sinch/sdk-core), [npm @infobip-api/sdk](https://www.npmjs.com/package/@infobip-api/sdk), [npm termii-nodejs](https://www.npmjs.com/package/termii-nodejs), [npm messagebird](https://www.npmjs.com/package/messagebird)
- Twilio in Rwanda: two-way SMS not supported, domestic long codes not supported, short codes not available — [Twilio RW guidelines](https://www.twilio.com/en-us/guidelines/rw/sms)
- AT in Rwanda:
  - Dedicated MTN short code: about 6 weeks. Dedicated MTN USSD code: about 6 weeks.
  - Dedicated services for Airtel/Tigo are listed as "N/A".
  - Requests go through RURA.
  - Source: [AT community help](https://community.africastalking.com/forum/help-18238/topic/at-help-comprehensive-94/)
- AT USSD in Rwanda is supported on MTN and Airtel; a dedicated MTN code takes about 6 weeks — [helloduty AT USSD coverage 2026](https://helloduty.com/blogs/countries-supported-by-africas-talking-ussd-api). This is a third-party blog, and it conflicts with AT's own "N/A" for Airtel dedicated services.
- AT bulk SMS API reference — [AT docs: bulk SMS](https://developers.africastalking.com/docs/sms/sending/bulk); AT two-way SMS product page — [AT two-way SMS](https://africastalking.com/sms/twowaysms)
- Twilio Verify:
  - US$0.05 per successful verification, plus the channel fee; the example SMS fee is US$0.0083 at US rates.
  - The fee includes rate limiting and automated SMS-pumping protection.
  - No Rwanda-specific Verify price is listed, so the SMS leg would presumably bill at the Rwanda SMS rate.
  - Source: [Twilio Verify pricing](https://www.twilio.com/en-us/verify/pricing)
- Prelude is an OTP-specialist API that lists Rwanda at €0.1177/SMS — [Prelude RW](https://prelude.so/countries/rw)

### Inferences
- If the existing Pindo driver already handles delivery-report webhooks, AT is the closest drop-in alternative. It is Africa-focused, cheap, has a maintained Node SDK, and offers optional USSD and short-code features for later.
- Twilio Verify in Rwanda would cost at least about US$0.05 plus about US$0.33 per OTP. That is expensive for a student project.
- Building an OTP on top of AT or Pindo SMS, with your own code generation and rate limiting, is far cheaper.

### Gaps
- I did not verify the delivery-report (DLR) webhook payloads for each provider against Rwanda carriers. In particular, I don't know whether MTN and Airtel return final handset delivery receipts or only network acceptance.
- No information was found on whether Infobip, Sinch or Vonage Verify products support Rwanda specifically.

## 4. Account / KYC, minimum top-up, payment methods

### Takeaway
I found little public, Rwanda-specific information. AT runs on a prepaid wallet topped up per country. The AT help docs I found cover only M-Pesa paybill and bank transfer, and do not mention Rwandan MTN MoMo. The global providers are pay-as-you-go by card.

### Cited Findings
- AT top-up flow: Billing → Top Up → choose the country and a method. The article (shown as updated 2026-08-20) lists no per-country methods or minimums — [AT help: how do I top up](https://help.africastalking.com/en/articles/1981959-how-do-i-top-up-my-account)
- AT payment-wallet top-up: "through mobile money (Mpesa) and bank transfer", using Paybill 525900 — [AT help: top up wallet](https://help.africastalking.com/en/articles/2255714-how-do-i-top-up-my-mobile-data-wallet). This is Kenya-centric.
- AT's Rwanda SMS price tiers depend on cumulative RWF top-up/spend bands starting at RWF 0, so there is no stated minimum — [AT pricing (snippet)](https://africastalking.com/pricing)
- Twilio: pay-as-you-go with no contracts; volume discounts through sales — [Twilio pricing RW](https://www.twilio.com/en-us/sms/pricing/rw)
- Infobip: pay-as-you-go, enterprise discounts and custom plans through sales — [Infobip SMS pricing](https://www.infobip.com/sms/pricing)

### Inferences
- Registering a sender ID in Rwanda through any provider will likely need some organisational identity and a letter of authorisation, because RURA and MTN pre-registration are involved. A student project without a registered company may have trouble obtaining a branded sender ID.

### Gaps
- No confirmed list of AT KYC documents for Rwanda accounts.
- No confirmation that AT accepts Rwandan MTN MoMo or Airtel Money top-ups.
- No minimum top-ups were found for Twilio, Plivo, Infobip, Sinch or Vonage.

## 5. Known Rwanda delivery reliability issues

### Takeaway
I found few public reports. The documented failure modes are about sender IDs (numeric, generic or unregistered) rather than routing. There is one sourced carrier incident: Twilio's MTN Rwanda delay on 2024-10-09.

### Cited Findings
- Twilio incident "SMS Delivery Delays to MTN Network in Rwanda" on 2024-10-09, from 04:44 to 09:38 PDT; resolved together with the carrier partner — [Twilio status incident](https://status.twilio.com/incidents/sdl270ch6qtj)
- Twilio has other incidents that show up in searches for this topic ([1](https://status.twilio.com/incidents/2hrp96wpjb78), [2](https://status.twilio.com/incidents/cqqy1191jm8v), [3](https://status.twilio.com/incidents/hjd8g8q4wrkr)). I did not fetch them, so their Rwanda relevance is unverified.
- MTN and Airtel Rwanda do not support numeric international sender IDs, so messages sent with one fail. Generic IDs such as "INFO" or "Verify" risk being blocked — [Twilio RW guidelines](https://www.twilio.com/en-us/guidelines/rw/sms)
- AT accounts that keep using the shared default sender after getting their own can be put on risk hold — [AT help](https://help.africastalking.com/en/articles/2258523-why-am-i-getting-the-risk-hold-error)

### Inferences
- The main reliability risk for Isoko on any provider is the sender ID, not the provider itself. Register an alphanumeric "ISOKO"-style sender with MTN and Airtel before launch.

### Gaps
- I found no Reddit, StackOverflow or forum threads about Rwanda-specific delivery rates for AT, Infobip or the others.
- No published delivery-rate statistics for Rwanda were found for any provider.

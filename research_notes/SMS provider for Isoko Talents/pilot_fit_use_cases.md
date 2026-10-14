# SMS approach for a student capstone pilot (Isoko Talents, Kigali): practical fit, cost, demo path

Research date: 2026-10-10. Pricing pages change often; every price below is "as fetched/reported in Oct 2026" unless flagged. Exchange rate used for rough conversion: ~1 USD ≈ 1,400–1,450 RWF (approximate, not sourced; verify before quoting).

## Q1. What do comparable East African platforms use for SMS / USSD, and why?

### Takeaway
The pattern is local or pan-African CPaaS aggregators (Pindo in Rwanda, Africa's Talking regionally, Celcom-type bulk resellers) rather than Twilio, chosen for direct MTN/Airtel connections, local-currency billing and USSD support. Feature-phone-first services in Rwanda (Irembo, One Acre Fund) lean on USSD plus SMS. I found little public, named evidence for most of the specific startups listed (Lynk, SafeBoda, Kasha, Yego).

### Cited Findings
- Pindo is a Kigali-based CPaaS founded in 2020 by Remy Muhire (CEO) and Eugene Rwagasore (CTO). It offers APIs for SMS, USSD, voice, IVR, verification and campaigns, has raised over $833K from investors including Google and Mozilla Ventures, and was one of six Rwandan startups given $100K by Google — [search summary of Dealroom/VC4A/CB Insights profiles](https://vc4a.com/ventures/pindo-rwanda-ltd/)
- Pindo names Irembo (Rwanda's e-government platform), Kudibooks and Exuus as customers, using it for payment notifications, reminders and SMS. It also advertises Kinyarwanda support, two-way SMS and USSD — [Pindo homepage](https://pindo.io/)
- Pindo and I&M Bank launched what was described as Rwanda's first Kinyarwanda Voice AI banking agent. Pindo's docs list Speech-to-Text, Text-to-Speech and NER for Kinyarwanda, Kiswahili and Luganda — [The New Times](https://www.newtimes.co.rw/article/37739/news/featured/pindo-im-bank-launch-rwandas-first-kinyarwanda-voice-ai-banking-agent/amp); [Pindo docs](https://docs.pindo.ai/)
- Africa's Talking (AT) is a pan-African CPaaS offering SMS, USSD, voice and airtime APIs. It has reported roughly 20,000 developers and clients including Tala, M-Kopa and Ecobank, with operations in Kenya, Uganda, Rwanda, Tanzania, Malawi, Nigeria and Ethiopia — [Courier alternatives page / search summary](https://www.courier.com/integrations/alternatives/africas-talking)
- **Risk flag on AT (2025–2026):** AT is still operating but is in a governance dispute. Co-founder litigation dates from 2023. Founder Samuel Gikandi said in Sept 2025 that he had been "kicked out". Paul Wamalwa was sworn in as CEO in March 2026. In July 2026 the High Court sent the disputes to ICC arbitration. Gikandi's claims about IFC blocking sale offers are disputed by IFC. The source is a Kenyan outlet with a clear editorial angle — [Kenya Insights](https://kenyainsights.com/africas-talking-ceo-cry-how-the-world-banks-ifc-sabotage-killed-my-company). Tracxn lists about 95 employees as of May 2026 and no reported shutdown — [Tracxn](https://tracxn.com/d/companies/africas-talking/__Vk3YEsKZ4b0w6fmDafAioJV2SQFXXB8n01Jo_x_aPs4)
- Irembo has offered government services (driver's licence, land title and others) by SMS/USSD since about 2017, presented as a fix for poor internet and for reaching older and rural users — [KT Press, 2017 (dated)](https://www.ktpress.rw/2017/11/through-sms-rwandans-can-request-for-drivers-license-land-title/)
- One Acre Fund rolled out USSD in 2020. Over 600,000 Rwandan farmers enrolled for farm supplies through USSD on basic phones — [One Acre Fund](https://oneacrefund.org/articles/using-mobile-tech-shape-smallholder-farming-rwanda)
- Esoko (agri-tech, Ghana and East Africa) is built around SMS for prices, advice and data collection, plus weekly voice messages in local languages. A Machakos (Kenya) pilot with 802 farmers reported 5–10% higher produce prices — [How We Made It In Africa (older article, likely ~2011–2013)](https://www.howwemadeitinafrica.com/how-mobile-phones-are-transforming-african-agriculture/8704/); [GSMA case study (2016)](https://gsma.com/solutions-and-impact/connectivity-for-good/mobile-for-development//wp-content/uploads/2016/02/Case_Study_-Esoko.pdf)
- Celcom Africa sells Rwanda bulk SMS over direct MTN Rwanda and Airtel Rwanda connections, bills in RWF via mobile money or bank transfer, and handles RURA-aligned sender ID registration — [Celcom Africa](https://celcomafrica.com/bulk-sms-rwanda)

### Inferences
- For a Rwandan product, Pindo is the "local champion" choice: Rwandan company, Kinyarwanda-aware, Irembo as reference customer, and Isoko already has a Pindo driver stub. That makes it the natural primary driver to defend to assessors.
- Africa's Talking is the regional default and has the best developer sandbox (see Q3). Its 2025–26 governance turmoil is a reason not to make it the only production dependency, but it is fine as a sandbox/demo tool.
- Comparable feature-phone services use USSD for anything interactive and SMS for push notifications. That split is a reasonable pattern to cite in the capstone.

### Gaps
- No primary source found naming the SMS/USSD provider for Lynk, SafeBoda, Kasha, Yego or M-Kopa beyond M-Kopa being listed as an AT client. One search summary claimed SafeBoda was a Celcom client, but the fetched Celcom page did not name SafeBoda, so treat this as unverified.
- No public engineering-blog write-ups were found from Rwandan gig/marketplace startups on SMS provider choice.

## Q2. Cost for about 200 users × 10 SMS/month (2,000 messages), GSM-7 vs Unicode

### Takeaway
On local or regional aggregators the pilot costs about **$8–$25/month** for single-segment GSM-7 messages, roughly double if messages fall into Unicode or run long. Twilio and other global providers cost about **$420–$650/month** for the same volume, 20–60× more. Keeping messages GSM-7 and under 160 characters is the biggest cost lever after provider choice.

### Cited Findings
- Pindo pricing page: SMS "Starting at $0.01 per SMS" for Rwanda (MTN-RWA). Verify is "Starting at $0.002 per successful verification". Campaign tool is free (pay per channel transaction) — [Pindo pricing](https://www.pindo.io/pricing)
- HelloDuty Rwanda guide (an aggregator; prices look like Africa's Talking-style RWF rates): RWF 6 per SMS sent, brand-name (alphanumeric) SMS free and one-way only, two-way shortcode RWF 13,500/month, shared USSD code RWF 26,000/month, dedicated USSD setup RWF 25,000, USSD session RWF 13 — [HelloDuty Rwanda](https://helloduty.com/country/rwanda)
- Celcom Africa: €0.0100 per SMS (about RWF 11) to Rwanda — [Celcom Africa](https://celcomafrica.com/bulk-sms-rwanda)
- Twilio Rwanda: $0.3261 per outbound segment (international number or alphanumeric sender ID). Inbound costs the same. Failed-message fee $0.001. Pumping protection +$0.025/msg — [Twilio Rwanda pricing](https://www.twilio.com/en-us/sms/pricing/rw)
- Plivo Rwanda: $0.2089/SMS to MTN and $0.2384/SMS to Airtel — [Plivo via search](https://www.plivo.com/sms/pricing/rw/)
- Aggregated figures from sent.dm (secondary, page titled 2023–2024 so possibly dated): Twilio $0.2627, Plivo $0.1608, Sinch $0.2263, Infobip $0.2147, operator retail RWF 20–30 per SMS — [sent.dm Rwanda pricing](https://sent.dm/resources/rwanda-sms-pricing). These conflict with the current Twilio and Plivo pages above; use the provider pages.
- Encoding: both GSM-7 and UCS-2 work in Rwanda. Concatenated segments are 153 characters (GSM-7) or 67 characters (Unicode). A single segment is 160 / 70 characters — [sent.dm compliance](https://sent.dm/en/resources/sms-compliance/rw-sms-guidance)

### Worked estimate (2,000 messages/month; my arithmetic from the cited rates)
| Option | GSM-7, 1 segment | Unicode or long message, 2 segments |
|---|---|---|
| HelloDuty/AT-style RWF 6 | RWF 12,000 (~$8) | RWF 24,000 (~$17) |
| Pindo "from $0.01" | $20 | $40 |
| Celcom €0.01 | €20 (~$22) | €40 |
| Plivo ~$0.21–0.24 | ~$420–$480 | ~$840–$960 |
| Twilio $0.3261 | $652 | $1,304 |

### Inferences
- Kinyarwanda is written in plain Latin script, so most Isoko templates fit GSM-7. Unicode is triggered by curly quotes, emoji, or accented characters pasted from rich text. The SMS driver should normalise to GSM-7 and keep templates short (e.g. "Isoko: New gig - Tailoring, Kimironko. Reply in app: isoko.rw/g/123").
- A whole semester pilot on Pindo would cost roughly $20–$40/month, or under $10 for a demo-sized cohort. Twilio is not credible for Rwanda production cost-wise, though its trial is still useful.
- Pindo's "starting at" price may be MTN-only. Airtel may cost more, so budget a 1.5× buffer.

### Gaps
- Could not fetch Africa's Talking's official Rwanda pricing page (HTTP 403). The RWF 6 figure is from a third-party aggregator and is unverified against AT directly.
- Pindo's Airtel Rwanda rate and its exact per-segment Unicode billing are not shown publicly.

## Q3. Demo strategy without a live sender ID: which path gets a real send to a Rwandan phone fastest?

### Takeaway
Use a layered demo. (1) The existing **log driver**, plus an Africa's Talking **sandbox simulator** (free, no sender ID, shows the message on a virtual phone in the browser), always works. (2) For a real handset, the quickest routes are **Pindo free-trial test credits** or a **Twilio trial** sending to a verified personal number. Rwandan alphanumeric sender IDs take about 3 weeks and need company paperwork, which a student project may not have.

### Cited Findings
- AT sandbox: free 2-way SMS short codes, USSD channels, payments, voice numbers and airtime "that you can use to develop and test... on our simulator instead of your handset". Sandbox SMS is not delivered to real phones; it is logged in the dashboard simulator. Live sending costs per SMS and needs a registered sender ID — [AT help: sandbox](https://help.africastalking.com/en/articles/1170660-how-do-i-get-started-on-the-africa-s-talking-sandbox); [AT help: sandbox vs live](https://help.africastalking.com/en/articles/2189460-what-are-the-sandbox-and-the-live-environments)
- AT: sender IDs are currently free in Rwanda. Shortcodes and USSD codes are raised through RURA. No timeline is given — [AT help](https://help.africastalking.com/en/articles/2285370-how-long-does-it-take-to-get-dedicated-services-in-rwanda-and-malawi)
- Pindo offers a free signup with test credits — [Pindo docs](https://docs.pindo.ai/); [Pindo homepage, free trial at app.pindo.io](https://pindo.io/)
- Rwanda alphanumeric sender IDs need pre-registration with both MTN and Airtel, using a procuration letter on company letterhead plus a registration certificate. Provisioning takes about 3 weeks — [sent.dm compliance](https://sent.dm/en/resources/sms-compliance/rw-sms-guidance)
- Twilio supports alphanumeric sender IDs at no cost for outbound to Rwanda and offers a free trial — [Twilio Rwanda pricing](https://www.twilio.com/en-us/sms/pricing/rw)
- Celcom: standard accounts need no paperwork, but branded traffic requires sender ID approval — [Celcom Africa](https://celcomafrica.com/bulk-sms-rwanda)

### Inferences
- Recommended assessor demo order:
  1. Show the per-user channel preference and the log driver output, which proves the abstraction.
  2. Point an AT sandbox driver, or Pindo in test mode, at the simulator or dashboard.
  3. If credits allow, do one live send from Pindo's default/shared sender to the student's own MTN number. Screenshot or record it in advance as backup.
- Twilio trials normally only send to verified numbers and prepend a trial notice. Workable for one personal phone, but the cost and international sender may get filtered or rewritten by Rwandan carriers (sent.dm notes international numeric senders "may experience rewriting or rejection").
- Pre-record the live-send video, because carrier delivery during a live assessment is not guaranteed.

### Gaps
- Could not confirm the size of Pindo's free trial credit or whether it uses a shared default sender ID (e.g. "PindoTest") before your own sender ID is approved. docs.pindo.io did not resolve; docs.pindo.ai gave only an overview. Check by signing up.
- Could not confirm whether Twilio trial messages to Rwanda are actually delivered via alphanumeric sender without registration.

## Q4. Two-way SMS replies and USSD for feature-phone workers: value, providers, cost

### Takeaway
Two-way SMS ("reply YES to accept") and USSD fit feature-phone workers, and USSD is the established Rwandan pattern (Irembo, One Acre Fund, MoMo *182#). Both, however, need a shortcode or USSD code and so carry RURA and provider fees and lead time. For a capstone, build and demo them in the **AT sandbox** (free 2-way shortcode and USSD channel in the simulator) and present production as a costed next step. Sources conflict on whether two-way SMS is generally available in Rwanda.

### Cited Findings
- HelloDuty Rwanda: two-way shortcode RWF 13,500/month; shared USSD code RWF 26,000/month; dedicated USSD setup RWF 25,000; USSD session RWF 13 (postpaid); brand-name SMS is one-way only — [HelloDuty Rwanda](https://helloduty.com/country/rwanda)
- **Contradiction:** sent.dm states "Two-way SMS is not available in Rwanda through major SMS providers" and that short codes are not currently supported — [sent.dm compliance](https://sent.dm/en/resources/sms-compliance/rw-sms-guidance). Pindo, by contrast, advertises two-way messaging and "receiving replies" — [Pindo homepage](https://pindo.io/); [Pindo docs](https://docs.pindo.ai/). Twilio prices inbound to Rwanda at $0.3261 — [Twilio](https://www.twilio.com/en-us/sms/pricing/rw). Likely reading: global providers can't do Rwandan two-way, but local aggregators can via local shortcodes.
- RURA short code / USSD fees as reported in search snippets (from RURA, AT and Wikiprocedure pages; not independently verified): application fee RWF 25,000; annual fee RWF 1,300,000; dedicated USSD setup RWF 100,000 plus RWF 259,500/month maintenance; 3-digit USSD authorization USD 1,000; deposit required for session costs — [search results: RURA short code categories](https://www.rura.rw/fileadmin/onlinesca/Shortcodes_categories.php); [AT RURA PDF](https://africastalking.com/docs/rwanda_rura_short_codes.pdf); [Wikiprocedure](https://www.wikiprocedure.com/index.php/Rwanda_-_Apply_for_Short_Code_Number_(Special_Telephone_Numbers)). The AT PDF could not be parsed to confirm.
- The AT sandbox provides free 2-way SMS short codes and USSD channels for simulator testing — [AT help](https://help.africastalking.com/en/articles/1170660-how-do-i-get-started-on-the-africa-s-talking-sandbox)
- USSD reach evidence: over 600,000 Rwandan farmers enrolled through One Acre Fund's USSD — [One Acre Fund](https://oneacrefund.org/articles/using-mobile-tech-shape-smallholder-farming-rwanda); Irembo USSD for citizens with poor internet — [KT Press 2017](https://www.ktpress.rw/2017/11/through-sms-rwandans-can-request-for-drivers-license-land-title/)
- Rwanda opt-out rules: campaigns must honour STOP/CANCEL/END/UNSUBSCRIBE free of charge within 24 hours. Recommended send window is 08:00–20:00 — [sent.dm compliance](https://sent.dm/en/resources/sms-compliance/rw-sms-guidance)

### Inferences
- The cheapest production path to interactivity is a **shared** USSD code on an aggregator (about RWF 26,000/month, roughly $18, plus RWF 13/session). A dedicated code (RWF 100k setup plus RWF 259.5k/month, plus RURA annual fee) is out of scope for a capstone.
- A USSD menu (e.g. *XXX*YY# → 1. My gigs → 1. Accept) is more robust than parsing free-text SMS replies. It is session-based, the user pays nothing on most networks, and it is familiar from MoMo. Two-way SMS "YES 123" is simpler to build but depends on getting a shortcode.
- Inbound and opt-out handling (STOP) should be mentioned even if one-way only. With alphanumeric one-way, opt-out has to happen in-app, which suits Isoko's existing channel-preference setting.

### Gaps
- The RURA fee figures come from search snippets of RURA/AT documents I could not render. Treat as indicative.
- I could not find Pindo's published prices for two-way shortcodes or USSD.

## Q5. Phone verification / OTP options for Rwanda: availability and price

### Takeaway
Pindo Verify is the cheapest advertised option ($0.002 per successful verification, apparently on top of SMS, which is unclear). Twilio Verify works but costs about $0.38 per verification in Rwanda. Firebase/Identity Platform phone auth needs the paid Blaze plan, has a small free daily allowance, and costs about $0.11/SMS for Rwanda (secondary source). For a capstone, a home-grown OTP over the existing SMS driver, or Pindo Verify, is the practical choice.

### Cited Findings
- Pindo Verify: "Starting at $0.002 per successful verification" — [Pindo pricing](https://www.pindo.io/pricing)
- Twilio Verify: $0.05 per successful verification plus channel cost. Rwanda SMS is $0.3261, so about $0.376 per SMS verification — [Twilio Verify pricing](https://static1.twilio.com/en-us/verify/pricing); [Twilio Rwanda SMS](https://www.twilio.com/en-us/sms/pricing/rw)
- Firebase phone auth: since Sept 2024 SMS requires the Blaze (pay-as-you-go) plan. Cost per SMS ranges from $0.01 (US/Canada) to $0.46. The first 10 SMS/day are reported as free — [Logto blog (secondary)](https://blog.logto.io/fr/firebase-authentication-pricing). A Rwanda (+250) SMS OTP rate of $0.11 comes from Appwrite's phone OTP pricing table, which is a different vendor, not Firebase — [Appwrite docs](https://appwrite.io/docs/advanced/platform/phone-otp)
- AT has no dedicated verify product in the sources found; OTP would be sent as ordinary SMS at bulk rates (inference from AT product lists: SMS, USSD, voice, airtime) — [Courier](https://www.courier.com/integrations/alternatives/africas-talking)

### Inferences
- With 200 users, phone verification is a one-off cost: 200 × $0.38 ≈ $76 on Twilio, versus a few dollars on Pindo or an aggregator plus self-built OTP.
- Simulated MoMo payments plus OTP via the existing SMS abstraction keep the architecture consistent. Firebase adds a second vendor and a billing account for little gain.
- On feature phones, an SMS OTP the user types into a web form only helps if the worker also uses a smartphone or browser. For feature-phone-only workers, verification is better done implicitly through USSD (the session carries the MSISDN) or at in-person onboarding.

### Gaps
- Could not retrieve Google's official Identity Platform per-country price for Rwanda (page did not render). The $0.11 figure is Appwrite's, not Firebase's.
- Unclear whether Pindo's $0.002 Verify fee includes the SMS cost.

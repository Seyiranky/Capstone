# Rwanda A2P SMS: Regulatory and Compliance Requirements (as of Oct 2026)

Research date: 2026-10-10. Most provider guidance pages are undated or "live" pages read on this date; dated items are marked.

## RURA rules on bulk/A2P SMS and alphanumeric sender IDs

### Takeaway
The code comment is broadly right but conflates two separate steps. (1) RURA runs a free "Sender ID Whitelisting Authorization" e-service that needs a signed request letter and an RDB (company registration) certificate, and RURA says it completes in 5 days. (2) Separately, MTN Rwanda and Airtel Rwanda each need operator pre-registration, submitted through your SMS provider using signed and stamped procuration letters plus the company registration certificate. International providers quote about 3 weeks for that step. A registered company (RDB certificate) is effectively required either way. Generic or shared IDs such as "INFO" or "VERIFY" are rejected. Rwanda has no short codes for A2P and no two-way replies on standard routes.

### Cited Findings
- RURA licensing portal lists a "Sender ID Whitelisting Authorization" service "for entities or individuals seeking approval to whitelist a Sender ID for bulk SMS services". First-time documents: a request letter signed by the applicant confirming lawful use of the sender ID, an authorization letter if an agent or third party submits it, and an RDB certificate. Application fee: free. Authorization fee: free. Processing: "within 5 days". It is non-renewable (no renewal process) — [RURA licensing portal](https://licensing.rura.rw/licenses/license-details/eyJpdiI6Iit3cEt1Y2Z2RzJNODhITUxuSTBMZEE9PSIsInZhbHVlIjoiWm52UEFMUEc0Z0tBSzhueit2RHdBUT09IiwibWFjIjoiMDM2MTUzM2ZhN2I5YmE5YzA1ODI5MGRkN2JkMjVjNTYxY2QxMjZiZTEyNDYxZDc0N2I0OGI2ZmE4ZmVlMmI2NyIsInRhZyI6IiJ9/license) (live page, read Oct 2026)
- The same RURA page lists short code pricing separately, at USD 200–1,000 depending on service category and number type — [RURA licensing portal](https://licensing.rura.rw/licenses/license-details/eyJpdiI6Iit3cEt1Y2Z2RzJNODhITUxuSTBMZEE9PSIsInZhbHVlIjoiWm52UEFMUEc0Z0tBSzhueit2RHdBUT09IiwibWFjIjoiMDM2MTUzM2ZhN2I5YmE5YzA1ODI5MGRkN2JkMjVjNTYxY2QxMjZiZTEyNDYxZDc0N2I0OGI2ZmE4ZmVlMmI2NyIsInRhZyI6IiJ9/license)
- Twilio Rwanda guidelines say alphanumeric sender IDs are "Supported" with "Global Pre-registration" required. Provisioning takes "3 weeks". The sender ID is preserved. MTN requires pre-registration. "Promotional content is not allowed to be registered". Avoid generic IDs such as "InfoSMS, INFO, Verify, Notify". Domestic long codes are not supported. Short codes are not supported. Two-way SMS: "No" — [Twilio Rwanda SMS guidelines](https://www.twilio.com/en-us/guidelines/rw/sms) (live page)
- Telerivet (published Feb 11, 2026) says registration requires "Procuration letters on your organization's letterhead, signed and stamped" and the certificate of company registration, with separate submissions to MTN and Airtel. "Processing takes approximately three weeks from submission of complete documentation". "Generic sender IDs are rejected. Terms like 'INFO,' 'InfoSMS,' 'ALERTS,' or 'VERIFY' will not be approved". "There are no short codes currently available in Rwanda" — [Telerivet blog, 2026-02-11](https://www.telerivet.com/blog/rwanda-sms-compliance-rura-sender-id-law-058)
- Sent.dm says the sender ID can be at most 11 characters, uses letters, numbers and spaces only, must start with a letter, and requires "Separate procuration letters required for MTN and Airtel networks". It also says "no dynamic usage supported" — [Sent.dm Rwanda guidance](https://sent.dm/en/resources/sms-compliance/rw-sms-guidance)
- Market structure: a two-operator duopoly. MTN Rwanda uses the 078 prefix and has about 60–65% share. Airtel Rwanda uses 072/073 — [Telerivet, 2026-02-11](https://www.telerivet.com/blog/rwanda-sms-compliance-rura-sender-id-law-058)
- Conflict: D7 Networks says "Full Dynamic … Sender IDs are permitted across all Rwanda networks, except MTN, which requires pre-registration", implying Airtel needs no registration. Twilio, Telerivet and Sent.dm all say both networks need it — [D7 Networks](https://d7networks.com/sms/rwanda/sms-regulations) vs [Telerivet](https://www.telerivet.com/blog/rwanda-sms-compliance-rura-sender-id-law-058)
- A review of bulk SMS regulation reportedly limits sending bulk SMS to telecom companies and licensed aggregators. This was summarised by a search engine from RURA and press sources and is not verified against primary text — [RURA consumer affairs laws page](https://www.rura.rw/about/consumer-affairs/laws-and-regulations), [New Times](https://www.newtimes.co.rw/article/19409/National/community-development-solutions-portal-unveiled/amp)
- Local aggregator Celcom Africa says it "manages the regulatory filings on behalf of businesses", has direct connections to both operators, and charges about RWF 11/SMS pay-as-you-go (billed as €0.0100). It does not publish its document list or timeline — [Celcom Africa](https://celcomafrica.com/bulk-sms-rwanda)
- Pindo (a Rwandan provider) registers sender IDs per country through its API (`POST /sender_ids` with countries `["RW"]`), and they are subject to approval before activation — [Pindo docs (community mirror on Mintlify)](https://mintlify.com/yvan99/pindo-sms/guides/sender-ids)

### Inferences
- The "about three weeks" figure is the operator (MTN/Airtel) provisioning time quoted by international aggregators, not RURA's own SLA. RURA's own whitelisting step is stated as free and within 5 days. The real end-to-end time is probably 1–4 weeks depending on the provider and whether it bundles the RURA step.
- In practice the aggregator (Twilio, a local aggregator, etc.) files with the operators, and in some cases with RURA, on the customer's behalf. The customer supplies the documents: an RDB certificate, and letterhead procuration or authorization letters that are signed and stamped. A student project with no registered company cannot obtain its own branded sender ID through any of the documented routes.
- "Isoko" or "IsokoTalent" (up to 11 characters) fits the format rules. Avoid generic words.
- No source documents an official shared or generic sender ID usable without registration. Generic IDs are explicitly rejected. Some local aggregators may send from their own pre-registered brand ID (for example for test traffic), but I found no published confirmation of this for Rwanda.
- Twilio's line "promotional content is not allowed to be registered" suggests the sender ID should be registered for transactional or notification use cases. That suits Isoko's notifications and OTPs.

### Gaps
- I could not retrieve the text of the current RURA bulk SMS regulation or guidelines (for example, whether aggregators must hold a specific RURA licence, and its fees). The RURA site laws page was not fetched in full.
- No published fees from MTN or Airtel for sender ID registration were found. Twilio, Telerivet and Sent.dm list none.
- The documentation and timeline used by Africa's Talking and Infobip for Rwanda could not be retrieved (Africa's Talking page returned 403).
- It is unclear whether RURA whitelisting must precede operator registration, or whether operators require proof of RURA authorization.

## International aggregators: sender ID replacement, filtering, grey routes

### Takeaway
On MTN and Airtel Rwanda only pre-registered alphanumeric sender IDs work reliably. An international numeric sender is not supported: it fails on MTN and is altered on Airtel. Unregistered traffic is filtered. Replies are not possible on standard A2P routes, so "reply STOP" cannot work.

### Cited Findings
- Twilio: "Numeric International sender ID is not supported to the MTN and Airtel networks" — [Twilio Rwanda guidelines](https://www.twilio.com/en-us/guidelines/rw/sms). The search snippet of the same page adds that messages submitted with a numeric sender result in "delivery failure to MTN and altered sender ID to Airtel". The fetched summary did not show this sentence verbatim, so treat it as likely but check on the page — [Twilio](https://www.twilio.com/guidelines/rw/sms)
- Sent.dm: "Registered alphanumeric IDs have higher deliverability; unregistered numbers face carrier filtering." It also says "MTN and Airtel actively filter suspicious content" and recommends avoiding all-caps, multiple exclamation marks and shortened URLs — [Sent.dm](https://sent.dm/en/resources/sms-compliance/rw-sms-guidance)
- Telerivet: "Standard A2P SMS delivery in Rwanda is one-directional… They cannot reply through the same channel". Reply-STOP opt-outs are therefore ineffective on standard A2P routes — [Telerivet, 2026-02-11](https://www.telerivet.com/blog/rwanda-sms-compliance-rura-sender-id-law-058)
- General background on grey routes, where traffic is rerouted via local SIMs with sender IDs replaced to bypass A2P pricing — [Enea white paper](https://www.enea.com/insights/network-messaging-fraud-grey-routes-sim-banks/) (not Rwanda-specific)

### Inferences
- A cheap provider that doesn't register a sender ID for Rwanda is likely using a grey or SIM-box route. Expect a random local number as sender, unpredictable delivery, or blocking. This is a material risk for OTPs.
- Opt-out must be offered through the app or web (a settings toggle, as the project's notification preferences already do), not through SMS replies.

### Gaps
- I found no public MTN or Airtel Rwanda statement or RURA enforcement notice specifically on grey-route blocking for A2P SMS. Evidence comes only from aggregators.

## Data protection: Law No. 058/2021 and NCSA

### Takeaway
Isoko is a data controller. Its SMS provider is a data processor. In principle both must register with NCSA's Data Protection and Privacy Office (certificate within 30 days). Article 50 requires personal data, phone numbers included, to be stored in Rwanda unless NCSA authorizes otherwise. Sending numbers to a foreign SMS API is a cross-border transfer and needs an Article 48 basis, such as NCSA authorization with safeguards or the data subject's informed consent, plus a written contract under Article 49. Consent must be freely given, specific, informed and unambiguous, and withdrawable at any time. Breaches go to NCSA within 48 hours.

### Cited Findings
- Controllers and processors must register with the supervisory authority (Article 29). The application covers identity, data description, purposes, recipients, transfer destinations and risk measures (Article 30). The certificate is issued within 30 days. The regulation on validity period has not yet been adopted (Article 31). The law does not specify fees — [DLA Piper Data Protection Laws: Rwanda](https://www.dlapiperdataprotection.com/index.html?c=RW&t=law)
- NCSA's Data Protection and Privacy Office issued a registration guide for data controllers and processors on 29 June 2023. Registration is done through www.dpo.gov.rw — [Digital Policy Alert](https://digitalpolicyalert.org/change/12081-dpo-registration-guide-for-data-controllers-and-data-processors)
- International transfers should be described in the registration application. The registration certificate then covers them where applicable — [Hogan Lovells](https://hoganlovells.com/en/publications/key-features-of-the-new-rwandan-data-protection-law)
- Article 48 lists the bases for transfer outside Rwanda: NCSA authorization on proof of appropriate safeguards; data subject consent; performance of a contract; public interest; legal claims; vital interests; limited legitimate interests; and international instruments. Article 49 requires a written contract between transferor and recipient. Article 50: "Personal data must be stored in Rwanda" unless NCSA authorizes external storage — [DLA Piper](https://www.dlapiperdataprotection.com/index.html?c=RW&t=law)
- A DPO is mandatory for public or private corporate bodies and legal entities, and for large-scale systematic monitoring or large-scale sensitive data (Article 40) — [DLA Piper](https://www.dlapiperdataprotection.com/index.html?c=RW&t=law)
- Breach notification: the controller notifies NCSA within 48 hours of awareness, and the processor notifies the controller within 48 hours (Articles 43, 45). Data subjects are notified where high risk is likely — [DLA Piper](https://www.dlapiperdataprotection.com/index.html?c=RW&t=law). Sent.dm says breaches go to "RURA" within 48 hours. This appears to be an error: the law names NCSA — [Sent.dm](https://sent.dm/en/resources/sms-compliance/rw-sms-guidance)
- Consent must be "freely given, specific, informed, and unambiguous", with no pre-ticked boxes, and can be withdrawn at any time. The law applies to anyone processing data of people located in Rwanda regardless of where the organization is established — [Telerivet, 2026-02-11](https://www.telerivet.com/blog/rwanda-sms-compliance-rura-sender-id-law-058). Children under 16 need consent from the holder of parental responsibility (Article 9) — [DLA Piper](https://www.dlapiperdataprotection.com/index.html?c=RW&t=law)
- Penalties: administrative fines of RWF 2–5 million or 1% of annual turnover (Article 53). Criminal fines for corporate entities are up to 5% of turnover (Article 62) — [DLA Piper](https://www.dlapiperdataprotection.com/index.html?c=RW&t=law)

### Inferences
- For a foreign SMS provider (Twilio and similar), the most practical transfer basis for a capstone is explicit, informed consent at signup. The consent should say that phone numbers are sent to a named provider outside Rwanda to deliver SMS. Add a data processing agreement or terms with the provider. A production deployment would also need NCSA registration declaring the transfer, and possibly Article 50 authorization if the database is hosted outside Rwanda.
- A Rwandan provider such as Pindo or Celcom reduces the cross-border element of the SMS leg, but does not remove it if the app's own database is hosted abroad.
- As a student project not operating as a legal entity, Isoko may not yet trigger the DPO requirement. Registration with NCSA still applies to "controllers" generally. Flag this as something to formalize before a real launch.

### Gaps
- NCSA registration fees and the current online process could not be confirmed (dpo.gov.rw not fetched).
- I could not access the PwC Rwanda cross-border transfer alert (403), so I found nothing on any 2024–2026 NCSA implementing regulations such as standard contractual clauses or an adequacy list.

## Marketing vs transactional SMS, quiet hours, opt-out

### Takeaway
Rwandan law requires an opt-out and sender identification for unsolicited commercial or advertising messages, under RURA's 2018 regulation and the ICT law. Spamming is a criminal offence. No statutory quiet hours exist. Providers recommend 8 AM–8 PM CAT and STOP-style keywords in English and Kinyarwanda. Rwanda has no national DND registry. Transactional notifications and OTPs are on firmer ground but still need a lawful basis or consent.

### Cited Findings
- RURA Regulation N°001/R/STD-CMR/RURA/018 governing unsolicited commercial communications entered into force on 6 July 2018. Service providers must "clearly identify themselves in all messages" — [Digital Policy Alert](https://digitalpolicyalert.org/change/12964-regulation-on-user-rights-for-unsolicited-commercial-communications-regulation-no-001rstdcmrrura018); [event entry](https://digitalpolicyalert.org/event/26665-the-regulation-governing-unsolicited-commercial-communications-including-user-rights-entered-into-force)
- ICT Law Article 168 gives recipients the right to cancel unsolicited communications. Sender identity cannot be disguised and an opt-out address is required. Administrative fines are RWF 50,000–500,000. Spamming is criminal under Cyber Crime Law Article 37: 3–6 months imprisonment plus RWF 300,000–500,000 — [DLA Piper](https://www.dlapiperdataprotection.com/index.html?c=RW&t=law)
- RURA, in 2014 (dated), said that each telecom provider sending advertising or promotional texts "should give them the right to unsubscribe and detail the process involved" — [New Times, 2014-08-21](https://www.newtimes.co.rw/article/110438/National/telecom-operators-on-the-spot-over-unsolicited-sms/amp)
- No legally mandated hours. Best practice is 8 AM–8 PM CAT, avoiding Sundays and holidays. Support "STOP, CANCEL, END, and UNSUBSCRIBE in English, and their equivalents in Kinyarwanda". "Rwanda does not maintain a centralized do-not-disturb or do-not-contact registry" — [Telerivet, 2026-02-11](https://www.telerivet.com/blog/rwanda-sms-compliance-rura-sender-id-law-058)
- Sent.dm suggests processing opt-outs within 24 hours and keeping suppression lists. It also suggests avoiding Sunday mornings and days such as 7 April (Genocide Memorial) and 1 July (Independence) — [Sent.dm](https://sent.dm/en/resources/sms-compliance/rw-sms-guidance)
- Twilio: get opt-in consent, send during daytime unless urgent, and support HELP/STOP in the local language — [Twilio](https://www.twilio.com/en-us/guidelines/rw/sms)
- Content prohibitions cited by providers: gambling, adult content, unlicensed financial products. D7 also lists political and religious content — [Telerivet](https://www.telerivet.com/blog/rwanda-sms-compliance-rura-sender-id-law-058); [D7](https://d7networks.com/sms/rwanda/sms-regulations)
- Conflict: D7 says "Don't message DND-listed numbers", but Telerivet says there is no national DND registry — [D7](https://d7networks.com/sms/rwanda/sms-regulations) vs [Telerivet](https://www.telerivet.com/blog/rwanda-sms-compliance-rura-sender-id-law-058)

### Inferences
- Isoko's gig notifications ("new job match", "booking confirmed") and OTPs are transactional, which is the safer category. Any promotional SMS ("new gigs this week!") should carry Isoko's name and an opt-out instruction. Because SMS replies are impossible, the opt-out should be a URL or app setting.
- Timing: send non-urgent notifications 8 AM–8 PM CAT. OTPs and urgent booking messages can go at any time.

### Gaps
- I could not obtain the full text of the 2018 RURA regulation, so its exact consent and opt-out wording, any time restrictions, and its penalties remain unverified.

## Kinyarwanda text: GSM-7 vs UCS-2 encoding and cost

### Takeaway
Standard Kinyarwanda orthography uses unaccented Latin letters only, so typical Kinyarwanda fits GSM-7 (160 characters per single SMS, 153 per segment when concatenated). Unicode (70/67) is forced only by stray characters such as curly apostrophes or quotes (which word processors and mobile keyboards insert), emoji, or accented letters. Kinyarwanda's frequent elisions (for example "n'", "y'") must use the straight ASCII apostrophe.

### Cited Findings
- Kinyarwanda's orthography "is nearly phonemic and uses 23 basic Latin letters without diacritics". Tone is not marked in the standard orthography — [Kinyarwanda, Wikipedia](https://en.Wikipedia.com/wiki/Kinyarwanda); [UT Austin Kinyarwanda phonology: tone](https://www.laits.utexas.edu/phonology/kinyarwanda/kin_tone.html)
- GSM-7 allows 160 characters in a single message and 153 per segment when concatenated. Unicode allows 70 and 67. Concatenation is supported in Rwanda — [Sent.dm](https://sent.dm/en/resources/sms-compliance/rw-sms-guidance); Twilio notes concatenation "Yes*", which "may not be supported" for certain sender ID types — [Twilio](https://www.twilio.com/en-us/guidelines/rw/sms)
- Indicative local price: about RWF 11 per SMS segment (Celcom, pay-as-you-go) — [Celcom Africa](https://celcomafrica.com/bulk-sms-rwanda)

### Inferences
- Cost example: a 200-character Kinyarwanda message is 2 segments in GSM-7. If one curly apostrophe slips in, it becomes 3 segments in UCS-2, raising the cost by 50%. A 150-character message goes from 1 segment to 3, tripling the cost. The code should normalize ’ ‘ “ ” to ASCII and strip emoji before sending, and should count segments.
- Kinyarwanda words tend to be long (agglutinative), so equivalent messages may run longer than English. Keep templates short.
- This is based on knowledge of GSM 03.38, not a cited source: the straight apostrophe ' is in the GSM-7 basic set, while characters such as [ ] { } ~ \ ^ | € take 2 septets via the escape table.

### Gaps
- No source measured the typical length of Kinyarwanda SMS versus English, and none confirmed how Rwandan operators handle GSM-7 extension characters.

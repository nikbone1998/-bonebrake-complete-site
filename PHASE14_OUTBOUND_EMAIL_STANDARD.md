# Bonebrake Web Design — Outbound Email Professionalism & Deliverability Standard

**Status: AUTHORITATIVE FOR COLD OUTBOUND**

This standard applies to all Bonebrake Web Design prospect emails.

## Purpose

The objective is not to maximize send volume. The objective is to make every message look and behave like a genuine one-to-one professional email from a real local business, while minimizing spam complaints and preserving sender reputation.

## Research basis

- Google Gmail sender guidelines: https://support.google.com/mail/answer/81126
- Google Gmail sender guidelines FAQ: https://support.google.com/mail/answer/14229414
- FTC CAN-SPAM compliance guide: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- Gong cold-email analysis of 28M+ emails: https://www.gong.io/blog/does-cold-email-even-work-any-more-heres-what-the-data-says
- HubSpot cold-email writing guidance: https://blog.hubspot.com/sales/how-to-write-a-cold-email-that-will-actually-get-a-response

## 1. Deliverability is primarily reputation + authentication, not magic words

Do not rely on lists of supposed spam-trigger words. Maintain low complaint rates, honest identity, correct authentication, good sending behavior, and relevance.

Google recommends keeping spam complaints below 0.10% and never allowing them to reach 0.30%. Bonebrake should operate conservatively below those levels.

When Bonebrake sends from its own domain in the future, SPF, DKIM, and DMARC must be configured and aligned before cold outbound is moved to that address. Prefer a real-person sender identity on the same domain as the public website, e.g. Nicholas Bonebrake / Bonebrake Web Design, rather than a generic sales identity.

## 2. Low-volume, one-to-one behavior

- Never mass blast.
- Continue strict prospect qualification; relevance is a deliverability control.
- Maximum two prospects per hourly run.
- Never send the two messages in parallel.
- Do not reuse identical copy across prospects.
- Do not repeatedly contact non-responders in the same run.
- Immediately suppress opt-outs, negative replies, and hard bounces.

## 3. Human sender identity

Every message must clearly identify the sender as a real person and business.

Preferred visible identity:

Nicholas Bonebrake
Bonebrake Web Design
bwdnorth.com
2405 N Sheffield Ave
Chicago, IL 60614, United States

Use "Nick" naturally in the body/signature when appropriate, but the business identity must remain clear.

Do not pretend there was a prior conversation, meeting, referral, or relationship when none exists. Never use fake RE:, FWD:, "following up on our call," or similar tactics.

## 4. Subject line standard

Target 3–7 words whenever practical.

The subject must be specific, factual, calm, and connected to the message. Avoid promotional language, exaggerated numbers, buzzwords, emojis, urgency, all caps, and clickbait.

Preferred patterns:

- `[Company] homepage idea`
- `Website idea for [Company]`
- `[Company] website concept`
- `A homepage concept for [Company]`

Avoid repetitive use of one exact subject across every prospect.

## 5. Message length and structure

Gong's 28M+ email analysis found higher reply rates for shorter emails and reported an ideal cold-email length of 100 words or fewer, often 3–4 substantive sentences. Bonebrake should target approximately 70–110 words before the legal/signature footer.

The first email should normally contain:

1. One highly specific, verified reason this company was selected.
2. One concise observation about the mismatch between the real business and its current web presentation.
3. One sentence explaining that Bonebrake created an unsolicited concept specifically for the company.
4. One simple CTA that is easy to answer.

Do not list every credential, every service, every website defect, or every design improvement. Save detail for the concept or a reply.

## 6. Personalization standard

Personalization must prove the message was researched, not merely merge-tagged.

Use one or two verified details that are unusually specific to the prospect, such as:

- operating history
- owner/family involvement
- a distinctive service line
- commercial/industrial specialization
- a verifiable license/accreditation
- a real project/client category when publicly listed
- a concrete website weakness

Do not overstuff the email with facts. One strong detail is more human than a paragraph of scraped facts.

Avoid generic openings like "I came across your company" as the default. Prefer context such as "I was looking at established Chicago masonry contractors and Casey stood out because..." only when that statement is actually true for the run.

## 7. Credibility without over-selling

Credibility should come from transparency and verifiable behavior, not unsupported claims.

Recommended trust signals:

- real personal name
- local business name and Chicago address
- one link to bwdnorth.com in the signature
- clearly state that the concept is unsolicited
- state that the live website has not been changed
- say the concept uses public/first-party information when true
- attach the actual personalized concept PNG/JPEG
- offer to show the full concept rather than forcing a sales call

Do not invent client counts, awards, revenue results, conversion improvements, testimonials, years in business, or claims about Bonebrake's success unless verified and approved.

Do not use phrases such as "guaranteed to increase sales," "10x," "best-in-class," or similar unverified marketing language.

## 8. CTA standard

Use one low-friction question only.

Preferred:

- `Would you like me to send the full concept?`
- `Open to seeing the full version?`
- `Would it be useful if I sent the clickable concept?`

Avoid asking for a meeting, payment, contract, and website review all at once.

## 9. Pricing

The $1,995 pilot price may be mentioned, but it should not dominate the message. Keep it to one calm sentence. Do not use discount language, countdowns, scarcity, payment links, or pressure tactics in cold outreach.

## 10. Visual proof

Use exactly one real PNG/JPEG concept sample unless there is a verified reason to do otherwise.

- No externally hosted SVG proof image.
- Actual MIME attachment or verified inline MIME image.
- Preferred width 600–800 px.
- Preferred size 200–500 KB; maximum 1 MB.
- No tracking pixels.
- No URL shorteners.
- Avoid multiple attachments.
- Gmail readback must confirm the expected image exists after sending.

## 11. HTML/style

Prefer simple, personal-looking email formatting rather than a newsletter/template aesthetic.

- No banner graphics.
- No giant logo.
- No colored marketing buttons.
- No multi-column layout.
- No excessive bolding.
- No emoji-heavy copy.
- No tracking pixel.
- One normal website link in the signature is enough.

## 12. CAN-SPAM safeguards

Every commercial outreach must:

- use accurate From/To/Reply-To information
- use a non-deceptive subject
- clearly identify Bonebrake Web Design as the sender/business
- include the valid postal address
- include a clear opt-out mechanism
- suppress and honor opt-outs promptly

Preferred footer:

`Commercial outreach from Bonebrake Web Design. If this isn't relevant, reply "no thanks" and I won't email you again.`

## 13. Default first-email template

This is a framework, not copy to reuse verbatim:

Subject: `[Company] homepage idea`

Hi [First Name],

[One specific verified observation about the business/current site]. I put together an unsolicited homepage concept specifically for [Company] using public information; nothing has been changed on your live site.

I attached one PNG so you can see the direction. If it feels useful, the full rebuild is a $1,995 one-time pilot.

Would you like me to send the full concept?

Nick
Bonebrake Web Design
bwdnorth.com
2405 N Sheffield Ave
Chicago, IL 60614, United States

Commercial outreach from Bonebrake Web Design. If this isn't relevant, reply "no thanks" and I won't email you again.

## 14. Final pre-send professionalism QA

Before every send, confirm:

- Subject is honest, specific, and not clickbait.
- Body is approximately 70–110 words before footer unless a verified exception is justified.
- First substantive sentence contains prospect-specific research.
- Copy does not sound like a generic template.
- No fake familiarity.
- No unsupported claims.
- One CTA only.
- No more than one normal web link plus the required visual attachment.
- Sender name/business/address/opt-out are present.
- Duplicate, suppression, bounce, and reply checks have passed.
- PNG/JPEG MIME verification gate has passed.

If the email fails this professionalism QA, do not send it until rewritten.
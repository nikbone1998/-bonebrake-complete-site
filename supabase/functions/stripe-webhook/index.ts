import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const enc = new TextEncoder()
const clean = (v: unknown, max = 500) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const now = () => new Date().toISOString()

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

async function verifyStripeSignature(raw: string, header: string, secret: string) {
  const parts = header.split(',').map(x => x.trim())
  const timestamp = parts.find(x => x.startsWith('t='))?.slice(2)
  const signatures = parts.filter(x => x.startsWith('v1=')).map(x => x.slice(3))
  if (!timestamp || !signatures.length) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return false
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${raw}`)))
  return signatures.some(sig => safeEqual(sig, digest))
}

function customField(session: any, key: string, max = 200) {
  const field = Array.isArray(session?.custom_fields) ? session.custom_fields.find((f: any) => f?.key === key) : null
  return clean(field?.text?.value ?? field?.numeric?.value ?? field?.dropdown?.value, max)
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return Response.json({ ok: false, error: 'method_not_allowed' }, { status: 405 })

  const sburl = Deno.env.get('SUPABASE_URL')
  const secretKey = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')['default']
  if (!sburl || !secretKey) return Response.json({ ok: false, error: 'server_configuration_error' }, { status: 500 })
  const db = createClient(sburl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: secretRow, error: secretError } = await db.from('integration_secrets').select('secret_value').eq('key', 'stripe_webhook_signing_secret').maybeSingle()
  if (secretError || !secretRow?.secret_value) return Response.json({ ok: false, error: 'webhook_not_configured' }, { status: 503 })

  const raw = await req.text()
  if (raw.length > 2_000_000) return Response.json({ ok: false, error: 'payload_too_large' }, { status: 413 })
  const signature = req.headers.get('stripe-signature') || ''
  if (!(await verifyStripeSignature(raw, signature, secretRow.secret_value))) return Response.json({ ok: false, error: 'invalid_signature' }, { status: 400 })

  let event: any
  try { event = JSON.parse(raw) } catch { return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 }) }

  const eventId = clean(event?.id, 120)
  const eventType = clean(event?.type, 160)
  const object = event?.data?.object || {}
  const objectId = clean(object?.id, 160) || null
  if (!eventId || !eventType) return Response.json({ ok: false, error: 'invalid_event' }, { status: 400 })

  const { data: prior } = await db.from('stripe_payment_events').select('status,received_at').eq('stripe_event_id', eventId).maybeSingle()
  if (prior?.status === 'processed' || prior?.status === 'ignored') return Response.json({ ok: true, duplicate: true })
  if (prior?.status === 'processing') {
    const ageMs = prior.received_at ? Date.now() - new Date(prior.received_at).getTime() : 0
    if (ageMs < 10 * 60_000) return Response.json({ ok: true, in_progress: true })
  }

  if (!prior) {
    const { error } = await db.from('stripe_payment_events').insert({
      stripe_event_id: eventId,
      event_type: eventType,
      object_id: objectId,
      livemode: !!event?.livemode,
      payload: { created: event?.created ?? null, request_id: event?.request?.id ?? null },
      status: 'received'
    })
    if (error) return Response.json({ ok: false, error: 'event_ledger_failed' }, { status: 500 })
  } else {
    await db.from('stripe_payment_events').update({ status: 'received', error_message: null }).eq('stripe_event_id', eventId)
  }

  const { data: claimed, error: claimError } = await db.from('stripe_payment_events')
    .update({ status: 'processing', error_message: null, processed_at: null })
    .eq('stripe_event_id', eventId).eq('status', 'received')
    .select('stripe_event_id').maybeSingle()
  if (claimError || !claimed) return Response.json({ ok: true, in_progress: true })

  const finish = async (status: 'processed' | 'ignored') => {
    await db.from('stripe_payment_events').update({ status, processed_at: now(), error_message: null }).eq('stripe_event_id', eventId).eq('status', 'processing')
  }
  const fail = async (message: string, status = 500) => {
    await db.from('stripe_payment_events').update({ status: 'failed', error_message: clean(message, 500), processed_at: now() }).eq('stripe_event_id', eventId).eq('status', 'processing')
    return Response.json({ ok: false, error: clean(message, 160) }, { status })
  }

  try {
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(eventType)) {
      const session = object
      const sessionId = clean(session?.id, 160)
      if (!sessionId) return await fail('checkout_session_id_missing', 422)

      const paymentLinkId = clean(session?.payment_link, 160) || null
      const email = clean(session?.customer_details?.email || session?.customer_email, 254).toLowerCase()
      const name = clean(session?.customer_details?.name, 200) || email || 'Stripe customer'
      const phone = clean(session?.customer_details?.phone, 80) || null
      const company = customField(session, 'company', 160) || null
      const website = customField(session, 'website', 500) || null
      const paymentStatus = clean(session?.payment_status, 40) || 'unpaid'
      const checkoutStatus = clean(session?.status, 40) || 'complete'
      const amountTotal = Math.max(0, Number(session?.amount_total || 0))
      const currency = clean(session?.currency, 12).toLowerCase() || 'usd'
      const paymentIntentId = typeof session?.payment_intent === 'string' ? session.payment_intent : clean(session?.payment_intent?.id, 160) || null
      const customerId = typeof session?.customer === 'string' ? session.customer : clean(session?.customer?.id, 160) || null

      let catalog: any = null
      const packageFromMetadata = clean(session?.metadata?.bonebrake_package, 80)
      if (packageFromMetadata) {
        const { data } = await db.from('stripe_catalog').select('*').eq('package_key', packageFromMetadata).eq('active', true).maybeSingle()
        catalog = data
      }
      if (!catalog && paymentLinkId) {
        const { data } = await db.from('stripe_catalog').select('*').eq('payment_link_id', paymentLinkId).eq('active', true).maybeSingle()
        catalog = data
      }
      if (!catalog) return await fail('unknown_bonebrake_package', 422)
      if (currency !== String(catalog.currency).toLowerCase()) return await fail('unexpected_currency', 422)
      if (amountTotal !== Number(catalog.amount_cents)) return await fail('unexpected_amount', 422)

      const sessionPayload = {
        stripe_checkout_session_id: sessionId,
        stripe_payment_intent_id: paymentIntentId,
        stripe_customer_id: customerId,
        stripe_payment_link_id: paymentLinkId,
        package_key: catalog.package_key,
        customer_email: email || null,
        customer_name: name || null,
        customer_phone: phone,
        company,
        website,
        amount_total: amountTotal,
        currency,
        checkout_status: ['open','complete','expired'].includes(checkoutStatus) ? checkoutStatus : 'complete',
        payment_status: ['unpaid','paid','no_payment_required'].includes(paymentStatus) ? paymentStatus : 'unpaid',
        completed_at: now(),
        updated_at: now(),
        metadata: { stripe_event_id: eventId, source: 'stripe_payment_link', livemode: !!event?.livemode }
      }
      const { error: sessionError } = await db.from('stripe_checkout_sessions').upsert(sessionPayload, { onConflict: 'stripe_checkout_session_id' })
      if (sessionError) return await fail('checkout_session_persistence_failed')

      if (paymentStatus !== 'paid') {
        await finish('processed')
        return Response.json({ ok: true, waiting_for_payment: true })
      }

      const { data: settings } = await db.from('automation_settings').select('payments_enabled').eq('key', 'global').maybeSingle()
      if (!settings?.payments_enabled) {
        const { data: existingDisabledAction } = await db.from('automation_actions')
          .select('id,payload').eq('action_type', 'process_paid_checkout').in('status', ['pending','approved','executing']).limit(100)
        const alreadyQueued = (existingDisabledAction || []).some((a: any) => a?.payload?.checkout_session_id === sessionId)
        if (!alreadyQueued) {
          await db.from('automation_actions').insert({
            action_type: 'process_paid_checkout',
            entity_type: 'stripe_checkout_session',
            title: `Process paid checkout for ${company || name}`,
            summary: `${catalog.product_name} payment received while payment automation is disabled.`,
            risk_level: 'approval', status: 'pending', proposed_by: 'stripe_webhook',
            payload: { checkout_session_id: sessionId, package_key: catalog.package_key, amount: amountTotal / 100, external_effect: 'create_paid_project' }
          })
        }
        await finish('processed')
        return Response.json({ ok: true, payment_recorded: true, automation_paused: true })
      }

      const { data: row } = await db.from('stripe_checkout_sessions').select('*').eq('stripe_checkout_session_id', sessionId).single()
      let leadId = row?.lead_id || null
      let projectId = row?.project_id || null

      if (!leadId && email) {
        const { data: lead } = await db.from('leads').select('*').ilike('email', email).order('created_at', { ascending: false }).limit(1).maybeSingle()
        leadId = lead?.id || null
      }

      const dollars = amountTotal / 100
      if (!leadId) {
        if (!email) return await fail('customer_email_missing', 422)
        const { data: lead, error: leadError } = await db.from('leads').insert({
          name, email, phone, company, website,
          source: 'stripe_checkout', status: 'won', priority: 'high', estimated_value: dollars,
          opportunity_score: 100, qualification: 'high', next_action: 'paid_client_onboarding',
          notes: `Paid via Stripe for ${catalog.product_name}.`
        }).select('id').single()
        if (leadError || !lead) return await fail('lead_creation_failed')
        leadId = lead.id
      } else {
        const update: any = {
          status: 'won', priority: 'high', estimated_value: dollars, qualification: 'high',
          next_action: 'paid_client_onboarding', updated_at: now()
        }
        if (phone) update.phone = phone
        if (company) update.company = company
        if (website) update.website = website
        const { error } = await db.from('leads').update(update).eq('id', leadId)
        if (error) return await fail('lead_update_failed')
      }

      if (!projectId) {
        const { data: project, error: projectError } = await db.from('projects').insert({
          lead_id: leadId,
          client_name: company || name,
          status: 'planning',
          project_type: catalog.package_key,
          agreed_price: dollars,
          deposit: dollars,
          balance: 0,
          payment_state: 'paid',
          paid_amount: dollars,
          current_milestone: 'paid_client_onboarding',
          next_action: 'collect_client_intake',
          notes: `Created automatically from Stripe Checkout ${sessionId}.`
        }).select('id').single()
        if (projectError || !project) return await fail('project_creation_failed')
        projectId = project.id
      }

      const { error: linkError } = await db.from('stripe_checkout_sessions').update({ lead_id: leadId, project_id: projectId, updated_at: now() }).eq('stripe_checkout_session_id', sessionId)
      if (linkError) return await fail('checkout_project_link_failed')

      await db.from('activity').insert([
        { entity_type: 'lead', entity_id: leadId, action: 'stripe_payment_received', detail: { checkout_session_id: sessionId, package_key: catalog.package_key, amount: dollars } },
        { entity_type: 'project', entity_id: projectId, action: 'project_created_from_payment', detail: { checkout_session_id: sessionId, package_key: catalog.package_key, amount: dollars } }
      ])

      const { data: existingAction } = await db.from('automation_actions').select('id').eq('action_type', 'start_paid_project_fulfillment').eq('entity_type', 'project').eq('entity_id', projectId).in('status', ['pending','approved','executing']).limit(1)
      if (!existingAction?.length) {
        await db.from('automation_actions').insert({
          action_type: 'start_paid_project_fulfillment', entity_type: 'project', entity_id: projectId,
          title: `Start fulfillment for ${company || name}`,
          summary: `${catalog.product_name} paid in full · $${dollars.toFixed(2)}`,
          risk_level: 'approval', status: 'pending', proposed_by: 'stripe_webhook',
          payload: { project_id: projectId, lead_id: leadId, checkout_session_id: sessionId, package_key: catalog.package_key, amount: dollars, external_effect: 'begin_client_fulfillment' }
        })
      }

      await finish('processed')
      return Response.json({ ok: true, lead_id: leadId, project_id: projectId })
    }

    if (eventType === 'checkout.session.async_payment_failed') {
      const sessionId = clean(object?.id, 160)
      await db.from('stripe_checkout_sessions').update({ payment_status: 'unpaid', updated_at: now() }).eq('stripe_checkout_session_id', sessionId)
      const { data: existing } = await db.from('automation_actions').select('id,payload').eq('action_type', 'review_failed_payment').in('status', ['pending','approved','executing']).limit(100)
      const alreadyQueued = (existing || []).some((a: any) => a?.payload?.checkout_session_id === sessionId)
      if (!alreadyQueued) {
        await db.from('automation_actions').insert({
          action_type: 'review_failed_payment', entity_type: 'stripe_checkout_session',
          title: 'Review failed Stripe payment', summary: `Checkout ${sessionId} reported an asynchronous payment failure.`,
          risk_level: 'approval', status: 'pending', proposed_by: 'stripe_webhook',
          payload: { checkout_session_id: sessionId, external_effect: 'none' }
        })
      }
      await finish('processed')
      return Response.json({ ok: true })
    }

    if (eventType === 'charge.refunded') {
      const paymentIntentId = typeof object?.payment_intent === 'string' ? object.payment_intent : null
      if (paymentIntentId) {
        const { data: sessionRow } = await db.from('stripe_checkout_sessions').select('project_id').eq('stripe_payment_intent_id', paymentIntentId).maybeSingle()
        if (sessionRow?.project_id && Number(object?.amount_refunded || 0) >= Number(object?.amount || 0)) {
          await db.from('projects').update({ payment_state: 'refunded', balance: 0, updated_at: now() }).eq('id', sessionRow.project_id)
          const { data: existing } = await db.from('automation_actions').select('id').eq('action_type', 'review_refunded_project').eq('entity_type', 'project').eq('entity_id', sessionRow.project_id).in('status', ['pending','approved','executing']).limit(1)
          if (!existing?.length) {
            await db.from('automation_actions').insert({
              action_type: 'review_refunded_project', entity_type: 'project', entity_id: sessionRow.project_id,
              title: 'Review refunded Bonebrake project', summary: 'Stripe reports this project payment as fully refunded.',
              risk_level: 'approval', status: 'pending', proposed_by: 'stripe_webhook',
              payload: { project_id: sessionRow.project_id, payment_intent_id: paymentIntentId, external_effect: 'review_required' }
            })
          }
        }
      }
      await finish('processed')
      return Response.json({ ok: true })
    }

    await finish('ignored')
    return Response.json({ ok: true, ignored: true })
  } catch (error) {
    return await fail(error instanceof Error ? error.message : 'processing_failed')
  }
})

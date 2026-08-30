import dns from 'node:dns/promises';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 7000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 10;
const MAX_CONCURRENT_AUDITS = 4;

const rateBuckets = new Map();
let activeAudits = 0;

function isPrivateIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a,b,c] = p;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224;
}

function isPrivateIPv6(ip) {
  const v = ip.toLowerCase().split('%')[0];
  if (v === '::' || v === '::1') return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(v)) return true;
  if (v.startsWith('ff')) return true;
  if (v.startsWith('2001:db8:') || v === '2001:db8::') return true;
  if (v.startsWith('::ffff:')) {
    const mapped = v.slice(7);
    if (net.isIPv4(mapped)) return isPrivateIPv4(mapped);
  }
  return false;
}

function isPrivateAddress(ip) {
  const family = net.isIP(ip);
  return family === 4 ? isPrivateIPv4(ip) : family === 6 ? isPrivateIPv6(ip) : true;
}

function cleanHost(hostname) {
  return String(hostname || '').replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
}

async function validateTarget(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('invalid_url'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported_protocol');
  if (url.username || url.password) throw new Error('credentials_not_allowed');

  const host = cleanHost(url.hostname);
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('private_target');

  const literalFamily = net.isIP(host);
  if (literalFamily) {
    if (isPrivateAddress(host)) throw new Error('private_target');
    return { url, host, address: host, family: literalFamily };
  }

  let records;
  try { records = await dns.lookup(host, { all: true, verbatim: true }); }
  catch { throw new Error('dns_failed'); }

  if (!records.length) throw new Error('dns_failed');
  if (records.some(record => isPrivateAddress(record.address))) throw new Error('private_target');
  const selected = records[0];
  return { url, host, address: selected.address, family: selected.family };
}

function headerValue(headers, name) {
  const value = headers?.[String(name).toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : String(value || '');
}

function pinnedRequest(target) {
  return new Promise((resolve, reject) => {
    const { url, host, address, family } = target;
    const client = url.protocol === 'https:' ? https : http;
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      fn(value);
    };

    const lookup = (_hostname, options, callback) => {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      if (options?.all) callback(null, [{ address, family }]);
      else callback(null, address, family);
    };

    const request = client.request({
      protocol: url.protocol,
      hostname: host,
      port: url.port || undefined,
      method: 'GET',
      path: `${url.pathname || '/'}${url.search || ''}`,
      servername: family === 0 || net.isIP(host) ? undefined : host,
      lookup,
      headers: {
        'User-Agent': 'BonebrakeWebsiteAudit/1.1 (+https://bonebrake-complete-site-1.vercel.app/website-audit)',
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'Accept-Encoding': 'identity',
        'Connection': 'close'
      }
    }, response => {
      const status = Number(response.statusCode || 0);
      const location = headerValue(response.headers, 'location');

      if ([301,302,303,307,308].includes(status)) {
        response.resume();
        return finish(resolve, { status, location, headers: response.headers, html: '' });
      }

      const type = headerValue(response.headers, 'content-type').toLowerCase();
      if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) {
        response.resume();
        return finish(reject, new Error('not_html'));
      }

      const declared = Number(headerValue(response.headers, 'content-length') || 0);
      if (declared && declared > MAX_BYTES) {
        response.destroy();
        return finish(reject, new Error('response_too_large'));
      }

      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          response.destroy(new Error('response_too_large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => finish(resolve, {
        status,
        location,
        headers: response.headers,
        html: Buffer.concat(chunks, size).toString('utf8')
      }));
      response.on('error', error => finish(reject, error?.message === 'response_too_large' ? error : new Error('fetch_failed')));
    });

    const deadline = setTimeout(() => request.destroy(new Error('fetch_timeout')), TIMEOUT_MS);
    request.on('error', error => {
      const code = error?.message === 'fetch_timeout' ? 'fetch_timeout' : 'fetch_failed';
      finish(reject, new Error(code));
    });
    request.end();
  });
}

async function fetchHtml(input) {
  let current = await validateTarget(input);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const response = await pinnedRequest(current);
    if ([301,302,303,307,308].includes(response.status)) {
      if (!response.location || redirect === MAX_REDIRECTS) throw new Error('redirect_limit');
      current = await validateTarget(new URL(response.location, current.url).href);
      continue;
    }
    return { status: response.status, html: response.html, finalUrl: current.url.href };
  }
  throw new Error('redirect_limit');
}

function clientKey(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown').trim() || 'unknown';
}

function takeRateSlot(key) {
  const now = Date.now();
  if (rateBuckets.size > 1000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (now - bucket.startedAt > RATE_WINDOW_MS) rateBuckets.delete(bucketKey);
    }
  }
  const current = rateBuckets.get(key);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= RATE_LIMIT) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - current.startedAt)) / 1000)) };
  }
  current.count += 1;
  return { allowed: true, retryAfter: 0 };
}

function decodeText(value='') {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, ' ').trim();
}

function attr(tag, name) {
  const match = tag.match(new RegExp('\\b' + name + '\\s*=\\s*(["\\\'])(.*?)\\1', 'i'));
  return match ? match[2].trim() : '';
}

function metaContent(html, key, value) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if ((attr(tag, key) || '').toLowerCase() === value.toLowerCase()) return attr(tag, 'content');
  }
  return '';
}

function linkHref(html, rel) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const relValue = (attr(tag, 'rel') || '').toLowerCase().split(/\s+/);
    if (relValue.includes(rel.toLowerCase())) return attr(tag, 'href');
  }
  return '';
}

function analyze(html, finalUrl, status) {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeText(titleMatch?.[1] || '');
  const description = metaContent(html, 'name', 'description');
  const viewport = metaContent(html, 'name', 'viewport');
  const canonical = linkHref(html, 'canonical');
  const lang = attr((html.match(/<html\b[^>]*>/i) || [''])[0], 'lang');
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => decodeText(m[1]));
  const h2Count = (html.match(/<h2\b/gi) || []).length;
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const imgAlt = imgs.filter(tag => /\balt\s*=\s*(["']).*?\1/i.test(tag)).length;
  const forms = (html.match(/<form\b/gi) || []).length;
  const labels = (html.match(/<label\b/gi) || []).length;
  const links = html.match(/<a\b[^>]*>/gi) || [];
  const telLinks = links.filter(tag => /^tel:/i.test(attr(tag, 'href'))).length;
  const mailLinks = links.filter(tag => /^mailto:/i.test(attr(tag, 'href'))).length;
  const jsonLd = (html.match(/<script\b[^>]*type\s*=\s*(["'])application\/ld\+json\1/gi) || []).length;
  const ogTitle = metaContent(html, 'property', 'og:title');
  const ogImage = metaContent(html, 'property', 'og:image');
  const robots = metaContent(html, 'name', 'robots');

  const findings = [
    { id:'title', status: title ? (title.length >= 20 && title.length <= 65 ? 'pass' : 'warn') : 'warn', title:'Page title', detail: title ? `${title.length} characters` : 'No title found' },
    { id:'description', status: description ? (description.length >= 70 && description.length <= 180 ? 'pass' : 'warn') : 'warn', title:'Meta description', detail: description ? `${description.length} characters` : 'No meta description found' },
    { id:'h1', status: h1s.length === 1 ? 'pass' : 'warn', title:'Primary heading', detail: h1s.length === 1 ? 'One H1 found' : `${h1s.length} H1 elements found` },
    { id:'viewport', status: viewport ? 'pass' : 'warn', title:'Mobile viewport', detail: viewport ? 'Viewport metadata present' : 'Viewport metadata missing' },
    { id:'canonical', status: canonical ? 'pass' : 'info', title:'Canonical URL', detail: canonical || 'No canonical link found' },
    { id:'images', status: imgs.length === 0 || imgAlt === imgs.length ? 'pass' : 'warn', title:'Image alternatives', detail: `${imgAlt}/${imgs.length} image elements include alt attributes` },
    { id:'social', status: ogTitle && ogImage ? 'pass' : 'info', title:'Social sharing metadata', detail: `${ogTitle ? 'OG title' : 'No OG title'} · ${ogImage ? 'OG image' : 'No OG image'}` },
    { id:'structured', status: jsonLd ? 'pass' : 'info', title:'Structured data', detail: jsonLd ? `${jsonLd} JSON-LD block${jsonLd === 1 ? '' : 's'}` : 'No JSON-LD block detected' },
    { id:'language', status: lang ? 'pass' : 'info', title:'Document language', detail: lang || 'No html lang attribute detected' }
  ];

  return {
    mode: 'live_heuristic',
    disclaimer: 'Automated structural checks are directional, not a scientific quality or SEO score.',
    url: finalUrl,
    http_status: status,
    title,
    first_h1: h1s[0] || '',
    metrics: {
      title_length: title.length,
      description_length: description.length,
      h1_count: h1s.length,
      h2_count: h2Count,
      image_count: imgs.length,
      images_with_alt_attribute: imgAlt,
      form_count: forms,
      label_count: labels,
      link_count: links.length,
      tel_link_count: telLinks,
      mailto_link_count: mailLinks,
      json_ld_blocks: jsonLd
    },
    metadata: { description, viewport, canonical, language: lang, robots, og_title: ogTitle, og_image: ogImage },
    findings
  };
}

function errorMessage(code) {
  return ({
    invalid_url: 'Enter a complete website URL.',
    unsupported_protocol: 'Only HTTP and HTTPS websites can be inspected.',
    credentials_not_allowed: 'URLs containing credentials are not allowed.',
    private_target: 'Private or local network targets cannot be inspected.',
    dns_failed: 'The website hostname could not be resolved.',
    fetch_timeout: 'The website took too long to respond.',
    fetch_failed: 'The website could not be reached from the audit service.',
    response_too_large: 'The page is too large for this lightweight audit.',
    redirect_limit: 'The website redirected too many times.',
    not_html: 'The requested URL did not return an HTML page.'
  })[code] || 'The website could not be inspected.';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok:false, error:'method_not_allowed' });
  }

  const rate = takeRateSlot(clientKey(req));
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    return res.status(429).json({ ok:false, error:'rate_limited', message:'Too many audit requests. Try again shortly.' });
  }
  if (activeAudits >= MAX_CONCURRENT_AUDITS) {
    res.setHeader('Retry-After', '2');
    return res.status(503).json({ ok:false, error:'audit_busy', message:'The audit service is busy. Try again shortly.' });
  }

  const raw = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  const input = String(raw.url || '').trim().slice(0, 2048);
  if (!input) return res.status(400).json({ ok:false, error:'invalid_url', message:errorMessage('invalid_url') });

  activeAudits += 1;
  try {
    const { status, html, finalUrl } = await fetchHtml(input);
    return res.status(200).json({ ok:true, fetched_at:new Date().toISOString(), ...analyze(html, finalUrl, status) });
  } catch (error) {
    const code = error?.message || 'audit_failed';
    const status = code === 'private_target' ? 403 : code === 'fetch_timeout' ? 504 : ['invalid_url','unsupported_protocol','credentials_not_allowed','not_html','response_too_large','redirect_limit'].includes(code) ? 400 : 502;
    return res.status(status).json({ ok:false, error:code, message:errorMessage(code) });
  } finally {
    activeAudits = Math.max(0, activeAudits - 1);
  }
}

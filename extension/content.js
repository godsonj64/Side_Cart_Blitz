const ACTION_PATTERNS = {
  confirm: [
    /\bplace\s+(?:your\s+)?order\b/i,
    /\bcomplete\s+(?:order|purchase)\b/i,
    /\bconfirm\s+(?:order|purchase)\b/i,
    /\bsubmit\s+order\b/i,
    /\bpay\s+now\b/i,
  ],
  buyNow: [
    /\bbuy\s+now\b/i,
    /\bpurchase\s+now\b/i,
    /\bcheckout\b/i,
    /\bcheck\s*out\b/i,
  ],
  add: [
    /\badd\s+to\s+(?:cart|bag|basket)\b/i,
    /\badd\s+bag\b/i,
  ],
};

document.addEventListener('click', handleClick, true);

function handleClick(event) {
  if (!event.isTrusted) return;
  const control = findClickable(event.composedPath?.() || []);
  if (!control) return;

  const label = getControlLabel(control);
  const action = classifyAction(label);
  if (!action) return;

  const item = extractProduct(control);
  chrome.runtime.sendMessage({ type: 'SHOP_ACTION', action, item }).catch(() => {});
}

function findClickable(path) {
  for (const node of path) {
    if (!(node instanceof Element)) continue;
    if (node.matches('button, a, input[type="button"], input[type="submit"], [role="button"]')) return node;
  }
  return null;
}

function getControlLabel(el) {
  const parts = [
    el.innerText,
    el.textContent,
    el.getAttribute('aria-label'),
    el.getAttribute('title'),
    el.getAttribute('name'),
    el.getAttribute('value'),
    el.id,
  ];
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function classifyAction(label) {
  if (!label) return null;
  for (const action of ['confirm', 'buyNow', 'add']) {
    if (ACTION_PATTERNS[action].some((pattern) => pattern.test(label))) return action;
  }
  return null;
}

function extractProduct(control) {
  const structured = findProductJsonLd();
  const title = firstText(
    structured?.name,
    meta('property', 'og:title'),
    meta('name', 'twitter:title'),
    text('[itemprop="name"]'),
    text('main h1'),
    text('h1'),
    document.title,
  ) || 'Shopping item';

  const structuredOffer = Array.isArray(structured?.offers) ? structured.offers[0] : structured?.offers;
  const rawPrice = firstText(
    structuredOffer?.price,
    structuredOffer?.lowPrice,
    meta('property', 'product:price:amount'),
    attr('[itemprop="price"]', 'content'),
    attr('[itemprop="price"]', 'value'),
    text('[itemprop="price"]'),
    nearbyPrice(control),
  );

  const currency = firstText(
    structuredOffer?.priceCurrency,
    meta('property', 'product:price:currency'),
    attr('[itemprop="priceCurrency"]', 'content'),
    inferCurrency(rawPrice),
  );

  const imageCandidate = Array.isArray(structured?.image) ? structured.image[0] : structured?.image;
  const image = absoluteUrl(firstText(
    typeof imageCandidate === 'object' ? imageCandidate?.url : imageCandidate,
    meta('property', 'og:image'),
    meta('name', 'twitter:image'),
    attr('[itemprop="image"]', 'src'),
  ));

  const url = canonicalUrl();
  const site = location.hostname.replace(/^www\./, '');
  const price = parsePrice(rawPrice);
  const fingerprint = `${site}|${normalize(title)}|${normalize(url)}`;

  return { title, price, currency, image, url, site, fingerprint };
}

function findProductJsonLd() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent);
      const product = findTypedNode(parsed, 'Product');
      if (product) return product;
    } catch {
      // Ignore malformed merchant JSON-LD.
    }
  }
  return null;
}

function findTypedNode(value, type) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findTypedNode(entry, type);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;

  const rawType = value['@type'];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  if (types.some((candidate) => String(candidate || '').toLowerCase() === type.toLowerCase())) return value;

  if (value['@graph']) {
    const graphMatch = findTypedNode(value['@graph'], type);
    if (graphMatch) return graphMatch;
  }
  return null;
}

function nearbyPrice(control) {
  let node = control;
  for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
    const candidates = node.querySelectorAll?.('[class*="price" i], [data-testid*="price" i], [aria-label*="$"], [aria-label*="price" i]');
    if (!candidates) continue;
    for (const candidate of candidates) {
      const content = candidate.getAttribute('content') || candidate.getAttribute('aria-label') || candidate.textContent;
      if (content && /(?:[$€£¥]|\b(?:USD|CAD|EUR|GBP|JPY)\b)\s*\d|\d[\d,.]*/i.test(content)) return content.trim();
    }
  }
  return '';
}

function parsePrice(value) {
  if (value == null) return null;
  const string = String(value).replace(/\s/g, '');
  const match = string.match(/(\d{1,3}(?:[,.]\d{3})*(?:[,.]\d{1,2})?|\d+(?:[,.]\d{1,2})?)/);
  if (!match) return null;

  let number = match[1];
  const lastComma = number.lastIndexOf(',');
  const lastDot = number.lastIndexOf('.');
  if (lastComma > lastDot) {
    number = number.replace(/\./g, '').replace(',', '.');
  } else {
    number = number.replace(/,/g, '');
  }
  const parsed = Number(number);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferCurrency(value) {
  const textValue = String(value || '');
  if (/CA\$/i.test(textValue) || /\bCAD\b/i.test(textValue)) return 'CAD';
  if (/US\$/i.test(textValue) || /\bUSD\b/i.test(textValue) || /\$/i.test(textValue)) return 'USD';
  if (/€|\bEUR\b/i.test(textValue)) return 'EUR';
  if (/£|\bGBP\b/i.test(textValue)) return 'GBP';
  if (/¥|\bJPY\b/i.test(textValue)) return 'JPY';
  return '';
}

function meta(attribute, value) {
  return document.querySelector(`meta[${attribute}="${CSS.escape(value)}"]`)?.content || '';
}

function text(selector) {
  return document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function attr(selector, name) {
  return document.querySelector(selector)?.getAttribute(name) || '';
}

function firstText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function canonicalUrl() {
  const href = document.querySelector('link[rel="canonical"]')?.href || location.href;
  try {
    const url = new URL(href, location.href);
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|ref_|tag$|aff|affiliate|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = '';
    return url.toString();
  } catch {
    return location.href;
  }
}

function absoluteUrl(value) {
  if (!value) return '';
  try {
    return new URL(value, location.href).toString();
  } catch {
    return '';
  }
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Best-effort job posting scraper. Never throws: returns whatever it could find.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

const ATS_PATTERNS = [
  ['Greenhouse', /greenhouse\.io|gh_jid=/i],
  ['Lever', /lever\.co/i],
  ['Ashby', /ashbyhq\.com/i],
  ['Workday', /myworkdayjobs\.com|workday\.com/i],
  ['SmartRecruiters', /smartrecruiters\.com/i],
  ['Workable', /workable\.com/i],
  ['BambooHR', /bamboohr\.com/i],
  ['iCIMS', /icims\.com/i],
  ['Jobvite', /jobvite\.com/i],
  ['Recruitee', /recruitee\.com/i],
  ['Teamtailor', /teamtailor\.com/i],
  ['Breezy', /breezy\.hr/i],
  ['Rippling', /rippling\.com/i],
  ['JazzHR', /jazz\.co|applytojob\.com/i],
  ['Taleo', /taleo\.net/i],
  ['SuccessFactors', /successfactors\.(com|eu)/i],
  ['LinkedIn', /linkedin\.com/i],
  ['Indeed', /indeed\.com/i],
  ['Wellfound', /wellfound\.com|angel\.co/i],
];

export function detectAts(url, html = '') {
  for (const [name, re] of ATS_PATTERNS) if (re.test(url)) return name;
  for (const [name, re] of ATS_PATTERNS) if (re.test(html.slice(0, 200000))) return name;
  return '';
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = (s = '') =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

const htmlToText = (html = '') =>
  decode(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<\/(p|div|li|h\d|br|tr)>|<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

function metaTags(html) {
  const out = {};
  for (const m of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = m[0];
    const key = /(?:property|name)=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const val = /content=["']([^"']*)["']/i.exec(tag)?.[1];
    if (key && val !== undefined && !(key in out)) out[key] = decode(val);
  }
  return out;
}

function jsonLdJobPosting(html) {
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      const queue = [data];
      while (queue.length) {
        const n = queue.shift();
        if (Array.isArray(n)) queue.push(...n);
        else if (n && typeof n === 'object') {
          const t = [].concat(n['@type'] || []);
          if (t.includes('JobPosting')) return n;
          if (n['@graph']) queue.push(n['@graph']);
        }
      }
    } catch { /* ignore malformed block */ }
  }
  return null;
}

const money = (n, cur) => {
  const sym = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$' }[cur];
  const s = Number(n).toLocaleString('en-US');
  return sym ? `${sym}${s}` : `${s}${cur ? ' ' + cur : ''}`;
};

function salaryFromJsonLd(jp) {
  const bs = jp?.baseSalary;
  if (!bs) return '';
  const cur = bs.currency || bs.value?.currency;
  const v = bs.value || bs;
  const unit = (v.unitText || '').toLowerCase();
  const per = unit ? `/${unit === 'year' ? 'yr' : unit}` : '';
  if (v.minValue && v.maxValue) return `${money(v.minValue, cur)} – ${money(v.maxValue, cur)}${per}`;
  if (v.value) return `${money(v.value, cur)}${per}`;
  return '';
}

const MONEY = String.raw`(?:[$€£]|CA\$|USD\s?|EUR\s?|GBP\s?)\s?\d{2,3}(?:,\d{3})`;

function salaryFromText(text) {
  // "minimum annual salary of $196,300 ... maximum salary of $265,600"
  const mm = new RegExp(`min(?:imum)?\\b[^$€£]{0,60}(${MONEY})[\\s\\S]{0,200}?max(?:imum)?\\b[^$€£]{0,60}(${MONEY})`, 'i').exec(text);
  if (mm) return `${mm[1].trim()} – ${mm[2].trim()}`;
  const re = /(?:[$€£]|CA\$|USD\s?|EUR\s?|GBP\s?)\s?\d{2,3}(?:,\d{3}|(?:\.\d+)?\s?[kK])(?:\s?(?:-|–|—|to)\s?(?:[$€£]|CA\$|USD\s?|EUR\s?|GBP\s?)?\s?\d{2,3}(?:,\d{3}|(?:\.\d+)?\s?[kK]))?(?:\s?(?:\/|per\s)\s?(?:yr|year|hr|hour|month))?/;
  return re.exec(text)?.[0]?.trim() || '';
}

function workTypeFrom(jp, text) {
  if (jp?.jobLocationType && /telecommute/i.test(jp.jobLocationType)) return 'Remote';
  const t = text.slice(0, 6000).toLowerCase();
  if (/\bhybrid\b/.test(t)) return 'Hybrid';
  if (/\bfully remote\b|\bremote\b/.test(t)) return 'Remote';
  if (/\bon-?site\b|\bin[- ]office\b/.test(t)) return 'On-site';
  return '';
}

function locationFromJsonLd(jp) {
  const locs = [].concat(jp?.jobLocation || []);
  const parts = locs
    .map((l) => {
      const a = l.address || {};
      return [a.addressLocality, a.addressRegion, a.addressCountry?.name || a.addressCountry]
        .filter((x) => x && typeof x === 'string')
        .join(', ');
    })
    .filter(Boolean);
  return [...new Set(parts)].join(' | ');
}

// LinkedIn's public (logged-out) job page uses stable "topcard" class names.
function linkedinParse(html) {
  const text = (re) => {
    const m = re.exec(html);
    return m ? decode(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() : '';
  };
  const body = /show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] || '';
  return {
    title: text(/topcard__title[^>]*>([\s\S]*?)</),
    company: text(/topcard__org-name-link[^>]*>([\s\S]*?)<\/a>/),
    location: text(/topcard__flavor--bullet[^>]*>([\s\S]*?)<\/span>/),
    description: htmlToText(body),
  };
}

const getJson = async (api) => {
  const r = await fetch(api, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(10000) });
  return r.ok ? r.json() : null;
};

async function ashbyJob(co, id) {
  const j = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${co}?includeCompensation=true`);
  const job = j?.jobs?.find((x) => x.id === id);
  if (!job) return null;
  return {
    title: job.title,
    company: co,
    location: job.location,
    workType: job.isRemote ? 'Remote' : job.workplaceType || '',
    description: job.descriptionPlain,
    pay: job.compensation?.compensationTierSummary || '',
  };
}

// Company career pages that embed a board (?ashby_jid=… / ?gh_jid=…): the board slug is only in the HTML.
async function embeddedAts(url, html) {
  const u = new URL(url);
  try {
    const ashbyId = u.searchParams.get('ashby_jid');
    if (ashbyId) {
      const co = /ashbyhq\.com\/([\w-]+)\/(?:embed|jobs)|jobs\.ashbyhq\.com\/([\w-]+)/i.exec(html);
      const slug = co?.[1] || co?.[2];
      if (slug) return { ats: 'Ashby', ...(await ashbyJob(slug, ashbyId)) };
    }
    const ghId = u.searchParams.get('gh_jid');
    if (ghId) {
      const slug = /greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([\w-]+)/i.exec(html)?.[1];
      if (slug) return await greenhouseJob(slug, ghId);
    }
  } catch { /* fall back to HTML parsing */ }
  return null;
}

async function greenhouseJob(board, id) {
  const j = await getJson(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}?pay_transparency=true`);
  if (!j) return null;
  const pay = j.pay_input_ranges?.[0];
  return {
    title: j.title,
    company: j.company_name,
    location: j.location?.name,
    description: htmlToText(decode(j.content || '')),
    pay: pay ? `${money(pay.min_cents / 100, pay.currency_type)} – ${money(pay.max_cents / 100, pay.currency_type)}` : '',
  };
}

// Public JSON APIs for the common ATS boards give much cleaner data than HTML.
async function atsApi(url) {
  const u = new URL(url);
  const get = getJson;
  try {
    if (/greenhouse\.io$/.test(u.hostname)) {
      const m = /^\/([^/]+)\/jobs\/(\d+)/.exec(u.pathname);
      const board = m?.[1] || u.searchParams.get('for');
      const id = m?.[2] || u.searchParams.get('gh_jid');
      if (board && id) return await greenhouseJob(board, id);
    }
    if (u.hostname === 'jobs.lever.co') {
      const [, co, id] = u.pathname.split('/');
      if (co && id) {
        const j = await get(`https://api.lever.co/v0/postings/${co}/${id}`);
        if (j) {
          const sr = j.salaryRange;
          return {
            title: j.text,
            company: co,
            location: j.categories?.location,
            workType: j.workplaceType ? j.workplaceType[0].toUpperCase() + j.workplaceType.slice(1) : '',
            description: j.descriptionPlain,
            pay: sr ? `${money(sr.min, sr.currency)} – ${money(sr.max, sr.currency)}` : '',
          };
        }
      }
    }
    if (u.hostname === 'jobs.ashbyhq.com') {
      const [, co, id] = u.pathname.split('/');
      if (co && id) return await ashbyJob(co, id);
    }
  } catch { /* fall through to HTML */ }
  return null;
}

const titleCase = (s) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function companyFromHost(url) {
  const u = new URL(url);
  const parts = u.hostname.replace(/^www\./, '').split('.');
  if (/^(jobs|boards|careers|apply)$/.test(parts[0]) && parts.length > 2) {
    // jobs.lever.co/acme/... -> acme
    const seg = u.pathname.split('/')[1];
    if (seg) return titleCase(seg);
  }
  return titleCase(parts.length > 2 ? parts[parts.length - 2] : parts[0]);
}

export async function scrape(url) {
  const result = {
    title: '', company: '', url, ats: detectAts(url), pay: '', workType: '', location: '', description: '',
  };
  const merge = (src) => {
    for (const [k, v] of Object.entries(src || {})) if (v && !result[k]) result[k] = String(v).trim();
  };

  merge(await atsApi(url));

  let html = '';
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    html = (await r.text()).slice(0, 2_000_000);
    result.finalUrl = r.url;
  } catch (e) {
    result.error = `fetch failed: ${e.message}`;
  }

  if (html) {
    merge(await embeddedAts(url, html));
    const jp = jsonLdJobPosting(html);
    const meta = metaTags(html);
    if (/linkedin\.com$/.test(new URL(url).hostname)) merge(linkedinParse(html));
    const pageTitle = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').trim();
    const bodyText = htmlToText(jp?.description ? decode(jp.description) : html);

    if (jp) {
      merge({
        title: decode(jp.title || ''),
        company: jp.hiringOrganization?.name,
        location: locationFromJsonLd(jp),
        pay: salaryFromJsonLd(jp),
        workType: workTypeFrom(jp, ''),
        description: htmlToText(decode(jp.description || '')),
      });
    }

    // og:title is often "Job Title at Company" or "Company - Job Title"
    let ogTitle = meta['og:title'] || pageTitle;
    let company = '';
    const at = / (?:at|@|\|) ([^|–—-]+)$/.exec(ogTitle);
    if (at) {
      company = at[1].trim();
      ogTitle = ogTitle.slice(0, at.index).trim();
    }
    merge({
      title: ogTitle,
      company: company || meta['og:site_name'],
      description: meta['og:description'] || meta.description,
    });
    merge({ pay: salaryFromText(bodyText), workType: workTypeFrom(jp, bodyText) });
    if (!result.ats) result.ats = detectAts(url, html);
  }

  if (!result.company) result.company = companyFromHost(url);
  if (!result.title) result.title = 'Untitled role';
  if (result.description.length > 20000) result.description = result.description.slice(0, 20000) + '…';
  return result;
}

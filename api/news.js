// Vercel Serverless Function
// Fetches Google News RSS for all regions server-side (no CORS issues)
// Free — Vercel free tier allows 100,000 calls/month

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const queries = {
    global:     'global markets economy',
    europe:     'Europe markets economy',
    asia:       'Asia markets economy',
    middleeast: 'Middle East economy geopolitics',
    indonesia:  'Indonesia economy markets',
  };

  const CUTOFF_24H = 24 * 60 * 60 * 1000;

  const fetchFeed = async (query) => {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DailyBrief/1.0)' },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Feed failed: ${response.status}`);
    const text = await response.text();

    const allItems = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/;
    const descRegex  = /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/;
    const dateRegex  = /<pubDate>(.*?)<\/pubDate>/;

    let match;
    // Scan up to 20 items to find enough recent ones
    while ((match = itemRegex.exec(text)) !== null && allItems.length < 20) {
      const block = match[1];
      const titleM = titleRegex.exec(block);
      const descM  = descRegex.exec(block);
      const dateM  = dateRegex.exec(block);

      const title   = (titleM?.[1] || titleM?.[2] || '').replace(/<[^>]+>/g, '').trim();
      const desc    = (descM?.[1]  || descM?.[2]  || '').replace(/<[^>]+>/g, '').trim().substring(0, 200);
      const dateStr = dateM?.[1] || '';
      const pubMs   = dateStr ? new Date(dateStr).getTime() : NaN;

      if (title.length <= 5) continue;
      allItems.push({ title, desc, date: dateStr, pubMs });
    }

    // Sort by date descending (most recent first), put unparseable dates last
    allItems.sort((a, b) => {
      if (isNaN(a.pubMs) && isNaN(b.pubMs)) return 0;
      if (isNaN(a.pubMs)) return 1;
      if (isNaN(b.pubMs)) return -1;
      return b.pubMs - a.pubMs;
    });

    const now = Date.now();
    const within24h = allItems.filter(a => !isNaN(a.pubMs) && a.pubMs >= now - CUTOFF_24H);

    // Always return only within-24h articles, however many there are (could be 1, 2, or 3+)
    // Never fill with older articles just to pad the count
    return within24h.slice(0, 10);
  };

  try {
    const [global, europe, asia, middleeast, indonesia] = await Promise.all(
      Object.values(queries).map(q => fetchFeed(q).catch(() => []))
    );

    const fmt = (items, region) =>
      items.length
        ? items.map(a => `[${region}] ${a.title}${a.desc ? ' — ' + a.desc : ''}${a.date ? ' ('+a.date+')' : ''}`).join('\n')
        : `[${region}] No articles found.`;

    const news = [
      fmt(global,     'GLOBAL'),
      fmt(europe,     'EUROPE'),
      fmt(asia,       'ASIA'),
      fmt(middleeast, 'MIDDLEEAST'),
      fmt(indonesia,  'INDONESIA'),
    ].join('\n\n');

    res.status(200).json({
      news,
      count: global.length + europe.length + asia.length + middleeast.length + indonesia.length,
      breakdown: { global: global.length, europe: europe.length, asia: asia.length, middleeast: middleeast.length, indonesia: indonesia.length }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

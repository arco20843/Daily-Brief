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

  const fetchFeed = async (query) => {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DailyBrief/1.0)' },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`Feed failed: ${response.status}`);
    const text = await response.text();

    // Parse XML manually (no DOM in Node.js serverless)
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/;
    const descRegex  = /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/;
    const dateRegex  = /<pubDate>(.*?)<\/pubDate>/;

    let match;
    while ((match = itemRegex.exec(text)) !== null && items.length < 10) {
      const block = match[1];
      const titleM = titleRegex.exec(block);
      const descM  = descRegex.exec(block);
      const dateM  = dateRegex.exec(block);

      const title = (titleM?.[1] || titleM?.[2] || '').replace(/<[^>]+>/g, '').trim();
      const desc  = (descM?.[1]  || descM?.[2]  || '').replace(/<[^>]+>/g, '').trim().substring(0, 200);
      const date  = dateM?.[1] || '';

      // 36h filter
      if (date) {
        const pub = new Date(date).getTime();
        if (!isNaN(pub) && pub < Date.now() - 36 * 60 * 60 * 1000) continue;
      }

      if (title.length > 5) items.push({ title, desc, date });
    }
    return items;
  };

  try {
    const [global, europe, asia, middleeast, indonesia] = await Promise.all(
      Object.values(queries).map(q => fetchFeed(q).catch(() => []))
    );

    const fmt = (items, region) =>
      items.length
        ? items.map(a => `[${region}] ${a.title}${a.desc ? ' — ' + a.desc : ''}`).join('\n')
        : `[${region}] No recent articles found.`;

    const news = [
      fmt(global,     'GLOBAL'),
      fmt(europe,     'EUROPE'),
      fmt(asia,       'ASIA'),
      fmt(middleeast, 'MIDDLEEAST'),
      fmt(indonesia,  'INDONESIA'),
    ].join('\n\n');

    res.status(200).json({ news, count: global.length + europe.length + asia.length + middleeast.length + indonesia.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

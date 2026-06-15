/**
 * WealthFlow — Cloudflare Worker
 * Proxy CORS per quotazioni: Yahoo Finance → ZoneBourse → Borsa Italiana
 * Deploy: https://dash.cloudflare.com → Workers & Pages → Create Worker
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const tickers = (url.searchParams.get('tickers') || url.searchParams.get('ticker') || '').split(',').map(t => t.trim()).filter(Boolean);

    if (!tickers.length) return json({ error: 'Missing tickers parameter' }, 400);

    // Separate Yahoo tickers from ZoneBourse (numeric IDs = certificates)
    const yahooTickers  = tickers.filter(t => !/^\d+$/.test(t));
    const zbTickers     = tickers.filter(t => /^\d+$/.test(t));

    const results = {};

    // --- Yahoo Finance batch (v7 supports multi-symbol) ---
    if (yahooTickers.length) {
      try {
        const symbols = yahooTickers.join(',');
        const res = await fetch(
          `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketPreviousClose,regularMarketChange,regularMarketChangePercent,shortName,longName,currency,fullExchangeName,marketState`,
          { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
        );
        if (res.ok) {
          const data = await res.json();
          (data?.quoteResponse?.result || []).forEach(q => {
            results[q.symbol] = {
              source: 'yahoo',
              ticker: q.symbol,
              name: q.shortName || q.longName || q.symbol,
              price: q.regularMarketPrice,
              previousClose: q.regularMarketPreviousClose,
              change: q.regularMarketChange,
              changePercent: q.regularMarketChangePercent,
              currency: q.currency || 'EUR',
              exchange: q.fullExchangeName || '',
              marketState: q.marketState || 'REGULAR',
              timestamp: Math.floor(Date.now() / 1000),
            };
          });
        }
      } catch (e) { /* fallback below */ }

      // Fallback: try individual v8 for tickers not found in batch
      const missing = yahooTickers.filter(t => !results[t]);
      for (const ticker of missing) {
        try {
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`,
            { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
          );
          if (res.ok) {
            const data = await res.json();
            const meta = data?.chart?.result?.[0]?.meta;
            if (meta?.regularMarketPrice) {
              const prev = meta.previousClose || meta.chartPreviousClose || meta.regularMarketPrice;
              results[ticker] = {
                source: 'yahoo_v8',
                ticker,
                name: meta.shortName || meta.longName || ticker,
                price: meta.regularMarketPrice,
                previousClose: prev,
                change: meta.regularMarketPrice - prev,
                changePercent: ((meta.regularMarketPrice - prev) / prev) * 100,
                currency: meta.currency || 'EUR',
                exchange: meta.exchangeName || '',
                marketState: meta.marketState || 'REGULAR',
                timestamp: meta.regularMarketTime || Math.floor(Date.now() / 1000),
              };
            }
          }
        } catch (_) {}
      }
    }

    // --- ZoneBourse (certificates / prodotti strutturati) ---
    for (const id of zbTickers) {
      try {
        const res = await fetch(`https://www.zonebourse.com/cours/${id}/`, {
          headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' }
        });
        if (res.ok) {
          const html = await res.text();
          // Extract last price from page
          const priceMatch = html.match(/id="zbPrice"[^>]*>\s*([\d\s,\.]+)/);
          const nameMatch  = html.match(/<h1[^>]*class="[^"]*instrument[^"]*"[^>]*>([^<]+)</i) ||
                             html.match(/<title>([^|<]+)/);
          if (priceMatch) {
            const price = parseFloat(priceMatch[1].replace(/\s/g, '').replace(',', '.'));
            results[id] = {
              source: 'zonebourse',
              ticker: id,
              name: nameMatch ? nameMatch[1].trim() : `Certificate ${id}`,
              price,
              previousClose: null,
              change: null,
              changePercent: null,
              currency: 'EUR',
              exchange: 'ZoneBourse',
              marketState: 'REGULAR',
              timestamp: Math.floor(Date.now() / 1000),
            };
          }
        }
      } catch (_) {}

      // ZoneBourse API fallback
      if (!results[id]) {
        try {
          const res = await fetch(
            `https://www.borsaitaliana.it/borsa/certificates/scheda.html?isin=${id}&lang=it`,
            { headers: { 'User-Agent': 'Mozilla/5.0' } }
          );
          if (res.ok) {
            const html = await res.text();
            const priceMatch = html.match(/Ultimo\s*[\n\r\t ]*<[^>]+>\s*([\d,\.]+)/i);
            if (priceMatch) {
              results[id] = {
                source: 'borsa_italiana',
                ticker: id,
                name: `Certificate ${id}`,
                price: parseFloat(priceMatch[1].replace(',', '.')),
                previousClose: null,
                change: null,
                changePercent: null,
                currency: 'EUR',
                exchange: 'Borsa Italiana',
                marketState: 'REGULAR',
                timestamp: Math.floor(Date.now() / 1000),
              };
            }
          }
        } catch (_) {}
      }
    }

    // Mark not-found tickers
    tickers.forEach(t => { if (!results[t]) results[t] = { error: 'not_found', ticker: t }; });

    return json({ results, timestamp: Date.now() });
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

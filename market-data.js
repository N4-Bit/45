// market-data.js – Echte Kursdaten für präzise KI-Signale
// Quellen: CoinGecko + Binance (Krypto), Yahoo Finance (Aktien NVDA/TSLA/AAPL).
// Jeder erfolgreiche Live-Kurs wird in die Projekt-DB gecacht (Tabelle market_cache);
// ist keine Quelle erreichbar, greift eine realistische Fallback-Simulation.
(function () {
  'use strict';

  const CRYPTO = {
    'BTC/USD': { cg: 'bitcoin', bn: 'BTCUSDT' },
    'ETH/USD': { cg: 'ethereum', bn: 'ETHUSDT' },
    'SOL/USD': { cg: 'solana', bn: 'SOLUSDT' }
  };
  const STOCKS = { 'NVDA': 'NVDA', 'TSLA': 'TSLA', 'AAPL': 'AAPL' };
  const VOL = { 'BTC/USD': 0.035, 'ETH/USD': 0.045, 'SOL/USD': 0.055, 'NVDA': 0.025, 'TSLA': 0.03, 'AAPL': 0.012 };
  const BASE = { 'BTC/USD': 67000, 'ETH/USD': 3200, 'SOL/USD': 165, 'NVDA': 130, 'TSLA': 220, 'AAPL': 225 };
  const CACHE_TTL = 10 * 60 * 1000; // 10 Minuten

  function timeout(ms) {
    const c = new AbortController();
    return { signal: c.signal, done: setTimeout(() => c.abort(), ms) };
  }

  async function fetchJson(url, ms) {
    const t = timeout(ms || 6000);
    try {
      const res = await fetch(url, { signal: t.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally { clearTimeout(t.done); }
  }

  // ---------- Live-Quellen ----------
  async function fromCoinGecko(id) {
    const d = await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=' + id + '&vs_currencies=usd&include_24hr_change=true');
    const row = d && d[id];
    if (!row || !row.usd) throw new Error('keine Daten');
    return { price: row.usd, change: row.usd_24h_change || 0, source: 'CoinGecko (live)' };
  }

  async function fromBinance(sym) {
    const d = await fetchJson('https://api.binance.com/api/v3/ticker/24hr?symbol=' + sym);
    if (!d || !d.lastPrice) throw new Error('keine Daten');
    return { price: parseFloat(d.lastPrice), change: parseFloat(d.priceChangePercent) || 0, source: 'Binance (live)' };
  }

  async function fromYahoo(sym) {
    const d = await fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/' + sym + '?interval=1d&range=5d');
    const meta = d && d.chart && d.chart.result && d.chart.result[0] && d.chart.result[0].meta;
    if (!meta || !meta.regularMarketPrice) throw new Error('keine Daten');
    const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
    return { price: meta.regularMarketPrice, change: ((meta.regularMarketPrice - prev) / prev) * 100, source: 'Yahoo Finance (live)' };
  }

  // ---------- Cache über die Projekt-DB (SQLite im Preview, PostgreSQL in Produktion) ----------
  async function cacheRead(asset) {
    try { return await db.get('SELECT * FROM market_cache WHERE asset = ?', [asset]); } catch (e) { return null; }
  }

  async function cacheWrite(asset, q) {
    try {
      await db.run('INSERT OR REPLACE INTO market_cache (asset, price, change_24h, source, fetched_at) VALUES (?, ?, ?, ?, ?)',
        [asset, q.price, q.change, q.source, new Date().toISOString()]);
    } catch (e) { /* Cache ist optional */ }
  }

  // ---------- Realistischer Fallback (fortlaufend am letzten Cache-Preis) ----------
  async function simulate(asset) {
    const vol = VOL[asset] || 0.02;
    let base = BASE[asset] || 100;
    const c = await cacheRead(asset);
    if (c && c.price) base = c.price;
    const drift = (Math.random() * 2 - 1) * vol;
    return { price: base * (1 + drift), change: drift * 100, source: 'Fallback-Simulation (keine Live-Quelle erreichbar)' };
  }

  async function getQuote(asset) {
    const crypto = CRYPTO[asset];
    const stock = STOCKS[asset];
    let q = null;
    try {
      if (crypto) {
        try { q = await fromCoinGecko(crypto.cg); } catch (e) { q = await fromBinance(crypto.bn); }
      } else if (stock) {
        q = await fromYahoo(stock);
      }
    } catch (e) { q = null; }

    if (q && q.price) {
      await cacheWrite(asset, q);
      return { price: q.price, change: q.change, source: q.source, live: true };
    }

    const c = await cacheRead(asset);
    if (c && c.price && Date.now() - new Date(c.fetched_at).getTime() < CACHE_TTL) {
      return { price: c.price, change: c.change_24h, source: 'Cache (' + (c.source || 'unbekannt') + ')', live: false };
    }
    const s = await simulate(asset);
    return { price: s.price, change: s.change, source: s.source, live: false };
  }

  // ---------- Echte technische Analyse (Punkt 10) ----------
  // 30-Tage-Kursreihe laden, SMA(7)/SMA(25) + RSI(14) berechnen.
  function sma(v, n) { return v.length < n ? null : v.slice(-n).reduce((s, x) => s + x, 0) / n; }
  function rsi(v, p) {
    if (v.length < p + 1) return null;
    let g = 0, l = 0;
    for (let i = v.length - p; i < v.length; i++) { const d = v[i] - v[i - 1]; if (d >= 0) g += d; else l -= d; }
    if (l === 0) return 100;
    return 100 - 100 / (1 + (g / p) / (l / p));
  }
  async function seriesCoinGecko(id) {
    const d = await fetchJson('https://api.coingecko.com/api/v3/coins/' + id + '/market_chart?vs_currency=usd&days=30&interval=daily');
    const p = d && d.prices ? d.prices.map(x => x[1]) : [];
    if (p.length < 10) throw new Error('zu wenig Daten');
    return p;
  }
  async function seriesBinance(sym) {
    const d = await fetchJson('https://api.binance.com/api/v3/klines?symbol=' + sym + '&interval=1d&limit=30');
    const p = (d || []).map(k => parseFloat(k[4]));
    if (p.length < 10) throw new Error('zu wenig Daten');
    return p;
  }
  async function seriesYahoo(sym) {
    const d = await fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/' + sym + '?interval=1d&range=1mo');
    const r = d && d.chart && d.chart.result && d.chart.result[0];
    const p = r && r.indicators && r.indicators.quote && r.indicators.quote[0] ? r.indicators.quote[0].close.filter(x => x != null) : [];
    if (p.length < 10) throw new Error('zu wenig Daten');
    return p;
  }
  // Fallback-Serie: deterministische Random-Walk-Serie um den letzten Kurs
  function syntheticSeries(last) {
    const out = [];
    let p = last || 100;
    for (let i = 0; i < 30; i++) { out.unshift(p); p = p * (1 + (Math.sin(i * 1.7) * 0.5 + Math.random() - 0.5) * 0.02); }
    return out;
  }

  // Liefert Richtung (LONG/SHORT), Konfidenz, Begründung + Kursreihe für den Chart.
  async function getAnalysis(asset) {
    const crypto = CRYPTO[asset], stock = STOCKS[asset];
    let series = null, live = false, src = 'Fallback-Simulation';
    try {
      if (crypto) { try { series = await seriesCoinGecko(crypto.cg); src = 'CoinGecko (live)'; } catch (e) { series = await seriesBinance(crypto.bn); src = 'Binance (live)'; } }
      else if (stock) { series = await seriesYahoo(stock); src = 'Yahoo Finance (live)'; }
      live = !!series;
    } catch (e) { series = null; }
    if (!series) {
      const q = await getQuote(asset);
      series = syntheticSeries(q.price);
      src = 'Fallback-Serie (keine Live-Quelle)';
    }
    const fast = sma(series, 7), slow = sma(series, 25);
    const r = rsi(series, 14) || 50;
    const trendUp = fast !== null && slow !== null ? fast > slow : series[series.length - 1] > series[0];
    // Momentum-Abstand in % → Konfidenz; RSI-Sonderzonen modulieren
    const spread = fast !== null && slow !== null ? Math.abs(fast - slow) / slow * 100 : 0.5;
    let conf = 55 + Math.min(35, spread * 12);
    if (r > 75 || r < 25) conf -= 8;           // überkauft/überverkauft → unsicherer
    if ((trendUp && r > 50) || (!trendUp && r < 50)) conf += 5; // Trend+Momentum decken sich
    conf = Math.min(94, Math.max(52, conf));
    const action = trendUp ? 'LONG' : 'SHORT';
    const reason = 'SMA(7) ' + (trendUp ? 'über' : 'unter') + ' SMA(25) · RSI(14): ' + r.toFixed(1);
    return { action: action, confidence: Math.round(conf * 10) / 10, reason: reason, series: series, source: src, live: live, rsi: r };
  }

  window.marketData = { getQuote: getQuote, getAnalysis: getAnalysis };
})();

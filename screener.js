const ISHARES_CSV_URL = "https://www.ishares.com/uk/individual/en/products/270054/ishares-msci-world-quality-factor-ucits-etf/1506575576011.ajax?fileType=csv&fileName=IWQU_holdings&dataType=fund";
const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";

async function fetchETFHoldings(limit) {
  const response = await fetch(ISHARES_CSV_URL);
  if (!response.ok) throw new Error("ETF Source Offline");
  const csvText = await response.text();
  const lines = csvText.split('\n');
  const holdings = [];
  let tickerIdx = -1, sectorIdx = -1;
  const csvSplitRegex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;

  for (const line of lines) {
    const cols = line.split(csvSplitRegex).map(c => c.trim().replace(/^"|"$/g, ''));
    if (tickerIdx === -1) {
      if (cols.includes('Ticker') && cols.includes('Sector')) {
        tickerIdx = cols.indexOf('Ticker');
        sectorIdx = cols.indexOf('Sector');
      }
      continue;
    }
    if (cols.length > tickerIdx) {
      let symbol = cols[tickerIdx].replace('/', '-');
      if (symbol && symbol !== '-' && !symbol.includes(' ')) {
        holdings.push({ symbol, sector: cols[sectorIdx] || 'Misc' });
      }
    }
  }
  return holdings.slice(0, limit);
}

async function fetchStockData(symbol) {
  const response = await fetch(`${YAHOO_BASE}${symbol}?interval=1wk&range=5y`);
  if (!response.ok) throw new Error(`Market API error: ${symbol}`);
  const data = await response.json();
  return data.chart?.result?.[0];
}

function calculateSMA(quotes, windowSize) {
  const closes = (quotes.indicators.quote[0].close || []).filter(p => p != null);
  if (closes.length < windowSize) throw new Error(`SMA${windowSize} data missing`);
  return closes.slice(-windowSize).reduce((a, b) => a + b, 0) / windowSize;
}

function calculateMedianAnnualReturn(quotes) {
  const closes = (quotes.indicators.quote[0].close || []).filter(p => p != null);
  if (closes.length < 52) return 0;
  const returns = [];
  for (let i = closes.length - 1; i >= 52; i -= 52) {
    const end = closes[i], start = closes[i - 52];
    if (start > 0) returns.push(((end - start) / start) * 100);
  }
  if (returns.length === 0) return 0;
  returns.sort((a, b) => a - b);
  const mid = Math.floor(returns.length / 2);
  return returns.length % 2 !== 0 ? returns[mid] : (returns[mid - 1] + returns[mid]) / 2;
}

module.exports = { fetchETFHoldings, fetchStockData, calculateSMA, calculateMedianAnnualReturn };
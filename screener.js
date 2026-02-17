const ISHARES_CSV_URL = "https://www.ishares.com/uk/individual/en/products/270054/ishares-msci-world-quality-factor-ucits-etf/1506575576011.ajax?fileType=csv&fileName=IWQU_holdings&dataType=fund";
const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";
const BROWSER_PROXY = "https://cors-3bvl.onrender.com/proxy?url="; // Use example proxy

const getUrl = (target) => {
  const isNode = typeof window === 'undefined' || process.env.IS_BACKEND === 'true';
  return isNode ? target : `${BROWSER_PROXY}${encodeURIComponent(target)}`;
};

async function fetchETFHoldings(limit) {
  const response = await fetch(getUrl(ISHARES_CSV_URL));
  // ... (CSV Parsing Logic same as before)
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
  const url = `${YAHOO_BASE}${symbol}?interval=1wk&range=5y`;
  const response = await fetch(getUrl(url));
  if (!response.ok) throw new Error(`Market API error ${response.status}: ${symbol}`);
  const data = await response.json();
  const result = data.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);
  return result;
}

async function fetchFinvizMetrics(symbol) {
  const targetUrl = `https://finviz.com/quote.ashx?t=${symbol}`;
  const response = await fetch(getUrl(targetUrl));
  if (!response.ok) return { eps: null, growth5Y: null };
  const html = await response.text();
  
  const getVal = (key) => {
    const regex = new RegExp(`>${key}<\\/td>.*?<b>([0-9.-]+)%?<\\/b>`, 's');
    const match = html.match(regex);
    if (match && match[1] && match[1] !== '-') return parseFloat(match[1]);
    return null;
  };
  return { eps: getVal('EPS \\(ttm\\)'), growth5Y: getVal('EPS next 5Y') };
}

function calculateDCF(eps, growthRate5Y, terminalGrowthRate, discountRate) {
  if (discountRate <= terminalGrowthRate) return null;
  let pvSum = 0;
  let currentEps = eps;
  for (let i = 1; i <= 5; i++) {
    currentEps *= (1 + growthRate5Y);
    pvSum += currentEps / Math.pow(1 + discountRate, i);
  }
  const terminalEps = currentEps * (1 + terminalGrowthRate);
  const terminalValue = terminalEps / (discountRate - terminalGrowthRate);
  const pvTerminalValue = terminalValue / Math.pow(1 + discountRate, 5);
  return pvSum + pvTerminalValue;
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

module.exports = { fetchETFHoldings, fetchStockData, calculateSMA, calculateMedianAnnualReturn, fetchFinvizMetrics, calculateDCF };
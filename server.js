const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { 
  fetchETFHoldings, 
  fetchStockData, 
  calculateSMA, 
  calculateMedianAnnualReturn,
  fetchFinvizMetrics,
  calculateDCF
} = require('./screener');

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.get('/api/scan', async (req, res) => {
  console.log('--- Starting New Scan Request ---');
  try {
    const limit = parseInt(req.query.limit) || 20;
    const spyData = await fetchStockData('SPY');
    const spyMedianReturn = calculateMedianAnnualReturn(spyData);
    
    if (spyMedianReturn === 0) throw new Error("SPY benchmark calculation failed");

    const holdings = await fetchETFHoldings(limit);
    const results = [];
    
    for (const holding of holdings) {
      try {
        await sleep(250); 
        
        const data = await fetchStockData(holding.symbol);
        const price = data.meta.regularMarketPrice;
        const sma100 = calculateSMA(data, 100);
        const stockMedianReturn = calculateMedianAnnualReturn(data);
        const relativeReturn = stockMedianReturn / spyMedianReturn;
        
        if (price < (sma100 * 1.05)) {
          // Fetch Finviz Fundamentals
          const { eps, growth5Y } = await fetchFinvizMetrics(holding.symbol);
          let fairValue = null;
          
          if (eps !== null && growth5Y !== null) {
             // Defaults: Terminal 2.5%, Discount 9.5%
             fairValue = calculateDCF(eps, growth5Y / 100, 0.025, 0.095);
          }
          
          results.push({ 
            symbol: holding.symbol, 
            sector: holding.sector, 
            price, 
            sma100, 
            relativeReturn,
            diffPercent: ((price - sma100) / sma100) * 100,
            fairValue
          });
          console.log(`Match: ${holding.symbol} | FV: ${fairValue}`);
        }
      } catch (err) { 
        console.error(`Skipping ${holding.symbol}: ${err.message}`); 
      }
    }
    res.json({ success: true, data: results });
  } catch (err) {
    console.error('Fatal Scan Error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
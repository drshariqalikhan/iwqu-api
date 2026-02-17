const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
// This assumes you have screener.js in the same folder
const { 
  fetchETFHoldings, 
  fetchStockData, 
  calculateSMA, 
  calculateMedianAnnualReturn 
} = require('./screener');

dotenv.config();
const app = express();

// Enable CORS for all origins (or restrict to your frontend URL)..
app.use(cors());
app.use(express.json());

app.get('/api/scan', async (req, res) => {
  console.log('--- Starting New Scan Request ---');
  try {
    const limit = parseInt(req.query.limit) || 20;
    const holdings = await fetchETFHoldings(limit);
    const results = [];
    
    for (const holding of holdings) {
      try {
        const data = await fetchStockData(holding.symbol);
        const price = data.meta.regularMarketPrice;
        const sma100 = calculateSMA(data, 100);
        const medRet = calculateMedianAnnualReturn(data);
        
        // Value Logic: Price < 105% of 100-week SMA
        if (price < (sma100 * 1.05)) {
          results.push({ 
            symbol: holding.symbol, 
            sector: holding.sector, 
            price, 
            sma100, 
            medianReturn: medRet,
            diffPercent: ((price - sma100) / sma100) * 100
          });
          console.log(`Match Found: ${holding.symbol}`);
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
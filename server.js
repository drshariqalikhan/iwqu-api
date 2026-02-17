const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { 
  fetchETFHoldings, 
  fetchStockData, 
  calculateSMA, 
  calculateMedianAnnualReturn 
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
    
    // 1. Calculate SPY Benchmark first
    console.log('Calculating SPY benchmark...');
    const spyData = await fetchStockData('SPY');
    const spyMedianReturn = calculateMedianAnnualReturn(spyData);
    
    if (spyMedianReturn === 0) throw new Error("SPY benchmark calculation failed");

    // 2. Fetch ETF Holdings
    const holdings = await fetchETFHoldings(limit);
    const results = [];
    
    for (const holding of holdings) {
      try {
        await sleep(250); // Throttling
        
        const data = await fetchStockData(holding.symbol);
        const price = data.meta.regularMarketPrice;
        const sma100 = calculateSMA(data, 100);
        const stockMedianReturn = calculateMedianAnnualReturn(data);
        
        // 3. Calculate Relative Return vs SPY
        const relativeReturn = stockMedianReturn / spyMedianReturn;
        
        if (price < (sma100 * 1.05)) {
          results.push({ 
            symbol: holding.symbol, 
            sector: holding.sector, 
            price, 
            sma100, 
            relativeReturn,
            diffPercent: ((price - sma100) / sma100) * 100
          });
          console.log(`Match: ${holding.symbol} (Strength: ${relativeReturn.toFixed(2)}x)`);
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
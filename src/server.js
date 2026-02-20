const express = require('express');
const path = require('path');
const { loadData, calculateOrderSummary, getLowestAvailablePrice } = require('./dataService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

async function startServer() {
  const data = await loadData();

  app.get('/api/options', (req, res) => {
    const distanceMatrix = Object.fromEntries(data.distanceMap.entries());

    const itemPreview = data.items.map((item) => ({
      itemId: item.itemId,
      productName: item.productName,
      description: item.description,
      rating: item.rating,
      brand: item.brand,
      type: item.type,
      defaultPrice: getLowestAvailablePrice(item),
      pricesByCity: item.pricesByCity,
      quantitiesByCity: item.quantitiesByCity,
    }));

    res.json({
      cities: data.availableCities,
      items: itemPreview,
      distanceMatrix,
    });
  });

  app.post('/api/calculate', (req, res) => {
    const destinationCity = req.body.destinationCity;
    const orderItems = Array.isArray(req.body.orderItems) ? req.body.orderItems : [];

    if (!destinationCity) {
      return res.status(400).json({ error: 'destinationCity is required.' });
    }

    const summary = calculateOrderSummary({
      destinationCity,
      orderItems,
      data,
    });

    return res.json(summary);
  });

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

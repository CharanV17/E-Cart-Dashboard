const fs = require('fs/promises');
const path = require('path');
const { parse } = require('csv-parse/sync');

function parseNumber(value) {
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPriceForCity(item, city) {
  const directPrice = parseNumber(item.pricesByCity[city]);
  if (directPrice > 0) {
    return directPrice;
  }

  const fallbackPrice = Object.values(item.pricesByCity)
    .map((price) => parseNumber(price))
    .find((price) => price > 0);

  return fallbackPrice || 0;
}

function getLowestAvailablePrice(item) {
  const prices = Object.values(item.pricesByCity)
    .map((price) => parseNumber(price))
    .filter((price) => price > 0);

  return prices.length ? Math.min(...prices) : 0;
}

function getNearestFulfillment(item, destinationCity, distanceMap) {
  let nearest = null;

  for (const [city, rawPrice] of Object.entries(item.pricesByCity)) {
    const unitPrice = parseNumber(rawPrice);
    if (unitPrice <= 0) {
      continue;
    }

    const distanceKm = parseNumber(distanceMap.get(city)?.[destinationCity]);
    const hasDistance = Number.isFinite(distanceKm) && distanceKm >= 0;
    const candidateDistance = hasDistance ? distanceKm : Number.MAX_SAFE_INTEGER;

    if (
      !nearest ||
      candidateDistance < nearest.distanceKm ||
      (candidateDistance === nearest.distanceKm && unitPrice < nearest.unitPrice)
    ) {
      nearest = {
        sourceCity: city,
        unitPrice,
        distanceKm: candidateDistance,
      };
    }
  }

  if (!nearest) {
    return {
      sourceCity: null,
      unitPrice: 0,
      distanceKm: 0,
    };
  }

  if (nearest.distanceKm === Number.MAX_SAFE_INTEGER) {
    return {
      ...nearest,
      distanceKm: 0,
    };
  }

  return nearest;
}

async function loadCsv(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

function buildDistanceMap(rows) {
  const map = new Map();

  for (const row of rows) {
    const fromCity = row[''];
    const distances = {};

    for (const [toCity, distance] of Object.entries(row)) {
      if (!toCity || toCity === '') {
        continue;
      }
      distances[toCity] = parseNumber(distance);
    }

    map.set(fromCity, distances);
  }

  return map;
}

async function loadData() {
  const basePath = path.resolve(__dirname, '..');

  const [productsByCityRows, productsRows, distanceRows] = await Promise.all([
    loadCsv(path.join(basePath, '200_products_all_cities.csv')),
    loadCsv(path.join(basePath, 'BigBasket.csv')),
    loadCsv(path.join(basePath, 'india_city_distance_matrix.csv')),
  ]);

  const metadataByProductName = new Map();
  for (const row of productsRows) {
    const productName = row.product;
    if (!productName) {
      continue;
    }

    metadataByProductName.set(productName, {
      brand: row.brand,
      type: row.type,
      rating: parseNumber(row.rating),
      description: row.description || 'No description available.',
    });
  }

  const itemsById = new Map();
  for (const row of productsByCityRows) {
    const itemId = parseNumber(row['Item Number']);
    const productName = row.Product;
    const city = row.City;

    if (!itemId || !productName || !city) {
      continue;
    }

    if (!itemsById.has(itemId)) {
      const metadata = metadataByProductName.get(productName) || {
        brand: 'Unknown',
        type: 'Unknown',
        rating: 0,
        description: 'No description available.',
      };

      itemsById.set(itemId, {
        itemId,
        productName,
        brand: metadata.brand,
        type: metadata.type,
        rating: metadata.rating,
        description: metadata.description,
        pricesByCity: {},
        quantitiesByCity: {},
      });
    }

    const item = itemsById.get(itemId);
    
    // Try multiple possible key variations for price and quantity
    let priceValue = 0;
    let quantityValue = 0;
    
    // Try different price column key variations
    if (row['Cost per unit']) {
      priceValue = parseNumber(row['Cost per unit']);
    } else if (row['Cost per unit ']) {
      priceValue = parseNumber(row['Cost per unit ']);
    } else {
      const priceKey = Object.keys(row).find(k => k.includes('Cost') && k.includes('unit'));
      if (priceKey) priceValue = parseNumber(row[priceKey]);
    }
    
    // Try different quantity column key variations  
    if (row['No. of units']) {
      quantityValue = parseNumber(row['No. of units']);
    } else {
      const quantityKey = Object.keys(row).find(k => k.includes('No.') || k.includes('units'));
      if (quantityKey) quantityValue = parseNumber(row[quantityKey]);
    }
    
    item.pricesByCity[city] = priceValue;
    item.quantitiesByCity[city] = quantityValue;
  }

  const distanceMap = buildDistanceMap(distanceRows);
  const availableCities = distanceRows.length ? Object.keys(distanceRows[0]).filter((key) => key && key !== '') : [];

  return {
    items: [...itemsById.values()].sort((a, b) => a.itemId - b.itemId),
    distanceMap,
    availableCities,
  };
}

// Get fulfillment with split: may fulfill from multiple cities if quantity exceeds destination city stock
function getFulfillmentWithSplit(item, quantity, destinationCity, distanceMap) {
  const fulfillments = []; // Array of {sourceCity, quantityFromCity, unitPrice, distanceKm}
  let remainingQuantity = quantity;

  // First, try to fulfill from destination city
  const destinationQuantity = parseNumber(item.quantitiesByCity?.[destinationCity] || 0);
  const destinationPrice = parseNumber(item.pricesByCity?.[destinationCity] || 0);

  if (destinationQuantity > 0 && destinationPrice > 0) {
    const quantityFromDestination = Math.min(remainingQuantity, destinationQuantity);
    fulfillments.push({
      sourceCity: destinationCity,
      quantityFromCity: quantityFromDestination,
      unitPrice: destinationPrice,
      distanceKm: 0,
    });
    remainingQuantity -= quantityFromDestination;
  }

  // If we still need more, find nearest city with stock
  if (remainingQuantity > 0) {
    let nearest = null;

    for (const [city, rawQuantity] of Object.entries(item.quantitiesByCity || {})) {
      if (city === destinationCity) continue; // Skip destination city, already handled

      const cityQuantity = parseNumber(rawQuantity);
      if (cityQuantity <= 0) continue;

      const price = parseNumber(item.pricesByCity[city]);
      if (price <= 0) continue;

      const distanceKm = parseNumber(distanceMap.get(city)?.[destinationCity]) || 0;

      if (
        !nearest ||
        distanceKm < nearest.distanceKm ||
        (distanceKm === nearest.distanceKm && price < nearest.unitPrice)
      ) {
        nearest = {
          sourceCity: city,
          quantityInCity: cityQuantity,
          unitPrice: price,
          distanceKm,
        };
      }
    }

    if (nearest) {
      const quantityFromFallback = Math.min(remainingQuantity, nearest.quantityInCity);
      fulfillments.push({
        sourceCity: nearest.sourceCity,
        quantityFromCity: quantityFromFallback,
        unitPrice: nearest.unitPrice,
        distanceKm: nearest.distanceKm,
      });
      remainingQuantity -= quantityFromFallback;
    }
  }

  // If still remaining, product is out of stock
  if (remainingQuantity > 0) {
    fulfillments.push({
      sourceCity: null,
      quantityFromCity: remainingQuantity,
      unitPrice: 0,
      distanceKm: 0,
      outOfStock: true,
    });
  }

  return fulfillments;
}

// Get fulfillment with fallback: use destination city if in stock, else find nearest city with stock
function getFulfillmentWithFallback(item, destinationCity, distanceMap) {
  const quantityInDestination = parseNumber(item.quantitiesByCity?.[destinationCity]);
  
  // If destination city has stock, use it
  if (quantityInDestination > 0 && item.pricesByCity[destinationCity]) {
    return {
      sourceCity: destinationCity,
      unitPrice: parseNumber(item.pricesByCity[destinationCity]),
      distanceKm: 0,
      isFallback: false,
    };
  }

  // Otherwise, find nearest city with available stock
  let nearest = null;

  for (const [city, rawQuantity] of Object.entries(item.quantitiesByCity || {})) {
    const quantity = parseNumber(rawQuantity);
    if (quantity <= 0) continue;

    const price = parseNumber(item.pricesByCity[city]);
    if (price <= 0) continue;

    const distanceKm = parseNumber(distanceMap.get(city)?.[destinationCity]) || 0;

    if (
      !nearest ||
      distanceKm < nearest.distanceKm ||
      (distanceKm === nearest.distanceKm && price < nearest.unitPrice)
    ) {
      nearest = {
        sourceCity: city,
        unitPrice: price,
        distanceKm,
        isFallback: true,
      };
    }
  }

  if (!nearest) {
    return {
      sourceCity: null,
      unitPrice: 0,
      distanceKm: 0,
      isFallback: false,
    };
  }

  return nearest;
}

function calculateOrderSummary({ orderItems, destinationCity, data }) {
  let maxDistanceKm = 0;

  let itemsCost = 0;
  let deliveryCharge = 0;
  let totalQuantity = 0;

  const fulfillmentDetails = [];

  for (const orderItem of orderItems) {
    const item = data.items.find((entry) => entry.itemId === orderItem.itemId);
    if (!item) {
      continue;
    }

    const quantity = Math.max(0, parseNumber(orderItem.quantity));
    if (quantity === 0) {
      continue;
    }

    // Use split fulfillment: fulfill from destination city first, then nearest fallback if needed
    const fulfillments = getFulfillmentWithSplit(item, quantity, destinationCity, data.distanceMap);
    
    let itemHasStock = false;
    let totalItemCost = 0;
    let maxItemDistance = 0;

    for (const fulfillment of fulfillments) {
      if (!fulfillment.sourceCity) {
        // Out of stock portion
        fulfillmentDetails.push({
          itemId: item.itemId,
          productName: item.productName,
          quantity: fulfillment.quantityFromCity,
          sourceCity: null,
          unitPrice: 0,
          distanceKm: 0,
          status: 'OUT_OF_STOCK',
        });
        continue;
      }

      itemHasStock = true;
      const portionCost = fulfillment.unitPrice * fulfillment.quantityFromCity;
      totalItemCost += portionCost;
      itemsCost += portionCost;

      // Add delivery charge for this portion if it's from a fallback city (distance > 0)
      if (fulfillment.distanceKm > 0) {
        const distanceSlabs = Math.ceil(fulfillment.distanceKm / 100);
        deliveryCharge += distanceSlabs * 10;
      }

      maxItemDistance = Math.max(maxItemDistance, fulfillment.distanceKm);

      fulfillmentDetails.push({
        itemId: item.itemId,
        productName: item.productName,
        quantity: fulfillment.quantityFromCity,
        sourceCity: fulfillment.sourceCity,
        unitPrice: fulfillment.unitPrice,
        distanceKm: fulfillment.distanceKm,
        isFallback: fulfillment.distanceKm > 0,
        status: 'AVAILABLE',
      });
    }

    if (itemHasStock) {
      totalQuantity += quantity;
      maxDistanceKm = Math.max(maxDistanceKm, maxItemDistance);
    }
  }

  const baseMinutes = 30;
  const distanceMinutes = maxDistanceKm * 1.2;
  const productLineCount = fulfillmentDetails.length;
  const itemHandlingMinutes = productLineCount * 3;
  const arrivalMinutes = Math.round(baseMinutes + distanceMinutes + itemHandlingMinutes);
  const totalCost = Math.round(itemsCost + deliveryCharge);

  return {
    itemsCost: Math.round(itemsCost),
    deliveryCharge: Math.round(deliveryCharge),
    totalCost,
    totalQuantity,
    arrivalMinutes,
    distanceKm: maxDistanceKm,
    fulfillmentDetails,
  };
}

module.exports = {
  loadData,
  calculateOrderSummary,
  getPriceForCity,
  getLowestAvailablePrice,
};

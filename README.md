# E-Cart (Vyapaar-Hub)

City-aware product ordering dashboard built with **Node.js + Express** and a **Vanilla JS** frontend.

It helps users browse products, select quantities, and get real-time fulfillment/cost estimates based on city-wise inventory, prices, and inter-city distance.

## Features

- Product discovery with:
  - search by product name, brand, or type
  - category filter (auto-categorized from product metadata)
  - sorting by price, rating, and nearest distance
- Quantity controls (`+`, `-`, direct input) with stock validation
- Split fulfillment logic:
  - destination city first
  - nearest fallback city if stock is insufficient
  - out-of-stock marking for unfulfillable quantity
- Live order summary:
  - cart items
  - total items and quantity
  - items cost, delivery charge, total cost
  - expected arrival time
- Dark/Light mode toggle with persistence (`localStorage`)
- Scroll-to-top and scroll-to-bottom quick buttons

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js, Express
- Data: CSV files parsed with `csv-parse`

## Project Structure

```text
E-Cart/
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── src/
│   ├── server.js
│   └── dataService.js
├── 200_products_all_cities.csv
├── BigBasket.csv
├── india_city_distance_matrix.csv
├── WORKFLOW.md
├── package.json
└── README.md
```

## Data Sources

- `200_products_all_cities.csv`
  - item number, product, city, cost per unit, number of units
- `BigBasket.csv`
  - product metadata: brand, type, rating, description
- `india_city_distance_matrix.csv`
  - city-to-city distances in km

## API Endpoints

### `GET /api/options`
Returns initialization payload:

- `cities`: available city list
- `items`: product catalog with metadata + `pricesByCity` + `quantitiesByCity`
- `distanceMatrix`: city distance map

### `POST /api/calculate`
Calculates order summary.

Request body:

```json
{
  "destinationCity": "Mumbai",
  "orderItems": [
    { "itemId": 101, "quantity": 2 },
    { "itemId": 102, "quantity": 1 }
  ]
}
```

Response fields include:

- `itemsCost`
- `deliveryCharge`
- `totalCost`
- `totalQuantity`
- `arrivalMinutes`
- `distanceKm`
- `fulfillmentDetails`

## Fulfillment & Pricing Logic

### Fulfillment

For each ordered item:

1. Fulfill from destination city first (if stock exists).
2. If required quantity remains, use nearest alternate city with stock.
3. If still remaining, mark that portion as out-of-stock.

### Delivery Charge

For each fulfilled fallback portion (`distanceKm > 0`):

- `distanceSlabs = ceil(distanceKm / 100)`
- `charge += distanceSlabs * 10`

### Arrival Estimate

Computed as:

- `baseMinutes = 30`
- `distanceMinutes = maxDistanceKm * 1.2`
- `itemHandlingMinutes = fulfillmentLineCount * 3`
- `arrivalMinutes = round(baseMinutes + distanceMinutes + itemHandlingMinutes)`

## Getting Started

### Prerequisites

- Node.js (LTS recommended)
- npm

### Install

```bash
npm install
```

### Run

```bash
npm start
```

Server starts at:

- `http://localhost:3000`

## Available Script

- `npm start` → runs `node src/server.js`

## Notes

- Default selected city in UI is `Mumbai`.
- Quantity input is capped by total available stock across all cities.
- If an item is partially fulfillable, only the remaining portion is marked out-of-stock.

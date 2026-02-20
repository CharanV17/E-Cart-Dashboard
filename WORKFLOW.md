# E-Cart Workflow (Latest)

## Overview
E-Cart is a city-aware product ordering dashboard.
It lets users browse products, add quantities, and calculates fulfillment/cost/ETA using city distance and inventory data.

---

## Tech Stack
- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js + Express
- Data: CSV files
  - `200_products_all_cities.csv` (price + stock by city)
  - `BigBasket.csv` (brand/type/rating/description)
  - `india_city_distance_matrix.csv` (city-to-city distances)

---

## Current Features

### Product Discovery
- Search supports:
  - product name
  - brand
  - type
- Category filter (keyword-based auto categorization)
- Sort options:
  - default
  - price low/high
  - rating low/high
  - nearest distance

### Cart & Quantity
- `+` / `-` controls
- Bulk quantity input (type number directly)
- Quantity validation against available stock
- Selected cards are visually highlighted
- Live cart list in Order Summary (`product × quantity`)

### Inventory Behavior
- Stock is read from `No. of units` in `200_products_all_cities.csv`
- UI shows stock context like:
  - `(X in <selected-city>, Y total)`
  - `(Y in other cities)`
  - `(Out of Stock)`
- If selected city stock is insufficient:
  - fulfillment falls back to nearest city with stock
- If no stock anywhere:
  - order line is marked out of stock

### Summary & Navigation
- Fixed Order Summary panel (desktop)
- Two fixed scroll buttons:
  - Go Up
  - Go Down
- Dark/Light mode toggle with `localStorage` persistence

---

## API Workflow

### `GET /api/options`
Returns initialization data:
- `cities`
- `items` (includes `pricesByCity` and `quantitiesByCity`)
- `distanceMatrix`

Used by frontend to:
- populate filters
- render product cards
- compute nearest preview source
- enforce quantity limits

### `POST /api/calculate`
Input:
- `destinationCity`
- `orderItems: [{ itemId, quantity }]`

Backend computes:
- per-item fulfillment details
- items cost
- delivery charge
- total cost
- total quantity
- arrival minutes

---

## Fulfillment Logic (Current)

For each ordered item:
1. Try fulfilling from destination city first (if stock available).
2. If required quantity remains, use nearest alternate city with stock.
3. If still remaining, mark leftover quantity as out-of-stock.

Notes:
- Split fulfillment is supported between destination city + nearest fallback city.
- Delivery charge is applied for fallback portions based on distance slabs.

---

## Cost Logic

### Item Cost
`sum(unitPrice × fulfilledQuantity)` across fulfillment portions.

### Delivery Charge
For each fulfilled portion with `distanceKm > 0`:
- `slabs = ceil(distanceKm / 100)`
- `charge += slabs × 10`

---

## Arrival Time Logic
In `src/dataService.js`:
- `baseMinutes = 30`
- `distanceMinutes = maxDistanceKm × 1.2`
- `itemHandlingMinutes = productLineCount × 3`
- `arrivalMinutes = round(baseMinutes + distanceMinutes + itemHandlingMinutes)`

In `public/app.js`:
- `formatDeliveryTime(minutes)` displays as:
  - `Today at ...`
  - `Tomorrow at ...`
  - `<Mon DD> at ...`

---

## UI Update Flow

When quantity changes:
1. `quantityByItemId` updates
2. Product grid rerenders
3. Cart list rerenders
4. `POST /api/calculate` recalculates summary
5. Fulfillment source labels refresh (`Fulfilled From` / `Nearest Source`)

---

## Important Data Structures
- `quantityByItemId: Map<itemId, quantity>`
- `fulfillmentByItemId: Map<itemId, fulfillmentDetail>`
- `items[]` containing:
  - `itemId`
  - `productName`
  - `brand`
  - `type`
  - `rating`
  - `description`
  - `pricesByCity`
  - `quantitiesByCity`

---

## Known Behavior
- If user requests more than available total stock, excess is marked out-of-stock.
- Fallback currently selects nearest city with stock for remaining quantity (single nearest fallback city per item).

---

## Project Structure

```
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
└── WORKFLOW.md
```

const destinationCitySelect = document.getElementById('destinationCity');
const searchProductInput = document.getElementById('searchProduct');
const categorySelect = document.getElementById('categorySelect');
const sortSelect = document.getElementById('sortSelect');
const itemsContainer = document.getElementById('itemsContainer');
const resultsCountElement = document.getElementById('resultsCount');
const themeToggleButton = document.getElementById('themeToggle');
const totalItemsElement = document.getElementById('totalItems');
const totalQuantityElement = document.getElementById('totalQuantity');
const arrivalTimeElement = document.getElementById('arrivalTime');
const itemsCostElement = document.getElementById('itemsCost');
const deliveryChargeElement = document.getElementById('deliveryCharge');
const totalCostElement = document.getElementById('totalCost');
const cartItemsListElement = document.getElementById('cartItemsList');
const resetOrderButton = document.getElementById('resetOrderBtn');

const quantityByItemId = new Map();
const fulfillmentByItemId = new Map();
let items = [];
let distanceMatrix = {};

// Helper function to get available quantity for a product across all cities
function getAvailableQuantity(item) {
  if (!item.quantitiesByCity) return 0;
  return Object.values(item.quantitiesByCity).reduce((sum, qty) => sum + parseNumber(qty), 0);
}

// Helper to parse numbers safely
function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function setTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  if (themeToggleButton) {
    themeToggleButton.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
  }
}

function initScrollButtons() {
  const scrollDownBtn = document.getElementById('scrollDownBtn');
  const scrollUpBtn = document.getElementById('scrollUpBtn');

  if (scrollDownBtn) {
    scrollDownBtn.addEventListener('click', () => {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth',
      });
    });
  }

  if (scrollUpBtn) {
    scrollUpBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    });
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
  setTheme(initialTheme);

  if (themeToggleButton) {
    themeToggleButton.addEventListener('click', () => {
      const currentTheme = document.body.getAttribute('data-theme') || 'light';
      setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });
  }
}

function getNearestPreview(item, destinationCity) {
  let nearest = null;

  for (const [sourceCity, rawPrice] of Object.entries(item.pricesByCity || {})) {
    const unitPrice = Number(rawPrice || 0);
    if (unitPrice <= 0) {
      continue;
    }

    const distance = Number(distanceMatrix?.[sourceCity]?.[destinationCity]);
    const candidateDistance = Number.isFinite(distance) && distance >= 0 ? distance : Number.MAX_SAFE_INTEGER;

    if (
      !nearest ||
      candidateDistance < nearest.distanceKm ||
      (candidateDistance === nearest.distanceKm && unitPrice < nearest.unitPrice)
    ) {
      nearest = {
        sourceCity,
        unitPrice,
        distanceKm: candidateDistance,
      };
    }
  }

  if (!nearest) {
    return { sourceCity: null, unitPrice: item.defaultPrice || 0, distanceKm: 0 };
  }

  return nearest;
}

function getDisplayPrice(item) {
  const quantity = quantityByItemId.get(item.itemId) || 0;
  const fulfillment = fulfillmentByItemId.get(item.itemId);

  if (quantity > 0 && fulfillment?.unitPrice > 0) {
    return fulfillment.unitPrice;
  }

  const preview = getNearestPreview(item, destinationCitySelect.value);
  return preview.unitPrice || item.defaultPrice || 0;
}

function currency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDeliveryTime(minutes) {
  if (!minutes || minutes <= 0) {
    return '--';
  }

  const now = new Date();
  const deliveryDate = new Date(now.getTime() + minutes * 60 * 1000);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isToday = deliveryDate.toDateString() === today.toDateString();
  const isTomorrow = deliveryDate.toDateString() === tomorrow.toDateString();

  const timeString = deliveryDate.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (isToday) {
    return `Today at ${timeString}`;
  } else if (isTomorrow) {
    return `Tomorrow at ${timeString}`;
  } else {
    const dateString = deliveryDate.toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
    });
    return `${dateString} at ${timeString}`;
  }
}

function renderCartItems() {
  if (!cartItemsListElement) {
    return;
  }

  const selectedItems = items
    .map((item) => ({
      item,
      quantity: quantityByItemId.get(item.itemId) || 0,
    }))
    .filter((entry) => entry.quantity > 0);

  cartItemsListElement.innerHTML = '';

  if (!selectedItems.length) {
    const empty = document.createElement('li');
    empty.className = 'cart-empty';
    empty.textContent = 'No items added';
    cartItemsListElement.appendChild(empty);
    return;
  }

  for (const entry of selectedItems) {
    const li = document.createElement('li');
    li.textContent = `${entry.item.productName} × ${entry.quantity}`;
    cartItemsListElement.appendChild(li);
  }
}

const CATEGORY_RULES = [
  {
    name: 'Hair Care',
    keywords: ['hair', 'shampoo', 'conditioner'],
  },
  {
    name: 'Personal Care',
    keywords: [
      'face',
      'body',
      'bathing',
      'soap',
      'deodorant',
      'toothpaste',
      'hand wash',
      'sanitizer',
      'lip',
      'beauty',
      'skin',
    ],
  },
  {
    name: 'Health & Wellness',
    keywords: ['ayurveda', 'capsule', 'supplement', 'immunity', 'vitamin', 'health', 'kwath'],
  },
  {
    name: 'Food & Grocery',
    keywords: ['masala', 'spice', 'snack', 'breakfast', 'nuts', 'seeds', 'tea', 'baked', 'grocery', 'cereal'],
  },
  {
    name: 'Home & Kitchen',
    keywords: ['glassware', 'container', 'bottle', 'kitchen', 'storage', 'wipe', 'clean'],
  },
  {
    name: 'Pet Care',
    keywords: ['pet'],
  },
];

function getItemCategory(item) {
  const categoryText = `${item.type || ''} ${item.productName || ''}`.toLowerCase();

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => categoryText.includes(keyword))) {
      return rule.name;
    }
  }

  return 'Others';
}

function createQuantityControls(itemId, maxQuantity, item) {
  const wrapper = document.createElement('div');
  wrapper.className = 'quantity-controls';

  const minusButton = document.createElement('button');
  minusButton.textContent = '-';
  minusButton.type = 'button';
  minusButton.addEventListener('click', () => {
    const current = quantityByItemId.get(itemId) || 0;
    if (current > 0) {
      quantityByItemId.set(itemId, current - 1);
      quantityInput.value = String(current - 1);
      renderItems();
      calculate();
    }
  });

  const quantityInput = document.createElement('input');
  quantityInput.type = 'number';
  quantityInput.className = 'quantity-input';
  quantityInput.value = String(quantityByItemId.get(itemId) || 0);
  quantityInput.min = '0';
  quantityInput.max = String(getAvailableQuantity(item));
  quantityInput.style.width = '60px';
  quantityInput.style.padding = '4px';
  quantityInput.style.textAlign = 'center';
  
  quantityInput.addEventListener('change', () => {
    let newQuantity = parseInt(quantityInput.value) || 0;
    const totalAvailable = getAvailableQuantity(item);
    
    if (newQuantity < 0) newQuantity = 0;
    if (newQuantity > totalAvailable) {
      alert(`Maximum ${totalAvailable} units available. Setting quantity to ${totalAvailable}.`);
      newQuantity = totalAvailable;
      quantityInput.value = String(newQuantity);
    }
    
    quantityByItemId.set(itemId, newQuantity);
    renderItems();
    calculate();
  });

  const addButton = document.createElement('button');
  addButton.textContent = '+';
  addButton.type = 'button';
  addButton.addEventListener('click', () => {
    const current = quantityByItemId.get(itemId) || 0;
    const totalAvailable = getAvailableQuantity(item);
    
    if (current < totalAvailable) {
      quantityByItemId.set(itemId, current + 1);
      quantityInput.value = String(current + 1);
      renderItems();
      calculate();
    } else {
      alert(`Out of stock. Maximum ${totalAvailable} units available across all cities.`);
    }
  });

  const availabilityHint = document.createElement('span');
  availabilityHint.className = 'stock-limit';
  const totalAvailable = getAvailableQuantity(item);
  
  if (totalAvailable === 0) {
    availabilityHint.textContent = '(Out of Stock)';
    availabilityHint.style.color = 'var(--error-color, #d32f2f)';
    addButton.disabled = true;
    quantityInput.disabled = true;
  } else if (maxQuantity > 0) {
    availabilityHint.textContent = `(${maxQuantity} in ${destinationCitySelect.value}, ${totalAvailable} total)`;
  } else {
    availabilityHint.textContent = `(${totalAvailable} in other cities)`;
    availabilityHint.style.color = 'var(--warning-color, #f57c00)';
  }
  
  availabilityHint.style.fontSize = '0.8em';
  availabilityHint.style.color = availabilityHint.style.color || 'var(--text-secondary)';
  availabilityHint.style.marginLeft = '8px';

  wrapper.append(minusButton, quantityInput, addButton, availabilityHint);
  return wrapper;
}

function renderItems() {
  itemsContainer.innerHTML = '';
  const searchTerm = (searchProductInput.value || '').trim().toLowerCase();
  const selectedCategory = categorySelect.value || 'All';
  const sortBy = sortSelect.value || 'default';

  let filteredItems = items.filter((item) => {
    const matchesSearch = !searchTerm || 
      item.productName.toLowerCase().includes(searchTerm) ||
      (item.brand && item.brand.toLowerCase().includes(searchTerm)) ||
      (item.type && item.type.toLowerCase().includes(searchTerm));
    const matchesCategory = selectedCategory === 'All' || getItemCategory(item) === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Sort items
  if (sortBy === 'price-low') {
    filteredItems.sort((a, b) => getDisplayPrice(a) - getDisplayPrice(b));
  } else if (sortBy === 'price-high') {
    filteredItems.sort((a, b) => getDisplayPrice(b) - getDisplayPrice(a));
  } else if (sortBy === 'rating-high') {
    filteredItems.sort((a, b) => b.rating - a.rating);
  } else if (sortBy === 'rating-low') {
    filteredItems.sort((a, b) => a.rating - b.rating);
  } else if (sortBy === 'distance') {
    filteredItems.sort((a, b) => {
      const previewA = getNearestPreview(a, destinationCitySelect.value);
      const previewB = getNearestPreview(b, destinationCitySelect.value);
      return previewA.distanceKm - previewB.distanceKm;
    });
  }
  // 'default' keeps the original order (by itemId)

  if (resultsCountElement) {
    const label = filteredItems.length === 1 ? 'item' : 'items';
    resultsCountElement.textContent = `${filteredItems.length} ${label}`;
  }

  for (const item of filteredItems) {
    const card = document.createElement('article');
    const quantity = quantityByItemId.get(item.itemId) || 0;
    card.className = quantity > 0 ? 'item-card item-card-selected' : 'item-card';
    card.title = `Brand: ${item.brand || 'Unknown'}\nDescription: ${item.description || 'No description available.'}`;

    const title = document.createElement('h3');
    title.textContent = item.productName;

    const brand = document.createElement('p');
    brand.className = 'brand';
    brand.textContent = `Brand: ${item.brand || 'Unknown'}`;
 const description = document.createElement('p');
    description.className = 'description';
    description.textContent = item.description;

    const rating = document.createElement('p');
    rating.className = 'rating';
    rating.textContent = `Rating: ${item.rating}`;

    const price = document.createElement('p');
    price.className = 'price';
    price.textContent = `Unit Price: ${currency(getDisplayPrice(item))}`;

    const fulfillment = fulfillmentByItemId.get(item.itemId);
    const preview = getNearestPreview(item, destinationCitySelect.value);
    const fulfillmentText = document.createElement('p');
    fulfillmentText.className = 'fulfillment';
    if (quantity > 0) {
      fulfillmentText.textContent = `Fulfilled From: ${fulfillment?.sourceCity || 'Pending'}`;
    } else {
      fulfillmentText.textContent = `Nearest Source: ${preview.sourceCity || '--'}`;
    }

    const selectedCity = destinationCitySelect.value;
    const maxQuantity = item.quantitiesByCity?.[selectedCity] || 0;
    card.append(title, brand, description, rating, price, fulfillmentText, createQuantityControls(item.itemId, maxQuantity, item));
    itemsContainer.appendChild(card);
  }

  renderCartItems();
}

function fillCategories(itemsList) {
  categorySelect.innerHTML = '';

  const allOption = document.createElement('option');
  allOption.value = 'All';
  allOption.textContent = 'All Categories';
  categorySelect.appendChild(allOption);

  const categories = [...new Set(itemsList.map((item) => getItemCategory(item)))].sort((a, b) => a.localeCompare(b));

  for (const category of categories) {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    categorySelect.appendChild(option);
  }

  categorySelect.value = 'All';
  categorySelect.addEventListener('change', () => {
    renderItems();
  });
}

function initSortSelect() {
  sortSelect.value = 'default';
  sortSelect.addEventListener('change', () => {
    renderItems();
  });
}

async function calculate() {
  const orderItems = items
    .map((item) => ({
      itemId: item.itemId,
      quantity: quantityByItemId.get(item.itemId) || 0,
    }))
    .filter((entry) => entry.quantity > 0);

  if (totalItemsElement) {
    totalItemsElement.textContent = String(orderItems.length);
  }

  const response = await fetch('/api/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      destinationCity: destinationCitySelect.value,
      orderItems,
    }),
  });

  const result = await response.json();
  fulfillmentByItemId.clear();
  for (const detail of result.fulfillmentDetails || []) {
    fulfillmentByItemId.set(detail.itemId, detail);
  }

  totalQuantityElement.textContent = String(result.totalQuantity || 0);
  const minutes = Number(result.arrivalMinutes || 0);
  arrivalTimeElement.textContent = formatDeliveryTime(minutes);
  itemsCostElement.textContent = currency(result.itemsCost || 0);
  deliveryChargeElement.textContent = currency(result.deliveryCharge || 0);
  totalCostElement.textContent = currency(result.totalCost || 0);
  renderItems();
}

function fillCities(cities) {
  for (const city of cities) {
    const destinationOption = document.createElement('option');
    destinationOption.value = city;
    destinationOption.textContent = city;

    destinationCitySelect.appendChild(destinationOption);
  }

  destinationCitySelect.value = 'Mumbai';
  destinationCitySelect.addEventListener('change', () => {
    renderItems();
    calculate();
  });
}

function resetOrder() {
  for (const item of items) {
    quantityByItemId.set(item.itemId, 0);
  }

  fulfillmentByItemId.clear();
  renderItems();
  calculate();
}

async function init() {
  initTheme();
  initScrollButtons();

  const response = await fetch('/api/options');
  const data = await response.json();

  items = data.items;
  distanceMatrix = data.distanceMatrix || {};
  fillCities(data.cities);
  fillCategories(items);
  initSortSelect();

  for (const item of items) {
    quantityByItemId.set(item.itemId, 0);
  }

  searchProductInput.addEventListener('input', () => {
    renderItems();
  });

  if (resetOrderButton) {
    resetOrderButton.addEventListener('click', () => {
      resetOrder();
    });
  }

  renderItems();
  calculate();
}

init();

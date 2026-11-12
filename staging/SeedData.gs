/* STAGING ONLY — 100% FAKE TEST DATA and FAKE TEST EXCHANGE RATES. Never use in production. */
var SEED = {
 "aed_per_usd": 3,
 "usd_slsh": 10000,
 "staff": [
  [
   "U-001",
   "Test Owner",
   "owner.test",
   "owner"
  ],
  [
   "U-002",
   "Test Manager",
   "manager.test",
   "manager"
  ],
  [
   "U-003",
   "Test Employee",
   "employee.test",
   "employee"
  ]
 ],
 "items": [
  {
   "product_id": "ANE-LCD-001",
   "sku": "ANE-LCD-001",
   "supplier_item_name": "iPhone 11 INCELL",
   "category": "iPhone LCD",
   "variant_tag": "INCELL",
   "model_derived": "iPhone 11",
   "unit_cost_aed": 18,
   "selling_price_usd": 14,
   "source_qty": 10
  },
  {
   "product_id": "ANE-LCD-002",
   "sku": "ANE-LCD-002",
   "supplier_item_name": "iPhone 12 OLED",
   "category": "iPhone LCD",
   "variant_tag": "OLED",
   "model_derived": "iPhone 12",
   "unit_cost_aed": 42,
   "selling_price_usd": 26,
   "source_qty": 13
  },
  {
   "product_id": "ANE-LCD-003",
   "sku": "ANE-LCD-003",
   "supplier_item_name": "iPhone 13 OLED",
   "category": "iPhone LCD",
   "variant_tag": "OLED",
   "model_derived": "iPhone 13",
   "unit_cost_aed": 55,
   "selling_price_usd": 32.5,
   "source_qty": 16
  },
  {
   "product_id": "ANE-LCD-004",
   "sku": "ANE-LCD-004",
   "supplier_item_name": "iPhone X INCELL",
   "category": "iPhone LCD",
   "variant_tag": "INCELL",
   "model_derived": "iPhone X",
   "unit_cost_aed": 20,
   "selling_price_usd": 15,
   "source_qty": 19
  },
  {
   "product_id": "ANE-SAM-001",
   "sku": "ANE-SAM-001",
   "supplier_item_name": "Samsung A12 LCD",
   "category": "Samsung LCD",
   "variant_tag": "LCD",
   "model_derived": "Samsung A12",
   "unit_cost_aed": 9,
   "selling_price_usd": 9.5,
   "source_qty": 22
  },
  {
   "product_id": "ANE-SAM-002",
   "sku": "ANE-SAM-002",
   "supplier_item_name": "Samsung A32 OLED",
   "category": "Samsung LCD",
   "variant_tag": "OLED",
   "model_derived": "Samsung A32",
   "unit_cost_aed": 24,
   "selling_price_usd": 17,
   "source_qty": 25
  },
  {
   "product_id": "ANE-SAM-003",
   "sku": "ANE-SAM-003",
   "supplier_item_name": "Samsung S21 OLED",
   "category": "Samsung LCD",
   "variant_tag": "OLED",
   "model_derived": "Samsung S21",
   "unit_cost_aed": 70,
   "selling_price_usd": 40,
   "source_qty": 28
  },
  {
   "product_id": "ANE-BAT-001",
   "sku": "ANE-BAT-001",
   "supplier_item_name": "iPhone 11 Battery",
   "category": "Battery",
   "variant_tag": "Battery",
   "model_derived": "iPhone 11",
   "unit_cost_aed": 6,
   "selling_price_usd": 8,
   "source_qty": 31
  },
  {
   "product_id": "ANE-BAT-002",
   "sku": "ANE-BAT-002",
   "supplier_item_name": "iPhone 12 Battery",
   "category": "Battery",
   "variant_tag": "Battery",
   "model_derived": "iPhone 12",
   "unit_cost_aed": 8,
   "selling_price_usd": 9,
   "source_qty": 34
  },
  {
   "product_id": "ANE-BAT-003",
   "sku": "ANE-BAT-003",
   "supplier_item_name": "Samsung A12 Battery",
   "category": "Battery",
   "variant_tag": "Battery",
   "model_derived": "Samsung A12",
   "unit_cost_aed": 5,
   "selling_price_usd": 7.5,
   "source_qty": 12
  },
  {
   "product_id": "ANE-BCK-001",
   "sku": "ANE-BCK-001",
   "supplier_item_name": "iPhone 12 Glass",
   "category": "Back cover",
   "variant_tag": "Glass",
   "model_derived": "iPhone 12",
   "unit_cost_aed": 7,
   "selling_price_usd": 8.5,
   "source_qty": 15
  },
  {
   "product_id": "ANE-BCK-002",
   "sku": "ANE-BCK-002",
   "supplier_item_name": "Samsung A32 Glass",
   "category": "Back cover",
   "variant_tag": "Glass",
   "model_derived": "Samsung A32",
   "unit_cost_aed": 5,
   "selling_price_usd": 7.5,
   "source_qty": 18
  },
  {
   "product_id": "ANE-FLX-001",
   "sku": "ANE-FLX-001",
   "supplier_item_name": "iPhone 11 Charging flex",
   "category": "Flex cable",
   "variant_tag": "Charging flex",
   "model_derived": "iPhone 11",
   "unit_cost_aed": 3,
   "selling_price_usd": 6.5,
   "source_qty": 21
  },
  {
   "product_id": "ANE-FLX-002",
   "sku": "ANE-FLX-002",
   "supplier_item_name": "Samsung A12 Charging flex",
   "category": "Flex cable",
   "variant_tag": "Charging flex",
   "model_derived": "Samsung A12",
   "unit_cost_aed": 2,
   "selling_price_usd": 6,
   "source_qty": 24
  }
 ],
 "branches": {
  "1": {
   "name": "Test Branch 1",
   "cycle": "DAILY",
   "tech": [
    "Test Technician 1A",
    "Test Technician 1B"
   ],
   "asst": [
    "Test Assistant 1"
   ]
  },
  "2": {
   "name": "Test Branch 2",
   "cycle": "DAILY",
   "tech": [
    "Test Technician 2A",
    "Test Technician 2B"
   ],
   "asst": [
    "Test Assistant 2"
   ]
  },
  "3": {
   "name": "Test Branch 3",
   "cycle": "DAILY",
   "tech": [
    "Test Technician 3A",
    "Test Technician 3B"
   ],
   "asst": [
    "Test Assistant 3"
   ]
  },
  "4": {
   "name": "Test Branch 4",
   "cycle": "WEEKLY",
   "tech": [
    "Test Technician 4A",
    "Test Technician 4B"
   ],
   "asst": [
    "Test Assistant 4"
   ]
  }
 }
};

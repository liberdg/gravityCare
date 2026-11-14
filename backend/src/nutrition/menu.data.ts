/**
 * Fictional onboard menu.
 * Nutrient numbers are demonstration estimates so the prototype can plan meals.
 * They are not laboratory assays of real spaceflight food.
 */
export interface DemoFood {
  code: string;
  nameEn: string;
  nameFr: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  calciumMg: number;
  vitaminDIu: number;
  ironMg: number;
  vitaminB12Ug: number;
  folateUg: number;
  magnesiumMg: number;
  waterMl: number;
  allergens: string[];
  tags: string[];
  prep: 'READY' | 'HEAT' | 'REHYDRATE';
  portionLabel: string;
}

export const DEMO_FOODS: DemoFood[] = [
  { code: 'shrimp-cocktail', nameEn: 'Shrimp cocktail', nameFr: 'Cocktail de crevettes', kcal: 120, proteinG: 18, carbsG: 4, fatG: 2, calciumMg: 40, vitaminDIu: 0, ironMg: 1.2, vitaminB12Ug: 1.1, folateUg: 8, magnesiumMg: 30, waterMl: 80, allergens: [], tags: ['protein', 'rehydrate'], prep: 'REHYDRATE', portionLabel: '1 pouch' },
  { code: 'tortilla', nameEn: 'Flour tortilla', nameFr: 'Tortilla de blé', kcal: 190, proteinG: 5, carbsG: 32, fatG: 5, calciumMg: 40, vitaminDIu: 0, ironMg: 1.6, vitaminB12Ug: 0, folateUg: 50, magnesiumMg: 15, waterMl: 0, allergens: ['gluten'], tags: ['carb'], prep: 'READY', portionLabel: '1 tortilla' },
  { code: 'mac-cheese', nameEn: 'Macaroni and cheese', nameFr: 'Macaroni au fromage', kcal: 320, proteinG: 12, carbsG: 40, fatG: 12, calciumMg: 180, vitaminDIu: 20, ironMg: 1.4, vitaminB12Ug: 0.4, folateUg: 30, magnesiumMg: 25, waterMl: 0, allergens: ['gluten', 'milk'], tags: ['dairy', 'carb'], prep: 'HEAT', portionLabel: '1 pouch' },
  { code: 'grilled-chicken', nameEn: 'Grilled chicken', nameFr: 'Poulet grillé', kcal: 210, proteinG: 32, carbsG: 2, fatG: 7, calciumMg: 15, vitaminDIu: 5, ironMg: 0.9, vitaminB12Ug: 0.3, folateUg: 6, magnesiumMg: 28, waterMl: 0, allergens: [], tags: ['protein'], prep: 'HEAT', portionLabel: '1 pouch' },
  { code: 'salmon', nameEn: 'Salmon', nameFr: 'Saumon', kcal: 250, proteinG: 26, carbsG: 0, fatG: 16, calciumMg: 20, vitaminDIu: 350, ironMg: 0.5, vitaminB12Ug: 3.2, folateUg: 8, magnesiumMg: 30, waterMl: 0, allergens: ['fish'], tags: ['protein', 'vitamin-d'], prep: 'HEAT', portionLabel: '1 pouch' },
  { code: 'oatmeal', nameEn: 'Oatmeal', nameFr: 'Flocons d’avoine', kcal: 160, proteinG: 6, carbsG: 27, fatG: 3, calciumMg: 20, vitaminDIu: 0, ironMg: 1.5, vitaminB12Ug: 0, folateUg: 20, magnesiumMg: 40, waterMl: 120, allergens: ['gluten'], tags: ['breakfast', 'carb'], prep: 'REHYDRATE', portionLabel: '1 bowl' },
  { code: 'scrambled-eggs', nameEn: 'Scrambled eggs', nameFr: 'Œufs brouillés', kcal: 180, proteinG: 13, carbsG: 2, fatG: 13, calciumMg: 50, vitaminDIu: 40, ironMg: 1.2, vitaminB12Ug: 0.8, folateUg: 30, magnesiumMg: 12, waterMl: 0, allergens: ['egg'], tags: ['protein', 'breakfast'], prep: 'REHYDRATE', portionLabel: '1 pouch' },
  { code: 'yogurt', nameEn: 'Fruit yogurt', nameFr: 'Yaourt aux fruits', kcal: 150, proteinG: 8, carbsG: 22, fatG: 3, calciumMg: 220, vitaminDIu: 40, ironMg: 0.1, vitaminB12Ug: 0.5, folateUg: 12, magnesiumMg: 18, waterMl: 0, allergens: ['milk'], tags: ['dairy', 'calcium', 'breakfast'], prep: 'READY', portionLabel: '1 cup' },
  { code: 'peanut-butter', nameEn: 'Peanut butter', nameFr: 'Beurre d’arachide', kcal: 190, proteinG: 8, carbsG: 6, fatG: 16, calciumMg: 15, vitaminDIu: 0, ironMg: 0.6, vitaminB12Ug: 0, folateUg: 24, magnesiumMg: 50, waterMl: 0, allergens: ['peanut'], tags: ['fat', 'snack'], prep: 'READY', portionLabel: '2 tbsp' },
  { code: 'trail-mix', nameEn: 'Trail mix', nameFr: 'Mélange de fruits secs', kcal: 220, proteinG: 6, carbsG: 22, fatG: 13, calciumMg: 30, vitaminDIu: 0, ironMg: 1.1, vitaminB12Ug: 0, folateUg: 15, magnesiumMg: 45, waterMl: 0, allergens: ['tree-nut'], tags: ['snack'], prep: 'READY', portionLabel: '1 bag' },
  { code: 'almonds', nameEn: 'Almonds', nameFr: 'Amandes', kcal: 170, proteinG: 6, carbsG: 6, fatG: 15, calciumMg: 75, vitaminDIu: 0, ironMg: 1.0, vitaminB12Ug: 0, folateUg: 12, magnesiumMg: 80, waterMl: 0, allergens: ['tree-nut'], tags: ['snack', 'magnesium', 'calcium'], prep: 'READY', portionLabel: '30 g' },
  { code: 'beef-stew', nameEn: 'Beef stew', nameFr: 'Ragoût de bœuf', kcal: 280, proteinG: 22, carbsG: 18, fatG: 12, calciumMg: 30, vitaminDIu: 8, ironMg: 2.8, vitaminB12Ug: 1.8, folateUg: 18, magnesiumMg: 28, waterMl: 0, allergens: [], tags: ['protein', 'iron'], prep: 'HEAT', portionLabel: '1 pouch' },
  { code: 'rice-beans', nameEn: 'Rice and beans', nameFr: 'Riz et haricots', kcal: 300, proteinG: 12, carbsG: 48, fatG: 6, calciumMg: 40, vitaminDIu: 0, ironMg: 2.2, vitaminB12Ug: 0, folateUg: 80, magnesiumMg: 45, waterMl: 0, allergens: [], tags: ['carb', 'folate'], prep: 'HEAT', portionLabel: '1 pouch' },
  { code: 'fruit-cocktail', nameEn: 'Fruit cocktail', nameFr: 'Cocktail de fruits', kcal: 90, proteinG: 1, carbsG: 22, fatG: 0, calciumMg: 15, vitaminDIu: 0, ironMg: 0.3, vitaminB12Ug: 0, folateUg: 10, magnesiumMg: 10, waterMl: 40, allergens: [], tags: ['snack'], prep: 'READY', portionLabel: '1 cup' },
  { code: 'orange-drink', nameEn: 'Orange-mango drink', nameFr: 'Boisson orange-mangue', kcal: 80, proteinG: 0, carbsG: 20, fatG: 0, calciumMg: 10, vitaminDIu: 0, ironMg: 0.1, vitaminB12Ug: 0, folateUg: 15, magnesiumMg: 8, waterMl: 200, allergens: [], tags: ['drink', 'hydration'], prep: 'REHYDRATE', portionLabel: '250 ml' },
  { code: 'calcium-beverage', nameEn: 'Calcium-fortified drink', nameFr: 'Boisson enrichie en calcium', kcal: 60, proteinG: 1, carbsG: 12, fatG: 0, calciumMg: 300, vitaminDIu: 100, ironMg: 0, vitaminB12Ug: 0.6, folateUg: 40, magnesiumMg: 20, waterMl: 200, allergens: [], tags: ['drink', 'calcium', 'vitamin-d', 'hydration'], prep: 'REHYDRATE', portionLabel: '250 ml' },
  { code: 'creamed-spinach', nameEn: 'Creamed spinach', nameFr: 'Épinards à la crème', kcal: 90, proteinG: 4, carbsG: 8, fatG: 4, calciumMg: 140, vitaminDIu: 0, ironMg: 1.6, vitaminB12Ug: 0.1, folateUg: 70, magnesiumMg: 40, waterMl: 0, allergens: ['milk'], tags: ['vegetable', 'folate', 'calcium', 'dairy'], prep: 'HEAT', portionLabel: '1 pouch' },
  { code: 'quinoa-veg', nameEn: 'Quinoa and vegetables', nameFr: 'Quinoa et légumes', kcal: 240, proteinG: 9, carbsG: 38, fatG: 6, calciumMg: 35, vitaminDIu: 0, ironMg: 2.0, vitaminB12Ug: 0, folateUg: 45, magnesiumMg: 60, waterMl: 0, allergens: [], tags: ['carb', 'magnesium'], prep: 'HEAT', portionLabel: '1 pouch' }
];

export const FOOD_ESTIMATE_NOTE =
  'Food composition figures are demonstration estimates for a fictional menu. They are not laboratory values of flown foods.';

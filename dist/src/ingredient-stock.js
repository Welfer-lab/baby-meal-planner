export function getIngredientQuantity(ingredient) {
  return ingredient?.quantity ?? 1;
}

export function getIngredientUsed(ingredient) {
  return ingredient?.used ?? 0;
}

export function getIngredientRemaining(ingredient) {
  return Math.max(0, getIngredientQuantity(ingredient) - getIngredientUsed(ingredient));
}

export function getIngredientStockStatus(ingredient) {
  if (!ingredient) return "missing";

  if (getIngredientRemaining(ingredient) <= 0) {
    return "missing";
  }

  if (ingredient.stockStatus === "low" || ingredient.stockStatus === "missing") {
    return ingredient.stockStatus;
  }

  return "in-stock";
}

export function isIngredientAvailable(ingredient) {
  return getIngredientStockStatus(ingredient) !== "missing";
}

export function needsIngredientRestock(ingredient) {
  return getIngredientStockStatus(ingredient) !== "in-stock";
}

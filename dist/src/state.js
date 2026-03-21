import { getIngredientStockStatus } from "./ingredient-stock.js";

const mealSlotLabels = {
  lunch: "午餐",
  dinner: "晚餐",
};

const seedIngredients = [
  {
    id: "rice",
    name: "胚芽米",
    category: "主食",
    acceptedLabel: "爱吃",
    note: "煮软一些，和蔬菜一起打散更好吞咽。",
    stockStatus: "in-stock",
  },
  {
    id: "oat",
    name: "燕麦",
    category: "主食",
    acceptedLabel: "正常",
    note: "晚餐少量搭配，帮助口感更顺滑。",
    stockStatus: "in-stock",
  },
  {
    id: "millet",
    name: "小米",
    category: "主食",
    acceptedLabel: "爱吃",
    note: "适合搭配豆腐和青菜。",
    stockStatus: "in-stock",
  },
  {
    id: "noodle",
    name: "宝宝面",
    category: "主食",
    acceptedLabel: "爱吃",
    note: "剪短后更方便抓握和吞咽。",
    stockStatus: "in-stock",
  },
  {
    id: "quinoa",
    name: "藜麦",
    category: "主食",
    acceptedLabel: "正常",
    note: "第一次不要放太多，和米饭混合更容易接受。",
    stockStatus: "in-stock",
  },
  {
    id: "chicken",
    name: "鸡腿肉",
    category: "蛋白质",
    acceptedLabel: "爱吃",
    note: "剁碎蒸熟，保留一点汁水。",
    stockStatus: "in-stock",
  },
  {
    id: "salmon",
    name: "三文鱼",
    category: "蛋白质",
    acceptedLabel: "爱吃",
    note: "刺一定检查干净。",
    stockStatus: "in-stock",
  },
  {
    id: "beef",
    name: "牛肉",
    category: "蛋白质",
    acceptedLabel: "正常",
    note: "焯水后再炖煮更好嚼。",
    stockStatus: "in-stock",
  },
  {
    id: "tofu",
    name: "嫩豆腐",
    category: "蛋白质",
    acceptedLabel: "爱吃",
    note: "适合做软烩饭。",
    stockStatus: "in-stock",
  },
  {
    id: "shrimp",
    name: "虾仁",
    category: "蛋白质",
    acceptedLabel: "正常",
    note: "已尝试过，继续少量观察。",
    stockStatus: "in-stock",
  },
  {
    id: "cod",
    name: "鳕鱼",
    category: "蛋白质",
    acceptedLabel: "爱吃",
    note: "蒸熟后碾碎，口感软。",
    stockStatus: "in-stock",
  },
  {
    id: "broccoli",
    name: "西兰花",
    category: "蔬菜",
    acceptedLabel: "正常",
    note: "焯软后切碎。",
    stockStatus: "in-stock",
  },
  {
    id: "pumpkin",
    name: "南瓜",
    category: "蔬菜",
    acceptedLabel: "爱吃",
    note: "甜口好接受，和鱼肉很搭。",
    stockStatus: "in-stock",
  },
  {
    id: "cabbage",
    name: "卷心菜",
    category: "蔬菜",
    acceptedLabel: "正常",
    note: "切细丝再煮软。",
    stockStatus: "in-stock",
  },
  {
    id: "spinach",
    name: "菠菜",
    category: "蔬菜",
    acceptedLabel: "正常",
    note: "焯水后再切碎，减少涩味。",
    stockStatus: "in-stock",
  },
  {
    id: "corn",
    name: "玉米",
    category: "蔬菜",
    acceptedLabel: "爱吃",
    note: "打碎一些更好吞咽。",
    stockStatus: "in-stock",
  },
  {
    id: "carrot",
    name: "胡萝卜",
    category: "蔬菜",
    acceptedLabel: "爱吃",
    note: "蒸软后切丁更安全。",
    stockStatus: "in-stock",
  },
];

const seedRecipes = [
  {
    id: "chicken-broccoli-rice",
    name: "鸡肉西兰花胚芽饭",
    stageLabel: "9-12个月",
    slots: ["lunch"],
    ingredientIds: ["chicken", "broccoli", "rice"],
  },
  {
    id: "salmon-pumpkin-oat",
    name: "三文鱼南瓜燕麦糊",
    stageLabel: "9-12个月",
    slots: ["dinner"],
    ingredientIds: ["salmon", "pumpkin", "oat"],
  },
  {
    id: "beef-cabbage-rice",
    name: "牛肉卷心菜米糊",
    stageLabel: "9-12个月",
    slots: ["lunch"],
    ingredientIds: ["beef", "cabbage", "rice"],
  },
  {
    id: "tofu-spinach-millet",
    name: "豆腐菠菜小米羹",
    stageLabel: "9-12个月",
    slots: ["dinner"],
    ingredientIds: ["tofu", "spinach", "millet"],
  },
  {
    id: "shrimp-corn-noodle",
    name: "虾仁玉米碎面",
    stageLabel: "9-12个月",
    slots: ["lunch"],
    ingredientIds: ["shrimp", "corn", "noodle"],
  },
  {
    id: "cod-carrot-quinoa",
    name: "鳕鱼胡萝卜藜麦泥",
    stageLabel: "9-12个月",
    slots: ["dinner"],
    ingredientIds: ["cod", "carrot", "quinoa"],
  },
];

function cloneState(state) {
  return structuredClone(state);
}

function createPlan(date, lunchRecipeId, dinnerRecipeId) {
  return {
    date,
    meals: [
      {
        slot: "lunch",
        recipeId: lunchRecipeId,
        completed: false,
        note: "",
      },
      {
        slot: "dinner",
        recipeId: dinnerRecipeId,
        completed: false,
        note: "",
      },
    ],
  };
}

const planTemplates = [
  ["chicken-broccoli-rice", "salmon-pumpkin-oat"],
  ["beef-cabbage-rice", "tofu-spinach-millet"],
  ["shrimp-corn-noodle", "cod-carrot-quinoa"],
];

function addDays(dateString, amount) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function getDayNumber(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function createAutoPlan(dateString) {
  const template = planTemplates[getDayNumber(dateString) % planTemplates.length];
  return createPlan(dateString, template[0], template[1]);
}

function getRecipeMap(state) {
  return new Map(state.recipes.map((recipe) => [recipe.id, recipe]));
}

function getIngredientMap(state) {
  return new Map(state.ingredients.map((ingredient) => [ingredient.id, ingredient]));
}

export function createSeedState(baseDate = new Date().toISOString().slice(0, 10)) {
  return {
    profile: {
      babyName: "小橙汁",
      stageLabel: "9-12个月",
      defaultMeals: ["lunch", "dinner"],
      homeTitle: "小橙汁开饭啦",
      familyNote: "今天吃什么，明天长什么",
    },
    ingredients: cloneState(seedIngredients),
    recipes: cloneState(seedRecipes),
    plans: [
      createPlan(baseDate, "chicken-broccoli-rice", "salmon-pumpkin-oat"),
      createPlan(addDays(baseDate, 1), "beef-cabbage-rice", "tofu-spinach-millet"),
      createPlan(addDays(baseDate, 2), "shrimp-corn-noodle", "cod-carrot-quinoa"),
    ],
    shoppingChecks: {},
  };
}

export function getPlan(state, date) {
  return state.plans.find((plan) => plan.date === date) ?? null;
}

export function getMealPlan(state, date, slot) {
  return getPlan(state, date)?.meals.find((meal) => meal.slot === slot) ?? null;
}

export function replaceMealRecipe(state, date, slot, recipeId) {
  let nextState = cloneState(state);
  const plan = getPlan(nextState, date);

  if (!plan) {
    return state;
  }

  const meal = plan.meals.find((item) => item.slot === slot);
  if (!meal) {
    return state;
  }

  // 释放旧菜谱的预留（仅未完成的餐次才有预留）
  if (meal.recipeId && !meal.completed) {
    const oldRecipe = nextState.recipes.find((r) => r.id === meal.recipeId);
    if (oldRecipe?.ingredientIds) {
      nextState = releaseIngredients(nextState, oldRecipe.ingredientIds);
    }
  }

  meal.recipeId = recipeId;
  meal.completed = false;

  // 预留新菜谱的食材
  if (recipeId) {
    const newRecipe = nextState.recipes.find((r) => r.id === recipeId);
    if (newRecipe?.ingredientIds) {
      nextState = reserveIngredients(nextState, newRecipe.ingredientIds);
      // 更新 plan 引用（reserveIngredients 做了 cloneState）
      const updatedPlan = getPlan(nextState, date);
      const updatedMeal = updatedPlan?.meals.find((m) => m.slot === slot);
      if (updatedMeal) {
        updatedMeal.recipeId = recipeId;
        updatedMeal.completed = false;
      }
    }
  }

  return nextState;
}

export function toggleMealCompleted(state, date, slot) {
  const nextState = cloneState(state);
  const meal = getMealPlan(nextState, date, slot);

  if (!meal) {
    return state;
  }

  meal.completed = !meal.completed;
  return nextState;
}

export function updateMealNote(state, date, slot, note) {
  const nextState = cloneState(state);
  const meal = getMealPlan(nextState, date, slot);

  if (!meal) {
    return state;
  }

  meal.note = note;
  return nextState;
}

export function updateIngredientStock(state, ingredientId, stockStatus) {
  const nextState = cloneState(state);
  const ingredient = nextState.ingredients.find((item) => item.id === ingredientId);

  if (!ingredient) {
    return state;
  }

  ingredient.stockStatus = stockStatus;
  return nextState;
}

export function useIngredient(state, ingredientId) {
  const nextState = cloneState(state);
  const ingredient = nextState.ingredients.find((item) => item.id === ingredientId);
  if (!ingredient) return state;
  const used = ingredient.used ?? 0;
  const quantity = ingredient.quantity ?? 1;
  if (used >= quantity) return state;
  ingredient.used = used + 1;
  return nextState;
}

export function reserveIngredients(state, ingredientIds) {
  const nextState = cloneState(state);
  for (const ingredientId of ingredientIds) {
    const ingredient = nextState.ingredients.find((item) => item.id === ingredientId);
    if (!ingredient) continue;
    ingredient.reserved = (ingredient.reserved ?? 0) + 1;
  }
  return nextState;
}

export function releaseIngredients(state, ingredientIds) {
  const nextState = cloneState(state);
  for (const ingredientId of ingredientIds) {
    const ingredient = nextState.ingredients.find((item) => item.id === ingredientId);
    if (!ingredient) continue;
    ingredient.reserved = Math.max(0, (ingredient.reserved ?? 0) - 1);
  }
  return nextState;
}

export function resetIngredient(state, ingredientId, quantity) {
  const nextState = cloneState(state);
  const ingredient = nextState.ingredients.find((item) => item.id === ingredientId);
  if (!ingredient) return state;
  ingredient.used = 0;
  if (quantity !== undefined) ingredient.quantity = quantity;
  return nextState;
}

export function addIngredient(state, ingredient) {
  const nextState = cloneState(state);
  nextState.ingredients.push(ingredient);
  return nextState;
}

export function deleteIngredient(state, ingredientId) {
  const nextState = cloneState(state);
  nextState.ingredients = nextState.ingredients.filter((i) => i.id !== ingredientId);
  nextState.recipes = nextState.recipes.map((recipe) => ({
    ...recipe,
    ingredientIds: recipe.ingredientIds.filter((id) => id !== ingredientId),
  }));
  if (ingredientId in nextState.shoppingChecks) {
    delete nextState.shoppingChecks[ingredientId];
  }
  return nextState;
}

export function addRecipe(state, recipe) {
  const nextState = cloneState(state);
  nextState.recipes.push(recipe);
  return nextState;
}

export function deleteRecipe(state, recipeId) {
  const nextState = cloneState(state);
  nextState.recipes = nextState.recipes.filter((r) => r.id !== recipeId);
  return nextState;
}

export function updateRecipeIngredients(state, recipeId, ingredientIds) {
  const nextState = cloneState(state);
  const recipe = nextState.recipes.find((r) => r.id === recipeId);
  if (!recipe) return state;
  recipe.ingredientIds = ingredientIds;
  return nextState;
}

export function updateProfile(state, patch) {
  return {
    ...cloneState(state),
    profile: {
      ...state.profile,
      ...patch,
    },
  };
}

export function ensurePlanWindow(state, currentDate) {
  const nextState = cloneState(state);
  const existingDates = new Set(nextState.plans.map((plan) => plan.date));

  for (let index = 0; index < 3; index += 1) {
    const date = addDays(currentDate, index);
    if (!existingDates.has(date)) {
      nextState.plans.push(createAutoPlan(date));
    }
  }

  nextState.plans.sort((left, right) => left.date.localeCompare(right.date));
  return nextState;
}

export function getUpcomingPlans(state, fromDate, days = 3) {
  const endDate = addDays(fromDate, days - 1);
  return state.plans.filter((plan) => plan.date >= fromDate && plan.date <= endDate);
}

function getCompletedHistoryDays(state, currentDate, days) {
  const recipeMap = getRecipeMap(state);
  const startDate = addDays(currentDate, -(days - 1));

  return state.plans
    .filter((plan) => plan.date >= startDate && plan.date <= currentDate && plan.meals.some((meal) => meal.completed))
    .map((plan) => ({
      date: plan.date,
      meals: plan.meals.map((meal) => ({
        ...meal,
        slotLabel: mealSlotLabels[meal.slot],
        recipe: recipeMap.get(meal.recipeId),
      })),
    }))
    .sort((left, right) => right.date.localeCompare(left.date));
}

export function getHistoryDays(state, currentDate) {
  return getCompletedHistoryDays(state, currentDate, 5);
}

export function buildIngredientHistory(state, currentDate) {
  const historyMap = new Map();
  const recipeMap = getRecipeMap(state);
  const ingredientMap = getIngredientMap(state);

  getHistoryDays(state, currentDate).forEach((day) => {
    day.meals.forEach((meal) => {
      if (!meal.recipe) return;
      meal.recipe.ingredientIds.forEach((ingredientId) => {
        const ingredient = ingredientMap.get(ingredientId);
        if (!ingredient) return;
        if (!historyMap.has(ingredientId)) {
          historyMap.set(ingredientId, {
            ...ingredient,
            lastSeenOn: day.date,
            seenInRecipe: meal.recipe.name,
          });
        }
      });
    });
  });

  return Array.from(historyMap.values());
}

function buildIngredientStats(state, currentDate) {
  const ingredientMap = getIngredientMap(state);
  const counts = new Map();

  getCompletedHistoryDays(state, currentDate, 7).forEach((day) => {
    day.meals.forEach((meal) => {
      if (!meal.completed || !meal.recipe) return;

      meal.recipe.ingredientIds.forEach((ingredientId) => {
        const ingredient = ingredientMap.get(ingredientId);
        if (!ingredient) return;

        if (!counts.has(ingredientId)) {
          counts.set(ingredientId, {
            ingredientId,
            ingredientName: ingredient.name,
            category: ingredient.category,
            count: 0,
          });
        }

        counts.get(ingredientId).count += 1;
      });
    });
  });

  return Array.from(counts.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.ingredientName.localeCompare(right.ingredientName, "zh-Hans-CN");
  });
}

export function buildShoppingList(state, { from, days = 3 }) {
  const recipeMap = getRecipeMap(state);
  const ingredientMap = getIngredientMap(state);
  const items = new Map();

  getUpcomingPlans(state, from, days).forEach((plan) => {
    plan.meals.forEach((meal) => {
      const recipe = recipeMap.get(meal.recipeId);
      if (!recipe) return;

      recipe.ingredientIds.forEach((ingredientId) => {
        const ingredient = ingredientMap.get(ingredientId);
        const stockStatus = getIngredientStockStatus(ingredient);
        if (!ingredient || stockStatus === "in-stock") {
          return;
        }

        if (!items.has(ingredientId)) {
          items.set(ingredientId, {
            ingredientId,
            ingredientName: ingredient.name,
            stockStatus,
            checked: state.shoppingChecks[ingredientId] ?? false,
            sources: [],
          });
        }

        items.get(ingredientId).sources.push({
          date: plan.date,
          slot: meal.slot,
          slotLabel: mealSlotLabels[meal.slot],
          recipeId: recipe.id,
          recipeName: recipe.name,
        });
      });
    });
  });

  return Array.from(items.values()).sort((left, right) => {
    const stockPriority = { missing: 0, low: 1 };
    if (stockPriority[left.stockStatus] !== stockPriority[right.stockStatus]) {
      return stockPriority[left.stockStatus] - stockPriority[right.stockStatus];
    }
    return left.ingredientName.localeCompare(right.ingredientName, "zh-Hans-CN");
  });
}

export function toggleShoppingChecked(state, ingredientId) {
  return {
    ...cloneState(state),
    shoppingChecks: {
      ...state.shoppingChecks,
      [ingredientId]: !(state.shoppingChecks[ingredientId] ?? false),
    },
  };
}

export function getMealViewModel(state, date, slot) {
  const recipeMap = getRecipeMap(state);
  const ingredientMap = getIngredientMap(state);
  const meal = getMealPlan(state, date, slot);

  if (!meal) {
    return null;
  }

  const recipe = recipeMap.get(meal.recipeId);
  if (!recipe) return null;

  return {
    ...meal,
    slotLabel: mealSlotLabels[slot],
    recipe,
    ingredients: recipe.ingredientIds.map((ingredientId) => ingredientMap.get(ingredientId)).filter(Boolean),
    alternatives: state.recipes.filter(
      (candidate) => candidate.id !== recipe.id && candidate.slots.includes(slot),
    ),
  };
}

export function getDashboardSnapshot(state, currentDate) {
  const hydratedState = ensurePlanWindow(state, currentDate);

  return {
    today: getPlan(hydratedState, currentDate),
    upcoming: getUpcomingPlans(hydratedState, currentDate, 3),
    historyDays: getHistoryDays(hydratedState, currentDate),
    ingredientStats: buildIngredientStats(hydratedState, currentDate),
    ingredientHistory: buildIngredientHistory(hydratedState, currentDate),
    shoppingList: buildShoppingList(hydratedState, { from: currentDate, days: 3 }),
  };
}

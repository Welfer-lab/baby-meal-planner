import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildShoppingList,
  createSeedState,
  deleteIngredient,
  ensurePlanWindow,
  getDashboardSnapshot,
  getHistoryDays,
  getMealPlan,
  replaceMealRecipe,
  toggleMealCompleted,
  updateIngredientStock,
  useIngredient,
} from "../src/state.js";

test("createSeedState seeds today plus next two days of lunch and dinner plans", () => {
  const state = createSeedState("2026-03-15");

  assert.equal(state.profile.stageLabel, "9-12个月");
  assert.equal(state.plans.length, 3);
  assert.deepEqual(
    state.plans.map((plan) => [plan.date, plan.meals.length]),
    [
      ["2026-03-15", 2],
      ["2026-03-16", 2],
      ["2026-03-17", 2],
    ],
  );
});

test("replaceMealRecipe swaps a meal to a different recipe while keeping the date and slot", () => {
  const originalState = createSeedState("2026-03-15");

  const updatedState = replaceMealRecipe(
    originalState,
    "2026-03-15",
    "dinner",
    "tofu-spinach-millet",
  );

  assert.equal(getMealPlan(updatedState, "2026-03-15", "dinner").recipeId, "tofu-spinach-millet");
  assert.equal(getMealPlan(updatedState, "2026-03-15", "dinner").slot, "dinner");
  assert.equal(getMealPlan(originalState, "2026-03-15", "dinner").recipeId, "salmon-pumpkin-oat");
});

test("toggleMealCompleted marks a meal as completed and exposes it inside history", () => {
  const state = createSeedState("2026-03-15");
  const updatedState = toggleMealCompleted(state, "2026-03-15", "lunch");

  assert.equal(getMealPlan(updatedState, "2026-03-15", "lunch").completed, true);

  const historyDays = getHistoryDays(updatedState, "2026-03-15");

  assert.equal(historyDays.length, 1);
  assert.equal(historyDays[0].date, "2026-03-15");
  assert.equal(historyDays[0].meals[0].completed, true);
});

test("buildShoppingList only includes ingredients that are low or missing in the upcoming plans", () => {
  let state = createSeedState("2026-03-15");
  state = updateIngredientStock(state, "salmon", "missing");
  state = updateIngredientStock(state, "tofu", "low");
  state = updateIngredientStock(state, "pumpkin", "in-stock");

  const list = buildShoppingList(state, {
    from: "2026-03-15",
    days: 3,
  });

  assert.deepEqual(
    list.map((item) => ({
      ingredientId: item.ingredientId,
      stock: item.stockStatus,
      sources: item.sources.length,
    })),
    [
      { ingredientId: "salmon", stock: "missing", sources: 1 },
      { ingredientId: "tofu", stock: "low", sources: 1 },
    ],
  );
});

test("buildShoppingList merges repeated ingredients into one entry with multiple source meals", () => {
  let state = createSeedState("2026-03-15");
  state = updateIngredientStock(state, "rice", "low");

  const list = buildShoppingList(state, {
    from: "2026-03-15",
    days: 3,
  });

  const rice = list.find((item) => item.ingredientId === "rice");

  assert.ok(rice);
  assert.equal(rice.sources.length, 2);
});

test("buildShoppingList treats a used-up seeded ingredient as missing inventory", () => {
  let state = createSeedState("2026-03-15");
  state = useIngredient(state, "salmon");

  const list = buildShoppingList(state, {
    from: "2026-03-15",
    days: 3,
  });
  const salmon = list.find((item) => item.ingredientId === "salmon");

  assert.ok(salmon);
  assert.equal(salmon.stockStatus, "missing");
});

test("ensurePlanWindow keeps history and appends new future plans when today moves forward", () => {
  let state = createSeedState("2026-03-15");
  state = toggleMealCompleted(state, "2026-03-15", "lunch");

  const updated = ensurePlanWindow(state, "2026-03-18");

  assert.equal(getHistoryDays(updated, "2026-03-18")[0].date, "2026-03-15");
  assert.ok(updated.plans.find((plan) => plan.date === "2026-03-18"));
  assert.ok(updated.plans.find((plan) => plan.date === "2026-03-19"));
  assert.ok(updated.plans.find((plan) => plan.date === "2026-03-20"));
});

test("dashboard ingredient stats count completed ingredients across the last seven days without extending the history list", () => {
  let state = createSeedState("2026-03-10");

  ["2026-03-11", "2026-03-12", "2026-03-13", "2026-03-14", "2026-03-15", "2026-03-16"].forEach((date) => {
    state = ensurePlanWindow(state, date);
  });

  state = replaceMealRecipe(state, "2026-03-16", "lunch", "chicken-broccoli-rice");
  state = toggleMealCompleted(state, "2026-03-10", "lunch");
  state = toggleMealCompleted(state, "2026-03-16", "lunch");

  const snapshot = getDashboardSnapshot(state, "2026-03-16");
  const chicken = snapshot.ingredientStats.find((item) => item.ingredientId === "chicken");
  const broccoli = snapshot.ingredientStats.find((item) => item.ingredientId === "broccoli");
  const rice = snapshot.ingredientStats.find((item) => item.ingredientId === "rice");

  assert.equal(snapshot.historyDays.some((day) => day.date === "2026-03-10"), false);
  assert.ok(chicken);
  assert.ok(broccoli);
  assert.ok(rice);
  assert.equal(chicken.count, 2);
  assert.equal(broccoli.count, 2);
  assert.equal(rice.count, 2);
});

test("deleteIngredient removes the ingredient from recipes so meal plans stay renderable", () => {
  const state = createSeedState("2026-03-15");
  const updated = deleteIngredient(state, "salmon");
  const dinnerRecipe = updated.recipes.find((recipe) => recipe.id === "salmon-pumpkin-oat");
  const snapshot = getDashboardSnapshot(updated, "2026-03-18");

  assert.equal(updated.ingredients.some((ingredient) => ingredient.id === "salmon"), false);
  assert.equal(dinnerRecipe.ingredientIds.includes("salmon"), false);
  assert.equal(snapshot.ingredientHistory.some((ingredient) => ingredient.id === "salmon"), false);
});

test("hero top copy no longer shows stage badge or desktop install hint", () => {
  const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

  assert.equal(source.includes("Safari/Chrome 都可加到桌面"), false);
  assert.equal(source.includes("中晚两顿"), false);
});

test("styles include iphone 14 pro max viewport sizing and safe-area layout rules", () => {
  const stylesheet = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

  assert.equal(stylesheet.includes("--iphone-pro-max-width: 430px"), true);
  assert.equal(stylesheet.includes("--iphone-pro-max-height: 932px"), true);
  assert.equal(stylesheet.includes("env(safe-area-inset-top)"), true);
  assert.equal(stylesheet.includes("env(safe-area-inset-bottom)"), true);
  assert.equal(stylesheet.includes("@media (max-width: 430px)"), true);
});

test("service worker uses a fresh cache version and network-first for app shell files", () => {
  const source = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

  assert.equal(source.includes('baby-meal-planner-v5'), true);
  assert.equal(source.includes("NETWORK_FIRST_PATHS"), true);
  assert.equal(source.includes('url.pathname === "/"'), true);
});

test("main page markup and styles use compact card-board layout hooks", () => {
  const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

  assert.equal(source.includes("dashboard-board"), true);
  assert.equal(source.includes("content-board"), true);
  assert.equal(source.includes("summary-strip"), true);
  assert.equal(stylesheet.includes(".dashboard-board"), true);
  assert.equal(stylesheet.includes(".content-board"), true);
  assert.equal(stylesheet.includes(".summary-strip"), true);
});

test("history page includes a top seven-day ingredient stats card", () => {
  const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

  assert.equal(source.includes("Past 7 Days"), true);
  assert.equal(source.includes("食材频率统计"), true);
});

test("today meal cards use collapsible detail panels instead of fully expanded long stacks", () => {
  const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

  assert.equal(source.includes('class="meal-card compact-card'), true);
  assert.equal(source.includes("renderMealCard"), true);
  assert.equal(stylesheet.includes(".meal-card"), true);
  assert.equal(stylesheet.includes(".today-board"), true);
});

test("history meal cards keep a visible gap between sibling cards", () => {
  const stylesheet = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

  assert.equal(stylesheet.includes(".history-meals"), true);
  assert.equal(stylesheet.includes("gap: 8px;"), true);
});

test("recipe cards keep a visible vertical gap between sibling cards", () => {
  const stylesheet = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

  assert.equal(stylesheet.includes(".recipe-list"), true);
  assert.equal(stylesheet.includes("gap: 8px;"), true);
});

test("inventory page keeps 食物选配 for picker and 我的库存 for stock status", () => {
  const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

  assert.equal(source.includes("我的库存"), true);
  assert.equal(source.includes("食物选配"), true);
});

test("upcoming meal placeholders keep extra spacing below the meal badge", () => {
  const stylesheet = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

  assert.equal(stylesheet.includes(".upcoming-item .helper-copy"), true);
  assert.equal(stylesheet.includes("margin-top: 8px;"), true);
  assert.equal(stylesheet.includes("padding-left: 6px;"), true);
});

test("upcoming meal badges nudge left to align with placeholder copy", () => {
  const stylesheet = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

  assert.equal(stylesheet.includes(".upcoming-item .badge"), true);
  assert.equal(stylesheet.includes("margin-left: -1px;"), true);
});

test("completed meal action uses a dedicated yellow finished button style", () => {
  const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

  assert.equal(source.includes("is-completed-button"), true);
  assert.equal(stylesheet.includes(".is-completed-button"), true);
  assert.equal(stylesheet.includes("#fed709"), true);
});

test("inventory cards expose a delete action for ingredients", () => {
  const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

  assert.equal(source.includes('data-action="delete-ingredient"'), true);
  assert.equal(source.includes("ingredient-remove-button"), true);
  assert.equal(stylesheet.includes(".ingredient-remove-button"), true);
  assert.equal(source.includes(">x</button>"), true);
  assert.equal(stylesheet.includes("background: transparent;"), true);
  assert.equal(stylesheet.includes("border: 0;"), true);
  assert.equal(stylesheet.includes("color: #9f9f9f;"), true);
});

test("add ingredient drawer filter buttons disable press bounce animation", () => {
  const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

  assert.equal(source.includes("drawer-filter-button"), true);
  assert.equal(stylesheet.includes(".drawer-filter-button {"), true);
  assert.equal(stylesheet.includes("transition: none;"), true);
  assert.equal(stylesheet.includes(".drawer-filter-button:active"), true);
  assert.equal(stylesheet.includes("transform: none;"), true);
  assert.equal(stylesheet.includes("box-shadow: 2px 2px 0px var(--border);"), true);
});

test("vercel deployment config rewrites all routes to index for static pwa hosting", () => {
  const config = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");

  assert.equal(config.includes("\"buildCommand\": \"npm run build\""), true);
  assert.equal(config.includes("\"outputDirectory\": \"dist\""), true);
  assert.equal(config.includes("\"source\": \"/(.*)\""), true);
  assert.equal(config.includes("\"destination\": \"/index.html\""), true);
});

test("build script creates a dedicated dist output for vercel static hosting", () => {
  const pkg = readFileSync(new URL("../package.json", import.meta.url), "utf8");
  const buildScript = readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");

  assert.equal(pkg.includes("\"build\": \"node scripts/build.mjs\""), true);
  assert.equal(buildScript.includes("mkdirSync(distDir"), true);
  assert.equal(buildScript.includes("copyFileSync"), true);
});

test("pwa icon setup uses the new soft iphone-style icon set", () => {
  const manifest = readFileSync(new URL("../manifest.webmanifest", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.equal(manifest.includes("icon-app-soft.svg"), true);
  assert.equal(manifest.includes("icon-app-maskable.svg"), true);
  assert.equal(html.includes('apple-touch-icon" href="./public/icons/icon-app-soft.svg"'), true);
});

test("pwa app name uses 橙汁开饭啦 for install surfaces", () => {
  const manifest = readFileSync(new URL("../manifest.webmanifest", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.equal(manifest.includes('"short_name": "橙汁开饭啦"'), true);
  assert.equal(manifest.includes('"name": "橙汁开饭啦"'), true);
  assert.equal(html.includes("<title>橙汁开饭啦</title>"), true);
});

test("supabase runtime config and auth hooks exist for shared login settings", () => {
  const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const runtimeConfig = readFileSync(new URL("../src/runtime-config.js", import.meta.url), "utf8");

  assert.equal(source.includes("sign-in-password"), true);
  assert.equal(source.includes("sign-out"), true);
  assert.equal(source.includes("共享数据库"), true);
  assert.equal(runtimeConfig.includes("supabaseUrl"), true);
  assert.equal(runtimeConfig.includes("sharedStateId"), true);
});

test("docs mention supabase shared state and vercel env vars", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const setupDoc = readFileSync(new URL("../docs/supabase-setup.md", import.meta.url), "utf8");

  assert.equal(readme.includes("SUPABASE_URL"), true);
  assert.equal(readme.includes("SUPABASE_ANON_KEY"), true);
  assert.equal(setupDoc.includes("shared_state"), true);
  assert.equal(setupDoc.includes("magic link"), true);
});

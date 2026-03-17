import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildShoppingList,
  createSeedState,
  ensurePlanWindow,
  getHistoryDays,
  getMealPlan,
  replaceMealRecipe,
  toggleMealCompleted,
  updateIngredientStock,
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

test("ensurePlanWindow keeps history and appends new future plans when today moves forward", () => {
  let state = createSeedState("2026-03-15");
  state = toggleMealCompleted(state, "2026-03-15", "lunch");

  const updated = ensurePlanWindow(state, "2026-03-18");

  assert.equal(getHistoryDays(updated, "2026-03-18")[0].date, "2026-03-15");
  assert.ok(updated.plans.find((plan) => plan.date === "2026-03-18"));
  assert.ok(updated.plans.find((plan) => plan.date === "2026-03-19"));
  assert.ok(updated.plans.find((plan) => plan.date === "2026-03-20"));
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

  assert.equal(source.includes('baby-meal-planner-v2'), true);
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

test("today meal cards use collapsible detail panels instead of fully expanded long stacks", () => {
  const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

  assert.equal(source.includes('<details class="meal-details"'), true);
  assert.equal(stylesheet.includes(".meal-details"), true);
  assert.equal(stylesheet.includes(".meal-detail-grid"), true);
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

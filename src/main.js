import {
  addIngredient,
  addRecipe,
  buildShoppingList,
  createSeedState,
  deleteIngredient,
  deleteRecipe,
  ensurePlanWindow,
  getDashboardSnapshot,
  getMealViewModel,
  toggleMealCompleted,
  toggleShoppingChecked,
  updateIngredientStock,
  updateMealNote,
  updateProfile,
  replaceMealRecipe,
  updateRecipeIngredients,
} from "./state.js";

const STORAGE_KEY = "baby-meal-planner-state-v1";
const root = document.querySelector("#app");

const uiState = {
  activeTab: new URLSearchParams(location.search).get("tab") || "today",
  swapKey: null,
  recipeFilter: "all",
  openCategory: null,
  editingRecipeId: null,
  creatingRecipe: null,
  addingIngredient: null,
  schedulingRecipeId: null,
  suggestionSeed: Date.now(),
  notice: "",
  installPrompt: null,
};

let noticeTimer = null;
let state = initializeState();

render();
attachEvents();
registerPwa();

function initializeState() {
  const today = getTodayKey();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const hydrated = ensurePlanWindow(parsed, today);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(hydrated));
      return hydrated;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  const seeded = createSeedState(today);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

function attachEvents() {
  root.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }

    const { action } = actionTarget.dataset;

    switch (action) {
      case "switch-tab":
        uiState.activeTab = actionTarget.dataset.tab;
        uiState.swapKey = null;
        uiState.openCategory = null;
        render();
        break;
      case "toggle-category":
        uiState.openCategory = uiState.openCategory === actionTarget.dataset.category ? null : actionTarget.dataset.category;
        render();
        break;
      case "open-add-ingredient":
        uiState.addingIngredient = { name: "", category: "蛋白质", acceptedLabel: "爱吃" };
        render();
        break;
      case "close-add-ingredient":
        uiState.addingIngredient = null;
        render();
        break;
      case "set-ingredient-category":
        if (uiState.addingIngredient) {
          uiState.addingIngredient.category = actionTarget.dataset.category;
          render();
        }
        break;
      case "set-ingredient-accepted":
        if (uiState.addingIngredient) {
          uiState.addingIngredient.acceptedLabel = actionTarget.dataset.label;
          render();
        }
        break;
      case "save-ingredient": {
        if (!uiState.addingIngredient) break;
        const name = uiState.addingIngredient.name.trim();
        if (!name) { announce("请输入食材名称"); break; }
        const newIngredient = {
          id: `custom-ing-${Date.now()}`,
          name,
          category: uiState.addingIngredient.category,
          acceptedLabel: uiState.addingIngredient.acceptedLabel,
          note: "",
          stockStatus: "in-stock",
        };
        uiState.addingIngredient = null;
        commit(addIngredient(state, newIngredient), `${name} 已加入库存`);
        break;
      }
      case "delete-ingredient":
        commit(deleteIngredient(state, actionTarget.dataset.ingredientId), "食材已删除");
        break;
      case "refresh-suggestions":
        uiState.suggestionSeed = Date.now();
        render();
        break;
      case "open-schedule-recipe":
        uiState.schedulingRecipeId = actionTarget.dataset.recipeId;
        render();
        break;
      case "close-schedule-recipe":
        uiState.schedulingRecipeId = null;
        render();
        break;
      case "schedule-recipe":
        uiState.schedulingRecipeId = null;
        commit(
          replaceMealRecipe(state, actionTarget.dataset.date, actionTarget.dataset.slot, actionTarget.dataset.recipeId),
          "已放入计划"
        );
        break;
      case "open-recipe-creator":
        uiState.creatingRecipe = { slot: "lunch", ingredientIds: [] };
        render();
        break;
      case "add-suggested-recipe": {
        const ingredientIds = actionTarget.dataset.ingredientIds.split(",").filter(Boolean);
        const slot = actionTarget.dataset.slot;
        const newRecipe = {
          id: `custom-${Date.now()}`,
          name: buildRecipeName(ingredientIds),
          stageLabel: "9-12个月",
          slots: [slot],
          ingredientIds,
        };
        commit(addRecipe(state, newRecipe), "菜谱已加入");
        break;
      }
      case "close-recipe-creator":
        uiState.creatingRecipe = null;
        render();
        break;
      case "toggle-creator-slot":
        if (uiState.creatingRecipe) {
          uiState.creatingRecipe.slot = actionTarget.dataset.slot;
          render();
        }
        break;
      case "toggle-creator-ingredient": {
        if (!uiState.creatingRecipe) break;
        const id = actionTarget.dataset.ingredientId;
        const ids = uiState.creatingRecipe.ingredientIds;
        uiState.creatingRecipe.ingredientIds = ids.includes(id)
          ? ids.filter((x) => x !== id)
          : [...ids, id];
        render();
        break;
      }
      case "save-recipe": {
        if (!uiState.creatingRecipe) break;
        const { slot, ingredientIds } = uiState.creatingRecipe;
        const newRecipe = {
          id: `custom-${Date.now()}`,
          name: buildRecipeName(ingredientIds),
          stageLabel: "9-12个月",
          slots: [slot],
          ingredientIds,
        };
        uiState.creatingRecipe = null;
        commit(addRecipe(state, newRecipe), "菜谱已保存");
        break;
      }
      case "delete-recipe":
        commit(deleteRecipe(state, actionTarget.dataset.recipeId), "菜谱已删除");
        break;
      case "open-recipe-editor":
        uiState.editingRecipeId = actionTarget.dataset.recipeId;
        render();
        break;
      case "close-recipe-editor":
        uiState.editingRecipeId = null;
        render();
        break;
      case "toggle-recipe-ingredient": {
        const { recipeId, ingredientId } = actionTarget.dataset;
        const recipe = state.recipes.find((r) => r.id === recipeId);
        if (!recipe) break;
        const current = recipe.ingredientIds;
        const next = current.includes(ingredientId)
          ? current.filter((id) => id !== ingredientId)
          : [...current, ingredientId];
        commit(updateRecipeIngredients(state, recipeId, next), "食材已更新");
        break;
      }
      case "toggle-complete":
        commit(
          toggleMealCompleted(state, actionTarget.dataset.date, actionTarget.dataset.slot),
          "餐次状态已更新",
        );
        break;
      case "toggle-swap": {
        const nextKey = `${actionTarget.dataset.date}:${actionTarget.dataset.slot}`;
        uiState.swapKey = uiState.swapKey === nextKey ? null : nextKey;
        render();
        break;
      }
      case "replace-recipe":
        uiState.swapKey = null;
        commit(
          replaceMealRecipe(
            state,
            actionTarget.dataset.date,
            actionTarget.dataset.slot,
            actionTarget.dataset.recipeId,
          ),
          "已替换这顿辅食",
        );
        break;
      case "toggle-shopping":
        commit(toggleShoppingChecked(state, actionTarget.dataset.ingredientId), "采购清单已更新");
        break;
      case "set-stock":
        commit(
          updateIngredientStock(
            state,
            actionTarget.dataset.ingredientId,
            actionTarget.dataset.stock,
          ),
          "库存状态已更新",
        );
        break;
      case "set-filter":
        uiState.recipeFilter = actionTarget.dataset.filter;
        render();
        break;
      case "install":
        void promptInstall();
        break;
      default:
        break;
    }
  });

  root.addEventListener("input", (event) => {
    const target = event.target;
    if (target.matches("[data-role='ingredient-name']") && uiState.addingIngredient) {
      uiState.addingIngredient.name = target.value;
    }
  });

  root.addEventListener("change", (event) => {
    const target = event.target;

    if (target.matches("[data-role='meal-note']")) {
      commit(
        updateMealNote(state, target.dataset.date, target.dataset.slot, target.value.trim()),
        "备注已保存",
      );
      return;
    }

    if (target.matches("[data-role='profile-field']")) {
      commit(
        updateProfile(state, {
          [target.dataset.key]: target.value.trim(),
        }),
        "设置已保存",
      );
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    uiState.installPrompt = event;
    render();
  });

  window.addEventListener("appinstalled", () => {
    uiState.installPrompt = null;
    announce("已经可以像 App 一样从桌面打开了");
    render();
  });
}

function registerPwa() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

async function promptInstall() {
  if (!uiState.installPrompt) {
    announce("也可以从浏览器菜单里选择“添加到主屏幕”");
    render();
    return;
  }

  uiState.installPrompt.prompt();
  const choice = await uiState.installPrompt.userChoice;
  uiState.installPrompt = null;
  announce(
    choice.outcome === "accepted" ? "添加到桌面的请求已接受" : "稍后也可以再从浏览器菜单里添加",
  );
  render();
}

function commit(nextState, message) {
  state = ensurePlanWindow(nextState, getTodayKey());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  announce(message);
  render();
}

function announce(message) {
  uiState.notice = message;
  if (noticeTimer) {
    window.clearTimeout(noticeTimer);
  }

  noticeTimer = window.setTimeout(() => {
    uiState.notice = "";
    render();
  }, 2200);
}

function render() {
  document.body.dataset.tab = uiState.activeTab;
  const today = getTodayKey();
  const previousPlanCount = state.plans.length;
  state = ensurePlanWindow(state, today);
  if (state.plans.length !== previousPlanCount) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  const snapshot = getDashboardSnapshot(state, today);

  root.innerHTML = `
    <div class="app-shell fade-up">
      ${uiState.notice ? `<div class="toast">${escapeHtml(uiState.notice)}</div>` : ""}
      ${renderHero(snapshot, today)}
      <main class="page-stack">
        ${renderCurrentPage(snapshot, today)}
      </main>
    </div>
    ${renderBottomNav()}
    ${uiState.editingRecipeId ? renderIngredientDrawer(uiState.editingRecipeId) : ""}
    ${uiState.creatingRecipe ? renderRecipeCreatorDrawer() : ""}
    ${uiState.addingIngredient ? renderAddIngredientDrawer() : ""}
    ${uiState.schedulingRecipeId ? renderScheduleDrawer(uiState.schedulingRecipeId) : ""}
  `;
}

function renderHero(snapshot, today) {
  return `
    <section class="hero-card">
      <img class="hero-avatar" src="./public/pic.jpg" alt="小橙汁" />
      <p class="hero-overline">${formatLongDate(today)}</p>
      <h1 class="hero-title">${escapeHtml(state.profile.homeTitle)}</h1>
      <p class="hero-copy">${escapeHtml(state.profile.familyNote)}</p>
    </section>
  `;
}

function renderCurrentPage(snapshot, today) {
  switch (uiState.activeTab) {
    case "history":
      return renderHistoryPage(snapshot, today);
    case "buy":
      return renderBuyPage();
    case "inventory":
      return renderInventoryPage();
    case "library":
      return renderLibraryPage(today);
    case "today":
    default:
      return renderTodayPage(snapshot, today);
  }
}

function renderTodayPage(snapshot, today) {
  const lunch = getMealViewModel(state, today, "lunch");
  const dinner = getMealViewModel(state, today, "dinner");
  const quickShopping = snapshot.shoppingList.slice(0, 3);

  return `
    <section class="dashboard-board">
      <section class="content-board today-board">
        ${lunch ? renderMealCard(today, lunch) : ""}
        ${dinner ? renderMealCard(today, dinner) : ""}
        <section class="panel-card compact-card wide-card">
          <div class="header-row">
            <div>
              <p class="section-overline">Next 2 Days</p>
              <h3 class="section-title">接下来两天</h3>
            </div>
          </div>
          <div class="mini-grid card-grid">
            ${snapshot.upcoming
              .slice(1)
              .map((plan) => renderUpcomingPlan(plan))
              .join("")}
          </div>
        </section>
      </section>
    </section>
  `;
}

function renderMealCard(date, meal) {
  return `
    <article class="meal-card compact-card ${meal.completed ? "is-complete" : ""}" data-slot="${meal.slot}">
      <div class="meal-header">
        <div>
          <p class="eyebrow">${meal.slotLabel}</p>
          <h3 class="meal-title">${meal.recipe.name}</h3>
        </div>
        <button
          class="${meal.completed ? "secondary-button" : "primary-button"}"
          data-action="toggle-complete"
          data-date="${date}"
          data-slot="${meal.slot}"
          type="button"
        >
          ${meal.completed ? "已完成" : "标记完成"}
        </button>
      </div>
      <div class="pill-row">
        ${meal.ingredients.map((ingredient) => renderIngredientPill(ingredient)).join("")}
      </div>
    </article>
  `;
}

function renderUpcomingPlan(plan) {
  const lunch = state.recipes.find((recipe) => recipe.id === plan.meals[0]?.recipeId);
  const dinner = state.recipes.find((recipe) => recipe.id === plan.meals[1]?.recipeId);

  return `
    <article class="upcoming-card compact-tile">
      <p class="eyebrow">${formatShortDate(plan.date)}</p>
      <h3 class="upcoming-day">${weekdayLabel(plan.date)}</h3>
      <div class="upcoming-item">
        <span class="badge hot">午餐</span>
        <p class="helper-copy">${lunch?.name ?? "未安排"}</p>
      </div>
      <div class="upcoming-item">
        <span class="badge sage">晚餐</span>
        <p class="helper-copy">${dinner?.name ?? "未安排"}</p>
      </div>
    </article>
  `;
}

function renderQuickShopping(item) {
  return `
    <article class="shopping-row compact-tile">
      <div class="shopping-top">
        <div>
          <p class="shopping-title">${item.ingredientName}</p>
          <p class="helper-copy">${item.sources.map((source) => `${formatShortDate(source.date)} ${source.slotLabel}`).join(" · ")}</p>
        </div>
        <span class="status-pill stock-${item.stockStatus}">${stockLabel(item.stockStatus)}</span>
      </div>
    </article>
  `;
}

function renderHistoryPage(snapshot, today) {
  return `
    <section class="dashboard-board">
      <section class="content-board history-board">
        ${
          snapshot.historyDays.length
            ? snapshot.historyDays.map((day) => renderHistoryDay(day)).join("")
            : `<div class="empty-state wide-card">今天先从首页标记一顿“已完成”，这里就会开始累计你们家的真实喂养记录。</div>`
        }
        <section class="panel-card compact-card wide-card" style="margin-top:16px">
          <div class="header-row">
            <div>
              <p class="section-overline">Ingredient Memory</p>
              <h3 class="section-title">最近吃过的食材</h3>
            </div>
            <span class="badge">${snapshot.ingredientHistory.length} 个</span>
          </div>
          ${
            snapshot.ingredientHistory.length
              ? `
                <div class="ingredient-grid card-grid">
                  ${snapshot.ingredientHistory.map((ingredient) => renderHistoryIngredient(ingredient)).join("")}
                </div>
              `
              : `<div class="empty-state">这里会慢慢形成“最近吃过什么”的家庭记忆，避免隔天又撞菜。</div>`
          }
        </section>
      </section>
    </section>
  `;
}

function renderHistoryDay(day) {
  return `
    <article class="history-card compact-card wide-card">
      <div class="header-row">
        <div>
          <p class="eyebrow">${formatLongDate(day.date)}</p>
          <h3 class="history-title">${weekdayLabel(day.date)}</h3>
        </div>
        <span class="badge sage">${day.meals.filter((meal) => meal.completed).length} 顿完成</span>
      </div>
      <div class="history-meals card-grid">
        ${day.meals
          .filter((meal) => meal.completed)
          .map(
            (meal) => `
              <article class="history-item compact-tile">
                <div class="row-between">
                  <span class="badge hot">${meal.slotLabel}</span>
                  <span class="status-pill completed">已打卡</span>
                </div>
                <p class="history-title">${meal.recipe.name}</p>
                <p class="history-note">${meal.note || meal.recipe.highlight}</p>
              </article>
            `,
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderHistoryIngredient(ingredient) {
  return `
    <article class="ingredient-card compact-tile">
      <div class="header-row">
        <div>
          <p class="ingredient-name">${ingredient.name}</p>
          <p class="history-note">${ingredient.category} · ${ingredient.acceptedLabel}</p>
        </div>
        <span class="status-pill stock-${ingredient.stockStatus}">${stockLabel(ingredient.stockStatus)}</span>
      </div>
      <p class="ingredient-note">最近一次出现在 ${formatShortDate(ingredient.lastSeenOn)} 的「${ingredient.seenInRecipe}」里。</p>
    </article>
  `;
}

function renderCategoryPicker() {
  const categories = ["蛋白质", "蔬菜", "主食"];
  const open = uiState.openCategory;

  return `
    <section class="panel-card compact-card">
      <div class="header-row">
        <div>
          <p class="section-overline">My Ingredients</p>
          <h3 class="section-title">食物选配</h3>
        </div>
        <button class="primary-button" data-action="open-add-ingredient" type="button">+ 新增</button>
      </div>
      <div class="filter-row">
        ${categories.map((cat) => {
          const count = state.ingredients.filter((i) => i.category === cat).length;
          return `
            <button
              class="filter-button ${open === cat ? "active" : ""}"
              data-action="toggle-category"
              data-category="${cat}"
              type="button"
            >${cat}${count ? ` · ${count}` : ""}</button>
          `;
        }).join("")}
      </div>
      ${open ? `
        <div class="ingredient-toggle-grid">
          ${state.ingredients.filter((ing) => ing.category === open).length
            ? state.ingredients
                .filter((ing) => ing.category === open)
                .map((ing) => {
                  const hasStock = ing.stockStatus === "in-stock";
                  return `
                    <div
                      class="ingredient-toggle-card ${hasStock ? "is-stocked" : ""}"
                      data-action="set-stock"
                      data-ingredient-id="${ing.id}"
                      data-stock="${hasStock ? "missing" : "in-stock"}"
                      role="button"
                      tabindex="0"
                    >
                      <span class="ingredient-toggle-name">${escapeHtml(ing.name)}</span>
                      <span class="ingredient-toggle-label">${ing.acceptedLabel}</span>
                      <span class="ingredient-toggle-status">${hasStock ? "有" : "没有"}</span>
                    </div>
                  `;
                }).join("")
            : `<p class="empty-state" style="grid-column:1/-1;">还没有${open}，点右上角新增</p>`
          }
        </div>
      ` : ""}
    </section>
  `;
}

function renderAddIngredientDrawer() {
  const { name, category, acceptedLabel } = uiState.addingIngredient;
  const categories = ["蛋白质", "蔬菜", "主食"];
  const accepted = ["爱吃", "一般"];

  return `
    <div class="drawer-overlay" data-action="close-add-ingredient" role="button" aria-label="关闭"></div>
    <div class="drawer">
      <div class="drawer-header">
        <div>
          <p class="section-overline">Add Ingredient</p>
          <h3 class="section-title">新增食物</h3>
        </div>
        <button class="ghost-button" data-action="close-add-ingredient" type="button">取消</button>
      </div>
      <div class="drawer-body">
        <div class="drawer-group">
          <p class="drawer-group-label">食材名称</p>
          <input
            data-role="ingredient-name"
            type="text"
            placeholder="例如：鸡腿肉"
            value="${escapeHtml(name)}"
            autocomplete="off"
            style="width:100%;"
          />
        </div>
        <div class="drawer-group">
          <p class="drawer-group-label">分类</p>
          <div class="filter-row">
            ${categories.map((cat) => `
              <button
                class="filter-button ${category === cat ? "active" : ""}"
                data-action="set-ingredient-category"
                data-category="${cat}"
                type="button"
              >${cat}</button>
            `).join("")}
          </div>
        </div>
        <div class="drawer-group">
          <p class="drawer-group-label">接受度</p>
          <div class="filter-row">
            ${accepted.map((lbl) => `
              <button
                class="filter-button ${acceptedLabel === lbl ? "active" : ""}"
                data-action="set-ingredient-accepted"
                data-label="${lbl}"
                type="button"
              >${lbl}</button>
            `).join("")}
          </div>
        </div>
      </div>
      <div style="padding:12px 16px 16px;">
        <button
          class="primary-button"
          data-action="save-ingredient"
          type="button"
          style="width:100%;"
        >加入库存</button>
      </div>
    </div>
  `;
}

function renderScheduleDrawer(recipeId) {
  const recipe = state.recipes.find((r) => r.id === recipeId);
  if (!recipe) return "";
  const today = getTodayKey();
  const tomorrow = (() => {
    const [y, m, d] = today.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
  })();

  const slots = [
    { date: today,    slot: "lunch",  label: "今日午餐" },
    { date: today,    slot: "dinner", label: "今日晚餐" },
    { date: tomorrow, slot: "lunch",  label: "明日午餐" },
    { date: tomorrow, slot: "dinner", label: "明日晚餐" },
  ];

  return `
    <div class="drawer-overlay" data-action="close-schedule-recipe" role="button" aria-label="关闭"></div>
    <div class="drawer">
      <div class="drawer-header">
        <div>
          <p class="section-overline">Schedule</p>
          <h3 class="section-title">${escapeHtml(recipe.name)}</h3>
        </div>
        <button class="ghost-button" data-action="close-schedule-recipe" type="button">取消</button>
      </div>
      <div class="drawer-body">
        <div class="inventory-list">
          ${slots.map(({ date, slot, label }) => `
            <div
              class="inventory-row"
              data-action="schedule-recipe"
              data-date="${date}"
              data-slot="${slot}"
              data-recipe-id="${recipeId}"
              role="button"
              tabindex="0"
            >
              <span class="inventory-row-name">${label}</span>
              <span class="inventory-row-meta">${formatShortDate(date)}</span>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderBuyPage() {
  const missingItems = state.ingredients.filter((i) => i.stockStatus === "missing");

  return `
    <section class="dashboard-board">
      <section class="content-board shopping-board">
        <section class="panel-card compact-card wide-card">
          <div class="shopping-header">
            <div>
              <p class="section-overline">Buy List</p>
              <h3 class="section-title">待买清单</h3>
            </div>
            <span class="badge hot">${missingItems.length} 项</span>
          </div>
          ${
            missingItems.length
              ? `<div class="inventory-list">${missingItems.map((ing) => `
                  <div class="shopping-row">
                    <div class="shopping-top">
                      <div class="shopping-info">
                        <p class="shopping-title">${escapeHtml(ing.name)}</p>
                        <p class="helper-copy">${ing.category} · ${ing.acceptedLabel}</p>
                      </div>
                      <button
                        class="primary-button"
                        data-action="set-stock"
                        data-ingredient-id="${ing.id}"
                        data-stock="in-stock"
                        type="button"
                        style="flex-shrink:0;"
                      >买到了</button>
                    </div>
                  </div>
                `).join("")}</div>`
              : `<div class="empty-state">库存齐全，没有待买食材。</div>`
          }
        </section>
      </section>
    </section>
  `;
}

function renderInventoryPage() {
  const categories = ["蛋白质", "蔬菜", "主食"];
  return `
    <section class="dashboard-board">
      ${renderCategoryPicker()}
      <section class="panel-card compact-card wide-card">
        <div class="header-row">
          <div>
            <p class="section-overline">Stock Status</p>
            <h3 class="section-title">食物选配</h3>
          </div>
          <span class="badge sage">${state.ingredients.filter((i) => i.stockStatus === "in-stock").length} 有货</span>
        </div>
        ${categories.map((cat) => {
          const ings = state.ingredients.filter((i) => i.category === cat);
          if (!ings.length) return "";
          return `
            <div>
              <p class="drawer-group-label"><span class="badge ${categoryClass(cat)}">${cat}</span></p>
              <div class="ingredient-toggle-grid">
                ${ings.map((ing) => {
                  const hasStock = ing.stockStatus === "in-stock";
                  return `
                    <div
                      class="ingredient-toggle-card ${hasStock ? "is-stocked " + categoryClass(cat) : ""}"
                      data-action="set-stock"
                      data-ingredient-id="${ing.id}"
                      data-stock="${hasStock ? "missing" : "in-stock"}"
                      role="button"
                      tabindex="0"
                    >
                      <span class="ingredient-toggle-name">${escapeHtml(ing.name)}</span>
                      <span class="ingredient-toggle-label">${ing.acceptedLabel}</span>
                      <span class="ingredient-toggle-status">${hasStock ? "有" : "没有"}</span>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>
          `;
        }).join("")}
        ${!state.ingredients.length ? `<div class="empty-state">还没有食物，点上方新增。</div>` : ""}
      </section>
    </section>
  `;
}

function renderShoppingItem(item) {
  return `
    <div class="shopping-row ${item.checked ? "checked" : ""}">
      <div class="shopping-top">
        <div class="shopping-left">
          <button
            class="checkbox-button ${item.checked ? "checked" : ""}"
            data-action="toggle-shopping"
            data-ingredient-id="${item.ingredientId}"
            type="button"
            aria-label="切换已购买状态"
          ></button>
          <div class="shopping-info">
            <p class="shopping-title">${item.ingredientName}</p>
            <p class="helper-copy">${item.sources.map((s) => `${formatShortDate(s.date)} ${s.slotLabel}`).join(" · ")}</p>
          </div>
        </div>
        <span class="status-pill stock-${item.stockStatus}">${stockLabel(item.stockStatus)}</span>
      </div>
    </div>
  `;
}

function renderInventoryCard(ingredient) {
  return `
    <article class="inventory-card compact-tile">
      <div class="inventory-header">
        <div>
          <p class="ingredient-name">${ingredient.name}</p>
          <p class="history-note">${ingredient.category} · ${ingredient.acceptedLabel}</p>
        </div>
        <span class="status-pill stock-${ingredient.stockStatus}">${stockLabel(ingredient.stockStatus)}</span>
      </div>
      <p class="ingredient-note">${ingredient.note}</p>
      <div class="stock-actions">
        ${["in-stock", "low", "missing"]
          .map(
            (stock) => `
              <button
                class="stock-button ${ingredient.stockStatus === stock ? "active" : ""}"
                data-action="set-stock"
                data-ingredient-id="${ingredient.id}"
                data-stock="${stock}"
                type="button"
              >
                ${stockLabel(stock)}
              </button>
            `,
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderInventoryRow(ingredient) {
  const nextStock = { "in-stock": "low", "low": "missing", "missing": "in-stock" };
  return `
    <div
      class="inventory-row"
      data-action="set-stock"
      data-ingredient-id="${ingredient.id}"
      data-stock="${nextStock[ingredient.stockStatus]}"
      role="button"
      tabindex="0"
      aria-label="点击切换 ${ingredient.name} 库存状态"
    >
      <div class="inventory-row-left">
        <span class="inventory-row-name">${ingredient.name}</span>
        <span class="inventory-row-meta">${ingredient.category} · ${ingredient.acceptedLabel}</span>
      </div>
      <div class="inventory-row-right">
        <span class="status-pill stock-${ingredient.stockStatus}">${stockLabel(ingredient.stockStatus)}</span>
      </div>
    </div>
  `;
}

function renderLibraryPage() {
  const recipes = state.recipes.filter((recipe) => {
    if (uiState.recipeFilter === "all") return true;
    return recipe.slots.includes(uiState.recipeFilter);
  });

  return `
    <section class="dashboard-board">
      <section class="panel-card compact-card">
        <div class="header-row">
          <div class="filter-row">
            ${[
              ["all", "全部"],
              ["lunch", "午餐"],
              ["dinner", "晚餐"],
            ]
              .map(
                ([filter, label]) => `
                  <button
                    class="filter-button ${uiState.recipeFilter === filter ? "active" : ""}"
                    data-action="set-filter"
                    data-filter="${filter}"
                    type="button"
                  >${label}</button>
                `,
              )
              .join("")}
          </div>
          <button class="primary-button" data-action="open-recipe-creator" type="button">+ 新建菜谱</button>
        </div>
      </section>
      <section class="content-board library-board">
        ${renderSuggestedRecipes()}
        <section class="panel-card compact-card wide-card">
          <div class="header-row">
            <div>
              <p class="section-overline">Recipe Cards</p>
              <h3 class="section-title">我的菜谱</h3>
            </div>
            <span class="badge">${recipes.length} 道</span>
          </div>
          ${
            recipes.length
              ? `<div class="recipe-list">${recipes.map((recipe) => renderRecipeCard(recipe)).join("")}</div>`
              : `<div class="empty-state">还没有菜谱，先在采购页把买到的食材加入库存，再新建菜谱。</div>`
          }
        </section>
      </section>
    </section>
  `;
}

function renderRecipeCard(recipe) {
  const ingredients = recipe.ingredientIds
    .map((ingredientId) => state.ingredients.find((ingredient) => ingredient.id === ingredientId))
    .filter(Boolean);
  const slotLabel = recipe.slots.includes("lunch") ? "午餐" : "晚餐";

  return `
    <article class="recipe-card compact-tile">
      <div class="header-row">
        <div>
          <p class="recipe-name">${escapeHtml(recipe.name)}</p>
          <p class="history-note">${recipe.stageLabel} · ${slotLabel}模板</p>
        </div>
        <span class="badge ${recipe.slots.includes("lunch") ? "hot" : "sage"}">${slotLabel}</span>
      </div>
      <div class="pill-row">
        ${ingredients.map((ingredient) => renderIngredientPill(ingredient)).join("")}
      </div>
      <div style="display:flex;gap:8px;">
        <button
          class="primary-button"
          data-action="open-schedule-recipe"
          data-recipe-id="${recipe.id}"
          type="button"
        >放入计划</button>
        <button
          class="ghost-button"
          data-action="delete-recipe"
          data-recipe-id="${recipe.id}"
          type="button"
        >删除</button>
      </div>
    </article>
  `;
}

function generateSuggestions(count = 3) {
  const stocked = state.ingredients.filter((i) => i.stockStatus !== "missing");
  const byCategory = (cat) => stocked.filter((i) => i.category === cat);
  const proteins = byCategory("蛋白质");
  const vegs = byCategory("蔬菜");
  const staples = byCategory("主食");

  if (!proteins.length && !vegs.length && !staples.length) return [];

  // 伪随机：基于 seed，同一 seed 结果一致，刷新才变
  let s = uiState.suggestionSeed;
  const rand = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
  const pick = (arr) => arr.length ? arr[Math.floor(rand() * arr.length)] : null;

  const slots = ["lunch", "dinner"];
  const results = [];
  const seen = new Set();

  let attempts = 0;
  while (results.length < count && attempts < 30) {
    attempts++;
    const combo = [pick(proteins), pick(vegs), pick(staples)].filter(Boolean);
    if (!combo.length) break;
    const key = combo.map((i) => i.id).sort().join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      ingredientIds: combo.map((i) => i.id),
      slot: slots[results.length % 2],
    });
  }
  return results;
}

function renderSuggestedRecipes() {
  const suggestions = generateSuggestions(1);
  if (!suggestions.length) return "";

  const s = suggestions[0];
  const ingredients = s.ingredientIds
    .map((id) => state.ingredients.find((i) => i.id === id))
    .filter(Boolean);
  const name = buildRecipeName(s.ingredientIds);
  const slotLabel = s.slot === "lunch" ? "午餐" : "晚餐";

  return `
    <section class="panel-card compact-card wide-card">
      <div class="header-row">
        <div>
          <p class="section-overline">Suggestion</p>
          <h3 class="section-title">建议菜谱</h3>
        </div>
        <button class="ghost-button" data-action="refresh-suggestions" type="button" aria-label="换一道" style="padding:5px 9px;font-size:1rem;line-height:1;">↻</button>
      </div>
      <div class="header-row">
        <div>
          <p class="recipe-name">${escapeHtml(name)}</p>
          <p class="history-note">${slotLabel}建议</p>
        </div>
        <button
          class="primary-button"
          data-action="add-suggested-recipe"
          data-ingredient-ids="${s.ingredientIds.join(",")}"
          data-slot="${s.slot}"
          type="button"
        >加入</button>
      </div>
      <div class="pill-row">
        ${ingredients.map((i) => renderIngredientPill(i)).join("")}
      </div>
    </section>
  `;
}

function buildRecipeName(ingredientIds) {
  const ings = ingredientIds
    .map((id) => state.ingredients.find((i) => i.id === id))
    .filter(Boolean);
  const protein = ings.find((i) => i.category === "蛋白质")?.name ?? "";
  const veg = ings.find((i) => i.category === "蔬菜")?.name ?? "";
  const staple = ings.find((i) => i.category === "主食")?.name ?? "";
  return [protein, veg, staple].filter(Boolean).join("") || "新菜谱";
}

function renderRecipeCreatorDrawer() {
  const { slot, ingredientIds } = uiState.creatingRecipe;
  const categories = ["蛋白质", "蔬菜", "主食"];
  const stockedIngredients = state.ingredients.filter((i) => i.stockStatus !== "missing");
  const previewName = buildRecipeName(ingredientIds);

  return `
    <div class="drawer-overlay" data-action="close-recipe-creator" role="button" aria-label="关闭"></div>
    <div class="drawer">
      <div class="drawer-header">
        <div>
          <p class="section-overline">New Recipe</p>
          <h3 class="section-title">${escapeHtml(previewName)}</h3>
        </div>
        <button class="ghost-button" data-action="close-recipe-creator" type="button">取消</button>
      </div>
      <div class="drawer-body">
        <div class="drawer-group">
          <p class="drawer-group-label">槽位</p>
          <div class="filter-row">
            ${[["lunch", "午餐"], ["dinner", "晚餐"]].map(([s, label]) => `
              <button
                class="filter-button ${slot === s ? "active" : ""}"
                data-action="toggle-creator-slot"
                data-slot="${s}"
                type="button"
              >${label}</button>
            `).join("")}
          </div>
        </div>
        ${categories.map((cat) => {
          const catIngredients = stockedIngredients.filter((i) => i.category === cat);
          if (!catIngredients.length) return "";
          return `
            <div class="drawer-group">
              <p class="drawer-group-label">${cat}</p>
              <div class="inventory-list">
                ${catIngredients.map((ing) => {
                  const selected = ingredientIds.includes(ing.id);
                  return `
                    <div
                      class="inventory-row"
                      data-action="toggle-creator-ingredient"
                      data-ingredient-id="${ing.id}"
                      role="button"
                      tabindex="0"
                    >
                      <div class="inventory-row-left">
                        <span class="inventory-row-name">${ing.name}</span>
                        <span class="inventory-row-meta">${ing.acceptedLabel}</span>
                      </div>
                      <div class="drawer-check ${selected ? "checked" : ""}">
                        ${selected ? "✓" : ""}
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>
          `;
        }).join("")}
        ${!stockedIngredients.length ? `<p class="empty-state">先在采购页把买到的食材标为有货。</p>` : ""}
      </div>
      <div style="padding: 12px 16px 16px;">
        <button
          class="primary-button"
          data-action="save-recipe"
          type="button"
          style="width:100%"
          ${ingredientIds.length === 0 ? "disabled" : ""}
        >保存菜谱「${escapeHtml(previewName)}」</button>
      </div>
    </div>
  `;
}

function renderIngredientDrawer(recipeId) {
  const recipe = state.recipes.find((r) => r.id === recipeId);
  if (!recipe) return "";
  const categories = ["蛋白质", "蔬菜", "主食"];

  return `
    <div class="drawer-overlay" data-action="close-recipe-editor" role="button" aria-label="关闭"></div>
    <div class="drawer">
      <div class="drawer-header">
        <div>
          <p class="section-overline">Edit Ingredients</p>
          <h3 class="section-title">${escapeHtml(recipe.name)}</h3>
        </div>
        <button class="ghost-button" data-action="close-recipe-editor" type="button">完成</button>
      </div>
      <div class="drawer-body">
        ${categories.map((cat) => `
          <div class="drawer-group">
            <p class="drawer-group-label">${cat}</p>
            <div class="inventory-list">
              ${state.ingredients
                .filter((ing) => ing.category === cat)
                .map((ing) => {
                  const selected = recipe.ingredientIds.includes(ing.id);
                  return `
                    <div
                      class="inventory-row"
                      data-action="toggle-recipe-ingredient"
                      data-recipe-id="${recipeId}"
                      data-ingredient-id="${ing.id}"
                      role="button"
                      tabindex="0"
                    >
                      <div class="inventory-row-left">
                        <span class="inventory-row-name">${ing.name}</span>
                        <span class="inventory-row-meta">${ing.acceptedLabel}</span>
                      </div>
                      <div class="drawer-check ${selected ? "checked" : ""}">
                        ${selected ? "✓" : ""}
                      </div>
                    </div>
                  `;
                }).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderIngredientLibraryCard(ingredient) {
  return `
    <article class="ingredient-card compact-tile">
      <div class="header-row">
        <div>
          <p class="ingredient-name">${ingredient.name}</p>
          <p class="history-note">${ingredient.category} · ${ingredient.acceptedLabel}</p>
        </div>
        <span class="status-pill stock-${ingredient.stockStatus}">${stockLabel(ingredient.stockStatus)}</span>
      </div>
      <p class="ingredient-note">${ingredient.note}</p>
    </article>
  `;
}

function renderSettingsPage() {
  const standaloneHint = isStandaloneDisplay()
    ? "现在就是桌面模式，打开速度会更像 App。"
    : "如果想每天更顺手，建议加到桌面，用起来像一个家庭小工具。";

  return `
    <section class="dashboard-board">
      ${renderLeadCard({
        overline: "Settings",
        title: "家庭默认设置",
        copy: "把共享入口、首页文案和桌面安装放进两张主卡里，避免设置页也拖成长条。",
        badge: state.profile.stageLabel,
        metrics: [
          ["共享方式", "单入口", "plain"],
          ["当前阶段", state.profile.stageLabel, "sage"],
          ["桌面模式", isStandaloneDisplay() ? "已启用" : "可添加", "warm"],
        ],
      })}
      <section class="content-board settings-board">
        <article class="settings-card compact-card">
          <div class="settings-header">
            <div>
              <p class="section-overline">Profile</p>
              <h3 class="history-title">首页文案</h3>
            </div>
            <span class="badge sage">妈妈高频使用</span>
          </div>
          <div class="settings-grid">
            <label>
              <span class="field-label">宝宝昵称</span>
              <input data-role="profile-field" data-key="babyName" type="text" value="${escapeHtml(state.profile.babyName)}" />
            </label>
            <label>
              <span class="field-label">站点标题</span>
              <input data-role="profile-field" data-key="homeTitle" type="text" value="${escapeHtml(state.profile.homeTitle)}" />
            </label>
          </div>
          <label>
            <span class="field-label">家庭提醒</span>
            <textarea data-role="profile-field" data-key="familyNote" placeholder="比如今天先看冰箱，再决定晚餐要不要换菜谱。">${escapeHtml(state.profile.familyNote)}</textarea>
          </label>
        </article>
        <article class="settings-card compact-card">
          <div class="settings-header">
            <div>
              <p class="section-overline">Access</p>
              <h3 class="history-title">共享入口</h3>
            </div>
            <button class="ghost-button" data-action="install" type="button">添加到桌面</button>
          </div>
          <p class="setting-copy">默认按当前阶段的午餐和晚餐来组织内容，暂时不拆分多个家庭角色。</p>
          <div class="subtle-card">
            <p class="helper-copy">${standaloneHint}</p>
          </div>
        </article>
      </section>
    </section>
  `;
}

function renderLeadCard({ overline, title, copy, badge, metrics = [] }) {
  return `
    <section class="panel-card page-lead-card">
      <div class="section-header">
        <div>
          <p class="section-overline">${overline}</p>
          <h2 class="section-title">${title}</h2>
        </div>
        ${badge ? `<span class="badge sage">${badge}</span>` : ""}
      </div>
      <p class="section-copy page-copy">${copy}</p>
      ${metrics.length ? `<div class="summary-strip">${metrics.map(([label, value, tone]) => renderSummaryCard(label, value, tone)).join("")}</div>` : ""}
    </section>
  `;
}

function renderSummaryCard(label, value, tone = "plain") {
  return `
    <div class="summary-card ${tone}">
      <span class="metric-label">${label}</span>
      <div class="metric-value">${value}</div>
    </div>
  `;
}

function renderBottomNav() {
  const items = [
    ["today", "今日"],
    ["history", "记录"],
    ["inventory", "库存"],
    ["library", "菜谱"],
    ["buy", "采购"],
  ];

  return `
    <nav class="nav-wrap" aria-label="页面切换">
      <div class="nav-row">
        ${items
          .map(
            ([tab, label]) => `
              <button
                class="nav-button ${uiState.activeTab === tab ? "active" : ""}"
                data-action="switch-tab"
                data-tab="${tab}"
                type="button"
              >
                <span class="nav-label">${label}</span>
              </button>
            `,
          )
          .join("")}
      </div>
    </nav>
  `;
}

function renderSwapOption(date, slot, recipe) {
  return `
    <article class="swap-option">
      <div class="header-row">
        <div>
          <p class="history-title">${recipe.name}</p>
          <p class="history-note">${recipe.highlight}</p>
        </div>
        <button
          class="primary-button"
          data-action="replace-recipe"
          data-date="${date}"
          data-slot="${slot}"
          data-recipe-id="${recipe.id}"
          type="button"
        >
          换成这道
        </button>
      </div>
      <div class="pill-row">
        ${recipe.ingredientIds
          .map((ingredientId) => state.ingredients.find((ingredient) => ingredient.id === ingredientId))
          .map((ingredient) => renderIngredientPill(ingredient))
          .join("")}
      </div>
    </article>
  `;
}

function categoryClass(category) {
  if (category === "蛋白质") return "cat-protein";
  if (category === "蔬菜") return "cat-veg";
  if (category === "主食") return "cat-staple";
  return "";
}

function renderIngredientPill(ingredient) {
  const catCls = ingredient?.category ? categoryClass(ingredient.category) : "";
  return `
    <span class="pill ${catCls}">
      ${ingredient.name}
    </span>
  `;
}

function stockLabel(stockStatus) {
  switch (stockStatus) {
    case "missing":
      return "没有";
    case "low":
      return "快没了";
    case "in-stock":
    default:
      return "有";
  }
}

function getTodayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatLongDate(dateString) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${dateString}T00:00:00`));
}

function formatShortDate(dateString) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(`${dateString}T00:00:00`));
}

function weekdayLabel(dateString) {
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
  }).format(new Date(`${dateString}T00:00:00`));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isStandaloneDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

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
  getMealPlan,
  toggleMealCompleted,
  toggleShoppingChecked,
  updateIngredientStock,
  useIngredient,
  resetIngredient,
  updateMealNote,
  updateProfile,
  replaceMealRecipe,
  updateRecipeIngredients,
  releaseIngredients,
  ensureYesterdayPlan,
  setMealRating,
} from "./state.js";
import { isIngredientAvailable, needsIngredientRestock, getIngredientAvailable } from "./ingredient-stock.js";
import { LONG_PRESS_DELAY_MS, movedBeyondLongPressTolerance } from "./longpress.js";
import { isSupabaseEnabled, runtimeConfig } from "./runtime-config.js";

const STORAGE_KEY = "baby-meal-planner-state-v1";
const SHARED_STATE_TABLE = "shared_state";
const root = document.querySelector("#app");

const uiState = {
  activeTab: new URLSearchParams(location.search).get("tab") || "library",
  swapKey: null,
  recipeFilter: "all",
  openCategory: null,
  editingRecipeId: null,
  creatingRecipe: null,
  addingIngredient: null,
  editingIngredientId: null,
  buyingIngredientId: null,
  schedulingRecipeId: null,
  schedulingSlot: null,
  suggestionSeed: Date.now(),
  notice: "",
  installPrompt: null,
  authEmail: runtimeConfig.sharedLoginEmail || "",
  authPassword: "",
};

const cloudState = {
  enabled: isSupabaseEnabled(),
  client: null,
  session: null,
  status: isSupabaseEnabled() ? "checking" : "disabled",
  error: "",
  helper: "",
  lastRemoteUpdatedAt: "",
  subscription: null,
  saveTimer: null,
};

let noticeTimer = null;
let state = initializeState();

render();
attachEvents();
registerPwa();
void initializeCloudSync();

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
  persistLocalState(seeded);
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
        uiState.addingIngredient = { name: "", category: "蛋白质", acceptedLabel: "爱吃", quantity: 1 };
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
      case "set-ingredient-quantity":
        if (uiState.addingIngredient) {
          uiState.addingIngredient.quantity = parseInt(actionTarget.dataset.quantity, 10);
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
          quantity: uiState.addingIngredient.quantity,
          used: 0,
          note: "",
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
        uiState.schedulingSlot = null;
        render();
        break;
      case "clear-meal-slot":
        commit(
          replaceMealRecipe(state, actionTarget.dataset.date, actionTarget.dataset.slot, null),
          "已移除"
        );
        break;
      case "open-schedule-for-slot":
        uiState.schedulingSlot = { date: actionTarget.dataset.date, slot: actionTarget.dataset.slot };
        render();
        break;
      case "close-slot-picker":
        uiState.schedulingSlot = null;
        render();
        break;
      case "select-recipe-for-slot": {
        const { date, slot } = uiState.schedulingSlot;
        uiState.schedulingSlot = null;
        commit(
          replaceMealRecipe(state, date, slot, actionTarget.dataset.recipeId),
          "已放入计划"
        );
        break;
      }
      case "schedule-recipe":
        uiState.schedulingRecipeId = null;
        commit(
          replaceMealRecipe(state, actionTarget.dataset.date, actionTarget.dataset.slot, actionTarget.dataset.recipeId),
          "已放入计划"
        );
        break;
      case "open-recipe-creator":
        uiState.creatingRecipe = { ingredientIds: [], pickingTime: false };
        render();
        break;
      case "add-suggested-recipe": {
        const ingredientIds = actionTarget.dataset.ingredientIds.split(",").filter(Boolean);
        uiState.creatingRecipe = { ingredientIds, pickingTime: true };
        render();
        break;
      }
      case "close-recipe-creator":
        uiState.creatingRecipe = null;
        render();
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
        if (uiState.creatingRecipe.replaceSlot) {
          const { ingredientIds, replaceSlot } = uiState.creatingRecipe;
          const { date, slot } = replaceSlot;
          const newRecipe = {
            id: `custom-${Date.now()}`,
            name: buildRecipeName(ingredientIds),
            stageLabel: "9-12个月",
            slots: [slot],
            ingredientIds,
          };
          uiState.creatingRecipe = null;
          const s1 = addRecipe(state, newRecipe);
          commit(replaceMealRecipe(s1, date, slot, newRecipe.id), "菜谱已更新");
        } else {
          uiState.creatingRecipe.pickingTime = true;
          render();
        }
        break;
      }
      case "confirm-recipe-time": {
        if (!uiState.creatingRecipe) break;
        const { ingredientIds } = uiState.creatingRecipe;
        const date = actionTarget.dataset.date;
        const slot = actionTarget.dataset.slot;
        const newRecipe = {
          id: `custom-${Date.now()}`,
          name: buildRecipeName(ingredientIds),
          stageLabel: "9-12个月",
          slots: [slot],
          ingredientIds,
        };
        uiState.creatingRecipe = null;
        const s1 = addRecipe(state, newRecipe);
        commit(replaceMealRecipe(s1, date, slot, newRecipe.id), "菜谱已保存并加入计划");
        break;
      }
      case "complete-meal": {
        const { date: mealDate, slot: mealSlot } = actionTarget.dataset;
        const mealPlan = getMealPlan(state, mealDate, mealSlot);
        const wasCompleted = mealPlan?.completed ?? false;
        let nextState = toggleMealCompleted(state, mealDate, mealSlot);
        // 标记完成时扣减食材库存，同时释放预留；取消完成时不恢复
        if (!wasCompleted && mealPlan?.recipeId) {
          const recipe = state.recipes.find((r) => r.id === mealPlan.recipeId);
          if (recipe?.ingredientIds) {
            nextState = releaseIngredients(nextState, recipe.ingredientIds);
            for (const ingId of recipe.ingredientIds) {
              nextState = useIngredient(nextState, ingId);
            }
          }
        }
        commit(nextState, wasCompleted ? "已取消完成" : "已标记完成");
        // 标记完成时触发一次性动效
        if (!wasCompleted) {
          const card = root.querySelector(
            `[data-longpress-date="${mealDate}"][data-longpress-slot="${mealSlot}"]`
          );
          if (card) {
            card.classList.add("flash-complete");
            card.addEventListener("animationend", () => card.classList.remove("flash-complete"), { once: true });
          }
        }
        break;
      }
      case "rate-meal": {
        const { date: rateDate, slot: rateSlot, rating } = actionTarget.dataset;
        commit(setMealRating(state, rateDate, rateSlot, rating), rating === "happy" ? "😊 好吃！" : "😔 下次改进");
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
      case "use-ingredient":
        commit(useIngredient(state, actionTarget.dataset.ingredientId), "库存已更新");
        break;
      case "open-buy-quantity":
        uiState.buyingIngredientId = actionTarget.dataset.ingredientId;
        render();
        break;
      case "close-buy-quantity":
        uiState.buyingIngredientId = null;
        render();
        break;
      case "confirm-buy-quantity":
        commit(
          resetIngredient(state, actionTarget.dataset.ingredientId, parseInt(actionTarget.dataset.quantity, 10)),
          "已加入库存"
        );
        uiState.buyingIngredientId = null;
        render();
        break;
      case "open-edit-ingredient":
        uiState.editingIngredientId = actionTarget.dataset.ingredientId;
        render();
        break;
      case "close-edit-ingredient":
        uiState.editingIngredientId = null;
        render();
        break;
      case "reset-ingredient": {
        const qty = parseInt(actionTarget.dataset.quantity, 10);
        commit(resetIngredient(state, uiState.editingIngredientId, qty), "已重置");
        uiState.editingIngredientId = null;
        render();
        break;
      }
      case "set-filter":
        uiState.recipeFilter = actionTarget.dataset.filter;
        render();
        break;
      case "install":
        void promptInstall();
        break;
      case "sign-in-password":
        void signInWithPassword();
        break;
      case "sign-out":
        void signOutSharedAccount();
        break;
      case "sync-now":
        void pushCloudState("manual");
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

    if (target.matches("[data-role='magic-email']")) {
      uiState.authEmail = target.value;
    }
    if (target.matches("[data-role='auth-password']")) {
      uiState.authPassword = target.value;
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

  // Long press detection for ingredient cards
  let longPressTimer = null;
  let longPressFired = false;
  let longPressStartPoint = null;
  let longPressPointerId = null;
  const clearLongPress = (pointerId = null) => {
    if (pointerId !== null && longPressPointerId !== null && pointerId !== longPressPointerId) {
      return;
    }
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    longPressStartPoint = null;
    longPressPointerId = null;
  };
  root.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const ingCard = event.target.closest("[data-longpress-ingredient]");
    const planCard = event.target.closest("[data-longpress-plan]");
    const card = ingCard || planCard;
    if (!card) return;
    clearLongPress();
    longPressFired = false;
    longPressPointerId = event.pointerId;
    longPressStartPoint = { x: event.clientX, y: event.clientY };
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      longPressFired = true;
      longPressStartPoint = null;
      longPressPointerId = null;
      if (ingCard) {
        uiState.editingIngredientId = card.dataset.longpressIngredient;
      } else {
        const lpDate = card.dataset.longpressDate;
        const lpSlot = card.dataset.longpressSlot;
        const existingMeal = getMealPlan(state, lpDate, lpSlot);
        const existingRecipe = existingMeal?.recipeId
          ? state.recipes.find((r) => r.id === existingMeal.recipeId)
          : null;
        uiState.creatingRecipe = {
          ingredientIds: existingRecipe?.ingredientIds ? [...existingRecipe.ingredientIds] : [],
          pickingTime: false,
          replaceSlot: { date: lpDate, slot: lpSlot },
        };
      }
      render();
    }, LONG_PRESS_DELAY_MS);
  });
  root.addEventListener("pointerup", (event) => {
    clearLongPress(event.pointerId);
  });
  root.addEventListener("pointermove", (event) => {
    if (!longPressTimer || !longPressStartPoint) return;
    if (longPressPointerId !== null && event.pointerId !== longPressPointerId) return;
    if (
      movedBeyondLongPressTolerance(longPressStartPoint, {
        x: event.clientX,
        y: event.clientY,
      })
    ) {
      clearLongPress(event.pointerId);
    }
  });
  root.addEventListener("pointercancel", (event) => {
    clearLongPress(event.pointerId);
  });
  root.addEventListener("click", (event) => {
    if (longPressFired) {
      longPressFired = false;
      event.stopImmediatePropagation();
    }
  }, true);

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

async function initializeCloudSync() {
  if (!cloudState.enabled) {
    return;
  }

  try {
    const createClient = globalThis.supabase?.createClient;
    if (!createClient) {
      throw new Error("Supabase SDK 未加载，请刷新页面后重试。");
    }

    cloudState.client = createClient(runtimeConfig.supabaseUrl, runtimeConfig.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

    cloudState.client.auth.onAuthStateChange((_event, session) => {
      void handleSessionChange(session);
    });

    const {
      data: { session },
    } = await cloudState.client.auth.getSession();

    await handleSessionChange(session);
  } catch (error) {
    cloudState.status = "error";
    cloudState.error = error instanceof Error ? error.message : "共享登录初始化失败";
    render();
  }
}

async function handleSessionChange(session) {
  if (!cloudState.enabled) {
    return;
  }

  if (!session) {
    if (cloudState.subscription) {
      void cloudState.subscription.unsubscribe();
      cloudState.subscription = null;
    }
    cloudState.session = null;
    cloudState.status = "signed_out";
    cloudState.helper = "";
    render();
    return;
  }

  const unchangedSession = cloudState.session?.access_token === session.access_token && cloudState.status === "ready";
  cloudState.session = session;
  if (unchangedSession) {
    return;
  }

  cloudState.status = "syncing";
  cloudState.error = "";
  cloudState.helper = "正在同步共享数据…";
  render();

  await loadSharedState();
  subscribeToSharedState();

  cloudState.status = "ready";
  cloudState.helper = "云端同步已连接";
  render();
}

async function signInWithPassword() {
  if (!cloudState.client) return;

  const email = uiState.authEmail.trim();
  const password = uiState.authPassword;

  if (!email || !password) {
    cloudState.error = "请输入邮箱和密码";
    render();
    return;
  }

  cloudState.status = "sending";
  cloudState.error = "";
  cloudState.helper = "";
  render();

  const { error } = await cloudState.client.auth.signInWithPassword({ email, password });

  if (error) {
    cloudState.status = "error";
    cloudState.error = error.message || "登录失败，请检查邮箱和密码";
    render();
    return;
  }

  // session 变化会触发 onAuthStateChange → handleSessionChange → render
}

async function signOutSharedAccount() {
  if (!cloudState.client) {
    return;
  }

  await cloudState.client.auth.signOut();
  cloudState.session = null;
  cloudState.status = "signed_out";
  cloudState.helper = "已退出共享登录";
  render();
}

async function loadSharedState() {
  if (!cloudState.client || !cloudState.session) {
    return;
  }

  const { data, error } = await cloudState.client
    .from(SHARED_STATE_TABLE)
    .select("id, payload, updated_at")
    .eq("id", runtimeConfig.sharedStateId)
    .maybeSingle();

  if (error) {
    cloudState.status = "error";
    cloudState.error = error.message || "读取共享数据失败";
    render();
    return;
  }

  if (!data?.payload) {
    await pushCloudState("seed");
    return;
  }

  applyRemoteState(data.payload, data.updated_at, false);
}

function applyRemoteState(remotePayload, updatedAt, shouldAnnounce = true) {
  const nextState = ensurePlanWindow(remotePayload, getTodayKey());
  const localJson = JSON.stringify(state);
  const remoteJson = JSON.stringify(nextState);

  cloudState.lastRemoteUpdatedAt = updatedAt || cloudState.lastRemoteUpdatedAt;

  if (localJson === remoteJson) {
    return;
  }

  state = nextState;
  persistLocalState(state);
  if (shouldAnnounce) {
    announce("另一台设备的改动已同步");
  }
  render();
}

function subscribeToSharedState() {
  if (!cloudState.client) {
    return;
  }

  if (cloudState.subscription) {
    void cloudState.subscription.unsubscribe();
  }

  cloudState.subscription = cloudState.client
    .channel(`shared-state-${runtimeConfig.sharedStateId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: SHARED_STATE_TABLE,
        filter: `id=eq.${runtimeConfig.sharedStateId}`,
      },
      (payload) => {
        const remotePayload = payload.new?.payload;
        if (!remotePayload) {
          return;
        }

        const updatedAt = payload.new?.updated_at || "";
        if (updatedAt && updatedAt === cloudState.lastRemoteUpdatedAt) {
          return;
        }

        applyRemoteState(remotePayload, updatedAt, true);
      },
    )
    .subscribe();
}

function scheduleCloudSave() {
  if (!cloudState.enabled || !cloudState.session) {
    return;
  }

  if (cloudState.saveTimer) {
    window.clearTimeout(cloudState.saveTimer);
  }

  cloudState.saveTimer = window.setTimeout(() => {
    void pushCloudState("autosave");
  }, 450);
}

async function pushCloudState(reason = "autosave") {
  if (!cloudState.client || !cloudState.session) {
    return;
  }

  const { data, error } = await cloudState.client
    .from(SHARED_STATE_TABLE)
    .upsert(
      {
        id: runtimeConfig.sharedStateId,
        payload: state,
        updated_by: cloudState.session.user.email || "",
      },
      { onConflict: "id" },
    )
    .select("updated_at")
    .single();

  if (error) {
    cloudState.error = error.message || "同步失败";
    cloudState.helper = "";
    render();
    return;
  }

  cloudState.lastRemoteUpdatedAt = data?.updated_at || cloudState.lastRemoteUpdatedAt;
  cloudState.error = "";
  cloudState.helper = reason === "manual" ? "已手动同步到云端" : "数据已同步到云端";
  if (reason === "manual") {
    render();
  }
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
  persistLocalState(state);
  scheduleCloudSave();
  announce(message);
  render();
}

function persistLocalState(nextState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
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
  if (cloudState.enabled && (!cloudState.session || cloudState.status === "checking" || cloudState.status === "sending")) {
    root.innerHTML = renderAuthShell();
    return;
  }

  const prevDrawerScroll = root.querySelector(".drawer-body")?.scrollTop ?? 0;
  const drawerWasOpen = !!root.querySelector(".drawer");

  document.body.dataset.tab = uiState.activeTab;
  const today = getTodayKey();
  const previousPlanCount = state.plans.length;
  state = ensurePlanWindow(state, today);
  state = ensureYesterdayPlan(state, today);
  if (state.plans.length !== previousPlanCount) {
    persistLocalState(state);
    scheduleCloudSave();
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
    ${uiState.editingIngredientId ? renderEditIngredientDrawer(uiState.editingIngredientId) : ""}
    ${uiState.schedulingRecipeId ? renderScheduleDrawer(uiState.schedulingRecipeId) : ""}
    ${uiState.schedulingSlot ? renderSlotRecipePickerDrawer(uiState.schedulingSlot) : ""}
  `;

  const drawer = root.querySelector(".drawer");
  if (drawer) {
    if (!drawerWasOpen) {
      drawer.classList.add("is-opening");
      // 首次打开抽屉时，滚动到第一个已选食材
      const drawerBody = drawer.querySelector(".drawer-body");
      if (drawerBody) {
        const firstChecked = drawerBody.querySelector(".drawer-check.checked");
        if (firstChecked) {
          firstChecked.closest(".inventory-row")?.scrollIntoView({ block: "center" });
        }
      }
    }
    if (prevDrawerScroll > 0) {
      const drawerBody = drawer.querySelector(".drawer-body");
      if (drawerBody) drawerBody.scrollTop = prevDrawerScroll;
    }
  }
}

function renderAuthShell() {
  const isBusy = cloudState.status === "checking" || cloudState.status === "sending";
  const helper = cloudState.error || cloudState.helper || (isBusy ? "正在登录…" : "");

  return `
    <div class="auth-shell fade-up">
      <section class="auth-card">
        <img class="hero-avatar" src="./public/pic.jpg" alt="小橙汁" style="margin-bottom:12px;" />
        <h1 class="auth-title">小橙汁开饭啦</h1>
        <label class="auth-field">
          <span class="field-label">邮箱</span>
          <input
            data-role="magic-email"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder="family@example.com"
            value="${escapeHtml(uiState.authEmail)}"
          />
        </label>
        <label class="auth-field">
          <span class="field-label">密码</span>
          <input
            data-role="auth-password"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••"
          />
        </label>
        <button class="primary-button" data-action="sign-in-password" type="button" ${isBusy ? "disabled" : ""}>
          ${isBusy ? "登录中…" : "登录"}
        </button>
        ${helper ? `<p class="helper-copy" style="text-align:center;margin-top:8px;">${escapeHtml(helper)}</p>` : ""}
      </section>
    </div>
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
    case "settings":
      return renderSettingsPage();
    default:
      return renderLibraryPage();
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
          class="${meal.completed ? "secondary-button is-completed-button" : "primary-button"}"
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

function renderIngredientStats(stats) {
  if (!stats.length) {
    return "";
  }

  const catColor = { "主食": "#bbdff4", "蛋白质": "#fcd5ce", "蔬菜": "#b7ddb0" };
  const catText = { "主食": "#4A6FA5", "蛋白质": "#c0392b", "蔬菜": "#2d6a4f" };
  const maxCount = stats[0].count;

  return `
    <section class="panel-card compact-card wide-card">
      <div class="header-row" style="margin-bottom:12px;">
        <div>
          <p class="section-overline">Past 7 Days</p>
          <h3 class="section-title">食材频率统计</h3>
        </div>
        <span class="badge">${stats.length} 种</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${stats.map((item) => {
          const bg = catColor[item.category] || "#eee";
          const tc = catText[item.category] || "#666";
          const pct = Math.round((item.count / maxCount) * 100);

          return `
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:0.78em;font-weight:600;color:${tc};background:${bg};border-radius:6px;padding:2px 7px;min-width:52px;text-align:center;">${escapeHtml(item.ingredientName)}</span>
              <div style="flex:1;background:#f0f0f0;border-radius:99px;height:8px;overflow:hidden;">
                <div style="width:${pct}%;background:${bg};border:1.5px solid ${tc};height:100%;border-radius:99px;transition:width 0.4s;"></div>
              </div>
              <span style="font-size:0.78em;color:#888;min-width:28px;text-align:right;font-variant-numeric:tabular-nums;">${item.count}次</span>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderHistoryPage(snapshot, today) {
  return `
    <section class="dashboard-board">
      <section class="content-board history-board">
        ${renderIngredientStats(snapshot.ingredientStats)}
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
          .filter((meal) => meal.completed && meal.recipe)
          .map(
            (meal) => `
              <article class="history-item compact-tile">
                <div class="row-between">
                  <span class="badge hot">${meal.slotLabel}</span>
                  <span class="status-pill completed">已打卡</span>
                </div>
                <p class="history-title">${escapeHtml(meal.recipe.name)}</p>
                <div class="pill-row" style="margin-top:4px;">
                  ${(meal.recipe.ingredientIds || [])
                    .map((id) => state.ingredients.find((i) => i.id === id))
                    .filter(Boolean)
                    .map((ing) => renderIngredientPill(ing))
                    .join("")}
                </div>
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
      </div>
      <p class="ingredient-note">最近出现在 ${formatShortDate(ingredient.lastSeenOn)} 的「${escapeHtml(ingredient.seenInRecipe)}」里。</p>
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
                  const qty = ing.quantity ?? 1;
                  const used = ing.used ?? 0;
                  const remaining = qty - used;
                  const hasStock = remaining > 0;
                  const statusText = hasStock ? `${remaining}/${qty}` : "没有";
                  return `
                    <div
                      class="ingredient-toggle-card ${hasStock ? "is-stocked" : ""}"
                      data-action="use-ingredient"
                      data-ingredient-id="${ing.id}"
                      data-longpress-ingredient="${ing.id}"
                      role="button"
                      tabindex="0"
                    >
                      <span class="ingredient-toggle-name">${escapeHtml(ing.name)}</span>
                      <span class="ingredient-toggle-label">${ing.acceptedLabel}</span>
                      <span class="ingredient-toggle-status${hasStock ? "" : " is-empty"}">${statusText}</span>
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
  const { name, category, acceptedLabel, quantity } = uiState.addingIngredient;
  const categories = ["蛋白质", "蔬菜", "主食"];
  const accepted = ["爱吃", "一般"];
  const quantities = [1, 2, 3, 4, 5];

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
                class="filter-button drawer-filter-button ${category === cat ? "active" : ""}"
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
                class="filter-button drawer-filter-button ${acceptedLabel === lbl ? "active" : ""}"
                data-action="set-ingredient-accepted"
                data-label="${lbl}"
                type="button"
              >${lbl}</button>
            `).join("")}
          </div>
        </div>
        <div class="drawer-group">
          <p class="drawer-group-label">数量</p>
          <div class="filter-row">
            ${quantities.map((q) => `
              <button
                class="filter-button drawer-filter-button ${quantity === q ? "active" : ""}"
                data-action="set-ingredient-quantity"
                data-quantity="${q}"
                type="button"
              >${q}</button>
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

function renderEditIngredientDrawer(ingredientId) {
  const ing = state.ingredients.find((i) => i.id === ingredientId);
  if (!ing) return "";
  const qty = ing.quantity ?? 1;
  const quantities = [1, 2, 3, 4, 5];
  return `
    <div class="drawer-overlay" data-action="close-edit-ingredient" role="button" aria-label="关闭"></div>
    <div class="drawer">
      <div class="drawer-header">
        <div>
          <p class="section-overline">Edit Stock</p>
          <h3 class="section-title">${escapeHtml(ing.name)}</h3>
        </div>
        <button class="ghost-button" data-action="close-edit-ingredient" type="button">取消</button>
      </div>
      <div class="drawer-body">
        <div class="drawer-group">
          <p class="drawer-group-label">修改数量</p>
          <div class="filter-row">
            ${quantities.map((q) => `
              <button
                class="filter-button drawer-filter-button ${qty === q ? "active" : ""}"
                data-action="reset-ingredient"
                data-quantity="${q}"
                type="button"
              >${q}</button>
            `).join("")}
          </div>
        </div>
      </div>
      <div style="padding:12px 16px 16px;">
        <button
          class="primary-button"
          data-action="reset-ingredient"
          data-quantity="${qty}"
          type="button"
          style="width:100%;"
        >重置（恢复 ${qty}/${qty}）</button>
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

function isRecipeAvailable(recipe) {
  return recipe.ingredientIds.every((id) => {
    const ing = state.ingredients.find((i) => i.id === id);
    return !ing || getIngredientAvailable(ing) > 0;
  });
}

function renderSlotRecipePickerDrawer({ date, slot }) {
  const slotLabel = slot === "lunch" ? "午餐" : "晚餐";
  const currentMeal = state.plans.find((p) => p.date === date)?.meals.find((m) => m.slot === slot);
  const availableRecipes = state.recipes.filter((r) => {
    // 当前已选菜谱始终显示（替换自身不消耗新库存）
    if (r.id === currentMeal?.recipeId) return true;
    return isRecipeAvailable(r);
  });
  return `
    <div class="drawer-overlay" data-action="close-slot-picker" role="button" aria-label="关闭"></div>
    <div class="drawer is-opening">
      <div class="drawer-header">
        <div>
          <p class="section-overline">选择菜谱</p>
          <h3 class="section-title">${formatShortDate(date)} ${slotLabel}</h3>
        </div>
        <button class="ghost-button" data-action="close-slot-picker" type="button">取消</button>
      </div>
      <div class="drawer-body">
        ${availableRecipes.length ? `
          <div class="inventory-list">
            ${availableRecipes.map((r) => {
              const ings = r.ingredientIds
                .map((id) => state.ingredients.find((i) => i.id === id))
                .filter(Boolean)
                .map((i) => i.name).join("·");
              return `
                <div
                  class="inventory-row"
                  data-action="select-recipe-for-slot"
                  data-recipe-id="${r.id}"
                  role="button"
                  tabindex="0"
                >
                  <span class="inventory-row-name">${escapeHtml(r.name)}</span>
                  <span class="inventory-row-meta">${escapeHtml(ings)}</span>
                </div>
              `;
            }).join("")}
          </div>
        ` : `<p class="empty-state">食材库存不足，无可用菜谱。</p>`}
      </div>
    </div>
  `;
}

function renderBuyPage() {
  const missingItems = state.ingredients.filter((ingredient) => needsIngredientRestock(ingredient));

  return `
    <section class="dashboard-board">
      <section class="content-board shopping-board">
        <section class="panel-card compact-card wide-card">
          <div class="shopping-header">
            <div>
              <p class="section-overline">Buy List</p>
              <h3 class="section-title">待采购</h3>
            </div>
            <span class="badge hot">${missingItems.length} 项</span>
          </div>
          ${
            missingItems.length
              ? `<div class="inventory-list">${missingItems.map((ing) => `
                  <div
                    class="inventory-row buy-item"
                    data-action="open-buy-quantity"
                    data-ingredient-id="${ing.id}"
                    role="button"
                    tabindex="0"
                  >
                    <div class="inventory-row-left">
                      <span class="inventory-row-name">${escapeHtml(ing.name)}</span>
                      <span class="inventory-row-meta">${ing.category} · ${ing.acceptedLabel}</span>
                    </div>
                    <span class="buy-item-hint">选数量 →</span>
                  </div>
                `).join("")}</div>`
              : `<div class="empty-state">库存充足，没有待采购食材。</div>`
          }
        </section>
      </section>
    </section>
    ${uiState.buyingIngredientId ? renderBuyQuantityDrawer(uiState.buyingIngredientId) : ""}
  `;
}

function renderBuyQuantityDrawer(ingredientId) {
  const ing = state.ingredients.find((i) => i.id === ingredientId);
  if (!ing) return "";
  const quantities = [1, 2, 3, 4, 5];
  return `
    <div class="drawer-overlay" data-action="close-buy-quantity" role="button" aria-label="关闭"></div>
    <div class="drawer is-opening">
      <div class="drawer-header">
        <div>
          <p class="section-overline">Buy</p>
          <h3 class="section-title">${escapeHtml(ing.name)}</h3>
        </div>
        <button class="ghost-button" data-action="close-buy-quantity" type="button">取消</button>
      </div>
      <div class="drawer-body">
        <div class="drawer-group">
          <p class="drawer-group-label">买了几个？</p>
          <div class="filter-row">
            ${quantities.map((q) => `
              <button
                class="filter-button drawer-filter-button"
                data-action="confirm-buy-quantity"
                data-ingredient-id="${ingredientId}"
                data-quantity="${q}"
                type="button"
              >${q}</button>
            `).join("")}
          </div>
        </div>
      </div>
    </div>
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
            <h3 class="section-title">我的库存</h3>
          </div>
        </div>
        ${categories.map((cat) => {
          const ings = state.ingredients.filter((i) => i.category === cat);
          if (!ings.length) return "";
          return `
            <div>
              <p class="drawer-group-label"><span class="badge ${categoryClass(cat)}">${cat}</span></p>
              <div class="ingredient-toggle-grid">
                ${ings.map((ing) => {
                  const qty = ing.quantity ?? 1;
                  const used = ing.used ?? 0;
                  const remaining = qty - used;
                  const hasStock = remaining > 0;
                  const statusText = hasStock ? `${remaining}/${qty}` : "没有";
                  return `
                    <div
                      class="ingredient-toggle-card with-remove ${hasStock ? "is-stocked " + categoryClass(cat) : ""}"
                      data-action="use-ingredient"
                      data-ingredient-id="${ing.id}"
                      data-longpress-ingredient="${ing.id}"
                      role="button"
                      tabindex="0"
                    >
                      <button
                        class="ingredient-remove-button"
                        data-action="delete-ingredient"
                        data-ingredient-id="${ing.id}"
                        type="button"
                        aria-label="删除 ${escapeHtml(ing.name)}"
                      >x</button>
                      <span class="ingredient-toggle-name">${escapeHtml(ing.name)}</span>
                      <span class="ingredient-toggle-label">${ing.acceptedLabel}</span>
                      <span class="ingredient-toggle-status${hasStock ? "" : " is-empty"}">${statusText}</span>
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
  const today = getTodayKey();
  const yesterday = (() => {
    const [y, m, d] = today.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    return dt.toISOString().slice(0, 10);
  })();
  const tomorrow = (() => {
    const [y, m, d] = today.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
  })();

      return `
    <section class="dashboard-board">
      <section class="panel-card compact-card">
        <div class="header-row plan-board-header" style="align-items:center;">
          <div>
            <p class="section-overline">Yesterday · Today · Tomorrow</p>
            <h3 class="section-title">饮食计划</h3>
          </div>
          <button class="primary-button plan-board-create" data-action="open-recipe-creator" type="button">+ 新建菜谱</button>
        </div>
      </section>
      <section class="content-board library-board">
        ${renderSuggestedRecipes()}
        ${renderDayPlanCard(yesterday, "昨天")}
        ${renderDayPlanCard(today, "今天")}
        ${renderDayPlanCard(tomorrow, "明天")}
      </section>
    </section>
  `;
}

function renderDayPlanCard(date, dayLabel) {
  const lunch = getMealViewModel(state, date, "lunch");
  const dinner = getMealViewModel(state, date, "dinner");
  const [, m, d] = date.split("-").map(Number);
  const dateLabel = `${m}/${d}`;
  return `
    <section class="panel-card compact-card wide-card">
      <div class="header-row" style="margin-bottom:12px;">
        <h3 class="section-title">${dayLabel} <span style="font-size:0.75em;font-weight:400;color:var(--text-secondary);margin-left:4px;">${dateLabel}</span></h3>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${renderMealSlotCard(date, "lunch", "午餐", lunch)}
        ${renderMealSlotCard(date, "dinner", "晚餐", dinner)}
      </div>
    </section>
  `;
}

function renderMealSlotCard(date, slot, slotLabel, meal) {
  if (!meal) {
    return `
      <div class="meal-slot-empty">
        <span class="meal-slot-empty-label">${slotLabel}</span>
        <span class="meal-slot-empty-hint">暂未安排</span>
      </div>
    `;
  }

  const ingredients = meal.ingredients;
  const recipe = meal.recipe;
  const isLunch = slot === "lunch";
  const completed = meal.completed;
  const rating = meal.rating ?? null;

  return `
    <article
      class="plan-recipe-card ${completed ? "is-completed" : ""}"
      data-longpress-plan="${recipe.id}"
      data-longpress-date="${date}"
      data-longpress-slot="${slot}"
    >
      <div class="plan-recipe-actions">
        <button
          class="plan-recipe-complete ${completed ? "done" : ""}"
          data-action="complete-meal"
          data-date="${date}"
          data-slot="${slot}"
          type="button"
          aria-label="标记完成"
        >✓</button>
        <button
          class="plan-recipe-remove"
          data-action="clear-meal-slot"
          data-date="${date}"
          data-slot="${slot}"
          type="button"
          aria-label="移除"
        >×</button>
      </div>
      <p class="recipe-name">${escapeHtml(recipe.name)}</p>
      <div class="pill-row" style="margin-top:6px;">
        ${ingredients.map((ing) => renderIngredientPill(ing)).join("")}
      </div>
      <div class="plan-recipe-footer">
        ${completed ? `
        <div class="meal-rating-row">
          <button
            class="meal-rating-btn ${rating === "happy" ? "selected" : ""}"
            data-action="rate-meal"
            data-date="${date}"
            data-slot="${slot}"
            data-rating="happy"
            type="button"
            aria-label="好吃"
            title="好吃"
          ><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 14s1.6 2.1 4 2.1 4-2.1 4-2.1"/><line x1="9" y1="9.4" x2="9.01" y2="9.4"/><line x1="15" y1="9.4" x2="15.01" y2="9.4"/></svg></button>
          <button
            class="meal-rating-btn ${rating === "sad" ? "selected" : ""}"
            data-action="rate-meal"
            data-date="${date}"
            data-slot="${slot}"
            data-rating="sad"
            type="button"
            aria-label="不好吃"
            title="不好吃"
          ><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16s-1.6-2.1-4-2.1-4 2.1-4 2.1"/><line x1="9" y1="9.4" x2="9.01" y2="9.4"/><line x1="15" y1="9.4" x2="15.01" y2="9.4"/></svg></button>
        </div>
        ` : '<span class="meal-rating-placeholder" aria-hidden="true"></span>'}
        <span class="plan-recipe-slot-badge badge ${isLunch ? "hot" : "sage"}">${slotLabel}</span>
      </div>
    </article>
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
  const stocked = state.ingredients.filter((ingredient) => getIngredientAvailable(ingredient) > 0);
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
  return ings.map((i) => i.name).join("·") || "新菜谱";
}

function renderRecipeCreatorDrawer() {
  const { ingredientIds, pickingTime } = uiState.creatingRecipe;
  const previewName = buildRecipeName(ingredientIds);

  if (pickingTime) {
    const today = getTodayKey();
    const tomorrow = (() => {
      const [y, m, d] = today.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() + 1);
      return dt.toISOString().slice(0, 10);
    })();
    const timeSlots = [
      { date: today,    slot: "lunch",  label: "今天午餐" },
      { date: today,    slot: "dinner", label: "今天晚餐" },
      { date: tomorrow, slot: "lunch",  label: "明天午餐" },
      { date: tomorrow, slot: "dinner", label: "明天晚餐" },
    ];
    return `
      <div class="drawer-overlay" data-action="close-recipe-creator" role="button" aria-label="关闭"></div>
      <div class="drawer is-opening">
        <div class="drawer-header">
          <div>
            <p class="section-overline">选择时间</p>
            <h3 class="section-title">${escapeHtml(previewName)}</h3>
          </div>
          <button class="ghost-button" data-action="close-recipe-creator" type="button">取消</button>
        </div>
        <div class="drawer-body">
          <div class="inventory-list">
            ${timeSlots.map(({ date, slot, label }) => `
              <div
                class="inventory-row"
                data-action="confirm-recipe-time"
                data-date="${date}"
                data-slot="${slot}"
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

  const categories = ["蛋白质", "蔬菜", "主食"];
  const stockedIngredients = state.ingredients.filter((ingredient) => isIngredientAvailable(ingredient));

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
        ${!stockedIngredients.length ? `<p class="empty-state">先在库存页添加食材。</p>` : ""}
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
        ${renderCloudSettingsCard()}
      </section>
    </section>
  `;
}

function renderCloudSettingsCard() {
  if (!cloudState.enabled) {
    return `
      <article class="settings-card compact-card">
        <div class="settings-header">
          <div>
            <p class="section-overline">Sync</p>
            <h3 class="history-title">云端同步</h3>
          </div>
          <span class="sync-pill pending">本地模式</span>
        </div>
        <p class="setting-copy">还没有配置 Supabase 环境变量，所以当前只保存在本机浏览器。</p>
      </article>
    `;
  }

  const statusTone = cloudState.error ? "error" : cloudState.session ? "ready" : "pending";
  const statusText = cloudState.error
    ? "同步异常"
    : cloudState.session
      ? "已连接"
      : "未登录";

  return `
    <article class="settings-card compact-card">
      <div class="settings-header">
        <div>
          <p class="section-overline">Sync</p>
          <h3 class="history-title">共享数据库</h3>
        </div>
        <span class="sync-pill ${statusTone}">${statusText}</span>
      </div>
      <p class="setting-copy">${escapeHtml(cloudState.helper || cloudState.error || "登录同一个共享邮箱后，两台设备会共用同一份云端数据。")}</p>
      <div class="subtle-card sync-status-card">
        <p class="helper-copy">当前邮箱：${escapeHtml(cloudState.session?.user?.email || uiState.authEmail || "未设置")}</p>
      </div>
      <div class="filter-row">
        <button class="ghost-button" data-action="sync-now" type="button" ${cloudState.session ? "" : "disabled"}>立即同步</button>
        <button class="ghost-button" data-action="sign-out" type="button" ${cloudState.session ? "" : "disabled"}>退出共享登录</button>
      </div>
    </article>
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
    ["library", "计划"],
    ["history", "记录"],
    ["inventory", "库存"],
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

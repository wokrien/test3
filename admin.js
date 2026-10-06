
const STORAGE_THEME = "wokrienResselTheme";

const cfg = window.WOKRIEN_CONFIG || {};
const configured =
  cfg.SUPABASE_URL &&
  cfg.SUPABASE_ANON_KEY &&
  !cfg.SUPABASE_URL.includes("PASTE_") &&
  !cfg.SUPABASE_ANON_KEY.includes("PASTE_");

const db = configured
  ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
  : null;

const body = document.body;
const themeToggle = document.getElementById("themeToggle");
const themeLabel = document.querySelector(".theme-label");
const themeIcon = document.querySelector(".theme-icon");

const loginView = document.getElementById("loginView");
const adminView = document.getElementById("adminView");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const productForm = document.getElementById("productForm");
const adminProducts = document.getElementById("adminProducts");
const formMessage = document.getElementById("formMessage");
const productCount = document.getElementById("productCount");
const adminIdentity = document.getElementById("adminIdentity");
const adminOrders = document.getElementById("adminOrders");
const orderCount = document.getElementById("orderCount");

function escapeHtml(value = ""){
  return String(value)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function formatPrice(value){
  return new Intl.NumberFormat("ru-RU").format(Number(value || 0)) + " ₽";
}

function formatDate(value){
  if(!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function setTheme(theme){
  const dark = theme === "dark";
  body.classList.toggle("dark-theme",dark);
  body.classList.toggle("light-theme",!dark);
  themeLabel.textContent = dark ? "Dark" : "Light";
  themeIcon.textContent = dark ? "☾" : "☀";
  localStorage.setItem(STORAGE_THEME,theme);
}

themeToggle.addEventListener("click",() => {
  setTheme(body.classList.contains("dark-theme") ? "light" : "dark");
});
setTheme(localStorage.getItem(STORAGE_THEME) || "light");

function showError(message){
  loginError.hidden = false;
  loginError.textContent = message;
}

function showFormMessage(message, ok = true){
  formMessage.hidden = false;
  formMessage.textContent = message;
  formMessage.className = ok ? "admin-success" : "admin-error";
  setTimeout(() => formMessage.hidden = true,2200);
}

function requireConfig(){
  if(db) return true;
  showError("Supabase не настроен. Заполните config.js.");
  return false;
}

async function isCurrentUserAdmin(userId){
  const { data, error } = await db
    .from("admin_users")
    .select("user_id")
    .eq("user_id",userId)
    .maybeSingle();

  return !error && !!data;
}

async function refreshAuthView(){
  if(!requireConfig()){
    loginView.hidden = false;
    adminView.hidden = true;
    return;
  }

  const { data: { session } } = await db.auth.getSession();

  if(!session?.user){
    loginView.hidden = false;
    adminView.hidden = true;
    return;
  }

  const admin = await isCurrentUserAdmin(session.user.id);
  if(!admin){
    await db.auth.signOut();
    loginView.hidden = false;
    adminView.hidden = true;
    showError("У этой учётной записи нет прав администратора.");
    return;
  }

  loginView.hidden = true;
  adminView.hidden = false;
  adminIdentity.textContent = `Вход: ${session.user.email || "admin"}`;

  await Promise.all([loadProducts(), loadOrders()]);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if(!requireConfig()) return;

  loginError.hidden = true;

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  const { error } = await db.auth.signInWithPassword({ email, password });

  if(error){
    showError(error.message);
    return;
  }

  await refreshAuthView();
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  if(db) await db.auth.signOut();
  await refreshAuthView();
});

document.getElementById("reloadProducts").addEventListener("click", async () => {
  await Promise.all([loadProducts(), loadOrders()]);
});

async function loadProducts(){
  if(!db) return;

  adminProducts.innerHTML = `<div class="admin-note">Загрузка…</div>`;

  const { data, error } = await db
    .from("products")
    .select("*")
    .order("created_at",{ascending:false});

  if(error){
    adminProducts.innerHTML = `<div class="admin-error">${escapeHtml(error.message)}</div>`;
    return;
  }

  productCount.textContent = data.length;

  if(!data.length){
    adminProducts.innerHTML = `<div class="admin-note">Предметов пока нет.</div>`;
    return;
  }

  adminProducts.innerHTML = data.map(product => `
    <div class="admin-product-row">
      <div class="admin-product-main">
        <h3>${escapeHtml(product.icon || "✦")} ${escapeHtml(product.title)}</h3>
        <p>${formatPrice(product.price)} • ${escapeHtml(product.badge || "предмет")}</p>
      </div>

      <div class="stock-controls">
        <button class="stock-mini" onclick="changeStock('${product.id}', -1)">−</button>
        <div class="stock-value">${Number(product.stock || 0)}</div>
        <button class="stock-mini" onclick="changeStock('${product.id}', 1)">+</button>
        <button class="admin-btn danger" onclick="deleteProduct('${product.id}')">Удалить</button>
      </div>
    </div>
  `).join("");
}

async function loadOrders(){
  if(!db) return;

  adminOrders.innerHTML = `<div class="admin-note">Загрузка заказов…</div>`;

  const { data, error } = await db
    .from("orders")
    .select(`
      id,
      label,
      status,
      amount,
      received_amount,
      withdraw_amount,
      yoomoney_operation_id,
      created_at,
      paid_at,
      order_items (
        product_title,
        quantity,
        unit_price
      )
    `)
    .order("created_at",{ascending:false})
    .limit(100);

  if(error){
    adminOrders.innerHTML = `<div class="admin-error">${escapeHtml(error.message)}</div>`;
    return;
  }

  orderCount.textContent = data.length;

  if(!data.length){
    adminOrders.innerHTML = `<div class="admin-note">Заказов пока нет.</div>`;
    return;
  }

  adminOrders.innerHTML = data.map(order => {
    const items = (order.order_items || [])
      .map(item => `${escapeHtml(item.product_title)} × ${Number(item.quantity)}`)
      .join(", ");

    const statusLabel = {
      pending: "Ожидает оплату",
      paid: "Оплачен",
      paid_manual_review: "Оплачен / проверка",
      cancelled: "Отменён"
    }[order.status] || order.status;

    return `
      <article class="admin-order">
        <div class="admin-order-top">
          <div>
            <div class="admin-order-label">${escapeHtml(order.label)}</div>
            <div class="admin-order-items">${items || "—"}</div>
          </div>
          <span class="order-status status-${escapeHtml(order.status)}">${escapeHtml(statusLabel)}</span>
        </div>

        <div class="admin-order-meta">
          <div><span>Сумма</span><strong>${formatPrice(order.amount)}</strong></div>
          <div><span>Создан</span><strong>${formatDate(order.created_at)}</strong></div>
          <div><span>Оплачен</span><strong>${formatDate(order.paid_at)}</strong></div>
          <div><span>Operation ID</span><strong>${escapeHtml(order.yoomoney_operation_id || "—")}</strong></div>
        </div>

        ${order.status === "pending" ? `
          <div class="admin-order-actions">
            <button class="admin-btn danger" onclick="cancelOrder('${order.id}')">Отменить заказ</button>
          </div>
        ` : ""}
      </article>
    `;
  }).join("");
}

async function changeStock(id, delta){
  const { data: current, error: readError } = await db
    .from("products")
    .select("stock")
    .eq("id",id)
    .single();

  if(readError){
    showFormMessage(readError.message,false);
    return;
  }

  const nextStock = Math.max(0, Number(current.stock || 0) + delta);

  const { error } = await db
    .from("products")
    .update({ stock: nextStock })
    .eq("id",id);

  if(error){
    showFormMessage(error.message,false);
    return;
  }

  await loadProducts();
}

async function deleteProduct(id){
  if(!confirm("Удалить этот предмет?")) return;

  const { error } = await db.from("products").delete().eq("id",id);

  if(error){
    showFormMessage(error.message,false);
    return;
  }

  await loadProducts();
}

async function cancelOrder(id){
  if(!confirm("Отменить этот ожидающий заказ?")) return;

  const { error } = await db.rpc("cancel_pending_order", {
    p_order_id: id
  });

  if(error){
    alert(error.message);
    return;
  }

  await loadOrders();
}

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    title: document.getElementById("title").value.trim(),
    price: Number(document.getElementById("price").value || 0),
    stock: Number(document.getElementById("stock").value || 0),
    badge: document.getElementById("badge").value.trim() || "Предмет",
    icon: document.getElementById("icon").value.trim() || "✦",
    description: document.getElementById("description").value.trim(),
    popularity: 80
  };

  const { error } = await db.from("products").insert(payload);

  if(error){
    showFormMessage(error.message,false);
    return;
  }

  showFormMessage("Предмет добавлен");
  productForm.reset();
  document.getElementById("price").value = 990;
  document.getElementById("stock").value = 1;
  document.getElementById("icon").value = "✦";
  await loadProducts();
});

if(db){
  db.auth.onAuthStateChange(() => {
    setTimeout(refreshAuthView,0);
  });
}

refreshAuthView();

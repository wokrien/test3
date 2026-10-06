
const STORAGE_CART = "wokrienResselCartV6";
const STORAGE_THEME = "wokrienResselTheme";
const STORAGE_LAST_ORDER = "wokrienResselLastOrder";

const cfg = window.WOKRIEN_CONFIG || {};
const configured =
  cfg.SUPABASE_URL &&
  cfg.SUPABASE_ANON_KEY &&
  !cfg.SUPABASE_URL.includes("PASTE_") &&
  !cfg.SUPABASE_ANON_KEY.includes("PASTE_");

const db = configured
  ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
  : null;

let products = [];
let cart = JSON.parse(localStorage.getItem(STORAGE_CART) || "[]");
let checkoutBusy = false;

const body = document.body;
const productsGrid = document.getElementById("productsGrid");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const cartCount = document.getElementById("cartCount");
const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");
const cartPanel = document.getElementById("cartPanel");
const overlay = document.getElementById("overlay");
const toast = document.getElementById("toast");
const heroMascot = document.getElementById("heroMascot");
const themeToggle = document.getElementById("themeToggle");
const themeLabel = document.querySelector(".theme-label");
const themeIcon = document.querySelector(".theme-icon");
const paymentModal = document.getElementById("paymentModal");
const paymentModalClose = document.getElementById("paymentModalClose");
const checkoutMessage = document.getElementById("checkoutMessage");

function formatPrice(value){
  return new Intl.NumberFormat("ru-RU").format(Number(value || 0)) + " ₽";
}

function escapeHtml(value = ""){
  return String(value)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

async function loadProducts(){
  if(!db){
    productsGrid.innerHTML = `
      <div class="promo-card setup-warning" style="grid-column:1/-1">
        <strong>Supabase ещё не подключён.</strong>
        <p>Заполните <code>config.js</code> по инструкции из README.txt.</p>
      </div>
    `;
    return;
  }

  productsGrid.innerHTML = `
    <div class="promo-card" style="grid-column:1/-1;text-align:center">
      Загружаю предметы…
    </div>
  `;

  const { data, error } = await db
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if(error){
    productsGrid.innerHTML = `
      <div class="promo-card setup-warning" style="grid-column:1/-1">
        <strong>Не удалось загрузить предметы.</strong>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
    return;
  }

  products = data || [];
  renderProducts();
}

function renderProducts(){
  const query = searchInput.value.trim().toLowerCase();
  let filtered = products.filter(product => {
    const haystack = `${product.title} ${product.description || ""} ${product.badge || ""}`.toLowerCase();
    return haystack.includes(query);
  });

  if(sortSelect.value === "price-asc") filtered.sort((a,b) => Number(a.price) - Number(b.price));
  if(sortSelect.value === "price-desc") filtered.sort((a,b) => Number(b.price) - Number(a.price));
  if(sortSelect.value === "popular") filtered.sort((a,b) => Number(b.popularity || 0) - Number(a.popularity || 0));

  if(!filtered.length){
    productsGrid.innerHTML = `<div class="promo-card" style="grid-column:1/-1;text-align:center">Предметов пока нет ☁</div>`;
    return;
  }

  productsGrid.innerHTML = filtered.map(product => {
    const inStock = Number(product.stock || 0) > 0;
    return `
      <article class="product-card">
        <div class="product-top">
          <div class="product-badge">${escapeHtml(product.badge || "Предмет")}</div>
          <div class="product-icon">${escapeHtml(product.icon || "✦")}</div>
        </div>

        <div class="product-body">
          <div class="product-category">Предмет</div>
          <h3 class="product-title">${escapeHtml(product.title)}</h3>
          <p class="product-desc">${escapeHtml(product.description || "")}</p>

          <div class="product-meta">
            <span>• ${inStock ? `в наличии: ${Number(product.stock)}` : "нет в наличии"}</span>
            <span>• оплата через ЮMoney</span>
          </div>

          <div class="product-bottom">
            <div class="price">${formatPrice(product.price)}</div>
            <button
              class="add-btn"
              ${!inStock ? "disabled" : ""}
              onclick="addToCart('${product.id}')"
            >
              ${inStock ? "В корзину" : "Нет стока"}
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function addToCart(id){
  const item = products.find(p => String(p.id) === String(id));
  if(!item) return;

  if(Number(item.stock || 0) <= 0){
    showToast("Предмет закончился");
    return;
  }

  const alreadyInCart = cart.filter(p => String(p.id) === String(id)).length;
  if(alreadyInCart >= Number(item.stock || 0)){
    showToast("Больше доступного стока добавить нельзя");
    return;
  }

  cart.push({
    id: item.id,
    title: item.title,
    icon: item.icon,
    price: Number(item.price || 0)
  });

  saveCart();
  showToast("Добавлено в корзину ♡");
}

function removeCartItem(index){
  cart.splice(index,1);
  saveCart();
}

function saveCart(){
  localStorage.setItem(STORAGE_CART, JSON.stringify(cart));
  renderCart();
}

function renderCart(){
  cartCount.textContent = cart.length;

  if(!cart.length){
    cartItems.innerHTML = `
      <div class="cart-empty">
        <div class="big">☁</div>
        <p>Корзина пока пустая</p>
      </div>
    `;
    cartTotal.textContent = "0 ₽";
    return;
  }

  cartItems.innerHTML = cart.map((item,index) => `
    <div class="cart-item">
      <div class="cart-item-icon">${escapeHtml(item.icon || "✦")}</div>
      <div>
        <h4>${escapeHtml(item.title)}</h4>
        <small>${formatPrice(item.price)}</small>
      </div>
      <button class="remove-item" onclick="removeCartItem(${index})" aria-label="Удалить">×</button>
    </div>
  `).join("");

  cartTotal.textContent = formatPrice(
    cart.reduce((sum,item) => sum + Number(item.price || 0),0)
  );
}

function openCart(){
  cartPanel.classList.add("open");
  overlay.classList.add("show");
  cartPanel.setAttribute("aria-hidden","false");
}

function closeCart(){
  cartPanel.classList.remove("open");
  cartPanel.setAttribute("aria-hidden","true");
  if(!paymentModal.classList.contains("open")) overlay.classList.remove("show");
}

function openPaymentModal(){
  if(!cart.length){
    showToast("Сначала добавьте предмет ☁");
    return;
  }
  closeCart();
  paymentModal.classList.add("open");
  paymentModal.setAttribute("aria-hidden","false");
  overlay.classList.add("show");
  checkoutMessage.hidden = true;
}

function closePaymentModal(){
  if(checkoutBusy) return;
  paymentModal.classList.remove("open");
  paymentModal.setAttribute("aria-hidden","true");
  overlay.classList.remove("show");
}

function showToast(message){
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove("show"),1700);
}

function setCheckoutMessage(message, isError = false){
  checkoutMessage.hidden = false;
  checkoutMessage.textContent = message;
  checkoutMessage.className = isError ? "payment-message error" : "payment-message";
}

function aggregateCart(){
  const counts = new Map();
  for(const item of cart){
    const id = String(item.id);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()].map(([product_id, quantity]) => ({
    product_id,
    quantity
  }));
}

async function startCheckout(paymentType){
  if(checkoutBusy || !configured) {
    if(!configured) setCheckoutMessage("Сначала настройте Supabase в config.js.", true);
    return;
  }

  checkoutBusy = true;
  document.querySelectorAll(".payment-method").forEach(btn => btn.disabled = true);
  setCheckoutMessage("Создаю заказ…");

  try{
    const response = await fetch(`${cfg.SUPABASE_URL}/functions/v1/create-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": cfg.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${cfg.SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        items: aggregateCart(),
        payment_type: paymentType
      })
    });

    const data = await response.json();

    if(!response.ok){
      throw new Error(data.error || "Не удалось создать заказ");
    }

    localStorage.setItem(STORAGE_LAST_ORDER, data.label);

    const form = document.createElement("form");
    form.method = "POST";
    form.action = data.action;
    form.style.display = "none";

    for(const [name, value] of Object.entries(data.fields)){
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = String(value);
      form.appendChild(input);
    }

    document.body.appendChild(form);

    // Заказ создан на сервере. Корзину можно очистить перед переходом.
    cart = [];
    saveCart();

    setCheckoutMessage("Перенаправляю в ЮMoney…");
    form.submit();
  }catch(error){
    console.error(error);
    setCheckoutMessage(error.message || "Ошибка оплаты", true);
    checkoutBusy = false;
    document.querySelectorAll(".payment-method").forEach(btn => btn.disabled = false);
  }
}

function setTheme(theme){
  const isDark = theme === "dark";
  body.classList.toggle("dark-theme",isDark);
  body.classList.toggle("light-theme",!isDark);

  heroMascot.src = isDark ? heroMascot.dataset.dark : heroMascot.dataset.light;
  themeLabel.textContent = isDark ? "Dark" : "Light";
  themeIcon.textContent = isDark ? "☾" : "☀";

  localStorage.setItem(STORAGE_THEME,theme);
}

searchInput.addEventListener("input",renderProducts);
sortSelect.addEventListener("change",renderProducts);
document.getElementById("cartOpenBtn").addEventListener("click",openCart);
document.getElementById("cartCloseBtn").addEventListener("click",closeCart);
document.getElementById("checkoutBtn").addEventListener("click",openPaymentModal);

paymentModalClose.addEventListener("click",closePaymentModal);
overlay.addEventListener("click",() => {
  closeCart();
  closePaymentModal();
});

document.querySelectorAll(".payment-method").forEach(btn => {
  btn.addEventListener("click",() => startCheckout(btn.dataset.paymentType));
});

themeToggle.addEventListener("click",() => {
  setTheme(body.classList.contains("dark-theme") ? "light" : "dark");
});

setTheme(localStorage.getItem(STORAGE_THEME) || "light");
renderCart();
loadProducts();


const STORAGE_THEME = "wokrienResselTheme";
const STORAGE_LAST_ORDER = "wokrienResselLastOrder";
const cfg = window.WOKRIEN_CONFIG || {};

const body = document.body;
const statusIcon = document.getElementById("statusIcon");
const statusTitle = document.getElementById("statusTitle");
const statusText = document.getElementById("statusText");
const orderInfo = document.getElementById("orderInfo");
const refreshButton = document.getElementById("refreshStatus");
const themeToggle = document.getElementById("themeToggle");
const themeLabel = document.querySelector(".theme-label");
const themeIcon = document.querySelector(".theme-icon");

const params = new URLSearchParams(location.search);
const label = params.get("order") || localStorage.getItem(STORAGE_LAST_ORDER);

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

async function checkStatus(){
  if(!label){
    statusIcon.textContent = "!";
    statusTitle.textContent = "Заказ не найден";
    statusText.textContent = "Не удалось определить номер заказа.";
    return;
  }

  refreshButton.disabled = true;
  refreshButton.textContent = "Проверяю…";

  try{
    const response = await fetch(`${cfg.SUPABASE_URL}/functions/v1/order-status?label=${encodeURIComponent(label)}`, {
      headers: {
        "apikey": cfg.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${cfg.SUPABASE_ANON_KEY}`
      }
    });

    const data = await response.json();
    if(!response.ok) throw new Error(data.error || "Ошибка проверки заказа");

    orderInfo.hidden = false;
    orderInfo.innerHTML = `
      <div><span>Заказ</span><strong>${escapeHtml(data.label)}</strong></div>
      <div><span>Сумма</span><strong>${formatPrice(data.amount)}</strong></div>
      <div><span>Статус</span><strong>${escapeHtml(data.status)}</strong></div>
    `;

    if(data.status === "paid"){
      statusIcon.textContent = "✓";
      statusIcon.className = "status-icon paid";
      statusTitle.textContent = "Оплата подтверждена";
      statusText.textContent = "ЮMoney подтвердил перевод. Заказ отмечен как оплаченный, сток списан.";
    }else if(data.status === "paid_manual_review"){
      statusIcon.textContent = "!";
      statusIcon.className = "status-icon review";
      statusTitle.textContent = "Оплата получена — нужна проверка";
      statusText.textContent = "Деньги получены, но автоматическая выдача остановлена из-за проблемы со стоком. Заказ виден в админке.";
    }else if(data.status === "cancelled"){
      statusIcon.textContent = "×";
      statusIcon.className = "status-icon cancelled";
      statusTitle.textContent = "Заказ отменён";
      statusText.textContent = "Этот заказ был отменён.";
    }else{
      statusIcon.textContent = "⋯";
      statusIcon.className = "status-icon";
      statusTitle.textContent = "Ожидаем подтверждение";
      statusText.textContent = "Если вы уже оплатили, подождите несколько секунд и проверьте статус снова.";
    }
  }catch(error){
    statusIcon.textContent = "!";
    statusTitle.textContent = "Не удалось проверить заказ";
    statusText.textContent = error.message;
  }finally{
    refreshButton.disabled = false;
    refreshButton.textContent = "Проверить статус";
  }
}

refreshButton.addEventListener("click",checkStatus);
checkStatus();

// Несколько автоматических проверок после возврата из ЮMoney.
let attempts = 0;
const poll = setInterval(async () => {
  attempts += 1;
  await checkStatus();
  if(attempts >= 10 || statusTitle.textContent === "Оплата подтверждена"){
    clearInterval(poll);
  }
}, 3000);

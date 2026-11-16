"use strict";

/* =========================================================================
   CONFIGURAÇÃO DA CAMPANHA
   - raised: atualize manualmente conforme as doações chegarem (0 = barra oculta)
   ========================================================================= */
const CAMPAIGN = {
  goal: 2800,
  raised: 0,
  minAmount: 1,
  maxAmount: 50000,
  pix: {
    key: "99981932854",
    merchantName: "ELINE REIS",
    merchantCity: "BRASIL",
    txid: "CONSULTAGABI",
  },
};

const $ = (id) => document.getElementById(id);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const formatBRL = (value) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* =========================================================================
   PIX COPIA E COLA (EMV / Banco Central)
   ========================================================================= */
function emvField(id, value) {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

function asciiUpper(text, max) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .toUpperCase()
    .substring(0, max);
}

function generatePixPayload(amount) {
  const { key, merchantName, merchantCity, txid } = CAMPAIGN.pix;
  const account = emvField("00", "br.gov.bcb.pix") + emvField("01", key.trim());
  const payload =
    emvField("00", "01") +
    emvField("26", account) +
    emvField("52", "0000") +
    emvField("53", "986") +
    emvField("54", Number(amount).toFixed(2)) +
    emvField("58", "BR") +
    emvField("59", asciiUpper(merchantName, 25)) +
    emvField("60", asciiUpper(merchantCity, 15)) +
    emvField("62", emvField("05", asciiUpper(txid, 25))) +
    "6304";
  return payload + crc16(payload);
}

/* =========================================================================
   UTILITÁRIOS DE INTERFACE
   ========================================================================= */
let toastTimer;
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error("clipboard indisponível");
  } catch (_) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (err) {
      return false;
    }
  }
}

function flashButton(btn, doneLabel, originalLabel) {
  btn.textContent = doneLabel;
  btn.classList.add("done");
  setTimeout(() => {
    btn.textContent = originalLabel;
    btn.classList.remove("done");
  }, 2200);
}

function switchState(name) {
  document.querySelectorAll(".state").forEach((el) => el.classList.add("hidden"));
  const target = $(`state-${name}`);
  target.classList.remove("hidden");
  // reinicia a animação de entrada
  target.style.animation = "none";
  void target.offsetWidth;
  target.style.animation = "";
}

/* =========================================================================
   CONFETE DE CORAÇÕES
   ========================================================================= */
function heartBurst() {
  if (reducedMotion) return;
  const canvas = $("confetti");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.scale(dpr, dpr);

  const symbols = ["🤍", "❤️", "🧡", "✨"];
  const originY = window.innerHeight * 0.55;
  const parts = Array.from({ length: 70 }, () => ({
    x: window.innerWidth / 2,
    y: originY,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 14 - 5,
    size: 16 + Math.random() * 18,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.25,
    s: symbols[Math.floor(Math.random() * symbols.length)],
  }));

  let frames = 0;
  (function tick() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    parts.forEach((p) => {
      p.vy += 0.35;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - frames / 150);
      ctx.font = `${p.size}px serif`;
      ctx.textAlign = "center";
      ctx.fillText(p.s, 0, 0);
      ctx.restore();
    });
    if (++frames < 150) {
      requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  })();
}

/* =========================================================================
   PROGRESSO (só aparece se CAMPAIGN.raised > 0)
   ========================================================================= */
function initProgress() {
  $("goal-value").textContent = formatBRL(CAMPAIGN.goal);
  if (!(CAMPAIGN.raised > 0)) return;

  const percent = Math.min(100, (CAMPAIGN.raised / CAMPAIGN.goal) * 100);
  $("progress-wrap").classList.remove("hidden");
  $("raised-value").textContent = formatBRL(CAMPAIGN.raised);
  $("progress-percent").textContent = `${Math.round(percent)}%`;
  $("progress-track").setAttribute("aria-valuenow", String(Math.round(percent)));
  requestAnimationFrame(() =>
    requestAnimationFrame(() => ($("progress-fill").style.width = `${percent}%`))
  );
}

/* =========================================================================
   VALOR: máscara, validação e mensagem de impacto
   ========================================================================= */
function parseAmount(raw) {
  let s = String(raw).trim().replace(/\s/g, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Number(s);
}

function setError(message) {
  $("amount-error").textContent = message || "";
  const field = $("amount-field");
  field.classList.remove("invalid");
  if (message) {
    void field.offsetWidth;
    field.classList.add("invalid");
  }
}

function updateImpact() {
  const amount = parseAmount($("custom-amount").value);
  const el = $("impact-text");
  if (!Number.isFinite(amount) || amount <= 0) {
    el.innerHTML = "&nbsp;";
    return;
  }
  const pct = (amount / CAMPAIGN.goal) * 100;
  const pctText = pct >= 10 ? Math.round(pct) : pct.toFixed(1).replace(".", ",");
  el.textContent = `Sua ajuda cobre ${pctText}% da consulta. Obrigado! 🤍`;
}

function selectPreset(btn) {
  document.querySelectorAll(".preset-btn").forEach((b) => {
    b.classList.remove("selected");
    b.setAttribute("aria-pressed", "false");
  });
  if (btn) {
    btn.classList.add("selected");
    btn.setAttribute("aria-pressed", "true");
  }
}

document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.setAttribute("aria-pressed", "false");
  btn.addEventListener("click", () => {
    selectPreset(btn);
    $("custom-amount").value = btn.dataset.value;
    setError("");
    updateImpact();
    if (navigator.vibrate) navigator.vibrate(10);
  });
});

$("custom-amount").addEventListener("input", (e) => {
  let v = e.target.value.replace(/[^\d,.]/g, "").replace(/\./g, ",");
  const first = v.indexOf(",");
  if (first !== -1) {
    v = v.slice(0, first + 1) + v.slice(first + 1).replace(/,/g, "").slice(0, 2);
  }
  e.target.value = v;
  const match = document.querySelector(`.preset-btn[data-value="${v}"]`);
  selectPreset(match || null);
  setError("");
  updateImpact();
});

/* =========================================================================
   FLUXO: Seleção -> Loading -> Checkout -> Obrigado
   ========================================================================= */
let generating = false;

function renderQr(payload) {
  const wrapper = $("qr-wrapper");
  wrapper.innerHTML = "";
  try {
    if (typeof window.qrcode !== "function") throw new Error("lib ausente");
    const qr = window.qrcode(0, "M");
    qr.addData(payload);
    qr.make();
    wrapper.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    const svg = wrapper.querySelector("svg");
    if (!svg) throw new Error("svg não gerado");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "QR Code Pix");
  } catch (_) {
    // Fallback: serviço externo caso a biblioteca local não carregue
    const img = document.createElement("img");
    img.alt = "QR Code Pix";
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payload)}`;
    wrapper.appendChild(img);
  }
}

$("pix-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (generating) return;

  const amount = parseAmount($("custom-amount").value);
  if (!Number.isFinite(amount)) {
    setError("Digite um valor válido, por exemplo 35,00.");
    $("custom-amount").focus();
    return;
  }
  if (amount < CAMPAIGN.minAmount) {
    setError(`O valor mínimo é ${formatBRL(CAMPAIGN.minAmount)}.`);
    return;
  }
  if (amount > CAMPAIGN.maxAmount) {
    setError(`O valor máximo por Pix é ${formatBRL(CAMPAIGN.maxAmount)}.`);
    return;
  }

  generating = true;
  switchState("loading");

  setTimeout(() => {
    try {
      const code = generatePixPayload(amount);
      $("display-amount").textContent = formatBRL(amount);
      $("pix-payload-output").value = code;
      renderQr(code);
      switchState("checkout");
    } catch (err) {
      console.error("Erro ao gerar Pix:", err);
      switchState("select");
      setError("Não foi possível gerar o Pix. Tente novamente ou copie a chave abaixo.");
    } finally {
      generating = false;
    }
  }, reducedMotion ? 0 : 900);
});

$("copy-raw-btn").addEventListener("click", async () => {
  const ok = await copyText(CAMPAIGN.pix.key);
  if (ok) {
    flashButton($("copy-raw-btn"), "Copiada ✓", "Copiar chave");
    toast("Chave Pix copiada");
  } else {
    toast("Não foi possível copiar. Selecione e copie a chave manualmente.");
  }
});

$("copy-payload-btn").addEventListener("click", async () => {
  const ok = await copyText($("pix-payload-output").value);
  if (ok) {
    flashButton($("copy-payload-btn"), "Código copiado ✓", "Copiar código Pix");
    toast("Agora é só colar no app do seu banco");
  } else {
    $("pix-payload-output").select();
    toast("Toque e segure no código para copiar");
  }
});

$("confirm-paid-btn").addEventListener("click", () => {
  switchState("thanks");
  heartBurst();
  if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
});

$("back-btn").addEventListener("click", () => switchState("select"));

$("reset-btn").addEventListener("click", () => {
  $("pix-form").reset();
  selectPreset(null);
  setError("");
  updateImpact();
  switchState("select");
});

/* =========================================================================
   COMPARTILHAMENTO
   ========================================================================= */
function shareText() {
  return (
    "Oi, gente! 🤍 Estamos mobilizando esforços para custear a consulta urgente da Gabi com um médico especialista " +
    `(meta de ${formatBRL(CAMPAIGN.goal)}). Qualquer valor faz diferença!\n\nAcesse para ajudar:`
  );
}

function shareOnWhatsApp() {
  const text = encodeURIComponent(`${shareText()}\n${window.location.href}`);
  window.open(`https://wa.me/?text=${text}`, "_blank", "noopener");
}

$("share-whatsapp-btn").addEventListener("click", shareOnWhatsApp);
$("footer-whatsapp-btn").addEventListener("click", shareOnWhatsApp);

if (navigator.share) {
  const btn = $("native-share-btn");
  btn.classList.remove("hidden");
  btn.addEventListener("click", async () => {
    try {
      await navigator.share({ title: "Todos pela Gabi 🤍", text: shareText(), url: window.location.href });
    } catch (_) {
      /* usuário cancelou */
    }
  });
}

/* =========================================================================
   CTA FIXO: aparece quando nem o botão do topo nem a caixa de doação estão visíveis
   ========================================================================= */
function scrollToDonation() {
  $("doar").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  setTimeout(() => {
    const first = $("state-select").classList.contains("hidden") ? null : document.querySelector(".preset-btn");
    if (first) first.focus({ preventScroll: true });
  }, reducedMotion ? 0 : 500);
}

$("hero-cta").addEventListener("click", scrollToDonation);
$("sticky-btn").addEventListener("click", scrollToDonation);

(function initStickyCta() {
  const cta = $("sticky-cta");
  const btn = $("sticky-btn");
  const visible = { hero: true, box: false };

  const update = () => {
    const show = !visible.hero && !visible.box;
    cta.classList.toggle("show", show);
    cta.setAttribute("aria-hidden", String(!show));
    btn.tabIndex = show ? 0 : -1;
  };

  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.target.id === "hero-cta") visible.hero = entry.isIntersecting;
      if (entry.target.id === "doar") visible.box = entry.isIntersecting;
    });
    update();
  }, { threshold: 0.1 });

  io.observe($("hero-cta"));
  io.observe($("doar"));
})();

/* =========================================================================
   INIT
   ========================================================================= */
initProgress();

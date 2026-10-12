// nav.js – Navigation mit direkt sichtbaren Links (kein Menü-Button mehr)
(function () {
  var LINKS = [["index.html","home","Dashboard"],["profile.html","user","Profil"],["wallet-settings.html","credit-card","Wallet"],["pricing.html","tag","Pricing"],["faq.html","help-circle","FAQ"],["contact.html","mail","Kontakt"],["settings.html","settings","Einstellungen"]];
  var TITLES = {"KI Signal Hub":"index.html","Profil - KI Signal Hub":"profile.html","Wallet & APIs - KI Signal Hub":"wallet-settings.html","Pricing - KI Signal Hub":"pricing.html","FAQ - KI Signal Hub":"faq.html","Kontakt - KI Signal Hub":"contact.html","Einstellungen - KI Signal Hub":"settings.html","Admin Panel - KI Signal Hub":"index.html","Admin Login - KI Signal Hub":"index.html","Anmelden - KI Signal Hub":"index.html","Registrieren - KI Signal Hub":"index.html"};

  function current() {
    return TITLES[document.title] || (location.pathname.split("/").pop() || "index.html");
  }

  function buildNav() {
    var cur = current();
    var links = LINKS.map(function (l) {
      return '<a href="' + l[0] + '" class="nav-inline-link' + (cur === l[0] ? " active" : "") + '"><i data-lucide="' + l[1] + '"></i><span>' + l[2] + '</span></a>';
    }).join("");
    var n = document.createElement("nav");
    n.className = "site-nav";
    n.innerHTML = '<div class="nav-inner"><a href="index.html" class="nav-brand"><span class="nav-logo">KI</span><span>SIGNAL<em>HUB</em></span></a><div class="nav-actions"><div class="nav-inline-links">' + links + '</div><span id="nav-auth"></span></div></div>';
    return n;
  }

  function paintAuth(user, admin) {
    document.querySelectorAll("[data-auth-only]").forEach(function (el) {
      el.classList.toggle("hidden", !(user || admin));
    });
    var box = document.getElementById("nav-auth");
    if (!box) return;
    if (user || admin) {
      box.innerHTML = (admin ? '<a href="admin.html" class="nav-pill admin"><i data-lucide="shield-check"></i> Admin</a>' : '') +
        '<button id="nav-logout" type="button" class="nav-pill danger"><i data-lucide="log-out"></i> Abmelden</button>';
    } else {
      box.innerHTML = '<a href="login.html" class="nav-pill ghost">Anmelden</a><a href="register.html" class="nav-pill cta">Registrieren</a>';
    }
    if (typeof lucide !== "undefined") lucide.createIcons();
    var lg = document.getElementById("nav-logout");
    if (lg) lg.addEventListener("click", async function () {
      if (!confirm("Wirklich abmelden?")) return;
      try {
        await db.run("DELETE FROM settings WHERE key = 'user_session'");
        await db.run("DELETE FROM settings WHERE key = 'admin_session'");
      } catch (e) { /* ignore */ }
      window.location.reload();
    });
  }

  function guardPage(user, admin) {
    var page = location.pathname.split("/").pop() || "index.html";
    var protectedPages = ["profile.html", "wallet-settings.html"];
    if (protectedPages.indexOf(page) !== -1 && !user && !admin) {
      window.location.replace("login.html");
    }
  }

  function initAuth() {
    if (window.db && db.get) {
      Promise.all([
        db.get("SELECT value FROM settings WHERE key = 'user_session'"),
        db.get("SELECT value FROM settings WHERE key = 'admin_session'")
      ]).then(function (r) {
        var user = !!r[0], admin = !!r[1];
        paintAuth(user, admin);
        guardPage(user, admin);
      }).catch(function () { paintAuth(false, false); guardPage(false, false); });
    } else { paintAuth(false, false); guardPage(false, false); }
  }

  function init() {
    var old = document.querySelector("nav");
    var n = buildNav();
    if (old) old.replaceWith(n); else document.body.insertBefore(n, document.body.firstChild);
    initAuth();
    if (typeof lucide !== "undefined") lucide.createIcons();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

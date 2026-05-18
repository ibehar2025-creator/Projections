(function () {
  if (window.__stockLabMobileNavPatchApplied) return;
  window.__stockLabMobileNavPatchApplied = true;

  function byId(id) {
    return document.getElementById(id);
  }

  function setMobileNavOpen(open) {
    const menuToggle = byId("menuToggle");
    const mobileNav = byId("mobileNav");
    const mobileNavBackdrop = byId("mobileNavBackdrop");
    if (!menuToggle || !mobileNav || !mobileNavBackdrop) return;
    menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
    mobileNav.hidden = !open;
    mobileNav.style.display = open ? "grid" : "none";
    mobileNavBackdrop.hidden = !open;
  }

  function installMobileNavPatch() {
    const mobileBreakpoint = window.matchMedia("(max-width: 820px)");
    const mobileNav = byId("mobileNav");

    if (!byId("stockLabMobileLayoutPatchStyles")) {
      const style = document.createElement("style");
      style.id = "stockLabMobileLayoutPatchStyles";
      style.textContent = `
        @media (max-width: 980px) {
          .compare-layout {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 760px) {
          .workspace-grid,
          .compare-layout,
          .portfolio-grid {
            grid-template-columns: 1fr !important;
          }
          .metric-row,
          .metric-row-two,
          #projectionCards,
          #compareCards,
          #portfolioCards,
          #portfolioProjectionCards,
          #sp500Cards,
          .details-grid,
          #projectionDetails {
            grid-template-columns: 1fr !important;
          }
          .heading-actions,
          .button-row {
            width: 100%;
          }
          .heading-actions > *,
          .button-row > * {
            width: 100%;
            min-width: 0;
          }
        }
        @media (max-width: 520px) {
          .heading-actions > *,
          .button-row > * {
            flex-basis: 100%;
          }
        }
      `;
      document.head.appendChild(style);
    }

    if (mobileNav && !mobileNav.dataset.mobileNavPatchObserved) {
      mobileNav.dataset.mobileNavPatchObserved = "true";
      const syncDisplayState = () => {
        mobileNav.style.display = mobileNav.hidden ? "none" : "grid";
      };
      new MutationObserver(syncDisplayState).observe(mobileNav, {
        attributes: true,
        attributeFilter: ["hidden"],
      });
      syncDisplayState();
    }

    setMobileNavOpen(false);
    mobileBreakpoint.addEventListener?.("change", (event) => {
      if (!event.matches) {
        setMobileNavOpen(false);
      }
    });
    window.addEventListener("resize", () => {
      if (!mobileBreakpoint.matches) {
        setMobileNavOpen(false);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installMobileNavPatch, { once: true });
  } else {
    installMobileNavPatch();
  }
})();

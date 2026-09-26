(() => {
  document.documentElement.classList.add("js");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Scroll reveal
  const reveals = document.querySelectorAll(".reveal");
  const forceShow =
    location.hash === "#static" ||
    /(\?|&)static=1/.test(location.search) ||
    reduceMotion ||
    !("IntersectionObserver" in window);
  if (forceShow) {
    reveals.forEach((el) => el.classList.add("is-visible"));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    reveals.forEach((el) => io.observe(el));
  }

  // Active nav highlight
  const sections = ["position", "features", "challenges", "highlights", "system"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const navLinks = Array.from(document.querySelectorAll(".strip-nav a"));

  if (sections.length && "IntersectionObserver" in window) {
    const navIo = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          navLinks.forEach((link) => {
            const active = link.getAttribute("href") === `#${id}`;
            link.style.color = active ? "#e8e6e0" : "";
            link.style.borderBottomColor = active ? "#b33a2f" : "";
          });
        });
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: 0 }
    );
    sections.forEach((sec) => navIo.observe(sec));
  }

  // Smooth-scroll focus management for in-page links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      const id = anchor.getAttribute("href");
      if (!id || id === "#") return;
      const target = document.querySelector(id);
      if (!target) return;
      // native smooth scroll via CSS; ensure focus for a11y
      window.setTimeout(() => {
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }, reduceMotion ? 0 : 350);
    });
  });
})();

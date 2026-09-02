const visitStorageKey = "saudi-site-visit-count";
const previousVisits = Number.parseInt(localStorage.getItem(visitStorageKey) || "0", 10);
const visitCount = Number.isSafeInteger(previousVisits) && previousVisits >= 0
  ? previousVisits + 1
  : 1;

localStorage.setItem(visitStorageKey, String(visitCount));
document.querySelector("#visit-count").textContent = new Intl.NumberFormat("en-US").format(visitCount);
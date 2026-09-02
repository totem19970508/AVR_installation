const visitStorageKey = "saudi-site-visit-count";
const previousVisits = Number.parseInt(localStorage.getItem(visitStorageKey) || "0", 10);
const visitCount = Number.isSafeInteger(previousVisits) && previousVisits >= 0
  ? previousVisits + 1
  : 1;

localStorage.setItem(visitStorageKey, String(visitCount));
document.querySelector("#visit-count").textContent = new Intl.NumberFormat("en-US").format(visitCount);

window.readApiResponse = async function readApiResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Login expired. Reload the page and enter the current password.");
    }
    throw new Error(payload?.error || `${fallbackMessage}: ${response.status}`);
  }
  if (payload === null) {
    throw new Error(`${fallbackMessage}: the server returned an unexpected response.`);
  }
  return payload;
};
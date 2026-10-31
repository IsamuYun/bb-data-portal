// M0 stub. M2 adds: pairing, job polling with lease renewal, recipe interpreter injection, result/media upload.
export default defineBackground(() => {
  console.log("[bb-collector] background ready", { id: browser.runtime.id });
});

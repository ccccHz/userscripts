export function getQualityText(element) {
  return (element?.innerText || element?.textContent || "").trim();
}

export function findBestQualityOption(optionList) {
  return Array.from(optionList?.children || []).find(
    (option) => !getQualityText(option).startsWith("自动"),
  ) || null;
}

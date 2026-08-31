import { getExperienceYears } from "../state.js";

const housingBudgetRatio = 0.4;
const simplePurchaseMonths = 240;

export function getEffectiveExperience(experienceId, selectedYears) {
  return getExperienceYears(experienceId) + Number(selectedYears || 0);
}

export function getAvailableOffers(allOffers, state) {
  const effectiveExperience = getEffectiveExperience(state.experience, state.selectedYears);
  const cityOffers = allOffers.filter((offer) => offer.cityId === state.selectedCity);
  const matchingWork = cityOffers.filter((offer) => {
    if (offer.kind !== "work") return false;
    const professionMatches = normalize(offer.profession) === normalize(state.profession);
    return professionMatches && Number(offer.minExperience ?? 0) <= effectiveExperience;
  });

  const averageSalary = matchingWork.length
    ? matchingWork.reduce((sum, offer) => sum + Number(offer.salary ?? 0), 0) / matchingWork.length
    : 0;
  const monthlyHousingBudget = averageSalary * housingBudgetRatio;

  const housing = cityOffers.filter((offer) => {
    if (offer.kind === "rent" || offer.kind === "sale") return housingMonthlyEquivalent(offer) <= monthlyHousingBudget;
    return false;
  });

  return [...matchingWork, ...housing];
}

export function getOfferForBuilding(offers, buildingId, mode) {
  const allowedKinds = mode === "profession" ? ["work"] : ["rent", "sale"];
  return offers.find((offer) => offer.buildingId === buildingId && allowedKinds.includes(offer.kind)) ?? null;
}

export function getFallbackOffer(offers, mode, preferredKind = null) {
  const allowedKinds = mode === "profession" ? ["work"] : ["rent", "sale"];
  return offers.find((offer) => allowedKinds.includes(offer.kind) && (!preferredKind || offer.kind === preferredKind))
    ?? offers.find((offer) => allowedKinds.includes(offer.kind))
    ?? null;
}

export function getCityStats(allOffers, state) {
  const available = getAvailableOffers(allOffers, state);
  const work = available.filter((offer) => offer.kind === "work");
  const salary = work.length
    ? Math.round(work.reduce((sum, offer) => sum + Number(offer.salary ?? 0), 0) / work.length)
    : 0;
  const monthlyHousingBudget = Math.round(salary * housingBudgetRatio);
  const affordableRent = available.filter((offer) => offer.kind === "rent").length;
  const affordableSale = available.filter((offer) => offer.kind === "sale").length;

  return {
    effectiveExperience: getEffectiveExperience(state.experience, state.selectedYears),
    salary,
    monthlyHousingBudget,
    affordableRent,
    affordableSale
  };
}

function normalize(value) {
  return String(value ?? "").trim().toLocaleLowerCase("ru-RU");
}

function housingMonthlyEquivalent(offer) {
  const price = Number(offer.price ?? 0);
  if (offer.kind === "sale") return price / simplePurchaseMonths;
  return price;
}

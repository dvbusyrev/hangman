export const initialState = {
  profession: "",
  experience: "none",
  selectedRegion: null,
  selectedCity: null,
  selectedYears: 0,
  selectedMode: "profession",
  selectedObject: null,
  routeProgress: 0
};

export const state = { ...initialState };

const listeners = new Set();

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((listener) => listener({ ...state }));
}

export function resetState() {
  Object.assign(state, initialState);
  listeners.forEach((listener) => listener({ ...state }));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const experienceOptions = [
  { id: "none", label: "без опыта", years: 0 },
  { id: "lt1", label: "до 1 года", years: 0 },
  { id: "1-3", label: "1-3 года", years: 1 },
  { id: "3-5", label: "3-5 лет", years: 3 },
  { id: "5plus", label: "5+ лет", years: 5 }
];

export function getExperienceYears(experienceId) {
  return experienceOptions.find((option) => option.id === experienceId)?.years ?? 0;
}

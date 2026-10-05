import type { CompanionEntities, DeviceRegistryEntry, EntityRegistryEntry, EntityState } from "./types";

export interface LightCapabilities {
  brightness: boolean;
  color: boolean;
  temperature: boolean;
  effects: string[];
  minKelvin: number;
  maxKelvin: number;
}

const COLOR_MODES = new Set(["hs", "rgb", "rgbw", "rgbww", "xy"]);

export function capabilities(state: EntityState | undefined): LightCapabilities {
  const attributes = state?.attributes;
  const modes = Array.isArray(attributes?.supported_color_modes) ? attributes.supported_color_modes : [];
  const min = Number(attributes?.min_color_temp_kelvin);
  const max = Number(attributes?.max_color_temp_kelvin);
  const minKelvin = Number.isFinite(min) && min > 0 ? min : 2000;
  const maxKelvin = Number.isFinite(max) && max > minKelvin ? max : 6500;
  return {
    brightness: modes.some((mode) => mode !== "onoff" && mode !== "unknown") || typeof attributes?.brightness === "number",
    color: modes.some((mode) => COLOR_MODES.has(mode)),
    temperature: modes.includes("color_temp"),
    effects: Array.isArray(attributes?.effect_list) ? attributes.effect_list.filter((name): name is string => typeof name === "string") : [],
    minKelvin,
    maxKelvin,
  };
}

export function brightnessPercent(state: EntityState | undefined): number {
  const brightness = state?.attributes.brightness;
  return typeof brightness === "number" && Number.isFinite(brightness)
    ? Math.round(Math.max(0, Math.min(255, brightness)) / 255 * 100)
    : 100;
}

export function serviceData(entity: string, command: "on" | "off" | "brightness" | "color" | "temperature" | "effect", value?: number | string): { service: "turn_on" | "turn_off"; data: Record<string, unknown> } {
  const data: Record<string, unknown> = { entity_id: entity };
  if (command === "off") return { service: "turn_off", data };
  if (command === "brightness") data.brightness_pct = Math.round(Math.max(1, Math.min(100, Number(value))));
  if (command === "color") data.hs_color = hexToHs(String(value));
  if (command === "temperature") data.color_temp_kelvin = Math.round(Number(value));
  if (command === "effect") data.effect = String(value);
  return { service: "turn_on", data };
}

export function hexToHs(hex: string): [number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error("Invalid color");
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta) {
    if (maximum === r) hue = ((g - b) / delta) % 6;
    else if (maximum === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
  }
  return [Math.round((hue + 360) % 360), Math.round(maximum === 0 ? 0 : delta / maximum * 100)];
}

export function hsToHex(hs: unknown): string {
  if (!Array.isArray(hs) || hs.length !== 2 || !hs.every((value) => typeof value === "number" && Number.isFinite(value))) return "#ffffff";
  const hue = ((hs[0] % 360) + 360) % 360;
  const saturation = Math.max(0, Math.min(100, hs[1])) / 100;
  const c = saturation;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((value) => Math.round((value + 1 - c) * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function companionsFor(entity: string, entries: EntityRegistryEntry[], states: Record<string, EntityState | undefined>): CompanionEntities {
  const deviceId = entries.find((entry) => entry.entity_id === entity)?.device_id;
  if (!deviceId) return {};
  const related = entries.filter((entry) => entry.device_id === deviceId && !entry.disabled_by && states[entry.entity_id]);
  return {
    identify: related.find((entry) => entry.entity_id.startsWith("button.") && /identify/i.test(entry.entity_id))?.entity_id,
    gesture: related.find((entry) => entry.entity_id.startsWith("event.") && /gesture|touch/i.test(entry.entity_id))?.entity_id,
  };
}

export function nanoleafLights(entries: EntityRegistryEntry[], devices: DeviceRegistryEntry[], states: Record<string, EntityState | undefined>): string[] {
  const nanoleafDevices = new Set(devices.filter((device) => /nanoleaf/i.test(device.manufacturer ?? "")).map((device) => device.id));
  return entries.filter((entry) => entry.entity_id.startsWith("light.") && states[entry.entity_id] && (entry.platform === "nanoleaf" || (entry.device_id && nanoleafDevices.has(entry.device_id)))).map((entry) => entry.entity_id);
}

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&#39;" })[character]!);
}

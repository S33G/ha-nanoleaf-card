import test from "node:test";
import assert from "node:assert/strict";
import {
  brightnessPercent,
  capabilities,
  companionsFor,
  hexToHs,
  hsToHex,
  nanoleafLights,
  serviceData,
} from "../.test-build/model.mjs";

const shapes = {
  entity_id: "light.shapes",
  state: "on",
  attributes: {
    brightness: 128,
    supported_color_modes: ["color_temp", "hs"],
    min_color_temp_kelvin: 1200,
    max_color_temp_kelvin: 6500,
    hs_color: [300, 100],
    effect: "Northern Lights",
    effect_list: ["Northern Lights", "Flames"],
  },
};

test("Shapes exposes all supported controls and current values", () => {
  assert.deepEqual(capabilities(shapes), {
    brightness: true,
    color: true,
    temperature: true,
    effects: ["Northern Lights", "Flames"],
    minKelvin: 1200,
    maxKelvin: 6500,
  });
  assert.equal(brightnessPercent(shapes), 50);
  assert.equal(hsToHex(shapes.attributes.hs_color), "#ff00ff");
});

test("a simple on/off light hides unavailable controls", () => {
  assert.deepEqual(capabilities({ entity_id: "light.simple", state: "off", attributes: { supported_color_modes: ["onoff"] } }), {
    brightness: false,
    color: false,
    temperature: false,
    effects: [],
    minKelvin: 2000,
    maxKelvin: 6500,
  });
  assert.deepEqual(capabilities(undefined).effects, []);
});

test("service requests use Home Assistant light actions", () => {
  assert.deepEqual(serviceData("light.shapes", "off"), { service: "turn_off", data: { entity_id: "light.shapes" } });
  assert.deepEqual(serviceData("light.shapes", "brightness", 50), { service: "turn_on", data: { entity_id: "light.shapes", brightness_pct: 50 } });
  assert.deepEqual(serviceData("light.shapes", "temperature", 3000), { service: "turn_on", data: { entity_id: "light.shapes", color_temp_kelvin: 3000 } });
  assert.deepEqual(serviceData("light.shapes", "color", "#00ff00"), { service: "turn_on", data: { entity_id: "light.shapes", hs_color: [120, 100] } });
  assert.deepEqual(serviceData("light.shapes", "effect", "Flames"), { service: "turn_on", data: { entity_id: "light.shapes", effect: "Flames" } });
  assert.deepEqual(hexToHs("#ffffff"), [0, 0]);
});

test("related Identify and gesture entities are taken only from the same device", () => {
  const entries = [
    { entity_id: "light.shapes", device_id: "shapes", platform: "nanoleaf" },
    { entity_id: "button.shapes_identify", device_id: "shapes", platform: "nanoleaf" },
    { entity_id: "event.shapes_touch", device_id: "shapes", platform: "nanoleaf" },
    { entity_id: "button.other_identify", device_id: "other", platform: "nanoleaf" },
  ];
  const states = Object.fromEntries(entries.map((entry) => [entry.entity_id, shapes]));
  assert.deepEqual(companionsFor("light.shapes", entries, states), { identify: "button.shapes_identify", gesture: "event.shapes_touch" });
  assert.deepEqual(companionsFor("light.missing", entries, states), {});
  assert.deepEqual(nanoleafLights(entries, [{ id: "shapes", manufacturer: "Nanoleaf" }], states), ["light.shapes"]);
});

test("Matter and HomeKit Nanoleaf lights are preferred by manufacturer", () => {
  const entries = [
    { entity_id: "light.essentials", device_id: "matter-device", platform: "matter" },
    { entity_id: "light.other", device_id: "other-device", platform: "matter" },
  ];
  const states = { "light.essentials": shapes, "light.other": shapes };
  assert.deepEqual(nanoleafLights(entries, [{ id: "matter-device", manufacturer: "Nanoleaf" }, { id: "other-device", manufacturer: "Other" }], states), ["light.essentials"]);
});

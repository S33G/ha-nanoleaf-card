import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";

const browser = new Window({ url: "http://homeassistant.local:8123/" });
for (const key of ["window", "document", "customElements", "HTMLElement", "HTMLDialogElement", "HTMLInputElement", "CustomEvent", "Event", "KeyboardEvent"]) {
  globalThis[key] = key === "window" ? browser : browser[key];
}
await import("../ha-nanoleaf-card.js");

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const shapes = {
  entity_id: "light.shapes",
  state: "on",
  attributes: {
    friendly_name: "Shapes",
    brightness: 128,
    supported_color_modes: ["hs", "color_temp"],
    min_color_temp_kelvin: 2000,
    max_color_temp_kelvin: 6500,
    hs_color: [300, 100],
    effect: "Flames",
    effect_list: ["Flames", "Northern Lights"],
  },
};

function mockHass(state = shapes) {
  const calls = [];
  const states = {
    [state.entity_id]: state,
    "button.shapes_identify": { entity_id: "button.shapes_identify", state: "unknown", attributes: {} },
    "event.shapes_touch": { entity_id: "event.shapes_touch", state: "2026-10-05T10:00:00", attributes: { event_type: "swipe_up" } },
  };
  return {
    states,
    calls,
    callService: async (...args) => { calls.push(args); },
    callWS: async ({ type }) => type === "config/device_registry/list"
      ? [{ id: "device-1", manufacturer: "Nanoleaf" }]
      : [
        { entity_id: state.entity_id, device_id: "device-1", platform: "nanoleaf" },
        { entity_id: "button.shapes_identify", device_id: "device-1", platform: "nanoleaf" },
        { entity_id: "event.shapes_touch", device_id: "device-1", platform: "nanoleaf" },
      ],
  };
}

test("card opens, keeps the dialog open across state updates, and sends supported commands", async () => {
  const hass = mockHass();
  const card = document.createElement("ha-nanoleaf-card");
  document.body.append(card);
  card.setConfig({ entity: "light.shapes" });
  card.hass = hass;
  await tick();
  assert.equal(card.shadowRoot.querySelector(".name").textContent, "Shapes");
  card.shadowRoot.querySelector("[data-action='open']").click();
  assert.equal(card.shadowRoot.querySelector("dialog").open, true);
  assert.ok(card.shadowRoot.querySelector("#brightness"));
  assert.ok(card.shadowRoot.querySelector("#color-wheel"));
  assert.equal(card.shadowRoot.querySelector("#temperature"), null, "white temperature is hidden by default");
  assert.equal(card.shadowRoot.querySelector(".content").textContent.includes("Power"), false);
  assert.equal(card.shadowRoot.querySelector(".power-row .power ha-icon").getAttribute("icon"), "mdi:power");
  assert.equal(card.shadowRoot.querySelectorAll("[data-action='effect']").length, 2);
  assert.match(card.shadowRoot.querySelector("dialog").textContent, /Last gesture: swipe up/);

  card.hass = { ...hass, states: { ...hass.states, "light.shapes": { ...shapes, attributes: { ...shapes.attributes, brightness: 200 } } } };
  assert.equal(card.shadowRoot.querySelector("dialog").open, true);
  assert.equal(card.shadowRoot.querySelector("#brightness").value, "78");

  card.shadowRoot.querySelector("[data-effect='Northern Lights']").click();
  await tick();
  assert.deepEqual(hass.calls.at(-1), ["light", "turn_on", { entity_id: "light.shapes", effect: "Northern Lights" }]);
  card.shadowRoot.querySelector("[data-action='identify']").click();
  await tick();
  assert.deepEqual(hass.calls.at(-1), ["button", "press", { entity_id: "button.shapes_identify" }]);
  const wheel = card.shadowRoot.querySelector("#color-wheel");
  const marker = card.shadowRoot.querySelector(".color-marker");
  const leftBefore = Number.parseFloat(marker.style.left);
  const topBefore = Number.parseFloat(marker.style.top);
  wheel.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  const leftAfterRight = Number.parseFloat(marker.style.left);
  assert.ok(leftAfterRight > leftBefore, "ArrowRight moves the marker right");
  wheel.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
  const topAfterUp = Number.parseFloat(marker.style.top);
  assert.ok(topAfterUp < topBefore, "ArrowUp moves the marker up");
  assert.equal(hass.calls.length, 2, "arrow movement does not immediately call the service");
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.equal(hass.calls.length, 3, "rapid arrow presses are combined into one service call");
  const wheelHue = Number(wheel.getAttribute("aria-valuenow"));
  const wheelSaturation = Number(wheel.getAttribute("aria-valuetext").match(/saturation (\d+)/)[1]);
  assert.deepEqual(hass.calls.at(-1), ["light", "turn_on", { entity_id: "light.shapes", hs_color: [wheelHue, wheelSaturation] }]);
  assert.deepEqual(card.getGridOptions(), { columns: 6, min_columns: 3, max_columns: 12, min_rows: 1, max_rows: 3, rows: 1 });
  assert.equal(card.constructor.getConfigForm().schema[0].selector.entity.filter.domain, "light");
  card.setConfig({ entity: "light.shapes", show_temperature: true, show_color: false });
  assert.equal(card.shadowRoot.querySelector("#temperature") !== null, true, "temperature can be enabled in config");
  assert.equal(card.shadowRoot.querySelector("#color-wheel"), null, "color picker can be disabled in config");
  card.remove();
});

test("unavailable and simple lights disable or hide controls", () => {
  const state = { entity_id: "light.simple", state: "unavailable", attributes: { friendly_name: "Simple", supported_color_modes: ["onoff"] } };
  const card = document.createElement("ha-nanoleaf-card");
  document.body.append(card);
  card.setConfig({ entity: state.entity_id });
  card.hass = mockHass(state);
  assert.equal(card.shadowRoot.querySelector(".power").disabled, true);
  card.shadowRoot.querySelector("[data-action='open']").click();
  assert.equal(card.shadowRoot.querySelector("#brightness"), null);
  assert.equal(card.shadowRoot.querySelector("#color-wheel"), null);
  assert.equal(card.shadowRoot.querySelector("#temperature"), null);
  card.remove();
});

test("missing entities and failed actions show clear errors", async () => {
  const hass = mockHass();
  const missing = document.createElement("ha-nanoleaf-card");
  document.body.append(missing);
  missing.setConfig({ entity: "light.missing" });
  missing.hass = hass;
  assert.match(missing.shadowRoot.querySelector(".status").textContent, /Entity not found/);
  assert.equal(missing.shadowRoot.querySelector(".power").disabled, true);
  missing.remove();

  const card = document.createElement("ha-nanoleaf-card");
  document.body.append(card);
  card.setConfig({ entity: "light.shapes" });
  card.hass = { ...hass, callService: async () => { throw new Error("offline"); } };
  const originalError = console.error;
  console.error = () => {};
  try {
    card.shadowRoot.querySelector(".power").click();
    await tick();
  } finally {
    console.error = originalError;
  }
  assert.match(card.shadowRoot.querySelector("[role='alert']").textContent, /Could not control this light/);
  card.remove();
});

test("Home Assistant can open and use the visual editor", async () => {
  const hass = mockHass();
  const card = document.createElement("ha-nanoleaf-card");
  card.setConfig({ entity: "light.shapes" });
  const editor = card.getConfigElement();
  assert.equal(editor.localName, "ha-nanoleaf-card-editor");
  document.body.append(editor);
  editor.setConfig({ entity: "light.shapes" });
  editor.hass = hass;
  await tick();
  assert.match(editor.shadowRoot.querySelector("select").innerHTML, /Nanoleaf lights/);
  let changed;
  editor.addEventListener("config-changed", (event) => { changed = event.detail.config; });
  const title = editor.shadowRoot.querySelector("#title");
  title.value = "Studio";
  title.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(changed, { entity: "light.shapes", title: "Studio" });
  const showTemperature = editor.shadowRoot.querySelector("#show-temperature");
  assert.equal(showTemperature.checked, false, "editor defaults white temperature to off");
  showTemperature.checked = true;
  showTemperature.dispatchEvent(new Event("change", { bubbles: true }));
  assert.deepEqual(changed, { entity: "light.shapes", title: "Studio", show_temperature: true });
  const showColor = editor.shadowRoot.querySelector("#show-color");
  assert.equal(showColor.checked, true, "color picker defaults to on");
  showColor.checked = false;
  showColor.dispatchEvent(new Event("change", { bubbles: true }));
  assert.deepEqual(changed, { entity: "light.shapes", title: "Studio", show_temperature: true, show_color: false });
  editor.remove();
});

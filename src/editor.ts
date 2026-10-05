import { escapeHtml, nanoleafLights } from "./model";
import type { CardConfig, DeviceRegistryEntry, EntityRegistryEntry, HomeAssistant } from "./types";

const CSS = `
  :host { display:block; color:var(--primary-text-color); }
  .field { display:grid; gap:6px; margin:12px 0; }
  label { font-weight:600; }
  select,input { box-sizing:border-box; width:100%; min-height:40px; padding:8px 10px; border:1px solid var(--divider-color,#ddd); border-radius:8px; background:var(--ha-card-background,var(--card-background-color,#fff)); color:var(--primary-text-color); font:inherit; }
  select:focus-visible,input:focus-visible { outline:2px solid var(--primary-color); outline-offset:2px; }
  .hint { color:var(--secondary-text-color); font-size:var(--ha-font-size-s,13px); }
  .error { color:var(--error-color,#db4437); }
`;

export class NanoleafCardEditor extends HTMLElement {
  private config: Partial<CardConfig> = {};
  private hassData?: HomeAssistant;
  private entries: EntityRegistryEntry[] = [];
  private devices: DeviceRegistryEntry[] = [];
  private loading = false;
  private loaded = false;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.addEventListener("change", (event) => this.handleChange(event));
    root.addEventListener("input", (event) => this.handleInput(event));
  }

  setConfig(config: Partial<CardConfig>): void { this.config = { ...config }; this.render(); }
  set hass(hass: HomeAssistant) {
    this.hassData = hass;
    if (!this.loaded && !this.loading) void this.loadRegistries();
    this.render();
  }

  private async loadRegistries(): Promise<void> {
    if (!this.hassData?.callWS) return;
    this.loading = true;
    try {
      [this.entries, this.devices] = await Promise.all([
        this.hassData.callWS<EntityRegistryEntry[]>({ type: "config/entity_registry/list" }),
        this.hassData.callWS<DeviceRegistryEntry[]>({ type: "config/device_registry/list" }),
      ]);
      this.loaded = true;
    } catch (error) {
      console.warn("Nanoleaf Card editor: could not load device registry", error);
    }
    this.loading = false;
    this.render();
  }

  private handleChange(event: Event): void {
    const input = event.target as HTMLSelectElement;
    if (input.id === "entity") this.update({ entity: input.value });
  }

  private handleInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.id === "title") this.update({ title: input.value });
  }

  private update(change: Partial<CardConfig>): void {
    this.config = { ...this.config, ...change };
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this.config }, bubbles: true, composed: true }));
  }

  private render(): void {
    if (!this.shadowRoot) return;
    const focused = this.shadowRoot.activeElement as HTMLInputElement | HTMLSelectElement | null;
    const focusId = focused?.id;
    const selection = focusId === "title" ? (focused as HTMLInputElement).selectionStart : null;
    const allLights = Object.keys(this.hassData?.states ?? {}).filter((id) => id.startsWith("light.")).sort();
    const nanoleaf = nanoleafLights(this.entries, this.devices, this.hassData?.states ?? {});
    const preferred = new Set(nanoleaf);
    const others = allLights.filter((id) => !preferred.has(id));
    const selected = this.config.entity ?? "";
    const name = (id: string) => this.hassData?.states[id]?.attributes.friendly_name || id;
    const option = (id: string) => `<option value="${escapeHtml(id)}" ${selected === id ? "selected" : ""}>${escapeHtml(name(id))}</option>`;
    this.shadowRoot.innerHTML = `<style>${CSS}</style><div class="field"><label for="entity">Light</label><select id="entity" required>
      <option value="" ${!selected ? "selected" : ""}>Choose a light</option>
      ${selected && !allLights.includes(selected) ? `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)} (not found)</option>` : ""}
      ${nanoleaf.length ? `<optgroup label="Nanoleaf lights">${nanoleaf.map(option).join("")}</optgroup>` : ""}
      ${others.length ? `<optgroup label="Other lights">${others.map(option).join("")}</optgroup>` : ""}
    </select><span class="hint">Nanoleaf devices appear first when Home Assistant reports their manufacturer. Any compatible light can be selected.</span></div>
    <div class="field"><label for="title">Title (optional)</label><input id="title" type="text" value="${escapeHtml(this.config.title ?? "")}" placeholder="Use device name"></div>
    ${!this.loaded && !this.loading && this.hassData?.callWS ? `<div class="hint error">Could not load the device registry. All available lights are still listed.</div>` : ""}`;
    if (focusId) {
      const next = this.shadowRoot.querySelector<HTMLInputElement | HTMLSelectElement>(`#${focusId}`);
      next?.focus();
      if (focusId === "title" && selection !== null && selection !== undefined) (next as HTMLInputElement | null)?.setSelectionRange(selection, selection);
    }
  }
}

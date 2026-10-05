import { brightnessPercent, capabilities, companionsFor, escapeHtml, hsToHex, serviceData } from "./model";
import cardCss from "./card.css";
import type { CardConfig, CompanionEntities, EntityRegistryEntry, EntityState, HomeAssistant } from "./types";


export class NanoleafCard extends HTMLElement {
  private config?: CardConfig;
  private hassData?: HomeAssistant;
  private companions: CompanionEntities = {};
  private registryToken = 0;
  private open = false;
  private search = "";
  private error = "";
  private colorPreview?: [number, number];

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.addEventListener("click", (event) => this.handleClick(event));
    root.addEventListener("input", (event) => this.handleInput(event));
    root.addEventListener("change", (event) => this.handleChange(event));
    root.addEventListener("pointerdown", (event) => this.handleColorPointer(event, true));
    root.addEventListener("pointermove", (event) => this.handleColorPointer(event, false));
    root.addEventListener("pointerup", (event) => this.finishColorPointer(event));
    root.addEventListener("pointercancel", () => { this.colorPreview = undefined; this.render(); });
    root.addEventListener("keydown", (event) => this.handleColorKey(event as KeyboardEvent));
    root.addEventListener("close", (event) => {
      if (event.target instanceof HTMLDialogElement) this.open = false;
    }, true);
  }

  setConfig(config: CardConfig): void {
    if (!config || typeof config.entity !== "string" || !/^light\.[a-z0-9_]+$/.test(config.entity)) {
      throw new Error("Choose one light entity, for example light.nanoleaf_shapes.");
    }
    if (config.title !== undefined && typeof config.title !== "string") throw new Error("Title must be text.");
    const changed = this.config?.entity !== config.entity;
    this.config = { ...config };
    this.error = "";
    if (changed) {
      this.companions = {};
      this.registryToken++;
      void this.loadCompanions();
    }
    this.render();
  }

  set hass(hass: HomeAssistant) {
    const first = !this.hassData;
    this.hassData = hass;
    if (first) void this.loadCompanions();
    this.render();
  }

  get hass(): HomeAssistant | undefined { return this.hassData; }
  getCardSize(): number { return 2; }
  getGridOptions(): { columns: number; min_columns: number; max_columns: number; min_rows: number; rows: number } {
    return { columns: 6, min_columns: 3, max_columns: 12, min_rows: 1, rows: 2 };
  }
  getConfigElement(): HTMLElement { return document.createElement("ha-nanoleaf-card-editor"); }
  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { filter: { domain: "light" } } } },
        { name: "title", selector: { text: {} } },
      ],
      computeLabel: (schema: { name: string }) => schema.name === "entity" ? "Light" : "Title (optional)",
      computeHelper: (schema: { name: string }) => schema.name === "entity" ? "Choose a Nanoleaf light, or any compatible light entity." : "Leave empty to use the entity name.",
      assertConfig: (config: CardConfig) => {
        if (typeof config.entity !== "string" || !/^light\.[a-z0-9_]+$/.test(config.entity)) throw new Error("Choose one light entity.");
      },
    };
  }
  static getStubConfig(hass?: HomeAssistant): CardConfig {
    const first = Object.keys(hass?.states ?? {}).find((id) => id.startsWith("light."));
    return { entity: first ?? "light.choose_a_light" };
  }

  disconnectedCallback(): void { this.registryToken++; }

  private state(): EntityState | undefined { return this.config ? this.hassData?.states[this.config.entity] : undefined; }

  private async loadCompanions(): Promise<void> {
    if (!this.config || !this.hassData?.callWS) return;
    const token = ++this.registryToken;
    try {
      const entries = await this.hassData.callWS<EntityRegistryEntry[]>({ type: "config/entity_registry/list" });
      if (token !== this.registryToken) return;
      this.companions = companionsFor(this.config.entity, entries, this.hassData.states);
      this.render();
    } catch (error) {
      console.warn("Nanoleaf Card: could not load related entities", error);
    }
  }

  private async command(command: "on" | "off" | "brightness" | "color" | "temperature" | "effect", value?: string | number | [number, number]): Promise<void> {
    const state = this.state();
    if (!this.config || !this.hassData || !state || ["unavailable", "unknown"].includes(state.state)) return;
    try {
      const request = serviceData(this.config.entity, command, value);
      await this.hassData.callService("light", request.service, request.data);
      this.error = "";
    } catch (error) {
      console.error("Nanoleaf Card: light service failed", error);
      this.error = "Could not control this light. Check the Home Assistant log.";
    }
    this.render();
  }

  private async identify(): Promise<void> {
    if (!this.companions.identify || !this.hassData) return;
    try {
      await this.hassData.callService("button", "press", { entity_id: this.companions.identify });
      this.error = "";
    } catch (error) {
      console.error("Nanoleaf Card: identify failed", error);
      this.error = "Could not identify this device. Check the Home Assistant log.";
    }
    this.render();
  }

  private handleClick(event: Event): void {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "open") { this.open = true; this.render(); }
    else if (action === "close") this.shadowRoot?.querySelector("dialog")?.close();
    else if (action === "power") void this.command(this.state()?.state === "on" ? "off" : "on");
    else if (action === "effect" && button.dataset.effect) void this.command("effect", button.dataset.effect);
    else if (action === "identify") void this.identify();
  }

  private handleInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.id === "effect-search") {
      this.search = input.value;
      this.filterEffects();
    } else if (input.id === "brightness") {
      const output = this.shadowRoot?.querySelector("#brightness-value");
      if (output) output.textContent = `${input.value}%`;
    } else if (input.id === "temperature") {
      const output = this.shadowRoot?.querySelector("#temperature-value");
      if (output) output.textContent = `${input.value} K`;
    }
  }

  private handleChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.id === "brightness") void this.command("brightness", Number(input.value));
    else if (input.id === "temperature") void this.command("temperature", Number(input.value));
  }

  private colorAt(event: PointerEvent): [number, number] | undefined {
    const wheel = (event.target as HTMLElement).closest<HTMLElement>("#color-wheel");
    if (!wheel) return undefined;
    const rect = wheel.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2;
    if (!radius) return undefined;
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.min(1, Math.hypot(dx, dy) / radius);
    const hue = (Math.round(Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360;
    return [hue, Math.round(distance * 100)];
  }

  private setColorPreview(value: [number, number]): void {
    this.colorPreview = value;
    const marker = this.shadowRoot?.querySelector<HTMLElement>(".color-marker");
    const wheel = this.shadowRoot?.querySelector<HTMLElement>("#color-wheel");
    const output = this.shadowRoot?.querySelector<HTMLElement>("#color-value");
    if (!marker || !wheel || !output) return;
    const radians = value[0] * Math.PI / 180;
    const saturation = Math.max(0, Math.min(100, value[1])) / 100;
    marker.style.left = `${50 + Math.sin(radians) * saturation * 50}%`;
    marker.style.top = `${50 - Math.cos(radians) * saturation * 50}%`;
    const color = hsToHex(value);
    marker.style.backgroundColor = color;
    wheel.setAttribute("aria-valuenow", String(value[0]));
    wheel.setAttribute("aria-valuetext", `Hue ${value[0]} degrees, saturation ${value[1]} percent`);
    const swatch = output.querySelector<HTMLElement>(".swatch");
    if (swatch) swatch.style.backgroundColor = color;
    const hex = output.querySelector<HTMLElement>(".hex");
    if (hex) hex.textContent = color.toUpperCase();
  }

  private handleColorPointer(event: Event, start: boolean): void {
    const pointer = event as PointerEvent;
    const target = pointer.target as HTMLElement;
    if (start) {
      const wheel = target.closest<HTMLElement>("#color-wheel");
      if (!wheel || !this.state() || ["unavailable", "unknown"].includes(this.state()!.state)) return;
      pointer.preventDefault();
      wheel.focus();
      wheel.setPointerCapture?.(pointer.pointerId);
    }
    const value = this.colorAt(pointer);
    if (value) this.setColorPreview(value);
  }

  private finishColorPointer(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.closest("#color-wheel") || !this.colorPreview) return;
    const value = this.colorAt(event as PointerEvent) ?? this.colorPreview;
    this.colorPreview = value;
    void this.command("color", value);
  }

  private handleColorKey(event: KeyboardEvent): void {
    const wheel = (event.target as HTMLElement).closest<HTMLElement>("#color-wheel");
    if (!wheel || wheel.getAttribute("aria-disabled") === "true") return;
    const value = this.colorPreview ?? (this.state()?.attributes.hs_color as [number, number] | undefined) ?? [0, 0];
    const next: [number, number] = [value[0], value[1]];
    if (event.key === "ArrowLeft") next[0] = (next[0] + 359) % 360;
    else if (event.key === "ArrowRight") next[0] = (next[0] + 1) % 360;
    else if (event.key === "ArrowUp") next[1] = Math.min(100, next[1] + 1);
    else if (event.key === "ArrowDown") next[1] = Math.max(0, next[1] - 1);
    else return;
    event.preventDefault();
    this.setColorPreview(next);
    void this.command("color", next);
  }

  private filterEffects(): void {
    const query = this.search.trim().toLocaleLowerCase();
    this.shadowRoot?.querySelectorAll<HTMLButtonElement>("button[data-action='effect']").forEach((button) => {
      button.hidden = !button.dataset.effect?.toLocaleLowerCase().includes(query);
    });
  }

  private render(): void {
    const root = this.shadowRoot;
    if (!root || !this.config) return;
    const focused = root.activeElement as HTMLInputElement | null;
    const focusId = focused?.id;
    const selection = focusId === "effect-search" ? focused?.selectionStart : null;
    const state = this.state();
    const available = !!state && !["unknown", "unavailable"].includes(state.state);
    const on = state?.state === "on";
    const caps = capabilities(state);
    const title = this.config.title?.trim() || state?.attributes.friendly_name || this.config.entity;
    const icon = state?.attributes.icon || "mdi:lightbulb-group";
    const brightness = brightnessPercent(state);
    const effect = state?.attributes.effect;
    const status = !state ? "Entity not found" : !available ? "Unavailable" : on ? (effect || (caps.brightness ? `${brightness}% brightness` : "On")) : "Off";
    const selectedColor = this.colorPreview ?? (state?.attributes.hs_color as [number, number] | undefined) ?? [0, 0];
    const accent = hsToHex(selectedColor);
    const colorRadians = selectedColor[0] * Math.PI / 180;
    const colorSaturation = Math.max(0, Math.min(100, selectedColor[1])) / 100;
    const markerX = 50 + Math.sin(colorRadians) * colorSaturation * 50;
    const markerY = 50 - Math.cos(colorRadians) * colorSaturation * 50;
    const gesture = this.companions.gesture ? this.hassData?.states[this.companions.gesture]?.attributes.event_type : undefined;
    const temperature = Number(state?.attributes.color_temp_kelvin);
    const kelvin = Number.isFinite(temperature) && temperature >= caps.minKelvin && temperature <= caps.maxKelvin ? temperature : Math.round((caps.minKelvin + caps.maxKelvin) / 2);
    const markup = `<style>${cardCss}</style><ha-card style="--nanoleaf-accent:${accent}" class="${on ? "on" : ""}">
      <div class="tile">
        <button class="open" type="button" data-action="open" aria-label="Open controls for ${escapeHtml(title)}">
          <span class="light-icon"><ha-icon icon="${escapeHtml(icon)}"></ha-icon></span>
          <span class="text"><span class="name">${escapeHtml(title)}</span><span class="status">${escapeHtml(status)}</span></span>
        </button>
        <button class="power" type="button" data-action="power" aria-label="Turn ${escapeHtml(title)} ${on ? "off" : "on"}" aria-pressed="${on}" ${!available ? "disabled" : ""}><ha-icon icon="mdi:power"></ha-icon></button>
      </div>
      ${this.error ? `<p class="error" role="alert">${escapeHtml(this.error)}</p>` : ""}
    </ha-card>
    <dialog aria-label="Controls for ${escapeHtml(title)}"><div class="detail-header"><span class="detail-title">${escapeHtml(title)}</span><button class="close" type="button" data-action="close" aria-label="Close controls"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="content">
        <div class="row"><span><span class="label">Power</span><br><span class="muted">${escapeHtml(status)}</span></span><button class="secondary" type="button" data-action="power" aria-pressed="${on}" ${!available ? "disabled" : ""}>${on ? "Turn off" : "Turn on"}</button></div>
        ${caps.brightness ? `<div class="control"><div class="row"><label class="label" for="brightness">Brightness</label><output id="brightness-value" for="brightness">${brightness}%</output></div><input class="range" id="brightness" type="range" min="1" max="100" value="${brightness}" ${!available ? "disabled" : ""}></div>` : ""}
        ${caps.color ? `<div class="control"><span class="label">Color</span><div class="color-row"><div id="color-wheel" class="wheel" role="slider" tabindex="0" aria-label="Choose color" aria-valuemin="0" aria-valuemax="359" aria-valuenow="${selectedColor[0]}" aria-valuetext="Hue ${selectedColor[0]} degrees, saturation ${selectedColor[1]} percent" aria-disabled="${!available}" style="opacity:${available ? 1 : 0.5};cursor:${available ? "crosshair" : "not-allowed"}"><span class="color-marker" style="left:${markerX}%;top:${markerY}%;background-color:${accent}"></span></div><div id="color-value" class="color-value"><span class="swatch" style="background-color:${accent}"></span><span class="hex">${accent.toUpperCase()}</span><span>Drag to choose · arrow keys to fine-tune</span></div></div></div>` : ""}
        ${caps.temperature ? `<div class="control"><div class="row"><label class="label" for="temperature">White temperature</label><output id="temperature-value" for="temperature">${Math.round(kelvin)} K</output></div><input class="range" id="temperature" type="range" min="${caps.minKelvin}" max="${caps.maxKelvin}" step="50" value="${kelvin}" ${!available ? "disabled" : ""}></div>` : ""}
        ${caps.effects.length ? `<div class="control"><label class="label" for="effect-search">Saved effects</label><input class="search" id="effect-search" type="search" placeholder="Search effects" value="${escapeHtml(this.search)}"><div class="effects" aria-label="Saved effects">${caps.effects.map((name) => `<button class="effect" type="button" data-action="effect" data-effect="${escapeHtml(name)}" aria-pressed="${name === effect}" ${!available ? "disabled" : ""}>${escapeHtml(name)}</button>`).join("")}</div></div>` : ""}
        ${this.companions.identify || this.companions.gesture ? `<div class="row"><span class="muted">${gesture ? `Last gesture: ${escapeHtml(String(gesture).replace(/_/g, " "))}` : "Device"}</span>${this.companions.identify ? `<button class="secondary" type="button" data-action="identify" ${!available ? "disabled" : ""}>Identify</button>` : ""}</div>` : ""}
        ${this.error ? `<p class="detail-error" role="alert">${escapeHtml(this.error)}</p>` : ""}
      </div>
    </dialog>`;
    const template = document.createElement("template");
    template.innerHTML = markup;
    const existingDialog = root.querySelector("dialog");
    if (existingDialog) {
      const nextCard = template.content.querySelector("ha-card");
      const nextDialog = template.content.querySelector("dialog");
      if (nextCard) root.querySelector("ha-card")?.replaceWith(nextCard);
      if (nextDialog) {
        existingDialog.setAttribute("aria-label", nextDialog.getAttribute("aria-label") || "Light controls");
        existingDialog.innerHTML = nextDialog.innerHTML;
      }
    } else root.append(template.content);
    if (this.open) {
      const dialog = root.querySelector("dialog");
      if (dialog && !dialog.open) dialog.showModal();
      this.filterEffects();
      if (focusId) {
        const next = root.querySelector<HTMLInputElement>(`#${focusId}`);
        next?.focus();
        if (selection !== null && selection !== undefined) next?.setSelectionRange(selection, selection);
      }
    }
  }
}

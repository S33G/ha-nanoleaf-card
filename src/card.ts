import { brightnessPercent, capabilities, companionsFor, escapeHtml, hsToHex, serviceData } from "./model";
import type { CardConfig, CompanionEntities, EntityRegistryEntry, EntityState, HomeAssistant } from "./types";

const CSS = `
  :host { display:block; }
  ha-card { overflow:hidden; background:var(--ha-card-background,var(--card-background-color,#fff)); color:var(--primary-text-color); }
  button,input { font:inherit; }
  button { cursor:pointer; }
  button:focus-visible,input:focus-visible { outline:2px solid var(--primary-color); outline-offset:2px; }
  button:disabled,input:disabled { cursor:not-allowed; opacity:.5; }
  .tile { min-height:86px; display:flex; align-items:center; gap:12px; padding:12px 16px; box-sizing:border-box; }
  .open { flex:1; min-width:0; display:flex; align-items:center; gap:14px; border:0; padding:0; color:inherit; background:transparent; text-align:left; }
  .light-icon { width:48px; height:48px; flex:none; display:grid; place-items:center; border-radius:50%; background:var(--secondary-background-color,#eee); color:var(--secondary-text-color); }
  .on .light-icon { background:color-mix(in srgb,var(--nanoleaf-accent) 22%,var(--ha-card-background,var(--card-background-color,#fff))); color:var(--nanoleaf-accent); }
  .light-icon ha-icon { --mdc-icon-size:26px; }
  .text { min-width:0; display:flex; flex-direction:column; gap:3px; }
  .name { font-size:var(--ha-font-size-m,16px); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .status { color:var(--secondary-text-color); font-size:var(--ha-font-size-s,13px); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .power { width:42px; height:42px; flex:none; display:grid; place-items:center; border:0; border-radius:50%; background:var(--secondary-background-color,#eee); color:var(--primary-text-color); }
  .on .power { color:var(--state-light-active-color,var(--primary-color)); }
  .error { margin:0 16px 12px; color:var(--error-color,#db4437); font-size:var(--ha-font-size-s,13px); }
  dialog { box-sizing:border-box; width:min(440px,calc(100vw - 24px)); max-height:min(85vh,760px); overflow:auto; padding:0; border:1px solid var(--divider-color,#ddd); border-radius:var(--ha-card-border-radius,12px); color:var(--primary-text-color); background:var(--ha-card-background,var(--card-background-color,#fff)); box-shadow:var(--ha-card-box-shadow,0 16px 48px #0005); }
  dialog::backdrop { background:#0009; }
  .detail-header { position:sticky; top:0; z-index:1; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 18px; background:var(--ha-card-background,var(--card-background-color,#fff)); border-bottom:1px solid var(--divider-color,#ddd); }
  .detail-title { min-width:0; font-size:var(--ha-font-size-l,18px); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .close { width:36px; height:36px; flex:none; border:0; border-radius:50%; background:transparent; color:var(--primary-text-color); }
  .content { padding:16px 18px 20px; display:grid; gap:20px; }
  .row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .label { font-weight:600; font-size:var(--ha-font-size-s,13px); }
  .muted { color:var(--secondary-text-color); font-size:var(--ha-font-size-s,13px); }
  .control { display:grid; gap:8px; }
  .range { width:100%; accent-color:var(--state-light-active-color,var(--primary-color)); }
  .color-row { display:flex; align-items:center; gap:12px; }
  .color-input { width:54px; height:42px; border:1px solid var(--divider-color,#ddd); border-radius:8px; padding:3px; background:var(--secondary-background-color,#eee); }
  .search { width:100%; box-sizing:border-box; min-height:40px; padding:8px 10px; border:1px solid var(--divider-color,#ddd); border-radius:8px; background:var(--ha-card-background,var(--card-background-color,#fff)); color:var(--primary-text-color); }
  .effects { max-height:205px; overflow:auto; display:flex; flex-wrap:wrap; gap:8px; }
  .effect { min-height:36px; max-width:100%; padding:6px 11px; border:1px solid var(--divider-color,#ddd); border-radius:18px; background:var(--secondary-background-color,#eee); color:var(--primary-text-color); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .effect[aria-pressed="true"] { border-color:var(--primary-color); color:var(--primary-color); }
  .effect[hidden] { display:none; }
  .secondary { min-height:36px; padding:6px 12px; border:1px solid var(--divider-color,#ddd); border-radius:8px; background:var(--secondary-background-color,#eee); color:var(--primary-text-color); }
  .detail-error { margin:0; color:var(--error-color,#db4437); font-size:var(--ha-font-size-s,13px); }
  @media (max-width:360px) { .tile { padding:10px 12px; gap:8px; } .open { gap:9px; } .light-icon { width:40px; height:40px; } }
`;

export class NanoleafCard extends HTMLElement {
  private config?: CardConfig;
  private hassData?: HomeAssistant;
  private companions: CompanionEntities = {};
  private registryToken = 0;
  private open = false;
  private search = "";
  private error = "";

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.addEventListener("click", (event) => this.handleClick(event));
    root.addEventListener("input", (event) => this.handleInput(event));
    root.addEventListener("change", (event) => this.handleChange(event));
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
  getGridOptions(): { columns: number; min_rows: number; rows: number } { return { columns: 6, min_rows: 1, rows: 2 }; }
  getConfigElement(): HTMLElement { return document.createElement("ha-nanoleaf-card-editor"); }
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

  private async command(command: "on" | "off" | "brightness" | "color" | "temperature" | "effect", value?: string | number): Promise<void> {
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
    else if (input.id === "color") void this.command("color", input.value);
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
    const accent = hsToHex(state?.attributes.hs_color);
    const gesture = this.companions.gesture ? this.hassData?.states[this.companions.gesture]?.attributes.event_type : undefined;
    const temperature = Number(state?.attributes.color_temp_kelvin);
    const kelvin = Number.isFinite(temperature) && temperature >= caps.minKelvin && temperature <= caps.maxKelvin ? temperature : Math.round((caps.minKelvin + caps.maxKelvin) / 2);
    const markup = `<style>${CSS}</style><ha-card style="--nanoleaf-accent:${accent}" class="${on ? "on" : ""}">
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
        ${caps.color ? `<div class="control"><label class="label" for="color">Color</label><div class="color-row"><input class="color-input" id="color" type="color" value="${accent}" ${!available ? "disabled" : ""}><span class="muted">Choose a solid color</span></div></div>` : ""}
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

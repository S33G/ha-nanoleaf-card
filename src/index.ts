import { NanoleafCard } from "./card";
import { NanoleafCardEditor } from "./editor";

if (!customElements.get("ha-nanoleaf-card")) customElements.define("ha-nanoleaf-card", NanoleafCard);
if (!customElements.get("ha-nanoleaf-card-editor")) customElements.define("ha-nanoleaf-card-editor", NanoleafCardEditor);

declare global {
  interface Window {
    customCards?: Array<{ type: string; name: string; description: string; preview: boolean }>;
  }
}

window.customCards = window.customCards ?? [];
if (!window.customCards.some((card) => card.type === "ha-nanoleaf-card")) {
  window.customCards.push({
    type: "ha-nanoleaf-card",
    name: "Nanoleaf Card",
    description: "Theme-aware controls for Nanoleaf and other Home Assistant lights.",
    preview: false,
  });
}

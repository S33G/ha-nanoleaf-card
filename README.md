# Nanoleaf Card

A Home Assistant dashboard card for Nanoleaf lights. It shows a compact light tile and opens a detail panel for the controls that the selected light actually supports. The card uses Home Assistant theme colors and works with one light entity per card.

## Features

- Power, brightness, solid color, white temperature, and searchable saved effects, according to the light entity's capabilities.
- Automatic **Identify** button and latest touch gesture display when the Home Assistant device has those Nanoleaf entities.
- Nanoleaf lights shown first in the visual editor, including devices connected through Matter or HomeKit when their manufacturer is reported as Nanoleaf. Any compatible `light` entity can be configured manually.
- Unavailable state and service errors shown in the card.

The official Home Assistant Nanoleaf integration supports Light Panels, Canvas, Shapes, Elements, and Lines. It does not support the Nanoleaf Remote or Essentials lights; Essentials may instead be available through Matter or HomeKit. This card follows the capabilities reported by those Home Assistant light entities. It does not connect to the Nanoleaf device IP directly, require an API token, show physical panel layouts, or paint individual panels.

## Prerequisites

Add the device to Home Assistant first. For Shapes, use **Settings → Devices & services → Add Integration → Nanoleaf** and follow the pairing steps. For other Nanoleaf products, use the Home Assistant integration that exposes them as a `light` entity.

## Install

### HACS

After this project is published as its own GitHub repository, add that repository to HACS as a **Dashboard** custom repository and install **Nanoleaf Card**. Reload the browser. The HACS resource is `ha-nanoleaf-card.js`.

### Manual

Copy `ha-nanoleaf-card.js` to your Home Assistant `/config/www/` directory. Add a dashboard resource with URL `/local/ha-nanoleaf-card.js` and type **JavaScript module**, then reload the browser.

## Use

Add **Nanoleaf Card** in the dashboard card picker and choose a light in the visual editor. Or use YAML:

```yaml
type: custom:ha-nanoleaf-card
entity: light.nanoleaf_shapes
title: Studio Shapes
```

`entity` is required and must be a `light` entity ID. `title` is optional; the entity's friendly name is used by default. Add another card for each additional device.

Tap the light tile to open its controls. The power button on the tile turns the light on or off. Selecting a color, temperature, brightness, or effect uses Home Assistant's `light.turn_on` action. The card updates from Home Assistant's live entity state. An Identify control appears when a related button entity exists. The latest supported touch gesture appears when a related event entity exists.

## Build and test

Requires Node.js 20 or newer.

```sh
npm ci
npm run check
```

The TypeScript source is in `src/`. The checked-in `ha-nanoleaf-card.js` is the standalone resource used by HACS and manual installation. Tests use mock Home Assistant entities and a simulated DOM; test the resource in a Home Assistant dashboard before publishing a release.

## License

MIT. Copyright (c) 2026 s33g <dev@charlie.fyi>.

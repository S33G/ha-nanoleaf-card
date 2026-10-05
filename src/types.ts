export interface EntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown> & {
    friendly_name?: string;
    icon?: string;
    brightness?: number;
    hs_color?: [number, number];
    color_temp_kelvin?: number;
    min_color_temp_kelvin?: number;
    max_color_temp_kelvin?: number;
    supported_color_modes?: string[];
    effect?: string;
    effect_list?: string[];
    event_type?: string;
  };
}

export interface HomeAssistant {
  states: Record<string, EntityState | undefined>;
  callService(domain: string, service: string, data: Record<string, unknown>): Promise<unknown>;
  callWS?<T = unknown>(message: { type: string }): Promise<T>;
}

export interface EntityRegistryEntry {
  entity_id: string;
  device_id?: string | null;
  platform?: string;
  disabled_by?: string | null;
}

export interface DeviceRegistryEntry {
  id: string;
  manufacturer?: string | null;
  name?: string | null;
}

export interface CardConfig {
  type?: string;
  entity: string;
  title?: string;
}

export interface CompanionEntities {
  identify?: string;
  gesture?: string;
}

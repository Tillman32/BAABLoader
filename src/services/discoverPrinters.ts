import type { AppConfig } from "../config.js";

export interface Printer {
  id: string;
}

export async function discoverPrinters(config: AppConfig): Promise<Printer[]> {
  return config.printers.map((id) => ({ id }));
}

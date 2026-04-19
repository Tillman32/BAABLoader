export interface PrinterConfig {
  id: string;
  host: string;
  accessCode: string;
  serial: string;
}

export interface PulledTimelapse {
  hash: string;
  printerId: string;
  printerSerial: string;
  printerModel: string;
  projectName: string;
  stagedPath: string;
  capturedAt: string;
}

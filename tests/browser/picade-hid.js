const BUTTON_COUNT = 18;

export const PICADE_HID_FILTERS = Object.freeze([
  Object.freeze({ vendorId: 0x2e8a, productId: 0x1098 }),
  Object.freeze({ vendorId: 0xcafe, productId: 0x400d }),
]);

export function parsePicadeHidReport(data) {
  if (!(data instanceof DataView) || data.byteLength < 4) return null;
  const buttons = data.byteLength >= 6
    ? data.getUint32(2, true)
    : data.getUint16(2, true);
  return {
    axes: [data.getInt8(0) / 127, data.getInt8(1) / 127],
    buttons: Array.from({ length: BUTTON_COUNT }, (_, index) => Boolean(buttons & (1 << index))),
  };
}

export function getPicadePlayerReportIds(device) {
  const reportIds = new Set();
  for (const collection of device?.collections ?? []) {
    for (const report of collection.inputReports ?? []) {
      if (report.reportId === 1 || report.reportId === 2) reportIds.add(report.reportId);
    }
  }
  return [...reportIds].sort();
}

const createPlayer = (player, device) => ({
  player,
  device,
  axes: [0, 0],
  buttons: Array(BUTTON_COUNT).fill(false),
  timestamp: 0,
});

export class PicadeHidManager extends EventTarget {
  #hid;
  #devices = new Map();
  #players = new Map();

  constructor(hid = globalThis.navigator?.hid) {
    super();
    this.#hid = hid;
    this.#hid?.addEventListener?.('disconnect', (event) => this.#removeDevice(event.device));
  }

  get supported() {
    return Boolean(this.#hid?.requestDevice && this.#hid?.getDevices);
  }

  get connectedDevices() {
    return this.#devices.size;
  }

  get connectedPlayers() {
    return this.#players.size;
  }

  get active() {
    return this.connectedPlayers >= 2;
  }

  get gamepads() {
    return [...this.#players.values()]
      .sort((left, right) => left.player - right.player)
      .map((state) => ({
        index: state.player,
        id: `${state.device.productName || 'Picade Max'} · WebHID Player ${state.player + 1}`,
        mapping: '',
        connected: true,
        timestamp: state.timestamp,
        axes: [...state.axes],
        buttons: state.buttons.map((pressed) => ({ pressed, touched: pressed, value: pressed ? 1 : 0 })),
        source: 'webhid',
      }));
  }

  async connectAuthorized() {
    if (!this.supported) return [];
    return this.connectDevices(await this.#hid.getDevices());
  }

  async requestAndConnect() {
    if (!this.supported) return [];
    const devices = await this.#hid.requestDevice({ filters: PICADE_HID_FILTERS });
    return this.connectDevices(devices);
  }

  async connectDevices(devices) {
    for (const device of devices) {
      if (this.#devices.has(device)) continue;

      const reportIds = getPicadePlayerReportIds(device);
      const playerByReport = new Map();
      if (reportIds.includes(1) && reportIds.includes(2)) {
        playerByReport.set(1, 0);
        playerByReport.set(2, 1);
      } else {
        const player = [0, 1].find((candidate) => !this.#players.has(candidate));
        if (player === undefined) continue;
        playerByReport.set(0, player);
      }

      if (!device.opened) await device.open();
      for (const player of playerByReport.values()) {
        this.#players.set(player, createPlayer(player, device));
      }
      const onReport = (event) => this.#handleReport(device, event);
      device.addEventListener('inputreport', onReport);
      this.#devices.set(device, { playerByReport, onReport });
    }
    this.#notify('connect');
    return this.gamepads;
  }

  async disconnectAll() {
    for (const [device, record] of this.#devices) {
      device.removeEventListener('inputreport', record.onReport);
      if (device.opened) await device.close();
    }
    this.#devices.clear();
    this.#players.clear();
    this.#notify('disconnect');
  }

  #handleReport(device, event) {
    const record = this.#devices.get(device);
    const player = record?.playerByReport.get(event.reportId) ?? record?.playerByReport.get(0);
    const report = parsePicadeHidReport(event.data);
    if (player === undefined || !report) return;
    const state = this.#players.get(player);
    state.axes = report.axes;
    state.buttons = report.buttons;
    state.timestamp = globalThis.performance?.now?.() ?? Date.now();
  }

  #removeDevice(device) {
    const record = this.#devices.get(device);
    if (!record) return;
    device.removeEventListener('inputreport', record.onReport);
    for (const player of record.playerByReport.values()) this.#players.delete(player);
    this.#devices.delete(device);
    this.#notify('disconnect');
  }

  #notify(type) {
    this.dispatchEvent(new CustomEvent('change', { detail: { type } }));
  }
}

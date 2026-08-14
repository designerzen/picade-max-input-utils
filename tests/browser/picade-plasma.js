// Browser Plasma control, adapted from PhotoSYNTH's Picade Max libraries.
// Protocol: 115200 baud, "multiverse:data", then 128 BGRA-brightness LEDs.

const PREFIX = new TextEncoder().encode('multiverse:data');
const BAUD_RATE = 115200;
const LED_COUNT = 128;
const LEDS_PER_CONTROL = 4;
const CONTROL_COUNT = LED_COUNT / LEDS_PER_CONTROL;
const BYTES_PER_LED = 4;
const REFRESH_MS = 50;

export const PICADE_SERIAL_FILTERS = Object.freeze([
  Object.freeze({ usbVendorId: 0x2e8a, usbProductId: 0x1098 }),
  Object.freeze({ usbVendorId: 0xcafe, usbProductId: 0x400d }),
]);

// Physical Plasma positions from PhotoSYNTH's full Picade Max layout.
// Browser button order is A, B, X, Y, Start, Select, L1, R1, L2, R2,
// L3, R3, Hotkey, X1, X2.
const PLAYER_LIGHTS = Object.freeze([
  Object.freeze([13, 11, 9, 7, 14, 10, 12, 8, 15, 18, 16, 17, 24, 29, 26]),
  Object.freeze([6, 4, 2, 0, 19, 3, 5, 1, 20, 23, 21, 22, 25, 28, 27]),
]);

const BUTTON_COLORS = Object.freeze([
  '#26c6da', '#7e57c2', '#ec407a', '#ffee58', '#66bb6a',
  '#42a5f5', '#ffa726', '#ab47bc', '#26a69a', '#ef5350',
  '#9ccc65', '#5c6bc0', '#ffffff', '#ff7043', '#29b6f6',
]);

const wait = (milliseconds, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException('Aborted', 'AbortError'));
    return;
  }
  const timeout = setTimeout(resolve, milliseconds);
  signal?.addEventListener('abort', () => {
    clearTimeout(timeout);
    reject(new DOMException('Aborted', 'AbortError'));
  }, { once: true });
});

function isPicadePort(port) {
  const info = port?.getInfo?.();
  return PICADE_SERIAL_FILTERS.some((filter) =>
    info?.usbVendorId === filter.usbVendorId && info?.usbProductId === filter.usbProductId);
}

function parseColor(color, brightness = 18) {
  const hex = String(color).replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) throw new TypeError(`Invalid colour: ${color}`);
  const value = Number.parseInt(hex, 16);
  return {
    red: (value >> 16) & 0xff,
    green: (value >> 8) & 0xff,
    blue: value & 0xff,
    brightness: Math.max(0, Math.min(31, brightness)),
  };
}

class PicadePlasmaDevice {
  constructor(port, number, notify) {
    this.port = port;
    this.number = number;
    this.notify = notify;
    this.writer = null;
    this.connected = false;
    this.buffer = new Uint8Array(LED_COUNT * BYTES_PER_LED);
    this.packet = new Uint8Array(PREFIX.length + this.buffer.length);
    this.packet.set(PREFIX);
    this.writeChain = Promise.resolve();
    this.writeTimer = null;
  }

  async connect() {
    await this.port.open({ baudRate: BAUD_RATE });
    this.writer = this.port.writable.getWriter();
    this.connected = true;
    this.notify('connect', this);
    await this.clear();
  }

  setControl(control, color, brightness) {
    if (!Number.isInteger(control) || control < 0 || control >= CONTROL_COUNT) return;
    const value = color == null ? { red: 0, green: 0, blue: 0, brightness: 0 } : parseColor(color, brightness);
    for (let offset = 0; offset < LEDS_PER_CONTROL; offset++) {
      const index = ((control * LEDS_PER_CONTROL) + offset) * BYTES_PER_LED;
      this.buffer[index] = value.blue;
      this.buffer[index + 1] = value.green;
      this.buffer[index + 2] = value.red;
      this.buffer[index + 3] = value.brightness;
    }
  }

  write() {
    if (!this.connected || !this.writer) return Promise.resolve();
    this.packet.set(this.buffer, PREFIX.length);
    const frame = this.packet.slice();
    this.writeChain = this.writeChain
      .then(() => this.writer?.write(frame))
      .catch((error) => this.notify('error', this, error));
    return this.writeChain;
  }

  queueWrite() {
    if (this.writeTimer != null) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.write();
    }, REFRESH_MS);
  }

  async clear() {
    this.buffer.fill(0);
    await this.write();
  }

  async demo(signal) {
    await this.clear();
    for (let control = 0; control < CONTROL_COUNT; control++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      this.setControl(control, BUTTON_COLORS[control % BUTTON_COLORS.length], 16);
      await this.write();
      await wait(REFRESH_MS, signal);
    }
    await wait(300, signal);
    for (let control = 0; control < CONTROL_COUNT; control++) {
      this.setControl(control, null);
      if (control % 4 === 3) {
        await this.write();
        await wait(REFRESH_MS, signal);
      }
    }
    await this.clear();
  }

  async disconnect() {
    if (!this.connected) return;
    if (this.writeTimer != null) clearTimeout(this.writeTimer);
    this.writeTimer = null;
    try { await this.clear(); } catch {}
    this.connected = false;
    await this.writeChain.catch(() => {});
    try { this.writer?.releaseLock(); } catch {}
    this.writer = null;
    try { await this.port.close(); } catch {}
    this.notify('disconnect', this);
  }
}

export class PicadePlasmaManager extends EventTarget {
  constructor() {
    super();
    this.devices = new Map();
    this.demoController = null;
    this.inputSeen = false;
    this.demoSeen = false;
    this.handleSerialDisconnect = (event) => {
      const device = this.devices.get(event.target);
      if (!device) return;
      device.connected = false;
      this.devices.delete(event.target);
      this.emit('disconnect', device);
    };
    navigator.serial?.addEventListener?.('disconnect', this.handleSerialDisconnect);
  }

  get supported() { return Boolean(navigator.serial?.requestPort); }
  get connectedDevices() { return [...this.devices.values()].filter((device) => device.connected); }
  get connectedCount() { return this.connectedDevices.length; }

  emit(type, device, error) {
    this.dispatchEvent(new CustomEvent('change', { detail: { type, device, error } }));
  }

  async connectPort(port) {
    if (this.devices.get(port)?.connected) return this.devices.get(port);
    const device = new PicadePlasmaDevice(port, this.devices.size + 1, (type, source, error) => {
      if (type === 'disconnect') this.devices.delete(port);
      this.emit(type, source, error);
    });
    this.devices.set(port, device);
    try {
      await device.connect();
      return device;
    } catch (error) {
      this.devices.delete(port);
      this.emit('error', device, error);
      throw error;
    }
  }

  async connectAuthorized() {
    if (!navigator.serial?.getPorts) return 0;
    const ports = (await navigator.serial.getPorts()).filter(isPicadePort);
    await Promise.all(ports.map((port) => this.connectPort(port)));
    return ports.length;
  }

  async requestAndConnect() {
    if (!this.supported) throw new Error('Web Serial is unavailable in this browser. Use desktop Chrome or Edge.');
    const port = await navigator.serial.requestPort({ filters: PICADE_SERIAL_FILTERS });
    return this.connectPort(port);
  }

  setGamepadButton(player, button, pressed) {
    const control = PLAYER_LIGHTS[player]?.[button];
    if (control == null || !this.connectedCount) return;
    this.inputSeen = true;
    const color = pressed ? BUTTON_COLORS[button % BUTTON_COLORS.length] : null;
    for (const device of this.connectedDevices) {
      device.setControl(control, color, pressed ? 22 : 0);
      device.queueWrite();
    }
  }

  async clear() {
    await Promise.all(this.connectedDevices.map((device) => device.clear()));
  }

  async runDemo() {
    this.stopDemo();
    this.demoController = new AbortController();
    this.demoSeen = true;
    try {
      await Promise.all(this.connectedDevices.map((device) => device.demo(this.demoController.signal)));
    } finally {
      this.demoController = null;
      this.emit('demo', null);
    }
  }

  stopDemo() {
    this.demoController?.abort();
    this.demoController = null;
  }

  async disconnectAll() {
    this.stopDemo();
    await Promise.all(this.connectedDevices.map((device) => device.disconnect()));
    this.devices.clear();
  }
}

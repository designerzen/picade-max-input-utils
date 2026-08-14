import assert from 'node:assert/strict';

if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, options = {}) {
      super(type);
      this.detail = options.detail;
    }
  };
}

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    serial: {
      addEventListener() {},
      async getPorts() { return []; },
      async requestPort() { throw new Error('Not used by this test'); },
    },
  },
});

const writes = [];
const writer = {
  async write(frame) { writes.push(new Uint8Array(frame)); },
  releaseLock() {},
};
const port = {
  async open(options) { assert.deepEqual(options, { baudRate: 115200 }); },
  async close() {},
  getInfo() { return { usbVendorId: 0x2e8a, usbProductId: 0x1098 }; },
  writable: { getWriter: () => writer },
};

const { PicadePlasmaManager } = await import('./picade-plasma.js');
const manager = new PicadePlasmaManager();
await manager.connectPort(port);
assert.equal(manager.connectedCount, 1);

manager.setGamepadButton(0, 0, true);
await new Promise((resolve) => setTimeout(resolve, 70));

const prefix = new TextEncoder().encode('multiverse:data');
const frame = writes.at(-1);
assert.deepEqual([...frame.slice(0, prefix.length)], [...prefix]);
assert.equal(frame.length, prefix.length + (128 * 4));

// Player 1 button A maps to physical Plasma control 13, four LEDs per control.
const payloadOffset = prefix.length + (13 * 4 * 4);
assert.deepEqual([...frame.slice(payloadOffset, payloadOffset + 4)], [0xda, 0xc6, 0x26, 22]);

manager.setGamepadButton(0, 0, false);
await new Promise((resolve) => setTimeout(resolve, 70));
assert.deepEqual([...writes.at(-1).slice(payloadOffset, payloadOffset + 4)], [0, 0, 0, 0]);

const secondWrites = [];
const secondPort = {
  async open(options) { assert.deepEqual(options, { baudRate: 115200 }); },
  async close() {},
  getInfo() { return { usbVendorId: 0xcafe, usbProductId: 0x400d }; },
  writable: {
    getWriter: () => ({
      async write(frameValue) { secondWrites.push(new Uint8Array(frameValue)); },
      releaseLock() {},
    }),
  },
};
await manager.connectPort(secondPort);
assert.equal(manager.connectedCount, 2);

// Player 2 button A maps to physical Plasma control 6 and broadcasts to every
// connected Picade interface.
manager.setGamepadButton(1, 0, true);
await new Promise((resolve) => setTimeout(resolve, 70));
const playerTwoOffset = prefix.length + (6 * 4 * 4);
assert.deepEqual([...writes.at(-1).slice(playerTwoOffset, playerTwoOffset + 4)], [0xda, 0xc6, 0x26, 22]);
assert.deepEqual([...secondWrites.at(-1).slice(playerTwoOffset, playerTwoOffset + 4)], [0xda, 0xc6, 0x26, 22]);

await manager.disconnectAll();
assert.equal(manager.connectedCount, 0);

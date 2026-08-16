import assert from 'node:assert/strict';
import { getPicadePlayerReportIds, parsePicadeHidReport } from './picade-hid.js';

const bytes = new Uint8Array(6);
const view = new DataView(bytes.buffer);
view.setInt8(0, -127);
view.setInt8(1, 127);
view.setUint32(2, (1 << 0) | (1 << 16) | (1 << 17), true);

const report = parsePicadeHidReport(view);
assert.deepEqual(report.axes, [-1, 1]);
assert.equal(report.buttons.length, 18);
assert.equal(report.buttons[0], true);
assert.equal(report.buttons[15], false);
assert.equal(report.buttons[16], true);
assert.equal(report.buttons[17], true);

assert.deepEqual(getPicadePlayerReportIds({
  collections: [{ inputReports: [{ reportId: 2 }, { reportId: 1 }, { reportId: 7 }] }],
}), [1, 2]);
assert.deepEqual(getPicadePlayerReportIds({ collections: [] }), []);

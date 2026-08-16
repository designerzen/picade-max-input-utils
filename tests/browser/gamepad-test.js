import { PicadePlasmaManager } from './picade-plasma.js';
import { PicadeHidManager } from './picade-hid.js';

const elements = {
  api: document.querySelector('#api-value'),
  secure: document.querySelector('#secure-value'),
  count: document.querySelector('#controller-count'),
  lastScan: document.querySelector('#last-scan'),
  status: document.querySelector('#monitor-status'),
  start: document.querySelector('#start-button'),
  stop: document.querySelector('#stop-button'),
  reset: document.querySelector('#reset-button'),
  hidApi: document.querySelector('#hid-api-value'),
  hidPlayers: document.querySelector('#hid-player-count'),
  hidConnect: document.querySelector('#hid-connect-button'),
  hidDisconnect: document.querySelector('#hid-disconnect-button'),
  checks: document.querySelector('#check-list'),
  gamepads: document.querySelector('#gamepad-list'),
  empty: document.querySelector('#empty-state'),
  log: document.querySelector('#event-log'),
  download: document.querySelector('#download-button'),
  clearLog: document.querySelector('#clear-log-button'),
  announcer: document.querySelector('#announcer'),
  serialApi: document.querySelector('#serial-api-value'),
  plasmaCount: document.querySelector('#plasma-count'),
  plasmaStatus: document.querySelector('#plasma-status'),
  plasmaConnect: document.querySelector('#plasma-connect-button'),
  plasmaAdd: document.querySelector('#plasma-add-button'),
  plasmaDemo: document.querySelector('#plasma-demo-button'),
  plasmaClear: document.querySelector('#plasma-clear-button'),
  plasmaDisconnect: document.querySelector('#plasma-disconnect-button'),
};

const encoderButtons = new Map([
  [15, { key: 'clockwise', label: 'Encoder clockwise', shortLabel: 'Encoder CW', buttonNumber: 16 }],
  [16, { key: 'counterclockwise', label: 'Encoder counter-clockwise', shortLabel: 'Encoder CCW', buttonNumber: 17 }],
  [17, { key: 'push', label: 'Encoder push', shortLabel: 'Encoder push', buttonNumber: 18 }],
]);

const state = {
  running: false,
  animationFrame: null,
  cards: new Map(),
  observations: new Map(),
  lastIndices: new Set(),
  events: [],
};

const plasma = new PicadePlasmaManager();
const hid = new PicadeHidManager();

const hasGamepadApi = typeof navigator.getGamepads === 'function';
elements.api.textContent = hasGamepadApi ? 'Available' : 'Unavailable';
elements.secure.textContent = window.isSecureContext ? 'Yes' : 'No';

function readNativeGamepads() {
  if (!hasGamepadApi) return [];
  return Array.from(navigator.getGamepads()).filter(Boolean);
}

function readGamepads() {
  return hid.active ? hid.gamepads : readNativeGamepads();
}

function getObservation(index) {
  if (!state.observations.has(index)) {
    state.observations.set(index, {
      button: false,
      axis: false,
      encoder: { clockwise: false, counterclockwise: false, push: false },
      encoderCounts: { clockwise: 0, counterclockwise: 0, push: 0 },
      encoderDown: { clockwise: false, counterclockwise: false, push: false },
      buttonDown: [],
    });
  }
  return state.observations.get(index);
}

function addLog(message, announce = false) {
  const timestamp = new Date();
  state.events.push({ timestamp: timestamp.toISOString(), message });
  const item = document.createElement('li');
  const time = document.createElement('time');
  time.dateTime = timestamp.toISOString();
  time.textContent = timestamp.toLocaleTimeString();
  item.append(time, document.createTextNode(message));
  elements.log.prepend(item);
  if (announce) elements.announcer.textContent = message;
}

function setMonitoring(running) {
  state.running = running;
  elements.start.disabled = running || (!hasGamepadApi && !hid.active);
  elements.stop.disabled = !running;
  elements.status.textContent = running ? 'Monitoring' : 'Stopped';
  elements.status.className = `status ${running ? 'status-running' : 'status-idle'}`;
  if (running) {
    addLog('Monitoring started. Press a button on both players.', true);
    scan();
  } else {
    if (state.animationFrame !== null) cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
    addLog('Monitoring stopped.', true);
    updateChecks(readGamepads());
  }
}

function createMetadata(label, value, valueClass) {
  const wrapper = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');
  term.textContent = label;
  description.textContent = value;
  if (valueClass) description.className = valueClass;
  wrapper.append(term, description);
  return wrapper;
}

function createCard(gamepad) {
  const article = document.createElement('article');
  article.className = 'gamepad-card';
  article.dataset.gamepadIndex = String(gamepad.index);

  const header = document.createElement('div');
  header.className = 'gamepad-header';
  const titleBlock = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = `Controller ${gamepad.index + 1}`;
  const id = document.createElement('p');
  id.className = 'device-id';
  id.textContent = gamepad.id || 'No device ID supplied';
  const activity = document.createElement('span');
  activity.className = 'status status-idle';
  activity.textContent = 'No input observed';
  titleBlock.append(title, id);
  header.append(titleBlock, activity);

  const metadata = document.createElement('dl');
  metadata.className = 'metadata-grid';
  const mapping = createMetadata('Mapping', gamepad.mapping || 'none');
  const axes = createMetadata('Axes', String(gamepad.axes.length));
  const buttons = createMetadata('Buttons', String(gamepad.buttons.length));
  const timestamp = createMetadata('Timestamp', gamepad.timestamp.toFixed(1), 'timestamp-value');
  metadata.append(mapping, axes, buttons, timestamp);

  const columns = document.createElement('div');
  columns.className = 'input-columns';
  const axesSection = document.createElement('section');
  const axesTitle = document.createElement('h4');
  axesTitle.textContent = 'Axes';
  const axisList = document.createElement('div');
  axisList.className = 'axis-list';
  const axisNodes = gamepad.axes.map((value, index) => {
    const row = document.createElement('div');
    row.className = 'axis-row';
    const label = document.createElement('span');
    label.textContent = `Axis ${index}`;
    const meter = document.createElement('meter');
    meter.min = -1;
    meter.max = 1;
    meter.value = value;
    meter.setAttribute('aria-label', `Axis ${index} value`);
    const output = document.createElement('output');
    output.className = 'axis-value';
    output.textContent = value.toFixed(3);
    row.append(label, meter, output);
    axisList.append(row);
    return { meter, output };
  });
  axesSection.append(axesTitle, axisList);

  const buttonsSection = document.createElement('section');
  const buttonsTitle = document.createElement('h4');
  buttonsTitle.textContent = 'Buttons';
  const buttonGrid = document.createElement('div');
  buttonGrid.className = 'button-grid';
  const buttonNodes = gamepad.buttons.map((button, index) => {
    const indicator = document.createElement('div');
    indicator.className = 'button-indicator';
    const label = document.createElement('span');
    label.className = 'button-label';
    const encoderButton = encoderButtons.get(index);
    if (encoderButton) {
      indicator.classList.add('is-encoder');
      label.textContent = `${encoderButton.shortLabel} (B${encoderButton.buttonNumber})`;
    } else {
      label.textContent = `Button ${index + 1}`;
    }
    const output = document.createElement('output');
    output.className = 'button-value';
    output.textContent = button.value.toFixed(3);
    indicator.append(label, output);
    buttonGrid.append(indicator);
    return { indicator, output };
  });
  buttonsSection.append(buttonsTitle, buttonGrid);
  columns.append(axesSection, buttonsSection);
  article.append(header, metadata, columns);
  elements.gamepads.append(article);

  return {
    article,
    id: gamepad.id,
    activity,
    timestamp: metadata.querySelector('.timestamp-value'),
    axisNodes,
    buttonNodes,
  };
}

function updateCard(gamepad, playerSlot) {
  let card = state.cards.get(gamepad.index);
  if (!card || card.id !== gamepad.id || card.axisNodes.length !== gamepad.axes.length || card.buttonNodes.length !== gamepad.buttons.length) {
    card?.article.remove();
    card = createCard(gamepad);
    state.cards.set(gamepad.index, card);
  }

  const observation = getObservation(gamepad.index);
  gamepad.axes.forEach((value, index) => {
    if (Math.abs(value) > 0.2) observation.axis = true;
    card.axisNodes[index].meter.value = value;
    card.axisNodes[index].output.textContent = value.toFixed(3);
  });
  gamepad.buttons.forEach((button, index) => {
    const active = button.pressed || button.value > 0.1;
    const wasActive = Boolean(observation.buttonDown[index]);
    if (active !== wasActive) plasma.setGamepadButton(playerSlot, index, active);
    observation.buttonDown[index] = active;
    if (active) observation.button = true;
    card.buttonNodes[index].indicator.classList.toggle('is-active', active);

    const encoderButton = encoderButtons.get(index);
    if (encoderButton) {
      const { key } = encoderButton;
      if (active && !observation.encoderDown[key]) {
        observation.encoder[key] = true;
        observation.encoderCounts[key]++;
      }
      observation.encoderDown[key] = active;
      card.buttonNodes[index].output.textContent = `${active ? 'Pressed' : 'Released'} · seen ${observation.encoderCounts[key]}`;
    } else {
      card.buttonNodes[index].output.textContent = `${button.value.toFixed(3)}${button.pressed ? ' pressed' : ''}${button.touched ? ' touched' : ''}`;
    }
  });
  card.timestamp.textContent = gamepad.timestamp.toFixed(1);
  const observed = observation.button || observation.axis;
  card.activity.textContent = observed ? 'Input observed' : 'No input observed';
  card.activity.className = `status ${observed ? 'status-running' : 'status-idle'}`;
}

function addCheck(fragment, title, detail, stateName) {
  const item = document.createElement('li');
  item.className = 'check-item';
  const status = document.createElement('span');
  status.className = `check-state state-${stateName}`;
  status.textContent = stateName === 'pass' ? 'Pass' : stateName === 'fail' ? 'Fail' : stateName === 'warn' ? 'Check' : 'Pending';
  const copy = document.createElement('div');
  copy.className = 'check-copy';
  const strong = document.createElement('strong');
  strong.textContent = title;
  const text = document.createElement('span');
  text.textContent = detail;
  copy.append(strong, text);
  item.append(status, copy);
  fragment.append(item);
}

function updateChecks(gamepads) {
  const fragment = document.createDocumentFragment();
  addCheck(fragment, 'Gamepad API', hasGamepadApi ? 'This browser implements navigator.getGamepads().' : 'Use a current version of Safari, Chrome or Edge.', hasGamepadApi ? 'pass' : 'fail');
  addCheck(fragment, 'WebHID fallback', hid.active
    ? `${hid.connectedPlayers} raw HID players are being shown instead of the collapsed Gamepad API result.`
    : hid.supported
      ? 'Available. Select Connect both via WebHID if the Gamepad API exposes only one player.'
      : 'Unavailable in this browser; use desktop Chrome or Edge.', hid.active ? 'pass' : 'warn');
  addCheck(fragment, 'Secure page', window.isSecureContext ? 'This page can request gamepad data.' : 'Serve this directory on localhost or HTTPS.', window.isSecureContext ? 'pass' : 'fail');
  addCheck(fragment, 'Web Serial API', plasma.supported ? 'Plasma control is available in this browser.' : 'Use desktop Chrome or Edge for Plasma control.', plasma.supported ? 'pass' : 'warn');
  addCheck(fragment, 'Plasma connection', plasma.connectedCount ? `${plasma.connectedCount} Picade Plasma interface${plasma.connectedCount === 1 ? '' : 's'} connected.` : 'Select Connect Plasma and approve the Picade serial interface.', plasma.connectedCount ? 'pass' : 'pending');
  if (plasma.connectedCount) {
    addCheck(fragment, 'Plasma lighting test', plasma.demoSeen || plasma.inputSeen ? 'A demo or mapped gamepad lighting event has been sent.' : 'Run the demo or press a mapped Picade button.', plasma.demoSeen || plasma.inputSeen ? 'pass' : 'pending');
  }
  addCheck(fragment, 'Monitoring', state.running ? 'The live animation-frame scan is running.' : 'Select Start monitoring to begin.', state.running ? 'pass' : 'pending');
  const controllerState = gamepads.length >= 2 ? 'pass' : gamepads.length === 1 ? 'fail' : 'pending';
  const controllerDetail = gamepads.length === 1
    ? 'Only one controller is visible. On macOS, select Connect both via WebHID to split the two raw Picade interfaces.'
    : `${gamepads.length} controllers visible. The Picade target is at least two.`;
  addCheck(fragment, 'Two controllers exposed', controllerDetail, controllerState);
  gamepads.forEach((gamepad) => {
    const layoutOkay = gamepad.axes.length >= 2 && gamepad.buttons.length >= 18;
    addCheck(fragment, `Controller ${gamepad.index + 1} layout`, `${gamepad.axes.length} axes and ${gamepad.buttons.length} buttons reported.`, layoutOkay ? 'pass' : 'warn');
    const observation = getObservation(gamepad.index);
    const seen = observation.button || observation.axis;
    addCheck(fragment, `Controller ${gamepad.index + 1} input`, seen ? 'A button or axis event has been observed.' : 'Press a button or move the joystick for this player.', seen ? 'pass' : 'pending');
  });

  const encoderControllers = gamepads.filter((gamepad) => gamepad.buttons.length >= 18);
  if (encoderControllers.length) {
    for (const encoderButton of encoderButtons.values()) {
      const observations = encoderControllers.map((gamepad) => ({
        gamepad,
        observation: getObservation(gamepad.index),
      }));
      const count = observations.reduce((total, item) => total + item.observation.encoderCounts[encoderButton.key], 0);
      const seenOn = observations
        .filter((item) => item.observation.encoder[encoderButton.key])
        .map((item) => `Controller ${item.gamepad.index + 1}`);
      addCheck(
        fragment,
        encoderButton.label,
        count ? `${count} event${count === 1 ? '' : 's'} observed on ${seenOn.join(', ')}.` : `Operate ${encoderButton.label.toLowerCase()} to test button ${encoderButton.buttonNumber}.`,
        count ? 'pass' : 'pending',
      );
    }
  } else {
    addCheck(fragment, 'Rotary encoder report', 'No controller exposes buttons 16–18. Flash the encoder-enabled firmware, reconnect the Picade, and start monitoring.', gamepads.length ? 'fail' : 'pending');
  }
  elements.checks.replaceChildren(fragment);
}

function reconcileConnections(gamepads) {
  const currentIndices = new Set(gamepads.map((gamepad) => gamepad.index));
  for (const gamepad of gamepads) {
    if (!state.lastIndices.has(gamepad.index)) addLog(`Controller ${gamepad.index + 1} connected: ${gamepad.id || 'unknown device'}`, true);
  }
  for (const index of state.lastIndices) {
    if (!currentIndices.has(index)) {
      addLog(`Controller ${index + 1} disconnected.`, true);
      void plasma.clear();
    }
  }
  for (const [index, card] of state.cards) {
    if (!currentIndices.has(index)) {
      card.article.remove();
      state.cards.delete(index);
    }
  }
  state.lastIndices = currentIndices;
}

function scan() {
  if (state.animationFrame !== null) cancelAnimationFrame(state.animationFrame);
  state.animationFrame = null;
  const gamepads = readGamepads();
  reconcileConnections(gamepads);
  gamepads
    .sort((first, second) => first.index - second.index)
    .forEach((gamepad, playerSlot) => updateCard(gamepad, playerSlot));
  elements.empty.hidden = gamepads.length > 0;
  elements.count.textContent = String(gamepads.length);
  elements.lastScan.textContent = new Date().toLocaleTimeString();
  updateChecks(gamepads);
  if (state.running && !document.hidden) state.animationFrame = requestAnimationFrame(scan);
}

function snapshot() {
  return {
    capturedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    platform: navigator.userAgentData?.platform || navigator.platform || 'unknown',
    secureContext: window.isSecureContext,
    monitoring: state.running,
    inputSource: hid.active ? 'webhid' : 'gamepad',
    webHid: {
      supported: hid.supported,
      connectedDevices: hid.connectedDevices,
      connectedPlayers: hid.connectedPlayers,
    },
    plasma: {
      webSerialSupported: plasma.supported,
      connectedInterfaces: plasma.connectedCount,
      demoObserved: plasma.demoSeen,
      mappedInputObserved: plasma.inputSeen,
    },
    checks: { expectedControllers: 2, controllersExposed: readGamepads().length },
    gamepads: readGamepads().map((gamepad) => ({
      index: gamepad.index,
      id: gamepad.id,
      mapping: gamepad.mapping,
      connected: gamepad.connected,
      timestamp: gamepad.timestamp,
      axes: Array.from(gamepad.axes),
      buttons: gamepad.buttons.map((button, index) => ({ index, pressed: button.pressed, touched: button.touched, value: button.value })),
      inputObserved: getObservation(gamepad.index),
      vibrationActuator: gamepad.vibrationActuator?.type || null,
    })),
    events: state.events,
  };
}

elements.start.addEventListener('click', () => setMonitoring(true));
elements.stop.addEventListener('click', () => setMonitoring(false));
elements.reset.addEventListener('click', () => {
  state.observations.clear();
  addLog('Input observations reset.');
  scan();
});
elements.clearLog.addEventListener('click', () => {
  state.events.length = 0;
  elements.log.replaceChildren();
});
elements.download.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `picade-gamepad-${new Date().toISOString().replaceAll(':', '-')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
  addLog('Diagnostic JSON downloaded.');
});

function updatePlasmaControls() {
  const connected = plasma.connectedCount > 0;
  elements.serialApi.textContent = plasma.supported ? 'Available' : 'Unavailable';
  elements.plasmaCount.textContent = String(plasma.connectedCount);
  elements.plasmaStatus.textContent = connected ? 'Connected' : 'Disconnected';
  elements.plasmaStatus.className = `status ${connected ? 'status-running' : 'status-idle'}`;
  elements.plasmaConnect.disabled = !plasma.supported || connected;
  elements.plasmaAdd.disabled = !plasma.supported;
  elements.plasmaDemo.disabled = !connected;
  elements.plasmaClear.disabled = !connected;
  elements.plasmaDisconnect.disabled = !connected;
  updateChecks(readGamepads());
}

function updateHidControls() {
  elements.hidApi.textContent = hid.supported ? 'Available' : 'Unavailable';
  elements.hidPlayers.textContent = String(hid.connectedPlayers);
  elements.hidConnect.disabled = !hid.supported || hid.active;
  elements.hidDisconnect.disabled = hid.connectedDevices === 0;
  elements.start.disabled = state.running || (!hasGamepadApi && !hid.active);
  if (state.running) scan();
  else updateChecks(readGamepads());
}

async function connectHid() {
  try {
    await hid.connectAuthorized();
    if (!hid.active) await hid.requestAndConnect();
    addLog(hid.active
      ? `WebHID split connected ${hid.connectedPlayers} players.`
      : `WebHID found ${hid.connectedPlayers} player. Select Connect both via WebHID again if the chooser listed a second Picade interface.`, true);
  } catch (error) {
    if (error?.name !== 'NotFoundError' && error?.name !== 'AbortError') {
      addLog(`Could not connect Picade WebHID: ${error?.message || error}`, true);
    }
  } finally {
    updateHidControls();
  }
}

elements.hidConnect.addEventListener('click', connectHid);
elements.hidDisconnect.addEventListener('click', async () => {
  await hid.disconnectAll();
  addLog('Picade WebHID disconnected.', true);
  updateHidControls();
});
hid.addEventListener('change', updateHidControls);

async function withPlasmaAction(action, failureMessage) {
  try {
    await action();
  } catch (error) {
    if (error?.name !== 'NotFoundError' && error?.name !== 'AbortError') {
      addLog(`${failureMessage}: ${error?.message || error}`, true);
    }
  } finally {
    updatePlasmaControls();
  }
}

elements.plasmaConnect.addEventListener('click', () => withPlasmaAction(async () => {
  const authorized = await plasma.connectAuthorized();
  if (!authorized) await plasma.requestAndConnect();
}, 'Could not connect Plasma'));
elements.plasmaAdd.addEventListener('click', () => withPlasmaAction(
  () => plasma.requestAndConnect(),
  'Could not add Plasma interface',
));
elements.plasmaDemo.addEventListener('click', () => withPlasmaAction(async () => {
  addLog(`Plasma demo started on ${plasma.connectedCount} interface${plasma.connectedCount === 1 ? '' : 's'}.`);
  await plasma.runDemo();
  addLog('Plasma demo completed.', true);
}, 'Plasma demo failed'));
elements.plasmaClear.addEventListener('click', () => withPlasmaAction(
  () => plasma.clear(),
  'Could not clear Plasma lights',
));
elements.plasmaDisconnect.addEventListener('click', () => withPlasmaAction(
  () => plasma.disconnectAll(),
  'Could not disconnect Plasma',
));
plasma.addEventListener('change', (event) => {
  const { type, device, error } = event.detail;
  if (type === 'connect') addLog(`Plasma interface ${device.number} connected at 115200 baud.`, true);
  if (type === 'disconnect') addLog(`Plasma interface ${device.number} disconnected.`, true);
  if (type === 'error') addLog(`Plasma serial error: ${error?.message || error}`, true);
  updatePlasmaControls();
});

window.addEventListener('gamepadconnected', (event) => {
  addLog(`Browser event: controller ${event.gamepad.index + 1} connected.`, true);
  if (state.running) scan();
});
window.addEventListener('gamepaddisconnected', (event) => {
  addLog(`Browser event: controller ${event.gamepad.index + 1} disconnected.`, true);
  if (state.running) scan();
});
document.addEventListener('visibilitychange', () => {
  if (!state.running) return;
  if (document.hidden) {
    if (state.animationFrame !== null) cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
    addLog('Live scanning paused while the tab is hidden.');
  } else {
    addLog('Live scanning resumed.');
    scan();
  }
});
window.addEventListener('pagehide', () => {
  void plasma.clear();
  void hid.disconnectAll();
});

if (!hasGamepadApi && !hid.active) elements.start.disabled = true;
updateHidControls();
updatePlasmaControls();
updateChecks(readGamepads());
void hid.connectAuthorized().then(updateHidControls).catch(() => {});

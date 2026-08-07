const elements = {
  api: document.querySelector('#api-value'),
  secure: document.querySelector('#secure-value'),
  count: document.querySelector('#controller-count'),
  lastScan: document.querySelector('#last-scan'),
  status: document.querySelector('#monitor-status'),
  start: document.querySelector('#start-button'),
  stop: document.querySelector('#stop-button'),
  reset: document.querySelector('#reset-button'),
  checks: document.querySelector('#check-list'),
  gamepads: document.querySelector('#gamepad-list'),
  empty: document.querySelector('#empty-state'),
  log: document.querySelector('#event-log'),
  download: document.querySelector('#download-button'),
  clearLog: document.querySelector('#clear-log-button'),
  announcer: document.querySelector('#announcer'),
};

const state = {
  running: false,
  animationFrame: null,
  cards: new Map(),
  observations: new Map(),
  lastIndices: new Set(),
  events: [],
};

const hasGamepadApi = typeof navigator.getGamepads === 'function';
elements.api.textContent = hasGamepadApi ? 'Available' : 'Unavailable';
elements.secure.textContent = window.isSecureContext ? 'Yes' : 'No';

function readGamepads() {
  if (!hasGamepadApi) return [];
  return Array.from(navigator.getGamepads()).filter(Boolean);
}

function getObservation(index) {
  if (!state.observations.has(index)) {
    state.observations.set(index, { button: false, axis: false });
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
  elements.start.disabled = running || !hasGamepadApi;
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
    label.textContent = `Button ${index}`;
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
    activity,
    timestamp: metadata.querySelector('.timestamp-value'),
    axisNodes,
    buttonNodes,
  };
}

function updateCard(gamepad) {
  let card = state.cards.get(gamepad.index);
  if (!card || card.axisNodes.length !== gamepad.axes.length || card.buttonNodes.length !== gamepad.buttons.length) {
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
    if (button.pressed || button.value > 0.1) observation.button = true;
    card.buttonNodes[index].indicator.classList.toggle('is-active', button.pressed || button.value > 0.1);
    card.buttonNodes[index].output.textContent = `${button.value.toFixed(3)}${button.pressed ? ' pressed' : ''}${button.touched ? ' touched' : ''}`;
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
  addCheck(fragment, 'Secure page', window.isSecureContext ? 'This page can request gamepad data.' : 'Serve this directory on localhost or HTTPS.', window.isSecureContext ? 'pass' : 'fail');
  addCheck(fragment, 'Monitoring', state.running ? 'The live animation-frame scan is running.' : 'Select Start monitoring to begin.', state.running ? 'pass' : 'pending');
  const controllerState = gamepads.length >= 2 ? 'pass' : gamepads.length === 1 ? 'fail' : 'pending';
  addCheck(fragment, 'Two controllers exposed', `${gamepads.length} controller${gamepads.length === 1 ? '' : 's'} visible. The Picade target is at least two.`, controllerState);
  gamepads.forEach((gamepad) => {
    const layoutOkay = gamepad.axes.length >= 2 && gamepad.buttons.length >= 15;
    addCheck(fragment, `Controller ${gamepad.index + 1} layout`, `${gamepad.axes.length} axes and ${gamepad.buttons.length} buttons reported.`, layoutOkay ? 'pass' : 'warn');
    const observation = getObservation(gamepad.index);
    const seen = observation.button || observation.axis;
    addCheck(fragment, `Controller ${gamepad.index + 1} input`, seen ? 'A button or axis event has been observed.' : 'Press a button or move the joystick for this player.', seen ? 'pass' : 'pending');
  });
  elements.checks.replaceChildren(fragment);
}

function reconcileConnections(gamepads) {
  const currentIndices = new Set(gamepads.map((gamepad) => gamepad.index));
  for (const gamepad of gamepads) {
    if (!state.lastIndices.has(gamepad.index)) addLog(`Controller ${gamepad.index + 1} connected: ${gamepad.id || 'unknown device'}`, true);
  }
  for (const index of state.lastIndices) {
    if (!currentIndices.has(index)) addLog(`Controller ${index + 1} disconnected.`, true);
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
  gamepads.forEach(updateCard);
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

if (!hasGamepadApi) elements.start.disabled = true;
updateChecks(readGamepads());

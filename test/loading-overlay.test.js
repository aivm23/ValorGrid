const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const moduleUrl = pathToFileURL(path.join(__dirname, '..', 'apps', 'web', 'src', 'loading-overlay.js')).href;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createClassList() {
  const values = new Set();
  return {
    add: (...items) => items.forEach((item) => values.add(item)),
    contains: (item) => values.has(item),
    remove: (...items) => items.forEach((item) => values.delete(item)),
    toggle(item, force) {
      if (force === true) values.add(item);
      else if (force === false) values.delete(item);
      else if (values.has(item)) values.delete(item);
      else values.add(item);
    },
  };
}

function createHarness() {
  const title = { textContent: '' };
  const message = { textContent: '' };
  const retry = { hidden: true };
  const issue = { hidden: true };
  const logo = { style: {} };
  const summary = { hidden: true, innerHTML: '' };
  const listeners = new Map();
  const timers = new Map();
  const previousFocus = {
    focusCount: 0,
    isConnected: true,
    focus() {
      this.focusCount += 1;
    },
  };
  let timerId = 0;

  const dialog = {
    classList: createClassList(),
    closeCount: 0,
    focusCount: 0,
    open: false,
    showCount: 0,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    close() {
      this.closeCount += 1;
      this.open = false;
    },
    focus() {
      this.focusCount += 1;
    },
    querySelector(selector) {
      return {
        '.app-loading-title': title,
        '.app-loading-message': message,
        '#app-loading-retry': retry,
        '.app-loading-issue-link': issue,
        '.app-loading-logo': logo,
        '.app-loading-summary': summary,
      }[selector];
    },
    setAttribute() {},
    showModal() {
      this.showCount += 1;
      this.open = true;
    },
  };

  const ctx = {
    document: {
      activeElement: previousFocus,
      getElementById: () => dialog,
    },
    t: (key) => key,
    window: {
      clearTimeout(id) {
        timers.delete(id);
      },
      setTimeout(callback, delay) {
        const id = ++timerId;
        timers.set(id, { callback, delay });
        return id;
      },
    },
  };

  return {
    ctx,
    dialog,
    message,
    summary,
    title,
    pendingTimers: () => timers.size,
    resetCounts() {
      dialog.closeCount = 0;
      dialog.showCount = 0;
    },
    runDelay(delay) {
      const matches = [...timers.entries()].filter(([, timer]) => timer.delay === delay);
      for (const [id, timer] of matches) {
        timers.delete(id);
        timer.callback();
      }
    },
  };
}

async function setup() {
  const { attach } = await import(moduleUrl);
  const harness = createHarness();
  attach(harness.ctx);
  harness.ctx.setBootState('ready');
  harness.resetCounts();
  return harness;
}

test('fast operations finish without flashing the loading dialog', async () => {
  const harness = await setup();
  const result = await harness.ctx.withAppLoading({ title: 'Saving' }, async () => 'done');

  assert.equal(result, 'done');
  assert.equal(harness.dialog.showCount, 0);
  assert.equal(harness.dialog.closeCount, 0);
  assert.equal(harness.pendingTimers(), 0);
});

test('visible loading dialog closes as soon as the operation promise resolves', async () => {
  const harness = await setup();
  const operation = deferred();
  let updateLoading;
  const resultPromise = harness.ctx.withAppLoading({ title: 'Saving', message: 'Updating portfolio' }, (update) => {
    updateLoading = update;
    return operation.promise;
  });

  harness.runDelay(200);
  assert.equal(harness.dialog.open, true);
  assert.equal(harness.title.textContent, 'Saving');
  updateLoading({ title: 'Finishing', message: 'Refreshing history' });
  assert.equal(harness.title.textContent, 'Finishing');
  assert.equal(harness.message.textContent, 'Refreshing history');

  operation.resolve('saved');
  assert.equal(await resultPromise, 'saved');
  assert.equal(harness.dialog.open, false);
  assert.equal(harness.dialog.closeCount, 1);
  assert.equal(harness.pendingTimers(), 0);
});

test('rejected operations close immediately and preserve the rejection', async () => {
  const harness = await setup();
  const operation = deferred();
  const resultPromise = harness.ctx.withAppLoading({ title: 'Saving' }, () => operation.promise);

  harness.runDelay(200);
  operation.reject(new Error('save failed'));

  await assert.rejects(resultPromise, /save failed/);
  assert.equal(harness.dialog.open, false);
  assert.equal(harness.dialog.closeCount, 1);
  assert.equal(harness.pendingTimers(), 0);
});

test('nested operations keep the dialog open until the final promise settles', async () => {
  const harness = await setup();
  const outer = deferred();
  const inner = deferred();
  const outerPromise = harness.ctx.withAppLoading({ title: 'Outer' }, () => outer.promise);
  const innerPromise = harness.ctx.withAppLoading({ title: 'Inner' }, () => inner.promise);

  harness.runDelay(200);
  assert.equal(harness.title.textContent, 'Inner');

  inner.resolve('inner done');
  await innerPromise;
  assert.equal(harness.dialog.open, true);
  assert.equal(harness.title.textContent, 'Outer');

  outer.resolve('outer done');
  await outerPromise;
  assert.equal(harness.dialog.open, false);
  assert.equal(harness.dialog.closeCount, 1);
});

test('operation summary is rendered safely and cleared when the promise settles', async () => {
  const harness = await setup();
  const operation = deferred();
  const resultPromise = harness.ctx.withAppLoading({ title: 'Saving' }, (update) => {
    update({
      summary: {
        heading: '<script>purchase</script>',
        rows: [{ label: 'Value', value: '<b>1,000 EUR</b>', tone: 'negative' }],
      },
    });
    return operation.promise;
  });

  harness.runDelay(200);
  assert.equal(harness.summary.hidden, false);
  assert.match(harness.summary.innerHTML, /&lt;script&gt;purchase&lt;\/script&gt;/);
  assert.match(harness.summary.innerHTML, /&lt;b&gt;1,000 EUR&lt;\/b&gt;/);
  assert.match(harness.summary.innerHTML, /is-negative/);
  assert.doesNotMatch(harness.summary.innerHTML, /<script>|<b>/);

  operation.resolve();
  await resultPromise;
  assert.equal(harness.summary.hidden, true);
  assert.equal(harness.summary.innerHTML, '');
});

test('boot error is restored after a later operation settles', async () => {
  const harness = await setup();
  const operation = deferred();
  harness.ctx.setBootState('error', 'Dashboard unavailable');
  const resultPromise = harness.ctx.withAppLoading({ title: 'Retrying' }, () => operation.promise);

  assert.equal(harness.title.textContent, 'Retrying');
  operation.resolve();
  await resultPromise;

  assert.equal(harness.dialog.open, true);
  assert.equal(harness.dialog.classList.contains('is-error'), true);
  assert.equal(harness.title.textContent, 'loading.boot.error');
  assert.equal(harness.message.textContent, 'Dashboard unavailable');
});

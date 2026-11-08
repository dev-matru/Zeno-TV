// Runs in the page before the app (addInitScript). It stands in for everything the
// app would get from the TV: the tizen API, the local network service and storage,
// with switches the checks flip to simulate failures. The app's own device.js is
// still used unchanged on top of it.
export function fakeTV(options) {
  const { seed, earlier, catalog, minuteMs, catalogFailure, noFontAPI, storageFailure, mock } = options;
  const HOME_KEY = 'zeno.home.v1',
    EARLIER_KEY = 'zeno.earlier.v1';

  // Seed storage only on the first load, so reloads see what the app saved.
  if (!sessionStorage.getItem('__seeded')) {
    const put = (key, value) => {
      if (value === undefined) return;
      if (value && typeof value === 'object') value.homeVersion = 4;
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    };
    put(HOME_KEY, seed);
    put(EARLIER_KEY, earlier);
    sessionStorage.setItem('__seeded', '1');
  }
  window.ZenoEarlierHomeKeys = [EARLIER_KEY];
  window.ZenoDeviceDefaults = { localToken: 'qa-local' };
  window.ZENO_OFFLINE_TEST = true;
  window.ZenoQA = { minuteMs };

  // Storage: count Home writes and optionally make them fail like a full quota.
  window.__failWrites = !!storageFailure;
  window.__storageAttempts = 0;
  const realSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key === HOME_KEY) {
      window.__storageAttempts++;
      if (window.__failWrites) throw new DOMException('Simulated full storage', 'QuotaExceededError');
    }
    return realSet.call(this, key, value);
  };

  window.__setHidden = hidden => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (hidden ? 'hidden' : 'visible')
    });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  if (noFontAPI) Object.defineProperty(document, 'fonts', { configurable: true, value: undefined });
  if (!mock) return;

  const tv = (window.__tv = {
    catalog,
    catalogFailure: !!catalogFailure,
    launchFailure: false,
    holdCatalog: false,
    pending: [],
    calls: [],
    catalogCalls: 0,
    serviceRequests: []
  });
  const later = fn => setTimeout(fn, 0);

  // The packaged network service answers over a message port.
  let serviceListener = null;
  const messageport = {
    requestTrustedLocalMessagePort: () => ({
      addMessagePortListener(fn) {
        serviceListener = fn;
        return 1;
      }
    }),
    requestTrustedRemoteMessagePort: () => ({
      sendMessage(items) {
        const request = JSON.parse(items[0].value);
        tv.serviceRequests.push(request);
        const reply = { id: request.id, value: { opened: true, ip: '127.0.0.1', enabled: true } };
        later(() =>
          serviceListener([{ key: 'response', value: JSON.stringify(reply) }], {
            isTrusted: true,
            appId: 'ZenoTV0000.NetworkService'
          })
        );
      }
    })
  };

  window.tizen = {
    messageport,
    ApplicationControlData: function (key, value) {
      this.key = key;
      this.value = value;
    },
    ApplicationControl: function (operation, uri, mime, category, data) {
      Object.assign(this, { operation, uri, mime, category, data });
    },
    application: {
      getAppsInfo(ok, fail) {
        tv.catalogCalls++;
        const answer = () =>
          tv.catalogFailure
            ? fail({ name: 'UnknownError', message: 'App list unavailable (simulated)' })
            : ok(tv.catalog.map(app => Object.assign({}, app)));
        if (tv.holdCatalog) tv.pending.push({ ok, fail });
        else later(answer);
      },
      launch(id, ok, fail) {
        tv.calls.push({ method: 'launch', id });
        later(() =>
          tv.launchFailure ? fail({ name: 'NotFoundError', message: 'App unavailable (simulated)' }) : ok()
        );
      },
      launchAppControl(control, id, ok, fail) {
        tv.calls.push({ method: 'launchAppControl', id, control });
        later(() =>
          tv.launchFailure ? fail({ name: 'UnknownError', message: 'Input unavailable (simulated)' }) : ok()
        );
      }
    }
  };
}

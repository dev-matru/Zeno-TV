/* Weather, the clock face and slow background motion.
 *
 * Weather comes from Open-Meteo. The place is either a city from the list, one
 * found by search, or "auto", which asks geojs.io for an approximate location
 * from the IP address. Weather is fetched only while Zeno is visible, at the
 * chosen interval, and the last reading is kept for three hours.
 *
 * Nothing here runs while the user moves around Home: a fetch never blocks the
 * remote.
 */
(function () {
  'use strict';

  var SETTINGS_KEY = 'zeno.extras.v1';
  var WEATHER_KEY = 'zeno.weather.v1';
  var MINUTE = 60000;
  var READING_LIFETIME = 180 * MINUTE; // older readings are not shown
  var STALE_AFTER = 120 * MINUTE; // shown, but marked as old
  var RETRY_AFTER_ERROR = 5 * MINUTE;
  var SEARCH_CACHE_LIFETIME = 10 * MINUTE;
  var SEARCH_CACHE_SIZE = 12;
  var REQUEST_TIMEOUT = 9000;

  var INTERVALS = ['30', '60', '180', 'home']; // minutes, or "every time Home opens"
  var CLOCK_FACES = ['digital', 'compact', 'analog'];

  var CITIES = [
    { id: 'roma', name: 'Roma', lat: 41.9028, lon: 12.4964 },
    { id: 'milano', name: 'Milano', lat: 45.4642, lon: 9.19 },
    { id: 'napoli', name: 'Napoli', lat: 40.8518, lon: 14.2681 },
    { id: 'torino', name: 'Torino', lat: 45.0703, lon: 7.6869 },
    { id: 'bologna', name: 'Bologna', lat: 44.4949, lon: 11.3426 },
    { id: 'firenze', name: 'Firenze', lat: 43.7696, lon: 11.2558 },
    { id: 'terni', name: 'Terni', lat: 42.5636, lon: 12.6427 },
    { id: 'perugia', name: 'Perugia', lat: 43.1107, lon: 12.3908 },
    { id: 'palermo', name: 'Palermo', lat: 38.1157, lon: 13.3615 },
    { id: 'bari', name: 'Bari', lat: 41.1171, lon: 16.8719 },
    { id: 'cagliari', name: 'Cagliari', lat: 39.2238, lon: 9.1217 },
    { id: 'venezia', name: 'Venezia', lat: 45.4408, lon: 12.3155 }
  ];

  // geojs.io answers in English.
  var ITALIAN_CITY_NAMES = {
    Milan: 'Milano',
    Rome: 'Roma',
    Naples: 'Napoli',
    Turin: 'Torino',
    Florence: 'Firenze',
    Venice: 'Venezia'
  };

  var settings = {
    location: 'auto', // 'auto', 'custom' or a city id
    enabled: true,
    motion: false,
    interval: '30',
    clock: 'digital',
    place: null // the searched place, when location is 'custom'
  };

  var weather = null; // the last reading
  var requestCount = 0; // a newer request makes older answers irrelevant
  var loading = false;
  var error = '';
  var timer;
  var searchCache = {};
  var searchOrder = [];

  /* ---- Places ---- */

  function isPlace(p) {
    return (
      p &&
      typeof p.name === 'string' &&
      p.name.trim() &&
      isFinite(p.lat) &&
      Math.abs(p.lat) <= 90 &&
      isFinite(p.lon) &&
      Math.abs(p.lon) <= 180
    );
  }

  function cleanPlace(p) {
    if (!isPlace(p)) return null;
    return {
      name: p.name.trim().slice(0, 70),
      region: String(p.region || '').slice(0, 100),
      lat: Number(p.lat),
      lon: Number(p.lon)
    };
  }

  function isLocation(value) {
    return (
      value === 'auto' ||
      value === 'custom' ||
      CITIES.some(function (city) {
        return city.id === value;
      })
    );
  }

  // Identifies a searched place, so a cached reading for another place is not reused.
  function placeKey() {
    return settings.location === 'custom' && settings.place
      ? settings.place.lat + ',' + settings.place.lon
      : '';
  }

  function loadSaved() {
    var saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (saved) {
      settings.location = isLocation(saved.location) ? saved.location : 'auto';
      // Older versions used location 'off' instead of enabled: false.
      settings.enabled = saved.enabled === undefined ? saved.location !== 'off' : !!saved.enabled;
      settings.motion = !!saved.motion;
      settings.interval = INTERVALS.indexOf(saved.interval) >= 0 ? saved.interval : '30';
      settings.clock = CLOCK_FACES.indexOf(saved.clock) >= 0 ? saved.clock : 'digital';
      settings.place = cleanPlace(saved.place);
      if (settings.location === 'custom' && !settings.place) settings.location = 'auto';
    }

    var cached = JSON.parse(localStorage.getItem(WEATHER_KEY) || 'null');
    if (
      cached &&
      cached.mode === settings.location &&
      cached.placeKey === placeKey() &&
      Date.now() - cached.at < READING_LIFETIME &&
      typeof cached.temperature === 'number' &&
      isFinite(cached.temperature) &&
      typeof cached.name === 'string'
    )
      weather = cached;
  }

  function changed() {
    document.dispatchEvent(new Event('zeno-extras-change'));
  }

  /* GET a JSON url. Returns a function that cancels the request. */
  function request(url, done) {
    var xhr = new XMLHttpRequest();
    var finished = false;
    function finish(failure, data) {
      if (finished) return;
      finished = true;
      done(failure, data);
    }
    xhr.open('GET', url, true);
    xhr.timeout = REQUEST_TIMEOUT;
    xhr.onload = function () {
      if (xhr.status < 200 || xhr.status > 299) {
        finish(Error('HTTP ' + xhr.status));
        return;
      }
      try {
        finish(null, JSON.parse(xhr.responseText));
      } catch (e) {
        finish(e);
      }
    };
    xhr.onerror = xhr.ontimeout = function () {
      finish(Error('Network unavailable'));
    };
    xhr.send();
    return function () {
      finished = true;
      xhr.abort();
    };
  }

  /* ---- Weather codes (WMO, as used by Open-Meteo) ---- */

  function isSnow(code) {
    return (code >= 70 && code < 80) || code === 85 || code === 86;
  }

  function description(code) {
    if (code === 0) return 'Sereno';
    if (code < 3) return 'Poco nuvoloso';
    if (code === 3) return 'Nuvoloso';
    if (code < 50) return 'Nebbia';
    if (code < 70) return 'Pioggia';
    if (isSnow(code)) return 'Neve';
    if (code < 90) return 'Rovesci';
    return 'Temporali';
  }

  function iconKind(code, isDay) {
    if (code === 0) return isDay === false ? 'moon' : 'sun';
    if (code < 3) return 'partly';
    if (code === 3) return 'cloud';
    if (code < 50) return 'fog';
    if (code < 70) return 'rain';
    if (isSnow(code)) return 'snow';
    if (code < 90) return 'rain';
    return 'storm';
  }

  var SUN =
    '<g class="weather-sun"><circle cx="21" cy="19" r="6"/>' +
    '<path d="M21 7v3m0 18v3M9 19h3m18 0h3M12.5 10.5l2 2m13 13 2 2m0-17-2 2m-13 13-2 2"/></g>';
  var CLOUD = '<path class="weather-cloud" d="M13 30a7 7 0 0 1-1-14 10 10 0 0 1 19-1 7.5 7.5 0 1 1 3 15Z"/>';
  var MOON = '<path class="weather-moon" d="M31 28a13 13 0 0 1-13-19 13 13 0 1 0 13 19Z"/>';
  var EXTRAS = {
    rain: '<g class="weather-drops"><path d="m16 35-2 4m10-4-2 4m10-4-2 4"/></g>',
    snow: '<g class="weather-snow"><path d="M16 35v5m-2.5-2.5h5M28 35v5m-2.5-2.5h5"/></g>',
    fog: '<g class="weather-fog"><path d="M11 35h25m-22 5h19"/></g>',
    storm:
      '<g class="weather-drops"><path d="m13 34-2 4m21-4-2 4"/></g>' +
      '<path class="weather-bolt" d="m25 32-6 7h5l-4 6"/>'
  };

  /* An SVG icon for the current weather, or '' when there is nothing to show. */
  function weatherIcon() {
    if (!weather || !settings.enabled || Date.now() - weather.at >= READING_LIFETIME) return '';
    var kind = iconKind(weather.code, weather.isDay);
    var body;
    if (kind === 'sun') body = SUN;
    else if (kind === 'moon') body = MOON;
    else body = (kind === 'partly' ? '<g transform="translate(-5 -7)">' + SUN + '</g>' : '') + CLOUD;
    body += EXTRAS[kind] || '';
    return (
      '<svg class="weather-icon weather-' +
      kind +
      '" viewBox="0 0 48 48" fill="none" stroke="currentColor"' +
      ' stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      body +
      '</svg>'
    );
  }

  /* ---- Fetching ---- */

  function refreshEvery() {
    return settings.interval === 'home' ? 10 * MINUTE : Number(settings.interval) * MINUTE;
  }

  function schedule(delay) {
    clearTimeout(timer);
    if (settings.enabled && !document.hidden && settings.interval !== 'home')
      timer = setTimeout(refresh, Math.max(1000, delay));
  }

  function forecastURL(place) {
    return (
      'https://api.open-meteo.com/v1/forecast?latitude=' +
      Number(place.lat) +
      '&longitude=' +
      Number(place.lon) +
      '&current=temperature_2m,weather_code,is_day,apparent_temperature,relative_humidity_2m,wind_speed_10m' +
      '&timezone=auto'
    );
  }

  function isForecast(data) {
    var current = data && data.current;
    return (
      current &&
      typeof current.temperature_2m === 'number' &&
      isFinite(current.temperature_2m) &&
      typeof current.weather_code === 'number'
    );
  }

  /* Fetch new weather unless the last reading is recent enough (or force is set). */
  function refresh(force) {
    clearTimeout(timer);
    if (window.ZENO_OFFLINE_TEST || document.hidden || !settings.enabled || loading) return;
    if (!force && weather && weather.mode === settings.location && Date.now() - weather.at < refreshEvery()) {
      schedule(refreshEvery() - (Date.now() - weather.at));
      return;
    }

    var thisRequest = ++requestCount;
    var mode = settings.location;
    var key = placeKey();
    loading = true;

    function fail() {
      if (thisRequest !== requestCount) return;
      loading = false;
      error = 'Meteo non disponibile';
      changed();
      schedule(RETRY_AFTER_ERROR);
    }

    function fetchFor(place) {
      if (!isPlace(place)) {
        fail();
        return;
      }
      request(forecastURL(place), function (failure, data) {
        if (thisRequest !== requestCount) return;
        if (failure || !isForecast(data)) {
          fail();
          return;
        }
        var current = data.current;
        weather = {
          mode: mode,
          placeKey: key,
          name: String(place.name).slice(0, 70),
          temperature: current.temperature_2m,
          code: current.weather_code,
          isDay: current.is_day !== 0,
          apparent: current.apparent_temperature,
          humidity: current.relative_humidity_2m,
          wind: current.wind_speed_10m,
          at: Date.now()
        };
        try {
          localStorage.setItem(WEATHER_KEY, JSON.stringify(weather));
        } catch (ignore) {}
        loading = false;
        error = '';
        changed();
        schedule(refreshEvery());
      });
    }

    if (mode === 'auto') {
      request('https://get.geojs.io/v1/ip/geo.json', function (failure, data) {
        if (thisRequest !== requestCount) return;
        if (failure || !data) {
          fail();
          return;
        }
        var name = ITALIAN_CITY_NAMES[data.city] || data.city;
        fetchFor({ name: name, lat: data.latitude, lon: data.longitude });
      });
    } else if (mode === 'custom') {
      fetchFor(settings.place);
    } else {
      CITIES.forEach(function (city) {
        if (city.id === mode) fetchFor(city);
      });
    }
  }

  /* ---- Settings ---- */

  /* The settings after one change, or null if the change is not allowed. */
  function withChange(key, value) {
    var next = {
      location: settings.location,
      enabled: settings.enabled,
      motion: settings.motion,
      interval: settings.interval,
      clock: settings.clock,
      place: settings.place
    };
    if (key === 'motion' || key === 'enabled') {
      next[key] = !!value;
    } else if (key === 'location' && value === 'off') {
      next.enabled = false;
    } else if (key === 'location' && isLocation(value)) {
      if (value === 'custom' && !next.place) return null;
      next.location = value;
    } else if (key === 'place') {
      next.place = cleanPlace(value);
      if (!next.place) return null;
      next.location = 'custom';
    } else if (key === 'interval' && INTERVALS.indexOf(value) >= 0) {
      next.interval = value;
    } else if (key === 'clock' && CLOCK_FACES.indexOf(value) >= 0) {
      next.clock = value;
    } else {
      return null;
    }
    return next;
  }

  function set(key, value) {
    var next = withChange(key, value);
    if (!next) return false;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch (e) {
      return false;
    }

    var weatherChanged =
      next.location !== settings.location ||
      JSON.stringify(next.place) !== JSON.stringify(settings.place) ||
      next.enabled !== settings.enabled ||
      next.interval !== settings.interval;
    settings = next;
    if (weatherChanged) {
      requestCount++;
      loading = false;
      error = '';
      if (weather && (weather.mode !== settings.location || weather.placeKey !== placeKey())) weather = null;
    }
    applyMotion();
    changed();
    if (weatherChanged) refresh();
    return true;
  }

  /* Find places by name. Returns a function that cancels the search. */
  function search(query, language, done) {
    query = String(query || '')
      .trim()
      .slice(0, 80);
    if (query.length < 2) {
      done(null, []);
      return function () {};
    }
    var key = language + '|' + query.toLowerCase();
    var cached = searchCache[key];
    if (cached && Date.now() - cached.at < SEARCH_CACHE_LIFETIME) {
      done(null, cached.results.slice());
      return function () {};
    }
    var url =
      'https://geocoding-api.open-meteo.com/v1/search?name=' +
      encodeURIComponent(query) +
      '&count=8&language=' +
      encodeURIComponent(language || 'it') +
      '&format=json';
    return request(url, function (failure, data) {
      if (failure) {
        done(failure);
        return;
      }
      var found = data && Array.isArray(data.results) ? data.results.slice(0, 8) : [];
      var results = found
        .map(function (place) {
          return cleanPlace({
            name: place.name,
            lat: place.latitude,
            lon: place.longitude,
            region: [place.admin1, place.country].filter(Boolean).join(' · ')
          });
        })
        .filter(Boolean);
      searchCache[key] = { at: Date.now(), results: results };
      searchOrder.push(key);
      if (searchOrder.length > SEARCH_CACHE_SIZE) delete searchCache[searchOrder.shift()];
      done(null, results.slice());
    });
  }

  /* Slow drift of the background photo, unless the system asks for reduced motion. */
  function applyMotion() {
    var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('scene').classList.toggle('zeno-motion', settings.motion && !reduced);
  }

  /* The current reading, ready to show, or null. */
  function data() {
    if (!settings.enabled || !weather || Date.now() - weather.at >= READING_LIFETIME) return null;
    function rounded(value) {
      return typeof value === 'number' ? Math.round(value) : null;
    }
    return {
      name: weather.name,
      temperature: Math.round(weather.temperature),
      description: ZenoI18n.t(description(weather.code)),
      apparent: rounded(weather.apparent),
      humidity: rounded(weather.humidity),
      wind: rounded(weather.wind),
      updated: weather.at,
      stale: Date.now() - weather.at > STALE_AFTER
    };
  }

  function locationName() {
    if (settings.location === 'auto') return 'Automatica da IP';
    if (settings.location === 'custom') return settings.place.name;
    return CITIES.filter(function (city) {
      return city.id === settings.location;
    })[0].name;
  }

  function status() {
    if (error) return error;
    if (loading) return 'Aggiornamento…';
    return settings.location === 'auto' ? 'Posizione approssimativa da IP' : 'Meteo Open-Meteo';
  }

  try {
    loadSaved();
  } catch (ignore) {}

  window.ZenoExtras = {
    cities: CITIES,
    weatherIcon: weatherIcon,
    config: function () {
      return {
        location: settings.location,
        enabled: settings.enabled,
        motion: settings.motion,
        interval: settings.interval,
        clock: settings.clock,
        place: settings.place && cleanPlace(settings.place)
      };
    },
    set: set,
    refresh: refresh,
    // Called when Home opens.
    home: function () {
      if (settings.enabled) refresh();
    },
    search: search,
    data: data,
    locationName: locationName,
    weatherText: function () {
      var reading = data();
      return reading ? reading.name + ' · ' + reading.temperature + '° · ' + reading.description : '';
    },
    status: status
  };

  document.addEventListener('visibilitychange', function () {
    document.documentElement.classList.toggle('weather-paused', document.hidden);
    if (document.hidden) clearTimeout(timer);
    else refresh();
  });
  applyMotion();
  setTimeout(refresh, 2000);
})();

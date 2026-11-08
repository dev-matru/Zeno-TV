/* Translations.
 *
 * The interface is written in Italian. Other languages are dictionaries in
 * app/locales/<id>.js, loaded only when chosen; nothing is translated online.
 * A dictionary maps Italian phrases to translated ones. Phrases with {0}, {1}...
 * are templates: "Aggiornato {0}" also matches "Aggiornato 5 min fa".
 *
 * render(root) translates the text nodes and aria-labels under root in place,
 * remembering the original text so it can be translated again later.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'zeno.language.v1';
  var SOURCE_LANGUAGE = 'it';
  var CACHE_LIMIT = 1200;

  var LANGUAGES = [
    ['it', 'Italiano'],
    ['en', 'English'],
    ['fr', 'Français'],
    ['es', 'Español'],
    ['de', 'Deutsch'],
    ['pt', 'Português'],
    ['da', 'Dansk'],
    ['tr', 'Türkçe'],
    ['nl', 'Nederlands'],
    ['no', 'Norsk'],
    ['fi', 'Suomi'],
    ['sv', 'Svenska'],
    ['hu', 'Magyar'],
    ['ro', 'Română'],
    ['el', 'Ελληνικά'],
    ['sr', 'Српски'],
    ['hr', 'Hrvatski'],
    ['sl', 'Slovenščina'],
    ['sq', 'Shqip'],
    ['ru', 'Русский'],
    ['uk', 'Українська'],
    ['pl', 'Polski'],
    ['ar', 'العربية'],
    ['zh-CN', '简体中文'],
    ['ko', '한국어'],
    ['ja', '日本語'],
    ['hi', 'हिन्दी'],
    ['bn', 'বাংলা'],
    ['kk', 'Қазақша'],
    ['fa', 'فارسی']
  ].map(function (pair) {
    return { id: pair[0], name: pair[1] };
  });

  // Listed by their own name, in alphabetical order.
  var collator = window.Intl && Intl.Collator ? new Intl.Collator('it', { sensitivity: 'base' }) : null;
  LANGUAGES.sort(function (a, b) {
    return collator ? collator.compare(a.name, b.name) : a.name.localeCompare(b.name);
  });

  var current = SOURCE_LANGUAGE;
  var dictionaries = { it: {} };
  var templates = {}; // language -> [{ pattern, value }]
  var pendingLoads = {}; // language -> callbacks waiting for its dictionary
  var requestCount = 0; // only the latest set() wins
  var listeners = [];

  var cache = Object.create(null);
  var cacheLanguage = '';
  var cacheSize = 0;

  function isLanguage(id) {
    return LANGUAGES.some(function (language) {
      return language.id === id;
    });
  }

  function rightToLeft() {
    return current === 'ar' || current === 'fa';
  }

  function has(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function remember(original, translated) {
    cache[original] = translated;
    cacheSize++;
    return translated;
  }

  function fillTemplate(phrase) {
    var list = templates[current] || [];
    for (var i = 0; i < list.length; i++) {
      var match = list[i].pattern.exec(phrase);
      if (!match) continue;
      var result = list[i].value;
      for (var n = 1; n < match.length; n++) result = result.split('{' + (n - 1) + '}').join(match[n]);
      return result;
    }
    return null;
  }

  /* The translation of one string. Surrounding spaces are kept; English is the
     fallback when a phrase is missing from the chosen dictionary. */
  function translate(value) {
    var text = String(value);
    if (current === SOURCE_LANGUAGE) return text;

    if (cacheLanguage !== current || cacheSize > CACHE_LIMIT) {
      cache = Object.create(null);
      cacheLanguage = current;
      cacheSize = 0;
    }
    if (has(cache, text)) return cache[text];

    var phrase = text.trim();
    var dictionary = dictionaries[current] || {};
    var english = dictionaries.en || {};
    var result = has(dictionary, phrase)
      ? dictionary[phrase]
      : has(english, phrase)
        ? english[phrase]
        : fillTemplate(phrase);
    return remember(text, result ? text.replace(phrase, result) : text);
  }

  function translateTextNodes(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while ((node = walker.nextNode())) {
      var parent = node.parentElement;
      if (!parent || /^(SCRIPT|STYLE)$/.test(parent.tagName) || parent.closest('[data-i18n-ignore]'))
        continue;
      // If we translated this node before, start again from the original.
      var original = node.nodeValue === node._zenoTranslated ? node._zenoOriginal : node.nodeValue;
      var translated = translate(original);
      node._zenoOriginal = original;
      node._zenoTranslated = translated;
      if (node.nodeValue !== translated) node.nodeValue = translated;
    }
  }

  function translateLabels(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[aria-label]'), function (element) {
      var label = element.getAttribute('aria-label');
      var original = label === element._zenoLabelOut ? element._zenoLabelIn : label;
      element._zenoLabelIn = original;
      element._zenoLabelOut = translate(original);
      if (label !== element._zenoLabelOut) element.setAttribute('aria-label', element._zenoLabelOut);
    });
  }

  function render(root) {
    if (!root) return;
    root.classList.toggle('is-rtl', rightToLeft());
    // Setting the document language, even to the same value, makes the TV redraw
    // every text layer, so it is only set when it really changes.
    if (document.documentElement.lang !== current) document.documentElement.lang = current;
    if (current === SOURCE_LANGUAGE && root._zenoLanguage === SOURCE_LANGUAGE) return;
    root._zenoLanguage = current;
    translateTextNodes(root);
    translateLabels(root);
  }

  /* Called by each app/locales/<id>.js file. */
  function register(id, dictionary) {
    dictionaries[id] = dictionary;
    templates[id] = [];
    Object.keys(dictionary).forEach(function (phrase) {
      if (phrase.indexOf('{0}') < 0) return;
      var escaped = phrase.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\d+)\}/g, '(.+?)');
      templates[id].push({ pattern: new RegExp('^' + escaped + '$'), value: dictionary[phrase] });
    });
  }

  function load(id, done) {
    if (dictionaries[id]) {
      done();
      return;
    }
    if (pendingLoads[id]) {
      pendingLoads[id].push(done);
      return;
    }
    pendingLoads[id] = [done];

    var script = document.createElement('script');
    script.src = 'locales/' + id + '.js';
    function finish(error) {
      var waiting = pendingLoads[id];
      delete pendingLoads[id];
      if (script.parentNode) script.parentNode.removeChild(script);
      waiting.forEach(function (callback) {
        callback(error);
      });
    }
    script.onload = function () {
      finish(dictionaries[id] ? null : Error('Traduzione non disponibile.'));
    };
    script.onerror = function () {
      finish(Error('Traduzione non disponibile.'));
    };
    document.head.appendChild(script);
  }

  function notify() {
    listeners.forEach(function (listener) {
      listener();
    });
  }

  /* Switch language, load its dictionary and save the choice. */
  function set(id, done) {
    done = done || function () {};
    if (!isLanguage(id)) {
      done(Error('Lingua non valida.'));
      return;
    }
    var request = ++requestCount;
    load(id, function (error) {
      if (request !== requestCount) return;
      if (error) {
        done(error);
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch (e) {
        done(Error('Impossibile salvare la lingua.'));
        return;
      }
      current = id;
      notify();
      done();
    });
  }

  window.ZenoI18n = {
    languages: LANGUAGES,
    register: register,
    set: set,
    render: render,
    t: translate,
    language: function () {
      return current;
    },
    languageName: function () {
      return LANGUAGES.filter(function (language) {
        return language.id === current;
      })[0].name;
    },
    // The locale used for dates and numbers.
    locale: function () {
      return current === 'no' ? 'nb-NO' : current;
    },
    onChange: function (listener) {
      listeners.push(listener);
    }
  };

  // Start in the saved language. A choice made before it loads takes precedence.
  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    var requestAtStart = requestCount;
    if (saved && isLanguage(saved) && saved !== SOURCE_LANGUAGE) {
      load(saved, function (error) {
        if (error || requestAtStart !== requestCount) return;
        current = saved;
        notify();
      });
    }
  } catch (ignore) {}
})();

/**
 * @license Copyright 2016 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/** @typedef {import('./extension-controller.js').Settings} Settings */

/** @type {import('./extension-controller.js')} */
const ExtensionController = (() => {
  // @ts-ignore: for popup-test.js
  if (window.ControllerMock) return window.ControllerMock;
  return require('./extension-controller.js');
})();

// `update_url` only exists in production - it's a property that the Chrome web store injects.
const DEV = !('update_url' in chrome.runtime.getManifest());
const VIEWER_URL = DEV ? 'http://localhost:8000' : 'https://googlechrome.github.io/lighthouse/viewer/';

const optionsVisibileClass = 'show-options';

/** @type {?string} */
let siteURL = null;

/**
 * Guaranteed context.querySelector. Always returns an element or throws if
 * nothing matches query.
 * @param {string} query
 * @param {ParentNode=} context
 * @return {HTMLElement}
 */
function find(query, context = document) {
  /** @type {?HTMLElement} */
  const result = context.querySelector(query);
  if (result === null) {
    throw new Error(`query ${query} not found`);
  }
  return result;
}

/**
 * @param {string} text
 * @param {string} id
 * @param {boolean} isChecked
 * @return {HTMLLIElement}
 */
function createOptionItem(text, id, isChecked) {
  const input = document.createElement('input');
  input.setAttribute('type', 'checkbox');
  input.setAttribute('value', id);
  if (isChecked) {
    input.setAttribute('checked', 'checked');
  }

  const label = document.createElement('label');
  label.appendChild(input);
  label.appendChild(document.createElement('span')).textContent = text;
  const listItem = document.createElement('li');
  listItem.appendChild(label);

  return listItem;
}

/**
 * Click event handler for Generate Report button.
 * @param {string} siteURL
 * @param {Settings} settings
 */
function onGenerateReportButtonClick(siteURL, settings) {
  const url = new URL(VIEWER_URL);
  url.searchParams.append('psiurl', siteURL);
  url.searchParams.append('strategy', settings.device);
  for (const category of settings.selectedCategories) {
    url.searchParams.append('category', category);
  }
  url.searchParams.append('utm_source', 'lh-chrome-ext');
  window.open(url.href);
}

/**
 * Generates a document fragment containing a list of checkboxes and labels
 * for the categories.
 * @param {Settings} settings
 */
function generateOptionsList(settings) {
  const frag = document.createDocumentFragment();

  ExtensionController.DEFAULT_CATEGORIES.forEach(category => {
    const isChecked = settings.selectedCategories.includes(category.id);
    frag.appendChild(createOptionItem(category.title, category.id, isChecked));
  });

  const optionsCategoriesList = find('.options__categories');
  optionsCategoriesList.appendChild(frag);
}

function fillDevToolsShortcut() {
  const el = find('.devtools-shortcut');
  const isMac = /mac/i.test(navigator.platform);
  el.textContent = isMac ? '⌘⌥I (Cmd+Opt+I)' : 'F12';
}

function logVersion() {
  // @ts-ignore: Run when in extension context, but not in unit tests.
  if (typeof window.ControllerMock !== 'undefined') return;

  chrome.runtime.onInstalled.addListener(details => {
    if (details.previousVersion) {
      // eslint-disable-next-line no-console
      console.log('previousVersion', details.previousVersion);
    }
  });
}

function persistSettings() {
  const optionsEl = find('.section--options');
  // Save settings when options page is closed.
  const checkboxes = /** @type {NodeListOf<HTMLInputElement>} */
    (optionsEl.querySelectorAll('.options__categories input:checked'));
  const selectedCategories = Array.from(checkboxes).map(input => input.value);
  const device = /** @type {HTMLInputElement} */ (find('input[name="device"]:checked')).value;

  ExtensionController.saveSettings({
    selectedCategories,
    device,
  });
}

/**
 * Initializes the popup's state and UI elements.
 */
async function initPopup() {
  logVersion();
  fillDevToolsShortcut();

  chrome.tabs.query({active: true, lastFocusedWindow: true}, function(tabs) {
    if (tabs.length === 0 || !tabs[0].url) {
      return;
    }

    siteURL = tabs[0].url;
    const url = new URL(siteURL);
    if (url.hostname === 'localhost') {
      generateReportButton.disabled = true;
      errorMessageEl.textContent = 'Use DevTools to audit pages on localhost.';
    } else if (/(chrome|chrome-extension):/.test(url.protocol)) {
      generateReportButton.disabled = true;
      errorMessageEl.textContent = `Cannot audit ${url.protocol}// pages.`;
    }
  });

  // generate checkboxes from saved settings
  ExtensionController.loadSettings().then(settings => {
    generateOptionsList(settings);
    const selectedDeviceEl = /** @type {HTMLInputElement} */ (
      find(`.options__device input[value="${settings.device}"]`));
    selectedDeviceEl.checked = true;
  });

  const errorMessageEl = /** @type {HTMLButtonElement} */ (find('.errormsg'));

  const generateReportButton = /** @type {HTMLButtonElement} */ (find('#generate-report'));
  generateReportButton.addEventListener('click', () => {
    ExtensionController.loadSettings().then(settings => {
      if (siteURL) {
        onGenerateReportButtonClick(siteURL, settings);
      }
    });
  });

  // bind View Options button
  const generateOptionsEl = find('#configure-options');
  const bodyEl = find('body');
  generateOptionsEl.addEventListener('click', () => {
    bodyEl.classList.toggle(optionsVisibileClass);
  });

  // bind Save Options button
  const optionsFormEl = find('.options__form');
  optionsFormEl.addEventListener('change', () => {
    persistSettings();
  });
}

initPopup();

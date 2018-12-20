/*
 * Hide Elo ratings on lichess.org.
 *
 * This works in three steps:
 *
 * 1. At document_start, inject CSS to hide all elements containing ratings. This will fully hide
 *    some elements also containing player names, which should not be hidden, i.e. it will hide a
 *    superset. This will be fixed in step 3.
 * 2. At document_end, register a MutationObserver to handle the seek list. This is dynamically
 *    populated and initially empty, so the observer is active in time.
 * 3. Also at document_end, find the elements fully hidden in step 1, remove the ratings from
 *    their text and add a CSS class to make them visible again.
 *
 * So we initially hide a superset to make sure ratings don't even flash up briefly until the
 * script has finished running. The alternative would probably be to register the MutationObserver
 * at document_start, but that should be bad for performance.
 *
 * When modifying DOM elements, ratings are stored in a hiddenElo property so they can be
 * restored when the extension is turned off.
 */

// TODO: Consider performance optimization. E.g. only run required code depending on URL.
// Idea: Don't hide ratings in other users' games.

var ratingRE = /[123]?\d{3}\??/;
var ratingParenthesizedRE = /(.*)(\([123]?\d{3}\??\))(.*)/;

// Process clicks on the icon, sent from the background script.
browser.runtime.onMessage.addListener(message => {
  if (message.operation == 'iconClicked') {
    enabled = !enabled;
  }
  storeEnabledState();
  setStyles();
  setIconState();
});

// Recursively search the specified subtree for TR elements and (un)hide ratings in them.
function hideRatingsInLobbyBox(node) {
  if (node.tagName == 'TR' && node.children.length >= 3) {
    var td = node.children[2];
    // This is really just a hack to skip the first row (which contains headings):
    if (ratingRE.test(td.textContent)) {
      td.classList.add('hide_elo');
    }
  } else if (node.children) {
    for (let childNode of node.children) {
      hideRatingsInLobbyBox(childNode);
    }
  }
}

// Callback for MutationObserver.
function processAddedNodes(mutationsList, observer) {
  for (let mutation of mutationsList) {
    // As per the configuration we only observe mutation.type == 'childList'.
    for (var node of mutation.addedNodes) {
      // The entire box can be added at once, e.g. by clicking its tab...
      var lobbyBoxAsDiv = node.tagName == 'DIV' && node.classList.contains('lobby_box');
      // ... or when returning from the filter settings.
      var lobbyBoxAsTable = node.tagName == 'TABLE'
        && node.parentNode.tagName == 'DIV' && node.parentNode.classList.contains('lobby_box');
      if (node.tagName == 'TR' || lobbyBoxAsDiv || lobbyBoxAsTable) {
        hideRatingsInLobbyBox(node);
      }
    }
  }
}

// TODO: Is the default run_at: document_idle fast enough? Or do we need to run at document_start?
var observer = new MutationObserver(processAddedNodes);

// Process the player names in the left side box of the game view. NOTE: When hovering over these
// they load a #powerTip with more ratings, which is hidden via CSS. *While* this tooltip is loading
// it will show the text from the link.
function processIngameLeftSidebox() {
  var players = document.querySelectorAll('.side_box .players .player a.user_link');
  for (let player of players) {
    var match = ratingParenthesizedRE.exec(player.innerHTML);
    if (match) {
      player.innerHTML = match[1] + '<span class="hide_elo">' + match[2] + '</span>' + match[3];
      player.classList.add('elo_hidden');
    }
  }
}

function setStyles() {
  if (enabled) {
    document.body.classList.remove('no_hide_elo');
  } else {
    document.body.classList.add('no_hide_elo');
  }
}

function storeEnabledState() {
  sessionStorage.setItem('enabled', enabled);
}

function setIconState() {
  browser.runtime.sendMessage({operation: enabled ? 'setIconOn' : 'setIconOff'});
}

// Whether the extension is enabled on the current tab. Will be overwritten from storage on load.
// Start out enabled to avoid flashing ratings.
var enabled = sessionStorage.getItem('enabled');
if (enabled === null) {  // Use default from sync storage.
  browser.storage.sync.get('defaultEnabled').then(result => {
    enabled = result.defaultEnabled;
    if (enabled === undefined) {
      enabled = false;
    }
    storeEnabledState();
    setStyles();
    setIconState();
  });
} else {
  // Session storage uses Strings.
  enabled = enabled === 'true';
  setStyles();
  setIconState();
}

observer.observe(document, { childList: true, subtree: true });
processIngameLeftSidebox();

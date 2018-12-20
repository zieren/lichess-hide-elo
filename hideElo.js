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
 * 3. Also at document_end, find the player names hidden in step 1 and separate them from the
 *    ratings, in a class that makes them always visible.
 *
 * So we initially hide a superset to make sure ratings don't even flash up briefly until the
 * script has finished running. When all classes are modified as needed, ratings can be shown/
 * hidden by adding/removing the no_hide_elo class to/from the body.
 */

// TODO: Consider performance optimization. E.g. only run required code depending on URL.
// Idea: Don't hide ratings in other users' games.

var ratingRE = /[123]?\d{3}\??/;
var ratingParenthesizedRE = /(.*)\b\s*(\([123]?\d{3}\??\))/;

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
    var match = ratingParenthesizedRE.exec(player.firstChild.textContent);
    if (match) {
      player.firstChild.textContent = match[1];  // Just the name.
      var rating = document.createElement('span');
      rating.textContent = match[2];
      rating.classList.add('hide_elo');
      player.insertBefore(rating, player.childNodes[1]);  // Insert before rating change.
      // Lichess puts an nbsp between name and rating.
      var nbsp = document.createTextNode('\u00A0');
      player.insertBefore(nbsp, rating);
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

observer.observe(document, { childList: true, subtree: true });
processIngameLeftSidebox();

// Whether the extension is enabled on the current tab.
var enabled = sessionStorage.getItem('enabled');
if (enabled === null) {
  // Use default from sync storage. This uses actual booleans.
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

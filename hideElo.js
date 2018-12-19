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
 */

// TODO: Consider performance optimization.
// Idea: Don't hide ratings in other users' games. (Just "*/tv/*"?)

var ratingRE = /[123]?\d{3}\??/;
var ratingParenthesizedRE = /(.*)\([123]?\d{3}\??\)(.*)/;  // TODO: Whitespace before parentheses.

var enabled = true;  // XXX Read from storage.
browser.runtime.sendMessage({operation: enabled ? 'setIconOn' : 'setIconOff'});

var processMessage = function(message) {
  if (message.operation == 'iconClicked') {
    enabled = !enabled;
    updateObservingState();
    browser.runtime.sendMessage({operation: enabled ? 'setIconOn' : 'setIconOff'});
    // TODO: Update page to reflect new state: Would need to keep the ratings somewhere...
  }
}
browser.runtime.onMessage.addListener(processMessage);

// TODO: Consider splitting this up for granularity.
// TODO: Consider options to not hide certain elements.
// document.body.classList.add("no_hide_elo");

/* Recursively search the specified subtree for TR elements and (un)hide ratings in them. */
var hideRatingsInLobbyBox = function(node) {
  if (node.tagName == 'TR'
      && node.children.length >= 3
      // This is really just a hack to skip the first row (which contains headings):
      && ratingRE.test(node.children[2].textContent)) {
    node.children[2].style.visibility = enabled ? 'hidden' : 'visible';
  } else if (node.children) {
    for (let childNode of node.children) {
      hideRatingsInLobbyBox(childNode);
    }
  }
}

var callback = function(mutationsList, observer) {
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
};

// TODO: Is the default run_at: document_idle fast enough? Or do we need to run at document_start?
var observer = new MutationObserver(callback);
var updateObservingState = function() {
  if (enabled) {
    observer.observe(document, { childList: true, subtree: true });
  } else {
    observer.disconnect();
  }
  var lobbyBox = document.querySelectorAll('div.lobby_box');
  if (lobbyBox.length == 1) {
    hideRatingsInLobbyBox(lobbyBox[0]);
  }
}
updateObservingState();

// TODO: Run the following on the ingame page only.

// Process the player names in the left side box of the game view. NOTE: When hovering over these
// they load a #powerTip with more ratings, which is hidden via CSS. *While* this tooltip is loading
// it will show the text from the link.
var players = document.querySelectorAll('.side_box .players .player a.user_link');
for (let player of players) {
  var match = ratingParenthesizedRE.exec(player.textContent);
  if (match) {
    player.innerText = match[1];  // TODO: plus match[2] for rating change, if desired
    player.classList.add('elo_hidden');
  }
}

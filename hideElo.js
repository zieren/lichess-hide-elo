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
 * When modifying DOM elements, ratings are stored in a hiddenRating property so they can be
 * restored when the extension is turned off.
 */

// TODO: Consider performance optimization. E.g. only run required code depending on URL.
// Idea: Don't hide ratings in other users' games.

var ratingRE = /[123]?\d{3}\??/;
var ratingParenthesizedRE = /(.*)\b(\s*\([123]?\d{3}\??\))/;

var enabled = true;  // XXX Read from storage.
browser.runtime.sendMessage({operation: enabled ? 'setIconOn' : 'setIconOff'});

var processMessage = function(message) {
  if (message.operation == 'iconClicked') {
    enabled = !enabled;
    updateObservingState();
    processIngameLeftSidebox();
    setStyles();
    browser.runtime.sendMessage({operation: enabled ? 'setIconOn' : 'setIconOff'});
  }
};
browser.runtime.onMessage.addListener(processMessage);

// TODO: Consider splitting this up for granularity.

/* Recursively search the specified subtree for TR elements and (un)hide ratings in them. */
var hideRatingsInLobbyBox = function(node) {
  if (node.tagName == 'TR' && node.children.length >= 3) {
    var td = node.children[2];
    if (// This is really just a hack to skip the first row (which contains headings):
        ratingRE.test(td.textContent) || td.hiddenElo !== undefined) {
      if (enabled) {
        td.hiddenElo = td.textContent;
        td.innerText = '';
      } else {
        console.log(td);
        if (td.hiddenElo !== undefined) {
          td.innerText = td.hiddenElo;
        }
      }
    }
  } else if (node.children) {
    for (let childNode of node.children) {
      hideRatingsInLobbyBox(childNode);
    }
  }
};

var processAddedNodes = function(mutationsList, observer) {
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
var observer = new MutationObserver(processAddedNodes);
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
};
updateObservingState();

// Process the player names in the left side box of the game view. NOTE: When hovering over these
// they load a #powerTip with more ratings, which is hidden via CSS. *While* this tooltip is loading
// it will show the text from the link.
var processIngameLeftSidebox = function() {
  var players = document.querySelectorAll('.side_box .players .player a.user_link');
  for (let player of players) {
    if (enabled) {
      var match = ratingParenthesizedRE.exec(player.firstChild.data);
      if (match) {
        player.firstChild.data = match[1];
        player.firstChild.hiddenElo = match[2];
        player.classList.add('elo_hidden');
      }
    } else {
      if (player.firstChild.hiddenElo !== undefined) {
        player.firstChild.data = player.firstChild.data + player.firstChild.hiddenElo;
      }
    }
  }
};
processIngameLeftSidebox();

var setStyles = function() {
  if (enabled) {
    document.body.classList.remove('no_hide_elo');
  } else {
    document.body.classList.add('no_hide_elo');
  }
};
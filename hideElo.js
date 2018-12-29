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
var ratingParenthesizedRE = /(?:\s*)(.*)\b\s*(\([123]?\d{3}\??\))/;
var skipPageRE = new RegExp('^https?://lichess.org/training(/.*)?$');

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
// XXX What about removed nodes?
function processAddedNodes(mutationsList) {
  console.log(mutationsList);
  // As per the configuration we only observe mutation.type == 'childList'.
  for (let mutation of mutationsList) {
    // XXX Maybe this is where we need to intercept? Or use the ParanoidObserver instead!
    for (let node of mutation.addedNodes) {
      if (typeof node.matches == 'function') {
        // ----- Case 1: The lobby box.
        // The entire box can be added at once, e.g. by clicking its tab or when returning from the
        // filter settings. Normally table rows are added.
        if (node.matches('div.lobby_box')  // XXX performance?
            || node.matches('div.lobby_box table')
            || node.tagName == 'TR') {
          hideRatingsInLobbyBox(node);
        // } else if (node.matches('.side_box div.players .player a.user_link')) {
        } else if (node.matches('.side_box')) {
          // ----- Case 2: The ingame left sidebox.  XXX improve the code above?
          console.log('sneaky');
          console.log(node);
        } else if (ratingRE.test(node.innerText)) {  // XXX
          console.log(node);
        }
      }
    }
  }
}

function createSeparator() {
  var nbsp = document.createTextNode('\u00A0');
  var span = document.createElement('span');
  span.classList.add('hide_elo_separator');
  span.appendChild(nbsp);
  return span;
}

// Process the player names in the left side box of the game view. NOTE: When hovering over these
// they load a #powerTip with more ratings, which is hidden via CSS. *While* this tooltip is loading
// it will show the text from the link.
function processIngameLeftSidebox() {
  var players = document.querySelectorAll('.side_box div.players .player a.user_link');
  console.log(players);
  for (let player of players) {
    // A title like IM is a separate node.
    if (player.firstChild.classList && player.firstChild.classList.contains('title')) {
      var nameNode = player.childNodes[1];
      player.insertBefore(createSeparator(), nameNode);
    } else {
      var nameNode = player.childNodes[0];
    }
    var match = ratingParenthesizedRE.exec(nameNode.textContent);
    console.log(match);
    if (match) {
      nameNode.textContent = match[1];  // Just the name.
      var rating = document.createElement('span');
      rating.textContent = match[2];
      rating.classList.add('hide_elo');
      // Insert before rating change if it exists (i.e. it's a rated game), or else at the end if
      // nextSibling is null.
      player.insertBefore(rating, nameNode.nextSibling);
      // Lichess puts an nbsp between name and rating.
      player.insertBefore(createSeparator(), nameNode.nextSibling);
      // Indicate that it's now safe to show the player name.
      player.classList.add('elo_hidden');
      console.log(player);
    }
  }
  console.log('Finished processing left sidebox');
}

//XXX Might need to observe characterData. And what about removed nodes?
//=========>>> Attach an observer for *.* to the modified node!!!
// -> Player names are updated after the game with the rating change.
// -----> XXX Add observer to parent, or document or something, because the node itself will
// be replaced! Need to be far enough up the DOM to avoid being replaced, so maybe the sidebox's
// top node or something.
function addParanoidObserver(element) {
  new MutationObserver(function(mutations) {
    for (let mutation of mutations) {
      console.log(mutation);
    }
  }).observe(element, {
    childList: true,
    attributes: true,
    characterData: true,
    subtree: true });
  console.log('observing element:');
  console.log(element);
}
var boardLeftSide = document.querySelector('div.board_left div.side');
if (boardLeftSide) {
  addParanoidObserver(boardLeftSide);
}

function setStyles() {
  var skipPage = skipPageRE.test(location.href);
  if (enabled && !skipPage) {
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

var hooksWrap = document.querySelector('div#hooks_wrap');
if (hooksWrap) {
  new MutationObserver(processAddedNodes).observe(hooksWrap, { childList: true, subtree: true });
}
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

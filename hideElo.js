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

var ratingRE = /[123]?\d{3}\??/;
var ratingParenthesizedRE = /(?:\s*)(.*)\b\s*(\([123]?\d{3}\??\))/;
var skipPageRE = new RegExp('^https?://lichess.org/training(/.*)?$');

// ---------- Seek list ----------

// XXX What about removed nodes? I don't think we listen to those with the specified options.
function observeLobbyBox(mutations) {
  mutations.forEach(function(mutation) {
    mutation.addedNodes.forEach(function(node) {
      // Over time individual rows are added. When switching tabs or switching back from the filter
      // settings the whole table is rebuilt and re-added.
      hideRatingsInSeekList(node.tagName == 'TR' ? [node] : node.querySelectorAll('tr'));
    });
  });
}

function hideRatingsInSeekList(rows) {
  rows.forEach(function(row) {
    if (row.children.length >= 3) {
      var cell = row.children[2];  // XXX also test for matches(...)?
      // This is really just a hack to skip the top row (which contains headings):
      if (ratingRE.test(cell.textContent)) {
        cell.classList.add('hide_elo');
      }
    }
  });
}

var hooksWrap = document.querySelector('div#hooks_wrap');
if (hooksWrap) {
  new MutationObserver(observeLobbyBox).observe(hooksWrap, {childList: true, subtree: true});
}

// ---------- Ingame left side box ----------

function observeLeftSideBox(mutations) {
  mutations.forEach(function(mutation) {
    mutation.addedNodes.forEach(function(node) {
      hideRatingsInLeftSidebox(node.querySelectorAll('.side_box div.players .player a.user_link'));
    });
  });
}

function hideRatingsInLeftSidebox(players) {
  players.forEach(function(player) {
    // A title like IM is a separate node.
    if (player.firstChild.classList && player.firstChild.classList.contains('title')) {
      var nameNode = player.childNodes[1];
      player.insertBefore(createSeparator(), nameNode);
    } else {
      var nameNode = player.childNodes[0];
    }
    var match = ratingParenthesizedRE.exec(nameNode.textContent);
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
    }
  });
}

function createSeparator() {
  var nbsp = document.createTextNode('\u00A0');
  var span = document.createElement('span');
  span.classList.add('hide_elo_separator');
  span.appendChild(nbsp);
  return span;
}

var boardLeft = document.querySelector('div.board_left');
if (boardLeft) {
  new MutationObserver(observeLeftSideBox).observe(boardLeft, {childList: true, subtree: true });
}

// Process the player names in the left side box of the game view. NOTE: When hovering over these
// they load a #powerTip with more ratings, which is hidden via CSS. *While* this tooltip is loading
// it will show the text from the link.
hideRatingsInLeftSidebox(document.querySelectorAll('.side_box div.players .player a.user_link'));

// ---------- Toggle on/off ----------

function setStyles() {
  var skipPage = skipPageRE.test(location.href);
  if (enabled && !skipPage) {
    document.body.classList.remove('no_hide_elo');
  } else {
    document.body.classList.add('no_hide_elo');
  }
}

// ---------- Clicks on the icon ----------

// Process clicks on the icon, sent from the background script.
browser.runtime.onMessage.addListener(message => {
  if (message.operation == 'iconClicked') {
    enabled = !enabled;
  }
  storeEnabledState();
  setStyles();
  setIconState();
});

function setIconState() {
  browser.runtime.sendMessage({operation: enabled ? 'setIconOn' : 'setIconOff'});
}

// ---------- Store/retrieve enabled state ----------

function storeEnabledState() {
  sessionStorage.setItem('enabled', enabled);
}

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

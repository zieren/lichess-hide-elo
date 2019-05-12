/*
 * Hide Elo ratings on lichess.org.
 *
 * This works in three steps:
 *
 * 1. At document_start, inject CSS to hide ratings already while the page is loading. At this point
 *    we need to hide a superset because some ratings are not isolated in the DOM tree.
 * 2. At document_end, make some static changes to the DOM tree to isolate ratings.
 * 3. Register MutationObserver-s to handle dynamic elements, such as the seek list and tool tips.
 *
 * Now we can toggle the visibility of the isolated/tagged elements containing ratings via CSS.
 */

// ---------- Options ----------

// Try to read options from session storage. This initially returns null, then 'true'/'false'.

// Hide ratings on the current tab. Default to true.
const enabledInSession = sessionStorage.getItem('enabled');
var enabled = enabledInSession === 'true' || enabledInSession === null;
// Allow toggle via icon click. Default to false.
var allowToggle = sessionStorage.getItem('allowToggle') === 'true';
// Convert FEN to Shredder-FEN. Default to false.
var convertFen = sessionStorage.getItem('convertFen') === 'true';

// ---------- Regular expressions ----------

// Pages on which the extension should always be disabled.
const skipPageRE = new RegExp('^https?://lichess.org/training(/.*)?$');

// Generic pattern to match "foobar (1234)" or "WIM foobar (2500?)" or "BOT foobar (3333)".
const titleNameRating = '((?:[A-Z]{2,}\\s+)?\\S+)\\s+(\\([123]?\\d{3}\\??\\))';

// Matches name and rating in the left sidebox, e.g. "foobar (1500?)".
const leftSideboxNameRatingRE = /(\S*)\s+(\([123]?\d{3}\??\))/;

// Matches the legend shown below a game in the #powerTip, e.g. "IM foobar (2400) • 1+0".
const tooltipGameLegendRE = new RegExp(titleNameRating);

// Matches the tooltip of the #powerTip, e.g. "GM foobar (2500) vs baz (1500?) • 15+15".
const tooltipGameTitleRE = new RegExp(titleNameRating + '\\s+vs\\s+' + titleNameRating + '\\s+(.*)');

// Matches name and rating in an incoming challenge.
// Caveat: I don't know what a challenge from a titled player looks like :-)
const challengeNameRE = new RegExp(titleNameRating);

// A page title, e.g. "foo (1234) - bar (2345) * lichess.org"
const pageTitleRE = new RegExp(titleNameRating + '\\s+-\\s+' + titleNameRating + '\\s+(.\\s+lichess\\.org)$');

// Matches ratings in the PGN.
const pgnRatingsRE = /\[(WhiteElo|BlackElo|WhiteRatingDiff|BlackRatingDiff)\b.*\]\n/g;

// Chess960 tag in the PGN.
const chess960RE = /\[Variant\s*"Chess960"\]/;

// FEN tag in the PGN (initial position).
const fenRE = /\[FEN\s*"(([nbrqk]{8})\/p{8}\/(?:8\/){4}P{8}\/([NBRQK]{8})\s+[wb]\s+)KQkq - 0 1"\]\n/;

// ---------- Seek list ----------

function observeLobbyBox(mutations) {
  mutations.forEach(function(mutation) {
    mutation.addedNodes.forEach(function(node) {
      // When new seeks come in, individual rows are added. When switching tabs or switching back
      // from the filter settings the whole table is rebuilt and re-added.
      if (node.tagName === 'TR') {
        hideRatingsInSeekList([node]);
      } else if (typeof node.querySelectorAll === 'function') {
        hideRatingsInSeekList(node.querySelectorAll('tr'));
      }
    });
  });
}

function hideRatingsInSeekList(rows) {
  rows.forEach(function(row) {
    if (row.children.length >= 3 && row.classList.contains('join')) {
      row.children[2].classList.add('hide_elo');
    }
  });
}

// main.lobby has a lot of noise, but its descendents are ephemeral so there seems to be no better
// node to observe.
var mainLobby = document.querySelector('main.lobby');
if (mainLobby) {
  new MutationObserver(observeLobbyBox).observe(mainLobby, {childList: true, subtree: true});
}

// ---------- Ingame left side box ----------

function observeLeftSideBox(mutations) {
  mutations.forEach(function(mutation) {
    mutation.addedNodes.forEach(function(node) {
      if (typeof node.querySelectorAll === 'function') {
        hideRatingsInLeftSidebox(node.querySelectorAll('div.game__meta__players .player a.user-link'));
      }
    });
  });
}

function hideRatingsInLeftSidebox(players) {
  players.forEach(function(player) {
    // A title like IM is a separate node.
    var titleSeparator = '';
    if (player.firstChild.classList && player.firstChild.classList.contains('title')) {
      var nameNode = player.childNodes[1];
      titleSeparator = ' ';
    } else {
      var nameNode = player.childNodes[0];
    }
    var match = leftSideboxNameRatingRE.exec(nameNode.textContent);
    if (match) {
      nameNode.textContent = titleSeparator + match[1];  // Just the name.
      var rating = document.createElement('span');
      rating.textContent = ' ' + match[2] + (nameNode.nextSibling ? ' ' : '');
      rating.classList.add('hide_elo');
      // Insert before rating change if it exists (i.e. it's a rated game), or else at the end if
      // nextSibling is null.
      player.insertBefore(rating, nameNode.nextSibling);
      // Indicate that it's now safe to show the player name.
      player.classList.add('elo_hidden');
    }
  });
}

// Process the player names in the left side box of the game view. NOTE: When hovering over these
// they load a #powerTip with more ratings, which is hidden via CSS. *While* this tooltip is loading
// it will show the text from the user-link.
hideRatingsInLeftSidebox(document.querySelectorAll('div.game__meta__players .player a.user-link'));

// ---------- Tooltip ----------

function observeTooltip(mutations) {
  if (!enabled) {
    return;
  }
  // Enabled state can't be toggled while the tooltip is shown, so we can manipulate in place.
  mutations.forEach(function(mutation) {
    mutation.addedNodes.forEach(function(node) {
      // Sometimes relevant nodes are added directly...
      if (typeof node.matches === 'function') {
        if (node.matches('#powerTip div.upt__game-legend')) {
          hideRatingsInTooltipGameLegend(node);
        } else if (node.matches('#powerTip a.mini-board')) {
          // A currently running game.
          hideRatingsInMiniBoardTitle(node);
        }
      }
      // ... and sometimes they are children of the added node.
      if (typeof node.querySelector === 'function') {
        // A finished game e.g. on the cross table.
        var miniBoard = node.querySelector('#miniGame span.mini-board');
        if (miniBoard) {
          hideRatingsInMiniBoardTitle(miniBoard);
        }
        var miniGameLegend = node.querySelector('#miniGame span.vstext');
        if (miniGameLegend) {
          hideRatingsInMiniGameLegend(miniGameLegend);
        }
      }
    });
  });
}

function hideRatingsInTooltipGameLegend(node) {
  if (node.lastChild.nodeName === '#text') {
    var match = tooltipGameLegendRE.exec(node.lastChild.textContent);
    if (match) {
      node.lastChild.textContent = match[1];
    }
  }
}

function hideRatingsInMiniBoardTitle(node) {
  var match = tooltipGameTitleRE.exec(node.title);
  if (match) {
    node.title = match[1] + ' vs ' + match[3] + ' ' + match[5];
  }
}

function hideRatingsInMiniGameLegend(node) {
  if (typeof node.querySelectorAll === 'function') {
    var players = node.querySelectorAll('span.user-link');
    if (players.length === 2) {
      // White rating is the last node.
      players[0].childNodes[players[0].childNodes.length - 1].remove();
      // Black rating is at index 2, possibly followed by a title.
      players[1].childNodes[2].remove();
    }
  }
}

new MutationObserver(observeTooltip).observe(document, {childList: true, subtree: true});

// ---------- Page title (e.g. watching a game) ----------

var originalTitle = document.title;
var hiddenTitle = document.title;
var match = pageTitleRE.exec(document.title);
if (match) {
  hiddenTitle = match[1] + ' - ' + match[3] + ' ' + match[5];
}

// ---------- Challenge (incoming) ----------

function observeIncomingChallenge(mutations) {
  mutations.forEach(function(mutation) {
    mutation.addedNodes.forEach(function(node) {
      if (typeof node.querySelector === 'function') {
        var name = node.querySelector('div.challenges a.user-link name');
        if (name) {
          hideRatingsInIncomingChallenge(name);
        }
      }
    });
  });
}

function hideRatingsInIncomingChallenge(name) {
  var match = challengeNameRE.exec(name.textContent);
  if (match) {
    name.textContent = match[1] + ' ';
    var rating = document.createElement('span');
    rating.textContent = match[2] + ' ';
    rating.classList.add('hide_elo');
    name.appendChild(rating);
  }
}

var headerTop = document.querySelector('header#top');
if (headerTop) {
  new MutationObserver(observeIncomingChallenge).observe(headerTop, {childList: true, subtree: true});
}

// ---------- FEN->Shredder-FEN conversion ----------

function convertFenIfChess960() {
  if (chess960RE.test(hiddenPgn)) {
    hiddenPgn = doConvertFen(hiddenPgn);
    originalPgn = doConvertFen(originalPgn);
  }
}

function doConvertFen(pgn) {
  var match = fenRE.exec(pgn);
  if (match && match[2].toUpperCase() === match[3]) {
    var leftRookBlack = match[2].indexOf('r');
    var rightRookBlack = match[2].indexOf('r', leftRookBlack + 1);
    var rookFiles = String.fromCharCode('a'.charCodeAt(0) + rightRookBlack, 'a'.charCodeAt(0) + leftRookBlack);
    return pgn.replace(fenRE, '[FEN "' + match[1] + rookFiles.toUpperCase() + rookFiles + ' - 0 1"]\n');
  }
  return pgn;
}

// ---------- Analysis board: embedded PGN ----------

var pgn = document.querySelector('div.analyse__underboard__panels div.fen-pgn div.pgn');
var originalPgn;
var hiddenPgn;
if (pgn) {
  originalPgn = pgn.textContent;
  hiddenPgn = pgn.textContent.replace(pgnRatingsRE, '');
  // Hide ratings until we read the options, then doTheThing() will pick the correct pgn.
  pgn.textContent = hiddenPgn;
  pgn.classList.add('elo_hidden');
}

// ---------- Analysis board: linked PGN ----------

function interceptPgnDownload(event) {
  if (!enabled && !convertFen) {
    return true;  // continue normally to href
  }
  var request = new XMLHttpRequest();
  request.onreadystatechange = function() {
    if (request.readyState == 4 && request.status == 200) {
      var contentDispositionFilenameRE = /\bfilename=((?:"[^"]+\.pgn")|(?:\S+\.pgn))/;
      var contentDisposition = request.getResponseHeader('content-disposition');
      var match = contentDispositionFilenameRE.exec(contentDisposition);
      var filename = match ? match[1] : 'file.pgn';
      var pgnFile = enabled ? request.responseText.replace(pgnRatingsRE, '') : request.responseText;
      if (convertFen) pgnFile = doConvertFen(pgnFile);
      var dummyA = document.createElement('a');
      var contentType = request.getResponseHeader('content-type') || 'application/x-chess-pgn';
      dummyA.setAttribute('href', 'data:' + contentType + ',' + encodeURIComponent(pgnFile));
      dummyA.setAttribute('download', filename);
      dummyA.style.display = 'none';
      document.body.appendChild(dummyA);
      dummyA.click();
      document.body.removeChild(dummyA);
    }
  }
  request.open('GET', event.srcElement.href, true);
  request.send();
  return false;  // skip the href
}

var pgnLinks = document.querySelectorAll('div.analyse__underboard__panels div.fen-pgn div.pgn-options a:not(.embed-howto)');
pgnLinks.forEach(function(a) {
  a.onclick = interceptPgnDownload;
});

// ---------- Toggle on/off ----------

function doTheThing() {
  var skipPage = skipPageRE.test(location.href);
  if (enabled && !skipPage) {
    document.body.classList.remove('no_hide_elo');
    document.title = hiddenTitle;
    if (pgn) {
      pgn.textContent = hiddenPgn;
    }
  } else {
    document.body.classList.add('no_hide_elo');
    document.title = originalTitle;
    if (pgn) {
      pgn.textContent = originalPgn;
    }
  }
}

// ---------- Clicks on the icon ----------

// Process clicks on the icon, sent from the background script.
browser.runtime.onMessage.addListener(message => {
  if (message.operation === 'iconClicked') {
    if (!allowToggle) {
      return;
    }
    enabled = !enabled;
    storeOptionsForSession();
    doTheThing();
    setIconState();
  }
});

function setIconState() {
  browser.runtime.sendMessage({operation: enabled ? 'setIconOn' : 'setIconOff'});
}

// ---------- Store/retrieve enabled state and options ----------

function storeOptionsForSession() {
  sessionStorage.setItem('enabled', enabled);
  sessionStorage.setItem('allowToggle', allowToggle);
  sessionStorage.setItem('convertFen', convertFen);
}

if (enabledInSession === null) {  // indicates session start
  // Read options from sync storage. This uses actual booleans.
  browser.storage.sync.get(['defaultEnabled', 'allowToggle', 'convertFen']).then(options => {
    enabled = options.defaultEnabled === undefined || options.defaultEnabled;
    allowToggle = options.allowToggle === undefined || options.allowToggle;
    convertFen = !!options.convertFen;
    storeOptionsForSession();
    if (convertFen) {
      convertFenIfChess960();
    }
    doTheThing();
    setIconState();
  });
} else {
  doTheThing();
  setIconState();
  // Pick up changes to the allowToggle and convertFen options.
  browser.storage.sync.get(['allowToggle', 'convertFen']).then(options => {
    allowToggle = !!options.allowToggle;
    convertFen = !!options.convertFen;
    sessionStorage.setItem('allowToggle', allowToggle);
    sessionStorage.setItem('convertFen', convertFen);
    if (convertFen) {
      convertFenIfChess960();
      doTheThing();
    }
  });
}

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

// Matches a plain rating, like "666" or "2345".
const ratingRE = /[123]?\d{3}\??/;

// Matches name and rating in the left sidebox, e.g. "foobar (1500?)".
const leftSideboxNameRatingRE = /(\S*)\s+(\([123]?\d{3}\??\))/;

// Matches the legend shown below a game in the #powerTip, e.g. "IM foobar (2400) • 1+0".
const tooltipGameLegendRE = new RegExp(titleNameRating + '\\s+(.*)');

// Matches the tooltip of the #powerTip, e.g. "GM foobar (2500) vs baz (1500?) • 15+15".
const tooltipGameTitleRE = new RegExp(titleNameRating + '\\s+vs\\s+' + titleNameRating + '\\s+(.*)');

// Matches name and rating in an incoming challenge.
// Caveat: I don't know what a challenge from a titled player looks like :-)
const challengeNameRE = new RegExp(titleNameRating);

// Matches the TV title, e.g. "foo (1234) - bar (2345) in xyz123 * lichess.org"
const tvTitleRE = new RegExp(titleNameRating + '\\s+-\\s+' + titleNameRating + '\\s+(.*)');
const tvTitlePageRE = new RegExp('.*/tv$');

// Matches ratings in the PGN.
const pgnRatingsRE = /\[(WhiteElo|BlackElo|WhiteRatingDiff|BlackRatingDiff)\b.*\]\n/g;

// Chess960 tag in the PGN.
const chess960RE = /\[Variant\s*"Chess960"\]/;

// FEN tag in the PGN (initial position).
const fenRE = /\[FEN\s*"(([nbrqk]{8})\/p{8}\/(?:8\/){4}P{8}\/([NBRQK]{8})\s+[wb]\s+)KQkq - 0 1"\]\n/;

// ---------- Helpers ----------

// Replace the &nbsp; Lichess sometimes puts between name and rating.
function createSeparator() {
  var nbsp = document.createTextNode('\u00A0');
  var span = document.createElement('span');
  span.appendChild(nbsp);
  return span;
}

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
    if (row.children.length >= 3) {
      var cell = row.children[2];
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
      if (typeof node.querySelectorAll === 'function') {
        hideRatingsInLeftSidebox(node.querySelectorAll('.side_box div.players .player a.user_link'));
      }
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
    var match = leftSideboxNameRatingRE.exec(nameNode.textContent);
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

var boardLeft = document.querySelector('div.board_left');
if (boardLeft) {
  new MutationObserver(observeLeftSideBox).observe(boardLeft, {childList: true, subtree: true });
}

// Process the player names in the left side box of the game view. NOTE: When hovering over these
// they load a #powerTip with more ratings, which is hidden via CSS. *While* this tooltip is loading
// it will show the text from the link.
hideRatingsInLeftSidebox(document.querySelectorAll('.side_box div.players .player a.user_link'));

// ---------- Tooltip ----------

function observeTooltip(mutations) {
  if (!enabled) {
    return;
  }
  // Enabled state can't be toggled while the tooltip is shown, so we don't need to use CSS.
  mutations.forEach(function(mutation) {
    mutation.addedNodes.forEach(function(node) {
      if (typeof node.matches === 'function') {
        if (node.matches('#powerTip div.game_legend')) {
          hideRatingsInTooltipGameLegend(node);
        } else if (node.matches('#miniGame a.mini_board') || node.matches('#powerTip a.mini_board')) {
          hideRatingsInMetaTooltip(node);
        } else if (node.matches('#miniGame div.vstext.clearfix')) {
          hideRatingsInMiniGame(node);
        }
      }
    });
  });
}

function hideRatingsInTooltipGameLegend(node) {
  var match = tooltipGameLegendRE.exec(node.textContent);
  if (match) {
    node.textContent = match[1] + ' ' + match[3];
  }
}

function hideRatingsInMetaTooltip(node) {
  var match = tooltipGameTitleRE.exec(node.title);
  if (match) {
    node.title = match[1] + ' vs ' + match[3] + ' ' + match[5];
  }
}

function hideRatingsInMiniGame(node) {
  if (typeof node.querySelectorAll === 'function') {
    var playerLeft = node.querySelector('div.left.user_link');
    var playerRight = node.querySelector('div.right.user_link');
    if (playerLeft) {
      // Rating is the last node.
      playerLeft.childNodes[playerLeft.childNodes.length - 1].remove();
    }
    if (playerRight) {
      // Rating is at index 2, possibly followed by a title.
      playerRight.childNodes[2].remove();
    }
  }
}

new MutationObserver(observeTooltip).observe(document, {childList: true, subtree: true});

// ---------- TV title ----------

var originalTitle = document.title;
var hiddenTitle = document.title;
if (tvTitlePageRE.test(location.href)) {
  var match = tvTitleRE.exec(document.title);
  if (match) {
    hiddenTitle = match[1] + ' - ' + match[3] + ' ' + match[5];
  }
}

// ---------- Challenge (incoming) ----------

function observeIncomingChallenge(mutations) {
  mutations.forEach(function(mutation) {
    mutation.addedNodes.forEach(function(node) {
      if (typeof node.querySelector === 'function') {
        var name = node.querySelector('div.challenges a.user_link name');
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
    name.textContent = match[1];
    name.appendChild(createSeparator());
    var rating = document.createElement('span');
    rating.textContent = match[2];
    rating.classList.add('hide_elo');
    name.appendChild(rating);
    name.appendChild(createSeparator());
  }
}

var challengeNotifications = document.querySelector('div#top div.challenge_notifications');
if (challengeNotifications) {
  new MutationObserver(observeIncomingChallenge).observe(challengeNotifications, {childList: true, subtree: true});
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

var pgn = document.querySelector('div.analysis_panels div.panel.fen_pgn div.pgn');
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

var pgnLinks = document.querySelectorAll('div.analysis_panels div.panel.fen_pgn div.pgn_options a:not(.embed_howto)');
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

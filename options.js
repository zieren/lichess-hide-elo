var saveOptions = function(event) {
  event.preventDefault();
  browser.storage.sync.set({
    defaultEnabled: document.getElementById('defaultEnabled').checked,
    convertFen: document.getElementById('convertFen').checked,
    allowToggle: document.getElementById('allowToggle').checked
  });
};

var restoreOptions = function(event) {
  // Storage provides boolean data type, or undefined if not yet written.
  browser.storage.sync.get(['defaultEnabled', 'allowToggle', 'convertFen']).then(result => {
    // Map undefined to true, so main feature is initially enabled.
    document.getElementById('defaultEnabled').checked = result.defaultEnabled === undefined || result.defaultEnabled;
    // Map undefined to true, so toggle is initially enabled.
    document.getElementById('allowToggle').checked = result.allowToggle === undefined || result.allowToggle;
    // Map undefined to false for suprising but thoroughly pleasant side effect.
    document.getElementById('convertFen').checked = Boolean(result.convertFen);
  });
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('defaultEnabled').addEventListener('change', saveOptions);
document.getElementById('allowToggle').addEventListener('change', saveOptions);
document.getElementById('convertFen').addEventListener('change', saveOptions);

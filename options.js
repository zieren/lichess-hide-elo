var saveOptions = function(event) {
  event.preventDefault();
  browser.storage.sync.set({defaultEnabled: document.getElementById('defaultEnabled').checked});
};

var restoreOptions = function(event) {
  browser.storage.sync.get('defaultEnabled').then(result => {
    document.getElementById('defaultEnabled').checked = result.defaultEnabled;
  });
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('defaultEnabled').addEventListener('change', saveOptions);

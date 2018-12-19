var saveOptions = function(event) {
  event.preventDefault();
  browser.storage.sync.set({defaultEnabled: document.getElementById('defaultEnabled').checked});
//  alert('set to: ' + document.getElementById('defaultEnabled').checked);
};

var restoreOptions = function(event) {
  browser.storage.sync.get('defaultEnabled').then(result => {
//    alert('value: ' + result.defaultEnabled);
//    alert('typeof: ' + typeof result.defaultEnabled);
//    if (enabled === null) {
//      enabled = true;
//    } else {
//      enabled = enabled == 'true';
//    }
    document.getElementById('defaultEnabled').checked = result.defaultEnabled;
  });
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('defaultEnabled').addEventListener('change', saveOptions);
